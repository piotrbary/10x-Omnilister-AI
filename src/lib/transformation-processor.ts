import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.generated";
import type { QualityScoreSnapshot, TransformationJob } from "../types/transformations";
import type { ObjectCategory } from "./config";
import { aiConfig } from "./config";
import { generateFull } from "./openrouter-images";
import { scorePhoto } from "./quality-scoring";

export async function processTransformationBatch(
  jobs: TransformationJob[],
  supabase: SupabaseClient<Database>,
  model?: string,
): Promise<void> {
  if (jobs.length === 0) return;

  const { data: objectData } = await supabase
    .from("objects")
    .select("category")
    .eq("id", jobs[0].object_id)
    .eq("user_id", jobs[0].user_id)
    .single();

  const category: ObjectCategory = (objectData?.category as ObjectCategory | null) ?? "item";

  await Promise.all(jobs.map((job) => processJob(job, supabase, category, model)));
}

async function writeLog(
  supabase: SupabaseClient<Database>,
  jobId: string,
  userId: string,
  logs: string[],
): Promise<void> {
  await supabase
    .from("transformations")
    .update({ error_message: logs.join("\n"), updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("user_id", userId);
}

async function processJob(
  job: TransformationJob,
  supabase: SupabaseClient<Database>,
  category: ObjectCategory,
  model?: string,
): Promise<void> {
  let retryCount = job.retry_count;
  const logs: string[] = [];

  while (true) {
    try {
      logs.push(`[1] Fetching photo from DB photo_id=${job.photo_id.slice(0, 8)}`);
      await writeLog(supabase, job.id, job.user_id, logs);

      const { data: photoRow, error: photoErr } = await supabase
        .from("photos")
        .select("original_url, mime_type")
        .eq("id", job.photo_id)
        .eq("user_id", job.user_id)
        .single();

      if (photoErr || !photoRow) {
        throw new Error(`Photo not found: ${photoErr?.message ?? "no data"}`);
      }

      logs.push(`[2] Fetching original photo bytes mime=${photoRow.mime_type} url_len=${photoRow.original_url.length}`);
      await writeLog(supabase, job.id, job.user_id, logs);

      const imageResponse = await fetch(photoRow.original_url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch original photo: HTTP ${imageResponse.status}`);
      }
      const imageData = new Uint8Array(await imageResponse.arrayBuffer());
      const mimeType = photoRow.mime_type;
      logs.push(`[2] Photo fetched bytes=${imageData.byteLength}`);

      const effectiveModel = model ?? aiConfig.transformationModel;
      logs.push(`[3] Calling OpenRouter ${effectiveModel} for full generation`);
      await writeLog(supabase, job.id, job.user_id, logs);

      const { buffer: fullBuffer } = await generateFull(imageData, job.prompt, mimeType, logs, effectiveModel);
      await writeLog(supabase, job.id, job.user_id, logs);

      const fullPath = `${job.user_id}/${job.object_id}/${job.id}/full.jpg`;
      logs.push(`[3] Uploading full to storage path=${fullPath}`);
      await writeLog(supabase, job.id, job.user_id, logs);

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
      logs.push(`[3] Full ready bytes=${resultFileSizeBytes} signed_url_ok=${!!signedFull?.signedUrl}`);

      await supabase
        .from("transformations")
        .update({
          status: "full_ready",
          result_url: resultUrl,
          result_file_size_bytes: resultFileSizeBytes,
          error_message: null,
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
      logs.push(`[ERROR] ${message}`);

      if (retryCount < aiConfig.maxRetries) {
        retryCount++;
        logs.push(`[RETRY] attempt ${retryCount} of ${aiConfig.maxRetries}`);
        await supabase
          .from("transformations")
          .update({ retry_count: retryCount, error_message: logs.join("\n"), updated_at: new Date().toISOString() })
          .eq("id", job.id)
          .eq("user_id", job.user_id);
      } else {
        await supabase
          .from("transformations")
          .update({
            status: "failed",
            error_message: logs.join("\n"),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("user_id", job.user_id);
        break;
      }
    }
  }
}
