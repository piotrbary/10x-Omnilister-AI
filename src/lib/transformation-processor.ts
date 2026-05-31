import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.generated";
import type { QualityScoreSnapshot, TransformationJob } from "../types/transformations";
import type { ObjectCategory } from "./config";
import { aiConfig } from "./config";
import { generateDraft, generateFull } from "./openrouter-images";
import { scorePhoto } from "./quality-scoring";

export async function processTransformationBatch(
  jobs: TransformationJob[],
  supabase: SupabaseClient<Database>,
): Promise<void> {
  if (jobs.length === 0) return;

  const { data: objectData } = await supabase
    .from("objects")
    .select("category")
    .eq("id", jobs[0].object_id)
    .eq("user_id", jobs[0].user_id)
    .single();

  const category: ObjectCategory = (objectData?.category as ObjectCategory | null) ?? "item";

  await Promise.all(jobs.map((job) => processJob(job, supabase, category)));
}

async function processJob(
  job: TransformationJob,
  supabase: SupabaseClient<Database>,
  category: ObjectCategory,
): Promise<void> {
  let retryCount = job.retry_count;
  let currentDraftUrl = job.draft_url;

  while (true) {
    try {
      const { data: photoRow, error: photoErr } = await supabase
        .from("photos")
        .select("original_url, mime_type")
        .eq("id", job.photo_id)
        .eq("user_id", job.user_id)
        .single();

      if (photoErr || !photoRow) {
        throw new Error(`Photo not found: ${photoErr?.message ?? "no data"}`);
      }

      const imageResponse = await fetch(photoRow.original_url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch original photo: HTTP ${imageResponse.status}`);
      }
      const imageData = new Uint8Array(await imageResponse.arrayBuffer());
      const mimeType = photoRow.mime_type;

      if (!currentDraftUrl) {
        const { buffer: draftBuffer } = await generateDraft(imageData, job.prompt, mimeType);
        const draftPath = `${job.user_id}/${job.object_id}/${job.id}/draft.jpg`;

        const { error: uploadErr } = await supabase.storage
          .from("transformed-photos")
          .upload(draftPath, new Blob([draftBuffer.buffer as ArrayBuffer], { type: "image/jpeg" }), {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (uploadErr) throw new Error(`Draft upload failed: ${uploadErr.message}`);

        const { data: signedDraft } = await supabase.storage
          .from("transformed-photos")
          .createSignedUrl(draftPath, 86400);

        const draftUrl = signedDraft?.signedUrl ?? "";
        currentDraftUrl = draftUrl;

        await supabase
          .from("transformations")
          .update({ status: "draft_ready", draft_url: draftUrl, updated_at: new Date().toISOString() })
          .eq("id", job.id)
          .eq("user_id", job.user_id);
      }

      const { buffer: fullBuffer } = await generateFull(imageData, job.prompt, mimeType);
      const fullPath = `${job.user_id}/${job.object_id}/${job.id}/full.jpg`;

      const { error: fullUploadErr } = await supabase.storage
        .from("transformed-photos")
        .upload(fullPath, new Blob([fullBuffer.buffer as ArrayBuffer], { type: "image/jpeg" }), {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (fullUploadErr) throw new Error(`Full upload failed: ${fullUploadErr.message}`);

      const { data: signedFull } = await supabase.storage
        .from("transformed-photos")
        .createSignedUrl(fullPath, 86400);

      const resultUrl = signedFull?.signedUrl ?? "";
      const resultFileSizeBytes = fullBuffer.byteLength;

      await supabase
        .from("transformations")
        .update({
          status: "full_ready",
          result_url: resultUrl,
          result_file_size_bytes: resultFileSizeBytes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("user_id", job.user_id);

      let scoreAfter: QualityScoreSnapshot | null = null;
      try {
        scoreAfter = await scorePhoto(resultUrl, category);
      } catch {
        // Non-fatal: scoring failure doesn't block the transformation
      }

      await supabase
        .from("transformations")
        .update({ score_after: scoreAfter as unknown as import("../types/database.generated").Json, updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("user_id", job.user_id);

      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (retryCount < aiConfig.maxRetries) {
        retryCount++;
        await supabase
          .from("transformations")
          .update({ retry_count: retryCount, updated_at: new Date().toISOString() })
          .eq("id", job.id)
          .eq("user_id", job.user_id);
        // currentDraftUrl preserved so next iteration skips draft if already done
      } else {
        await supabase
          .from("transformations")
          .update({
            status: "failed",
            error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("user_id", job.user_id);
        break;
      }
    }
  }
}
