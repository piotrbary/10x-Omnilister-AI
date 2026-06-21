interface EditorHeaderProps {
  objectName: string;
  category: string | null;
  usedMb: number;
  totalMb: number;
}

export default function EditorHeader({ objectName, category, usedMb, totalMb }: EditorHeaderProps) {
  const pct = Math.min(100, Math.round((usedMb / totalMb) * 100));

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 20px",
        backgroundColor: "var(--dt-color-canvas)",
        borderBottom: "1px solid var(--dt-color-hairline)",
        gap: "16px",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <a
          href="/objects"
          style={{
            fontSize: "13px",
            color: "var(--dt-color-slate)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          ← Obiekty
        </a>
        <span style={{ color: "var(--dt-color-hairline-strong)" }}>·</span>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--dt-color-ink)" }}>{objectName}</span>
        {category && (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: "var(--dt-radius-full)",
              backgroundColor: "var(--dt-color-tint-lavender)",
              color: "var(--dt-color-primary)",
            }}
          >
            {category}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        <span style={{ fontSize: "12px", color: "var(--dt-color-steel)", whiteSpace: "nowrap" }}>
          {usedMb} MB / {totalMb} MB
        </span>
        <div
          style={{
            width: "80px",
            height: "6px",
            borderRadius: "3px",
            backgroundColor: "var(--dt-color-hairline)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: "3px",
              backgroundColor: pct > 80 ? "var(--dt-color-error)" : "var(--dt-color-primary)",
            }}
          />
        </div>
      </div>
    </header>
  );
}
