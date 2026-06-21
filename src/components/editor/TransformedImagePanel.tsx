interface TransformedImagePanelProps {
  resultUrl: string | null;
  originalUrl: string | null;
  isTransforming: boolean;
  error: string | null;
  previewMode: "after" | "before-after";
  onTogglePreview: () => void;
}

export default function TransformedImagePanel({
  resultUrl,
  originalUrl,
  isTransforming,
  error,
  previewMode,
  onTogglePreview,
}: TransformedImagePanelProps) {
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
          <button
            onClick={onTogglePreview}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--dt-radius-md)",
              backgroundColor: "#dc2626",
              color: "#fff",
              border: "none",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      {!isTransforming && error === null && resultUrl !== null && previewMode === "after" && (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
          <img src={resultUrl} alt="Wynik transformacji" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={onTogglePreview}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--dt-radius-md)",
                border: "1px solid var(--dt-color-hairline)",
                backgroundColor: "var(--dt-color-canvas)",
                color: "var(--dt-color-slate)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Porównaj
            </button>
          </div>
        </div>
      )}

      {!isTransforming && error === null && resultUrl !== null && previewMode === "before-after" && (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px", flex: 1 }}>
            <img src={originalUrl ?? ""} alt="Przed" style={{ flex: 1, objectFit: "contain", minWidth: 0 }} />
            <img src={resultUrl} alt="Po" style={{ flex: 1, objectFit: "contain", minWidth: 0 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={onTogglePreview}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--dt-radius-md)",
                border: "1px solid var(--dt-color-hairline)",
                backgroundColor: "var(--dt-color-canvas)",
                color: "var(--dt-color-slate)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Widok po
            </button>
          </div>
        </div>
      )}

      {!isTransforming && error === null && resultUrl === null && (
        <p style={{ fontSize: "14px", color: "var(--dt-color-steel)", textAlign: "center" }}>
          Wybierz styl i kliknij Zastosuj
        </p>
      )}
    </div>
  );
}
