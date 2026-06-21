interface TransformedImagePanelProps {
  resultUrl: string | null;
  originalUrl: string | null;
  isTransforming: boolean;
  error: string | null;
  previewMode: "after" | "before-after";
  onTogglePreview: () => void;
  currentJobId: string | null;
  resultSaved: boolean;
  onSaveResult: () => void;
  onClearResult: () => void;
}

export default function TransformedImagePanel({
  resultUrl,
  originalUrl,
  isTransforming,
  error,
  previewMode,
  onTogglePreview,
  currentJobId,
  resultSaved,
  onSaveResult,
  onClearResult,
}: TransformedImagePanelProps) {
  const hasResult = !isTransforming && error === null && resultUrl !== null;

  return (
    <div
      className="editor-panel"
      style={{
        backgroundColor: "var(--dt-color-canvas)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        position: "relative",
      }}
    >
      {/* Transforming spinner */}
      {isTransforming && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--dt-color-canvas)",
            gap: "16px",
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              border: "3px solid var(--dt-color-hairline)",
              borderTopColor: "var(--dt-color-primary)",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p style={{ fontSize: "14px", color: "var(--dt-color-slate)" }}>Przetwarzanie…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error */}
      {!isTransforming && error !== null && (
        <div
          style={{
            padding: "24px",
            borderRadius: "var(--dt-radius-lg)",
            backgroundColor: "#fee2e2",
            border: "1px solid #fca5a5",
            textAlign: "center",
            maxWidth: "320px",
          }}
        >
          <p style={{ fontSize: "14px", color: "#dc2626", marginBottom: "12px" }}>
            Transformacja nie powiodła się. Spróbuj ponownie.
          </p>
        </div>
      )}

      {/* Result: after mode */}
      {hasResult && previewMode === "after" && (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <img
            src={resultUrl!}
            alt="Wynik transformacji"
            style={{ flex: 1, width: "100%", objectFit: "contain", minHeight: 0 }}
          />
          <ResultActions
            currentJobId={currentJobId}
            resultSaved={resultSaved}
            onSaveResult={onSaveResult}
            onClearResult={onClearResult}
            onTogglePreview={onTogglePreview}
            compareLabel="Porównaj"
          />
        </div>
      )}

      {/* Result: before-after mode */}
      {hasResult && previewMode === "before-after" && (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flex: 1, minHeight: 0 }}>
            <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
              <img
                src={originalUrl ?? ""}
                alt="Przed"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
              <span
                style={{
                  position: "absolute",
                  top: "6px",
                  left: "6px",
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.7)",
                  backgroundColor: "rgba(0,0,0,0.45)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  letterSpacing: "0.05em",
                }}
              >
                PRZED
              </span>
            </div>
            <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
              <img
                src={resultUrl!}
                alt="Po"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
              <span
                style={{
                  position: "absolute",
                  top: "6px",
                  left: "6px",
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.7)",
                  backgroundColor: "rgba(0,0,0,0.45)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  letterSpacing: "0.05em",
                }}
              >
                PO
              </span>
            </div>
          </div>
          <ResultActions
            currentJobId={currentJobId}
            resultSaved={resultSaved}
            onSaveResult={onSaveResult}
            onClearResult={onClearResult}
            onTogglePreview={onTogglePreview}
            compareLabel="Widok po"
          />
        </div>
      )}

      {/* Empty state */}
      {!isTransforming && error === null && resultUrl === null && (
        <p style={{ fontSize: "14px", color: "var(--dt-color-steel)", textAlign: "center" }}>
          Wybierz styl i kliknij Zastosuj
        </p>
      )}
    </div>
  );
}

interface ResultActionsProps {
  currentJobId: string | null;
  resultSaved: boolean;
  onSaveResult: () => void;
  onClearResult: () => void;
  onTogglePreview: () => void;
  compareLabel: string;
}

function ResultActions({
  currentJobId,
  resultSaved,
  onSaveResult,
  onClearResult,
  onTogglePreview,
  compareLabel,
}: ResultActionsProps) {
  return (
    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexShrink: 0 }}>
      <button
        onClick={onTogglePreview}
        style={{
          padding: "5px 10px",
          borderRadius: "var(--dt-radius-md)",
          border: "1px solid var(--dt-color-hairline)",
          backgroundColor: "var(--dt-color-canvas)",
          color: "var(--dt-color-slate)",
          fontSize: "12px",
          cursor: "pointer",
        }}
      >
        {compareLabel}
      </button>

      {currentJobId && !resultSaved && (
        <button
          onClick={onSaveResult}
          style={{
            padding: "5px 12px",
            borderRadius: "var(--dt-radius-md)",
            border: "none",
            backgroundColor: "#7c3aed",
            color: "#fff",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Zapisz wynik
        </button>
      )}

      {resultSaved && (
        <span
          style={{
            padding: "5px 12px",
            fontSize: "12px",
            color: "#10b981",
            fontWeight: 600,
          }}
        >
          Zapisano ✓
        </span>
      )}

      <button
        onClick={onClearResult}
        title="Wyczyść wynik transformacji"
        style={{
          padding: "5px 10px",
          borderRadius: "var(--dt-radius-md)",
          border: "1px solid var(--dt-color-hairline)",
          backgroundColor: "var(--dt-color-canvas)",
          color: "var(--dt-color-steel)",
          fontSize: "12px",
          cursor: "pointer",
        }}
      >
        Wyczyść
      </button>
    </div>
  );
}
