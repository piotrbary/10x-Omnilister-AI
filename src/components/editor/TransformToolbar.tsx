import { forwardRef, useImperativeHandle, useState } from "react";
import { BookmarkCheck } from "lucide-react";
import { PRESET_STYLES } from "@/lib/transformation-styles";
import { TRANSFORMATION_MODELS } from "@/lib/config";
import type { ObjectCategory } from "@/lib/config";

const CATEGORY_OPTIONS: { value: ObjectCategory; label: string }[] = [
  { value: "car", label: "Samochód" },
  { value: "real-estate", label: "Nieruchomość" },
  { value: "item", label: "Przedmiot" },
];

export interface ToolbarHandle {
  applyPrompt: (text: string) => void;
  getCurrentPrompt: () => string;
}

interface TransformToolbarProps {
  category: ObjectCategory;
  objectName: string;
  selectedStyleKey: string | null;
  onStyleSelect: (key: string) => void;
  onCategoryChange: (c: ObjectCategory) => void;
  onTransform: (styleKey: string, customPrompt?: string) => void;
  isTransforming: boolean;
  isSaveable: boolean;
  onSave: () => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  onOpenPrompts: () => void;
}

const TransformToolbar = forwardRef<ToolbarHandle, TransformToolbarProps>(function TransformToolbar(
  {
    category,
    objectName,
    selectedStyleKey,
    onStyleSelect,
    onCategoryChange,
    onTransform,
    isTransforming,
    isSaveable,
    onSave,
    selectedModel,
    onModelChange,
    onOpenPrompts,
  },
  ref,
) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState("");

  useImperativeHandle(ref, () => ({
    applyPrompt(text: string) {
      setInstructions(text);
      setShowInstructions(true);
    },
    getCurrentPrompt() {
      return instructions;
    },
  }));

  const presets = PRESET_STYLES[category];
  const selectedPreset = presets.find((p) => p.key === selectedStyleKey) ?? null;

  function handlePresetClick(key: string, basePrompt: string) {
    onStyleSelect(key);
    if (!showInstructions) setInstructions(basePrompt);
  }

  function handleTransform() {
    if (!selectedPreset || isTransforming) return;
    onTransform(
      selectedPreset.key,
      instructions !== selectedPreset.basePrompt ? instructions : undefined,
    );
  }

  const divider = (
    <div
      style={{
        width: "1px",
        height: "20px",
        backgroundColor: "rgba(255,255,255,0.1)",
        flexShrink: 0,
      }}
    />
  );

  return (
    <div>
      <div className="editor-toolbar-top">
        {/* Object name */}
        <span
          title={objectName}
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.8)",
            whiteSpace: "nowrap",
            flexShrink: 0,
            maxWidth: "160px",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {objectName}
        </span>

        {divider}

        {/* Category selector */}
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value as ObjectCategory)}
          style={{
            flexShrink: 0,
            padding: "5px 10px",
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.15)",
            backgroundColor: "rgba(255,255,255,0.08)",
            color: "#fff",
            fontSize: "12px",
            cursor: "pointer",
            outline: "none",
          }}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ backgroundColor: "#1a1a2e" }}>
              {opt.label}
            </option>
          ))}
        </select>

        {divider}

        {/* Preset style buttons */}
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => handlePresetClick(p.key, p.basePrompt)}
            title={p.description}
            style={{
              padding: "5px 12px",
              borderRadius: "6px",
              border: "1px solid",
              borderColor:
                selectedStyleKey === p.key ? "rgba(139,92,246,0.6)" : "rgba(255,255,255,0.12)",
              backgroundColor:
                selectedStyleKey === p.key ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.06)",
              color: selectedStyleKey === p.key ? "#c4b5fd" : "rgba(255,255,255,0.7)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {p.label}
          </button>
        ))}

        {/* Instructions toggle */}
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          style={{
            padding: "5px 10px",
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.12)",
            backgroundColor: showInstructions ? "rgba(255,255,255,0.1)" : "transparent",
            color: "rgba(255,255,255,0.5)",
            fontSize: "12px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          + Prompt
        </button>

        {/* Saved prompts drawer */}
        <button
          onClick={onOpenPrompts}
          title="Moje style i prompty"
          style={{
            padding: "5px 8px",
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.12)",
            backgroundColor: "transparent",
            color: "rgba(255,255,255,0.45)",
            fontSize: "12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <BookmarkCheck size={14} />
        </button>

        {divider}

        {/* Model selector */}
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          title="Model AI do transformacji"
          style={{
            flexShrink: 0,
            padding: "5px 10px",
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.15)",
            backgroundColor: "rgba(255,255,255,0.08)",
            color: "#fff",
            fontSize: "12px",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <optgroup label="Generują obraz bezpośrednio" style={{ backgroundColor: "#1a1a2e" }}>
            {TRANSFORMATION_MODELS.filter((m) => m.supportsImageOutput).map((m) => (
              <option key={m.id} value={m.id} style={{ backgroundColor: "#1a1a2e" }}>
                {m.label}
              </option>
            ))}
          </optgroup>
          <optgroup
            label="Ulepszają prompt → Gemini generuje (2-step)"
            style={{ backgroundColor: "#1a1a2e" }}
          >
            {TRANSFORMATION_MODELS.filter((m) => !m.supportsImageOutput).map((m) => (
              <option key={m.id} value={m.id} style={{ backgroundColor: "#1a1a2e" }}>
                {m.label}
              </option>
            ))}
          </optgroup>
        </select>

        {/* Spacer */}
        <div style={{ flex: 1, minWidth: "8px" }} />

        {/* Transform button */}
        <button
          onClick={handleTransform}
          disabled={!selectedPreset || isTransforming}
          title={!selectedPreset ? "Wybierz styl transformacji" : undefined}
          style={{
            padding: "6px 16px",
            borderRadius: "6px",
            backgroundColor:
              !selectedPreset || isTransforming ? "rgba(124,58,237,0.25)" : "#7c3aed",
            color: !selectedPreset || isTransforming ? "rgba(255,255,255,0.3)" : "#fff",
            border: "none",
            fontSize: "13px",
            fontWeight: 600,
            cursor: !selectedPreset || isTransforming ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {isTransforming ? "Transformuję…" : "▶ Zastosuj"}
        </button>

        {/* Save object button */}
        {isSaveable && (
          <button
            onClick={onSave}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              backgroundColor: "#10b981",
              color: "#fff",
              border: "none",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Zapisz
          </button>
        )}
      </div>

      {/* Expandable prompt editor */}
      {showInstructions && (
        <div
          style={{
            padding: "8px 20px 10px",
            backgroundColor: "var(--dt-color-brand-navy)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            gap: "8px",
            alignItems: "flex-start",
          }}
        >
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Zmodyfikuj prompt lub dodaj własne instrukcje do stylu…"
            rows={2}
            style={{
              flex: 1,
              resize: "none",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.05)",
              color: "#fff",
              fontSize: "13px",
              padding: "8px 12px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={onOpenPrompts}
            title="Zapisz lub wczytaj styl"
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.15)",
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.5)",
              fontSize: "12px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              alignSelf: "stretch",
            }}
          >
            Style →
          </button>
        </div>
      )}
    </div>
  );
});

export default TransformToolbar;
