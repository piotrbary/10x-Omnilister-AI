import { useState } from "react";
import type { ObjectCategory } from "@/lib/config";

interface CreatedStyle {
  id: string;
  name: string;
  category: string;
  prompt: string;
  description: string | null;
  is_public: boolean;
  usage_count: number;
  created_at: string;
}

interface StyleFormProps {
  category: ObjectCategory;
  initialPrompt?: string;
  onSuccess: (style: CreatedStyle) => void;
  onCancel?: () => void;
}

const CATEGORY_LABELS: Record<ObjectCategory, string> = {
  car: "Car",
  "real-estate": "Real Estate",
  item: "Item",
};

export function StyleForm({ category, initialPrompt = "", onSuccess, onCancel }: StyleFormProps) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          prompt,
          description: description || undefined,
          is_public: isPublic,
        }),
      });

      if (res.status === 401) {
        window.location.assign("/auth/signin");
        return;
      }

      const data = (await res.json()) as { style?: CreatedStyle; error?: unknown };
      if (!res.ok || !data.style) {
        setError(typeof data.error === "string" ? data.error : "Failed to save style");
        return;
      }

      onSuccess(data.style);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-white/60">
          Style name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          maxLength={80}
          required
          placeholder="e.g. Moody Studio"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-white/60">Category</span>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/50">
          {CATEGORY_LABELS[category]}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-white/60">
          Prompt <span className="text-red-400">*</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
          minLength={10}
          maxLength={2000}
          required
          rows={4}
          placeholder="Describe the visual transformation style…"
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none"
        />
        <span className="text-xs text-white/30">{prompt.length}/2000</span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-white/60">
          Description <span className="font-normal">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          maxLength={300}
          rows={2}
          placeholder="Short description shown on style cards…"
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none"
        />
      </div>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => {
            setIsPublic(e.target.checked);
          }}
          className="size-4 rounded border-white/20 bg-white/10 accent-purple-500"
        />
        <span className="text-sm text-white/80">Make public — share with all users</span>
      </label>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save style"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-white/50 hover:text-white">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
