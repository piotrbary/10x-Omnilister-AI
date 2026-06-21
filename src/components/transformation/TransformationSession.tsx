import { useState } from "react";
import type { ObjectRecord, PhotoRecord } from "@/types/objects";
import type { TransformationJob, QualityScoreSnapshot, FeedbackValue } from "@/types/transformations";
import { PhotoSelector } from "./PhotoSelector";
import { StylePicker } from "./StylePicker";
import { TransformationJobCard } from "./TransformationJobCard";
import { StyleForm } from "@/components/styles/StyleForm";

type Step = "selecting" | "styling" | "transforming" | "saving";

interface TransformationSessionProps {
  object: ObjectRecord;
  photos: PhotoRecord[];
  scoresByPhotoId: Record<string, QualityScoreSnapshot>;
  initialJobs: TransformationJob[];
}

export function TransformationSession({ object, photos, scoresByPhotoId, initialJobs }: TransformationSessionProps) {
  // When initial jobs exist (page refresh resume), go straight to saving
  const [step, setStep] = useState<Step>(initialJobs.length > 0 ? "saving" : "selecting");
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

  const [selectedStyleKey, setSelectedStyleKey] = useState<string | undefined>();
  const [selectedStylePrompt, setSelectedStylePrompt] = useState<string | undefined>();
  const [customOverrideAtSelection, setCustomOverrideAtSelection] = useState<string | undefined>();
  const [saveStyleOpen, setSaveStyleOpen] = useState(false);
  const [styleSaved, setStyleSaved] = useState(false);

  function handleToggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleStyleSelect(styleKey: string, customOverride?: string, rawPrompt?: string) {
    setSelectedStyleKey(styleKey);
    setSelectedStylePrompt(rawPrompt);
    setCustomOverrideAtSelection(customOverride);
    setSaveStyleOpen(false);
    setStyleSaved(false);
    setStartError(null);
    setStartLoading(true);
    setStep("transforming");

    try {
      const reqBody = {
        object_id: object.id,
        photo_ids: selectedIds,
        style_name: styleKey,
        custom_prompt: customOverride,
      };

      const res = await fetch("/api/transformations/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (res.status === 401) {
        window.location.assign("/auth/signin");
        return;
      }

      const responseText = await res.text();
      let data: { jobs?: TransformationJob[]; error?: string } = {};
      try { data = JSON.parse(responseText) as typeof data; } catch { /* non-JSON */ }

      if (!res.ok || !data.jobs) {
        setStartError(data.error ?? "Failed to start transformation");
        setStep("styling");
        return;
      }

      // Build saveChecked from score comparison
      const newSaveChecked: Record<string, boolean> = {};
      const scoresById = scoresByPhotoId as Record<string, QualityScoreSnapshot | undefined>;
      for (const job of data.jobs) {
        const after = job.score_after;
        const before = scoresById[job.photo_id];
        newSaveChecked[job.id] = after && before ? after.overall > before.overall : true;
      }

      setSaveChecked(newSaveChecked);
      setJobs(data.jobs);
      setStep("saving");
    } catch {
      setStartError("Network error — please try again");
      setStep("styling");
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
          <StylePicker
            category={(object.category ?? "item") as "car" | "real-estate" | "item"}
            onSelect={handleStyleSelect}
          />
        </div>
      )}

      {/* Step 3: Transforming — shown while API call is in flight */}
      {step === "transforming" && (
        <div className="flex flex-col items-center gap-4 py-16">
          <span className="size-10 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
          <p className="text-sm text-white/60">Transforming photos… this may take a minute</p>
        </div>
      )}

      {/* Step 4: Saving */}
      {step === "saving" && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">Save results</h2>
          <p className="text-sm text-white/60">
            {jobs.filter((j) => saveChecked[j.id] && (j.status === "full_ready" || j.status === "saved")).length} of{" "}
            {jobs.filter((j) => j.status === "full_ready" || j.status === "saved").length} photos selected to save.
          </p>
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

          {/* Save as Style accordion */}
          {selectedStyleKey !== undefined && (
            <div className="rounded-xl border border-white/10 bg-white/5">
              <button
                type="button"
                onClick={() => {
                  setSaveStyleOpen((prev) => !prev);
                }}
                className="flex w-full items-center justify-between px-4 py-3 text-sm text-white/70 hover:text-white"
              >
                <span>Save this prompt as a style to use it again</span>
                <span className="text-white/40">{saveStyleOpen ? "▲" : "▼"}</span>
              </button>
              {saveStyleOpen && (
                <div className="border-t border-white/10 px-4 pt-3 pb-4">
                  {styleSaved ? (
                    <p className="text-sm text-green-400">Style saved!</p>
                  ) : (
                    <StyleForm
                      category={(object.category ?? "item") as "car" | "real-estate" | "item"}
                      initialPrompt={
                        customOverrideAtSelection && customOverrideAtSelection.trim() !== ""
                          ? customOverrideAtSelection
                          : (selectedStylePrompt ?? "")
                      }
                      onSuccess={() => {
                        setStyleSaved(true);
                        setSaveStyleOpen(false);
                      }}
                      onCancel={() => {
                        setSaveStyleOpen(false);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          <button
            onClick={handleConfirmSave}
            disabled={saving || jobs.filter((j) => saveChecked[j.id] && j.status === "full_ready").length === 0}
            className="self-end rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm save"}
          </button>
        </div>
      )}
    </div>
  );
}
