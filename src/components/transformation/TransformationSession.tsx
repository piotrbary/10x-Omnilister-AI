import { useEffect, useRef, useState } from "react";
import type { ObjectRecord, PhotoRecord } from "@/types/objects";
import type { TransformationJob, QualityScoreSnapshot, FeedbackValue } from "@/types/transformations";
import { PhotoSelector } from "./PhotoSelector";
import { StylePicker } from "./StylePicker";
import { TransformationJobCard } from "./TransformationJobCard";

type Step = "selecting" | "styling" | "transforming" | "saving";

interface TransformationSessionProps {
  object: ObjectRecord;
  photos: PhotoRecord[];
  scoresByPhotoId: Record<string, QualityScoreSnapshot>;
  initialJobs: TransformationJob[];
}

const TERMINAL_STATUSES = new Set(["full_ready", "failed", "saved"]);

export function TransformationSession({ object, photos, scoresByPhotoId, initialJobs }: TransformationSessionProps) {
  const [step, setStep] = useState<Step>(initialJobs.length > 0 ? "transforming" : "selecting");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [jobs, setJobs] = useState<TransformationJob[]>(initialJobs);
  const [saveChecked, setSaveChecked] = useState<Record<string, boolean | undefined>>(() => {
    const init: Record<string, boolean> = {};
    for (const job of initialJobs) {
      const after = job.score_after;
      const before = (scoresByPhotoId as Record<string, QualityScoreSnapshot | undefined>)[job.photo_id];
      init[job.id] = after && before ? after.overall > before.overall : true;
    }
    return init;
  });
  const [startError, setStartError] = useState<string | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Stored for Save-as-Style CTA (consumed by S-04 Phase 3)
  const [_selectedStyleKey, setSelectedStyleKey] = useState<string | undefined>();
  const [_selectedStylePrompt, setSelectedStylePrompt] = useState<string | undefined>();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling: start when step === 'transforming', stop when all terminal
  useEffect(() => {
    if (step !== "transforming") return;

    const allTerminal = jobs.length > 0 && jobs.every((j) => TERMINAL_STATUSES.has(j.status));
    if (allTerminal) return;

    const poll = async () => {
      const ids = jobs.map((j) => j.id).join(",");
      if (!ids) return;
      try {
        const res = await fetch(`/api/transformations/status?ids=${ids}`);
        if (!res.ok) return;
        const data = (await res.json()) as { jobs: TransformationJob[] };
        setJobs(data.jobs);
      } catch {
        // silent — retry on next tick
      }
    };

    // Pause polling when tab is hidden
    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
      } else {
        intervalRef.current = setInterval(() => {
          void poll();
        }, 2000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    intervalRef.current = setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [step, jobs]);

  function handleToggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleStyleSelect(styleKey: string, customOverride?: string, rawPrompt?: string) {
    setSelectedStyleKey(styleKey);
    setSelectedStylePrompt(rawPrompt);
    setStartError(null);
    setStartLoading(true);

    try {
      const res = await fetch("/api/transformations/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object_id: object.id,
          photo_ids: selectedIds,
          style_name: styleKey,
          custom_prompt: customOverride,
        }),
      });

      if (res.status === 401) {
        window.location.assign("/auth/signin");
        return;
      }

      const data = (await res.json()) as { job_ids?: string[]; error?: string };
      if (!res.ok || !data.job_ids) {
        setStartError(data.error ?? "Failed to start transformation");
        return;
      }

      const newJobs: TransformationJob[] = data.job_ids.map((id) => ({
        id,
        user_id: "",
        object_id: object.id,
        photo_id: "",
        style_name: styleKey,
        prompt: "",
        status: "pending",
        draft_url: null,
        result_url: null,
        result_file_size_bytes: null,
        score_before: null,
        score_after: null,
        feedback: null,
        error_message: null,
        retry_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      setJobs(newJobs);
      setStep("transforming");
    } catch {
      setStartError("Network error — please try again");
    } finally {
      setStartLoading(false);
    }
  }

  async function handleFeedback(jobId: string, feedback: FeedbackValue) {
    try {
      await fetch(`/api/transformations/${jobId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, feedback } : j)));
    } catch {
      // best-effort
    }
  }

  function handleSaveToggle(jobId: string, save: boolean) {
    setSaveChecked((prev) => ({ ...prev, [jobId]: save }));
  }

  function handleRetry(jobId: string) {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: "pending", error_message: null } : j)));
  }

  async function handleConfirmSave() {
    setSaving(true);
    setSaveError(null);
    const toSave = jobs.filter((j) => saveChecked[j.id] && j.status === "full_ready");

    try {
      await Promise.all(
        toSave.map((job) =>
          fetch(`/api/transformations/${job.id}/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );
      window.location.assign(`/objects/${object.id}`);
    } catch {
      setSaveError("Failed to save — please try again");
    } finally {
      setSaving(false);
    }
  }

  const allTerminal = jobs.length > 0 && jobs.every((j) => TERMINAL_STATUSES.has(j.status));
  const photoById = Object.fromEntries(photos.map((p) => [p.id, p])) as Record<string, PhotoRecord | undefined>;
  const scoresById = scoresByPhotoId as Record<string, QualityScoreSnapshot | undefined>;

  return (
    <div className="flex flex-col gap-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-white/40">
        {(["selecting", "styling", "transforming", "saving"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span>/</span>}
            <span className={step === s ? "font-medium text-white" : ""}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
          </div>
        ))}
      </div>

      {/* Step 1: Photo selection */}
      {step === "selecting" && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">Select photos to transform</h2>
          <PhotoSelector photos={photos} selectedIds={selectedIds} onToggle={handleToggle} />
          <button
            onClick={() => {
              setStep("styling");
            }}
            disabled={selectedIds.length === 0}
            className="self-end rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {/* Step 2: Style picker */}
      {step === "styling" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setStep("selecting");
              }}
              className="text-sm text-white/50 hover:text-white"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-white">Choose a style</h2>
          </div>
          {startError && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {startError}
            </p>
          )}
          {startLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
            </div>
          ) : (
            <StylePicker
              category={(object.category ?? "item") as "car" | "real-estate" | "item"}
              onSelect={handleStyleSelect}
            />
          )}
        </div>
      )}

      {/* Step 3: Transforming (polling) */}
      {step === "transforming" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Transforming…</h2>
            {allTerminal && (
              <button
                onClick={() => {
                  setStep("saving");
                }}
                className="rounded-xl bg-purple-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
              >
                All done →
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {jobs.map((job) => (
              <TransformationJobCard
                key={job.id}
                job={job}
                originalPhoto={{ url: photoById[job.photo_id]?.originalUrl ?? "" }}
                scoreBefore={scoresById[job.photo_id] ?? null}
                saveChecked={saveChecked[job.id] ?? true}
                onFeedback={handleFeedback}
                onSaveToggle={handleSaveToggle}
                onRetry={handleRetry}
              />
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Saving */}
      {step === "saving" && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">Save results</h2>
          <p className="text-sm text-white/60">
            {Object.values(saveChecked).filter(Boolean).length} of {jobs.length} photos selected to save.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {jobs
              .filter((j) => j.status === "full_ready" || j.status === "saved")
              .map((job) => (
                <TransformationJobCard
                  key={job.id}
                  job={job}
                  originalPhoto={{ url: photoById[job.photo_id]?.originalUrl ?? "" }}
                  scoreBefore={scoresByPhotoId[job.photo_id] ?? null}
                  saveChecked={saveChecked[job.id] ?? true}
                  onFeedback={handleFeedback}
                  onSaveToggle={handleSaveToggle}
                  onRetry={handleRetry}
                />
              ))}
          </div>
          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          <button
            onClick={handleConfirmSave}
            disabled={saving}
            className="self-end rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm save"}
          </button>
        </div>
      )}
    </div>
  );
}
