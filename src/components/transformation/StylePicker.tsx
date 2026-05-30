import { useState } from "react";
import { PRESET_STYLES } from "@/lib/transformation-styles";
import type { ObjectCategory } from "@/lib/config";

interface LibraryStyle {
  id: string;
  name: string;
  description: string | null;
  usage_count: number;
  is_mine: boolean;
  prompt: string;
}

interface StylePickerProps {
  category: ObjectCategory;
  onSelect: (styleKey: string, customOverride?: string, rawPrompt?: string) => void;
}

type Tab = "presets" | "library";

export function StylePicker({ category, onSelect }: StylePickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("presets");
  const [selectedPresetKey, setSelectedPresetKey] = useState<string | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<LibraryStyle | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [libraryStyles, setLibraryStyles] = useState<LibraryStyle[] | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const presets = PRESET_STYLES[category];
  const activePreset = presets.find((p) => p.key === selectedPresetKey);
  const canTransform = selectedPresetKey !== null || selectedLibrary !== null;

  async function loadLibrary() {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const res = await fetch(`/api/styles?category=${category}`);
      if (!res.ok) throw new Error("Failed to load library");
      const data = (await res.json()) as { styles: LibraryStyle[] };
      setLibraryStyles(data.styles);
    } catch {
      setLibraryError("Could not load library styles");
    } finally {
      setLibraryLoading(false);
    }
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    if (tab === "library" && libraryStyles === null && !libraryLoading) {
      loadLibrary();
    }
  }

  function handlePresetSelect(key: string, basePrompt: string) {
    setSelectedPresetKey(key);
    setSelectedLibrary(null);
    setCustomPrompt(basePrompt);
  }

  function handleLibrarySelect(style: LibraryStyle) {
    setSelectedLibrary(style);
    setSelectedPresetKey(null);
  }

  function handleTransform() {
    const override = customPrompt.trim() || undefined;
    if (selectedPresetKey && activePreset) {
      onSelect(selectedPresetKey, override, activePreset.basePrompt);
    } else if (selectedLibrary) {
      onSelect(selectedLibrary.id, override, selectedLibrary.prompt);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
        {(["presets", "library"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "bg-purple-600 text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            {tab === "presets" ? "Presets" : "Library"}
          </button>
        ))}
      </div>

      {/* Presets tab */}
      {activeTab === "presets" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {presets.map((preset) => (
            <button
              key={preset.key}
              onClick={() => handlePresetSelect(preset.key, preset.basePrompt)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                selectedPresetKey === preset.key
                  ? "border-purple-500 bg-purple-600/20 text-white"
                  : "border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:bg-white/10"
              }`}
            >
              <div className="font-medium">{preset.label}</div>
              <div className="mt-1 text-xs text-white/50">{preset.description}</div>
            </button>
          ))}
        </div>
      )}

      {/* Library tab */}
      {activeTab === "library" && (
        <div className="min-h-[120px]">
          {libraryLoading && (
            <div className="flex items-center justify-center py-8">
              <span className="size-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          )}
          {libraryError && (
            <p className="py-4 text-center text-sm text-red-400">{libraryError}</p>
          )}
          {!libraryLoading && libraryStyles !== null && libraryStyles.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-sm text-white/50">No library styles for this category yet.</p>
              <a href="/styles/new" className="mt-2 inline-block text-sm text-purple-400 hover:text-purple-300">
                Create the first one →
              </a>
            </div>
          )}
          {!libraryLoading && libraryStyles !== null && libraryStyles.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {libraryStyles.map((style) => (
                <button
                  key={style.id}
                  onClick={() => handleLibrarySelect(style)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    selectedLibrary?.id === style.id
                      ? "border-purple-500 bg-purple-600/20 text-white"
                      : "border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{style.name}</span>
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
                      {style.usage_count}×
                    </span>
                  </div>
                  {style.description && (
                    <div className="mt-1 text-xs text-white/50">{style.description}</div>
                  )}
                  {style.is_mine && (
                    <span className="mt-2 inline-block rounded-full bg-purple-600/30 px-2 py-0.5 text-xs text-purple-300">
                      My style
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Custom prompt override */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-white/60">
          Additional instructions <span className="font-normal">(optional)</span>
        </label>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Add extra instructions or override the style prompt…"
          rows={3}
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      </div>

      {/* Transform button */}
      <button
        onClick={handleTransform}
        disabled={!canTransform}
        className="w-full rounded-xl bg-purple-600 py-3 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Transform
      </button>
    </div>
  );
}
