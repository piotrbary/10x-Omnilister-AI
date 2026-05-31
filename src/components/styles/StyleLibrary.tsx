import { useState } from "react";
import type { ObjectCategory } from "@/lib/config";

interface LibraryStyle {
  id: string;
  name: string;
  category: string;
  description: string | null;
  is_public: boolean;
  usage_count: number;
  is_reported: boolean;
  is_mine: boolean;
  created_at: string;
}

type CategoryCache = Partial<Record<ObjectCategory, LibraryStyle[]>>;

const CATEGORIES: ObjectCategory[] = ["car", "real-estate", "item"];
const CATEGORY_LABELS: Record<ObjectCategory, string> = {
  car: "Car",
  "real-estate": "Real Estate",
  item: "Item",
};

export function StyleLibrary() {
  const [activeCategory, setActiveCategory] = useState<ObjectCategory>("car");
  const [cache, setCache] = useState<CategoryCache>({});
  const [loading, setLoading] = useState<ObjectCategory | null>("car");
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Record<string, boolean>>({});
  const [reporting, setReporting] = useState<Record<string, boolean>>({});

  // Fetch on mount for default tab
  useState(() => {
    void fetchCategory("car");
  });

  async function fetchCategory(category: ObjectCategory) {
    if (cache[category] !== undefined) return;
    setLoading(category);
    setError(null);
    try {
      const res = await fetch(`/api/styles?category=${category}&public_only=true`);
      if (!res.ok) throw new Error("Failed to load styles");
      const data = (await res.json()) as { styles: LibraryStyle[] };
      setCache((prev) => ({ ...prev, [category]: data.styles }));
    } catch {
      setError("Could not load styles — please refresh");
    } finally {
      setLoading(null);
    }
  }

  function handleTabChange(category: ObjectCategory) {
    setActiveCategory(category);
    void fetchCategory(category);
  }

  async function handleReport(styleId: string) {
    setReporting((prev) => ({ ...prev, [styleId]: true }));
    try {
      await fetch(`/api/styles/${styleId}/report`, { method: "POST" });
      setReported((prev) => ({ ...prev, [styleId]: true }));
    } catch {
      // best-effort — if it fails the user can retry
    } finally {
      setReporting((prev) => ({ ...prev, [styleId]: false }));
    }
  }

  const styles = cache[activeCategory];
  const isLoading = loading === activeCategory;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                handleTabChange(cat);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeCategory === cat ? "bg-purple-600 text-white" : "text-white/60 hover:text-white"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        <a
          href="/styles/new"
          className="rounded-xl border border-purple-500/40 bg-purple-600/20 px-4 py-2 text-sm font-medium text-purple-300 transition-colors hover:bg-purple-600/30"
        >
          Create a style →
        </a>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <span className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
        </div>
      )}

      {error && !isLoading && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      {!isLoading && styles?.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 py-12 text-center">
          <p className="text-sm text-white/50">No public styles for this category yet.</p>
          <a href="/styles/new" className="mt-2 inline-block text-sm text-purple-400 hover:text-purple-300">
            Create the first one →
          </a>
        </div>
      )}

      {!isLoading && styles !== undefined && styles.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {styles.map((style) => {
            const isReported = reported[style.id] ?? style.is_reported;
            return (
              <div key={style.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-white">{style.name}</span>
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
                    {style.usage_count}×
                  </span>
                </div>

                {style.description && <p className="text-xs text-white/50">{style.description}</p>}

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/40">
                    {CATEGORY_LABELS[style.category as ObjectCategory]}
                  </span>
                  {style.is_mine && (
                    <span className="rounded-full bg-purple-600/30 px-2 py-0.5 text-xs text-purple-300">My style</span>
                  )}
                </div>

                {!style.is_mine && (
                  <button
                    onClick={() => {
                      void handleReport(style.id);
                    }}
                    disabled={isReported || reporting[style.id]}
                    className="self-start rounded-lg border border-white/10 px-3 py-1 text-xs text-white/40 transition-colors hover:border-red-500/40 hover:text-red-400 disabled:cursor-default disabled:opacity-50"
                  >
                    {isReported ? "Reported" : reporting[style.id] ? "Reporting…" : "Report"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
