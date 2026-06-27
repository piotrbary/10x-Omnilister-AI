import { useEffect, useState } from "react";
import { X, BookmarkPlus, RefreshCw } from "lucide-react";
import type { ObjectCategory } from "@/lib/config";

interface StyleEntry {
  id: string;
  name: string;
  prompt: string;
  description: string | null;
}

interface PromptDrawerProps {
  open: boolean;
  category: ObjectCategory;
  currentPrompt: string;
  onClose: () => void;
  onApply: (prompt: string) => void;
}

export default function PromptDrawer({
  open,
  category,
  currentPrompt,
  onClose,
  onApply,
}: PromptDrawerProps) {
  const [styles, setStyles] = useState<StyleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) void loadStyles();
  }, [open, category]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStyles() {
    setLoading(true);
    try {
      const res = await fetch(`/api/styles?category=${category}`);
      if (res.ok) {
        const data = (await res.json()) as { styles: StyleEntry[] };
        setStyles(data.styles);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!saveName.trim() || !currentPrompt.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          category,
          prompt: currentPrompt,
          is_public: false,
        }),
      });
      if (res.ok) {
        setSaveName("");
        setShowSaveForm(false);
        void loadStyles();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={onClose} />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "280px",
          zIndex: 201,
          backgroundColor: "var(--dt-color-brand-navy)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            gap: "8px",
          }}
        >
          <span
            style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.8)" }}
          >
            Moje style / prompty
          </span>
          <button
            onClick={() => void loadStyles()}
            title="Odśwież"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.35)",
              display: "flex",
              padding: "2px",
            }}
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.35)",
              display: "flex",
              padding: "2px",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Save current prompt */}
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {showSaveForm ? (
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave();
                  if (e.key === "Escape") setShowSaveForm(false);
                }}
                placeholder="Nazwa stylu…"
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  fontSize: "12px",
                  outline: "none",
                }}
              />
              <button
                onClick={() => void handleSave()}
                disabled={!saveName.trim() || saving}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor:
                    !saveName.trim() || saving ? "rgba(124,58,237,0.25)" : "#7c3aed",
                  color: !saveName.trim() || saving ? "rgba(255,255,255,0.3)" : "#fff",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: !saveName.trim() || saving ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {saving ? "…" : "Zapisz"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveForm(true)}
              disabled={!currentPrompt.trim()}
              style={{
                width: "100%",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px dashed rgba(255,255,255,0.15)",
                background: "none",
                color: "rgba(255,255,255,0.45)",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                cursor: currentPrompt.trim() ? "pointer" : "not-allowed",
                opacity: currentPrompt.trim() ? 1 : 0.4,
              }}
            >
              <BookmarkPlus size={13} /> Zapisz aktualny prompt jako styl
            </button>
          )}
        </div>

        {/* Style list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <p
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.3)",
                textAlign: "center",
                padding: "24px 16px",
                margin: 0,
              }}
            >
              Ładowanie…
            </p>
          )}
          {!loading && styles.length === 0 && (
            <p
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.3)",
                textAlign: "center",
                padding: "24px 16px",
                margin: 0,
              }}
            >
              Brak stylów dla tej kategorii. Wpisz prompt w edytorze i użyj przycisku powyżej.
            </p>
          )}
          {!loading &&
            styles.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onApply(s.prompt);
                  onClose();
                }}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  display: "block",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.75)",
                    marginBottom: "2px",
                  }}
                >
                  {s.name}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.3)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.description ?? s.prompt}
                </div>
              </button>
            ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <a
            href="/styles"
            style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", textDecoration: "none" }}
          >
            Zarządzaj wszystkimi stylami →
          </a>
        </div>
      </div>
    </>
  );
}
