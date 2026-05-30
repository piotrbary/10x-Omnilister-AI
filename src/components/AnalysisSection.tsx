"use client";

import { useState, useCallback } from "react";
import type { ObjectCategory } from "@/lib/config";
import { scoringConfig } from "@/lib/config";
import type { QualityScoreSnapshot } from "@/types/transformations";
import type { PhotoScoreResult } from "@/types/analysis";

// ── types ──────────────────────────────────────────────────────────────────

interface Photo {
  id: string;
  thumbnail_url: string | null;
  original_url: string;
}

interface AnalysisSectionProps {
  objectId: string;
  photos: Photo[];
  initialCategory?: ObjectCategory | null;
  initialFeaturesText?: string | null;
  initialScores?: Record<string, QualityScoreSnapshot>;
}

type PhotoUIState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; snapshot: QualityScoreSnapshot; scoreId: string }
  | { status: "error"; message: string };

// ── constants ─────────────────────────────────────────────────────────────

const DIMENSIONS: { key: keyof Omit<QualityScoreSnapshot, "overall" | "is_sales_ready">; label: string }[] = [
  { key: "sharpness",       label: "Sharpness" },
  { key: "lighting",        label: "Lighting" },
  { key: "background",      label: "Background" },
  { key: "object_features", label: "Object Features" },
  { key: "damage_defects",  label: "Damage & Defects" },
  { key: "labels",          label: "Labels" },
  { key: "angle_coverage",  label: "Angle & Coverage" },
  { key: "sales_readiness", label: "Sales Readiness" },
];

const CATEGORY_LABELS: Record<ObjectCategory, string> = {
  car:           "Car",
  "real-estate": "Real Estate",
  item:          "Item",
};

// ── helpers ───────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 7) return "bg-emerald-500";
  if (score >= 4) return "bg-amber-500";
  return "bg-red-500";
}

function Spinner() {
  return (
    <span className="block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
  );
}

// ── ScoreGrid ─────────────────────────────────────────────────────────────

function ScoreGrid({ snapshot }: { snapshot: QualityScoreSnapshot }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[320px] w-full text-sm">
        <tbody>
          {DIMENSIONS.map(({ key, label }) => {
            const val = snapshot[key] as number;
            return (
              <tr key={key} className="border-t border-white/10">
                <td className="py-1.5 pr-3 text-white/60 whitespace-nowrap">{label}</td>
                <td className="py-1.5 w-full">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/10">
                      <div
                        className={`h-1.5 rounded-full ${scoreColor(val)}`}
                        style={{ width: `${(val / 10) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right tabular-nums text-white/80">{val.toFixed(1)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-white/20">
            <td className="py-2 pr-3 font-semibold text-white whitespace-nowrap">Overall</td>
            <td className="py-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-white/10">
                  <div
                    className={`h-2 rounded-full ${scoreColor(snapshot.overall)}`}
                    style={{ width: `${(snapshot.overall / 10) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right tabular-nums font-semibold text-white">
                  {snapshot.overall.toFixed(2)}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-2">
        {snapshot.is_sales_ready ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Ready to publish
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-400">
            <span className="size-1.5 rounded-full bg-amber-400" />
            Needs improvement
          </span>
        )}
      </div>
    </div>
  );
}

// ── PhotoRow ──────────────────────────────────────────────────────────────

interface PhotoRowProps {
  photo: Photo;
  checked: boolean;
  state: PhotoUIState;
  onToggle: () => void;
  onRetry: () => void;
  onReanalyze: () => void;
}

function PhotoRow({ photo, checked, state, onToggle, onRetry, onReanalyze }: PhotoRowProps) {
  const imgSrc = photo.thumbnail_url ?? photo.original_url;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={state.status === "loading"}
          className="size-4 rounded accent-emerald-500 disabled:opacity-50"
        />
        <img
          src={imgSrc}
          alt=""
          className="size-12 rounded-lg object-cover shrink-0"
          loading="lazy"
        />
        <span className="text-xs text-white/40 truncate flex-1">{photo.id.slice(0, 8)}…</span>

        {state.status === "loading" && <Spinner />}

        {state.status === "success" && (
          <button
            onClick={onReanalyze}
            className="text-xs text-white/40 hover:text-white/70 transition-colors shrink-0"
          >
            Re-analyze
          </button>
        )}
      </div>

      {state.status === "success" && <ScoreGrid snapshot={state.snapshot} />}

      {state.status === "error" && (
        <div className="flex items-center justify-between rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <span>Analysis failed — {state.message}</span>
          <button
            onClick={onRetry}
            className="ml-3 shrink-0 rounded-md bg-red-500/20 px-2 py-1 text-xs font-medium hover:bg-red-500/30 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

// ── AnalysisSection ────────────────────────────────────────────────────────

export default function AnalysisSection({
  objectId,
  photos,
  initialCategory = null,
  initialFeaturesText = null,
  initialScores = {},
}: AnalysisSectionProps) {
  // Seed photo states from initialScores
  const [photoStates, setPhotoStates] = useState<Record<string, PhotoUIState>>(() => {
    const init: Record<string, PhotoUIState> = {};
    for (const photo of photos) {
      const snap = initialScores[photo.id];
      init[photo.id] = snap
        ? { status: "success", snapshot: snap, scoreId: "" }
        : { status: "idle" };
    }
    return init;
  });

  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [category, setCategory] = useState<ObjectCategory | null>(initialCategory);
  const [prevCategory, setPrevCategory] = useState<ObjectCategory | null>(initialCategory);
  const [featuresText, setFeaturesText] = useState(initialFeaturesText ?? "");
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isSavingFeatures, setIsSavingFeatures] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [featuresError, setFeaturesError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ── checkbox toggle ──────────────────────────────────────────────────

  function togglePhoto(photoId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function markReanalyze(photoId: string) {
    setCheckedIds((prev) => new Set([...prev, photoId]));
    setPhotoStates((prev) => ({ ...prev, [photoId]: { status: "idle" } }));
  }

  // ── analyze ──────────────────────────────────────────────────────────

  const runAnalysis = useCallback(
    async (idsToAnalyze: string[]) => {
      if (idsToAnalyze.length === 0) return;
      setGlobalError(null);

      // Set all targets to loading
      setPhotoStates((prev) => {
        const next = { ...prev };
        for (const id of idsToAnalyze) next[id] = { status: "loading" };
        return next;
      });

      try {
        const res = await fetch(`/api/objects/${objectId}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photo_ids: idsToAnalyze }),
        });

        if (res.status === 401) {
          window.location.assign("/auth/signin");
          return;
        }

        const data = (await res.json()) as {
          category?: ObjectCategory;
          features_text?: string;
          scores?: PhotoScoreResult[];
          error?: string;
        };

        if (!res.ok) {
          // All photos failed — mark each as error
          setPhotoStates((prev) => {
            const next = { ...prev };
            for (const id of idsToAnalyze) {
              next[id] = { status: "error", message: data.error ?? "Unknown error" };
            }
            return next;
          });
          return;
        }

        // Update category / features from response
        if (data.category) setCategory(data.category);
        if (data.features_text) setFeaturesText(data.features_text);

        // Apply per-photo results
        const scores = data.scores ?? [];
        setPhotoStates((prev) => {
          const next = { ...prev };
          for (const result of scores) {
            if ("error" in result) {
              next[result.photo_id] = { status: "error", message: result.error };
            } else {
              next[result.photo_id] = {
                status: "success",
                snapshot: result.snapshot,
                scoreId: result.score_id,
              };
            }
          }
          return next;
        });

        // Uncheck successfully processed photos
        setCheckedIds((prev) => {
          const next = new Set(prev);
          for (const result of scores) {
            if (!("error" in result)) next.delete(result.photo_id);
          }
          return next;
        });
      } catch {
        setPhotoStates((prev) => {
          const next = { ...prev };
          for (const id of idsToAnalyze) {
            next[id] = { status: "error", message: "Network error" };
          }
          return next;
        });
      }
    },
    [objectId],
  );

  // Only analyze checked photos that are idle or errored (not already succeeded)
  function handleAnalyze() {
    const toAnalyze = [...checkedIds].filter((id) => {
      const s = photoStates[id];
      return s?.status === "idle" || s?.status === "error";
    });
    void runAnalysis(toAnalyze);
  }

  function handleRetry(photoId: string) {
    void runAnalysis([photoId]);
  }

  // ── category PATCH ────────────────────────────────────────────────────

  async function handleCategoryChange(newCategory: ObjectCategory) {
    const optimistic = newCategory;
    setPrevCategory(category);
    setCategory(optimistic);
    setIsSavingCategory(true);
    setCategoryError(null);

    try {
      const res = await fetch(`/api/objects/${objectId}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newCategory }),
      });

      if (res.status === 401) {
        window.location.assign("/auth/signin");
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setCategoryError(data.error ?? "Failed to save category");
        setCategory(prevCategory); // revert
      }
    } catch {
      setCategoryError("Network error — please try again");
      setCategory(prevCategory);
    } finally {
      setIsSavingCategory(false);
    }
  }

  // ── features PATCH ────────────────────────────────────────────────────

  async function handleSaveFeatures() {
    setIsSavingFeatures(true);
    setFeaturesError(null);

    try {
      const res = await fetch(`/api/objects/${objectId}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category ?? "item",
          features_text: featuresText,
        }),
      });

      if (res.status === 401) {
        window.location.assign("/auth/signin");
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setFeaturesError(data.error ?? "Failed to save features");
      }
    } catch {
      setFeaturesError("Network error — please try again");
    } finally {
      setIsSavingFeatures(false);
    }
  }

  // ── derived ───────────────────────────────────────────────────────────

  const analyzableChecked = [...checkedIds].filter((id) => {
    const s = photoStates[id];
    return s?.status === "idle" || s?.status === "error";
  });
  const anyLoading = Object.values(photoStates).some((s) => s.status === "loading");
  const canAnalyze = analyzableChecked.length > 0 && !anyLoading;

  const hasAnyScore = Object.values(photoStates).some((s) => s.status === "success");

  // ── render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* header + analyze button */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Photo Analysis</h2>
        <button
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {anyLoading ? (
            <span className="flex items-center gap-2">
              <Spinner />
              Analyzing…
            </span>
          ) : (
            `Analyze selected (${analyzableChecked.length})`
          )}
        </button>
      </div>

      {globalError && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{globalError}</p>
      )}

      {/* photo list */}
      <div className="flex flex-col gap-3">
        {photos.map((photo) => (
          <PhotoRow
            key={photo.id}
            photo={photo}
            checked={checkedIds.has(photo.id)}
            state={photoStates[photo.id] ?? { status: "idle" }}
            onToggle={() => togglePhoto(photo.id)}
            onRetry={() => handleRetry(photo.id)}
            onReanalyze={() => markReanalyze(photo.id)}
          />
        ))}
      </div>

      {/* category + features — show after first successful score */}
      {hasAnyScore && (
        <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
          {/* category */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-white/60">AI-detected category</label>
            <div className="flex items-center gap-3">
              <select
                value={category ?? ""}
                onChange={(e) => void handleCategoryChange(e.target.value as ObjectCategory)}
                disabled={isSavingCategory}
                className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              >
                <option value="" disabled>Select category</option>
                {scoringConfig.categories.map((cat) => (
                  <option key={cat} value={cat} className="bg-neutral-800">
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
              {isSavingCategory && <Spinner />}
            </div>
            {categoryError && <p className="text-xs text-red-400">{categoryError}</p>}
          </div>

          {/* features */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-white/60">Detected features</label>
            <textarea
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              rows={3}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              placeholder="AI-generated description of the object's features…"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => void handleSaveFeatures()}
                disabled={isSavingFeatures}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-50"
              >
                {isSavingFeatures ? (
                  <span className="flex items-center gap-2"><Spinner />Saving…</span>
                ) : (
                  "Save"
                )}
              </button>
              {featuresError && <p className="text-xs text-red-400">{featuresError}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
