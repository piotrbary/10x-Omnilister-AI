import { aiConfig } from "@/lib/config";
import type { TransformationJob, QualityScoreSnapshot, FeedbackValue } from "@/types/transformations";

interface TransformationJobCardProps {
  job: TransformationJob;
  originalPhoto: { url: string };
  scoreBefore: QualityScoreSnapshot | null;
  saveChecked: boolean;
  onFeedback: (jobId: string, feedback: FeedbackValue) => void;
  onSaveToggle: (jobId: string, save: boolean) => void;
  onRetry: (jobId: string) => void;
}

const SCORE_DIMENSIONS: { key: keyof QualityScoreSnapshot; label: string }[] = [
  { key: "sharpness", label: "Sharpness" },
  { key: "lighting", label: "Lighting" },
  { key: "background", label: "Background" },
  { key: "object_features", label: "Object features" },
  { key: "damage_defects", label: "Damage/defects" },
  { key: "labels", label: "Labels" },
  { key: "angle_coverage", label: "Angle coverage" },
  { key: "sales_readiness", label: "Sales readiness" },
];

function fmt(n: number | undefined) {
  return typeof n === "number" ? n.toFixed(1) : "—";
}

export function TransformationJobCard({
  job,
  originalPhoto,
  scoreBefore,
  saveChecked,
  onFeedback,
  onSaveToggle,
  onRetry,
}: TransformationJobCardProps) {
  const isTerminal = job.status === "full_ready" || job.status === "saved";
  const isFailed = job.status === "failed";
  const isPending = !isTerminal && !isFailed;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      {/* Pending */}
      {isPending && (
        <div className="flex flex-col items-center gap-3 py-8">
          <span className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
          <p className="text-sm text-white/50">Processing…</p>
        </div>
      )}

      {/* Failed */}
      {isFailed && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-sm font-medium text-red-400">Transformation failed</p>
            {job.error_message && <p className="mt-1 text-xs text-red-400/70">{job.error_message}</p>}
          </div>
          <button
            onClick={() => {
              onRetry(job.id);
            }}
            disabled={job.retry_count >= aiConfig.maxRetries}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {job.retry_count >= aiConfig.maxRetries ? "Max retries reached" : "Retry"}
          </button>
        </div>
      )}

      {/* Full result */}
      {isTerminal && (
        <div className="flex flex-col gap-4">
          {/* Before / after images */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/40">Before</span>
              <img src={originalPhoto.url} alt="Before" className="aspect-square w-full rounded-lg object-cover" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/40">After</span>
              <img src={job.result_url ?? ""} alt="After" className="aspect-square w-full rounded-lg object-cover" />
            </div>
          </div>

          {/* Score delta */}
          {scoreBefore && job.score_after && (
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-sm text-white/60">Overall score</span>
              <span className="font-mono text-sm font-medium text-white">
                {fmt(scoreBefore.overall)} → {fmt(job.score_after.overall)}
              </span>
            </div>
          )}

          {/* Score details */}
          {scoreBefore && job.score_after && (
            <details className="rounded-xl border border-white/10 bg-white/5">
              <summary className="cursor-pointer px-4 py-3 text-sm text-white/60 hover:text-white">
                Score details
              </summary>
              <div className="border-t border-white/10 px-4 pt-2 pb-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {SCORE_DIMENSIONS.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between py-0.5">
                      <span className="text-xs text-white/50">{label}</span>
                      <span className="font-mono text-xs text-white">
                        {fmt(scoreBefore[key] as number)} → {fmt(job.score_after?.[key] as number | undefined)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          )}

          {/* Feedback */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/50">Rating:</span>
            <button
              onClick={() => {
                onFeedback(job.id, "improved");
              }}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                job.feedback === "improved" ? "bg-green-600 text-white" : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              👍 Improved
            </button>
            <button
              onClick={() => {
                onFeedback(job.id, "not_improved");
              }}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                job.feedback === "not_improved"
                  ? "bg-red-600 text-white"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              👎 No change
            </button>
          </div>

          {/* Save toggle */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={saveChecked}
              onChange={(e) => {
                onSaveToggle(job.id, e.target.checked);
              }}
              className="h-4 w-4 rounded accent-purple-500"
            />
            <span className="text-sm text-white/70">Save this photo</span>
          </label>
        </div>
      )}
    </div>
  );
}
