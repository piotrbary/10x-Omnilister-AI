import type { QualityScoreSnapshot } from "@/types/transformations";

const DIMENSIONS: { key: keyof Omit<QualityScoreSnapshot, "overall" | "is_sales_ready">; label: string }[] = [
  { key: "sharpness", label: "Ostrość" },
  { key: "lighting", label: "Oświetlenie" },
  { key: "background", label: "Tło" },
  { key: "object_features", label: "Cechy" },
  { key: "damage_defects", label: "Wady" },
  { key: "labels", label: "Oznaczenia" },
  { key: "angle_coverage", label: "Kąt" },
  { key: "sales_readiness", label: "Sprzedaż" },
];

function scoreColor(val: number): string {
  if (val >= 7) return "#10b981";
  if (val >= 4) return "#d97706";
  return "#dc2626";
}

function ScoreSection({ title, snapshot }: { title: string; snapshot: QualityScoreSnapshot | null }) {
  return (
    <div style={{ padding: "14px 12px" }}>
      <p
        style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "var(--dt-color-steel)",
          margin: "0 0 8px 0",
        }}
      >
        {title}
      </p>

      {snapshot !== null ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "10px" }}>
            <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--dt-color-ink)", lineHeight: 1 }}>
              {snapshot.overall.toFixed(1)}
            </span>
            <span
              style={{
                fontSize: "9px",
                fontWeight: 600,
                padding: "2px 5px",
                borderRadius: "99px",
                backgroundColor: snapshot.is_sales_ready ? "var(--dt-color-tint-mint)" : "var(--dt-color-tint-yellow)",
                color: snapshot.is_sales_ready ? "#10b981" : "#d97706",
              }}
            >
              {snapshot.is_sales_ready ? "Gotowe" : "Popraw"}
            </span>
          </div>

          <div>
            {DIMENSIONS.map(({ key, label }) => {
              const val = snapshot[key] as number;
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "3px 0",
                    borderTop: "1px solid var(--dt-color-hairline)",
                  }}
                >
                  <span style={{ fontSize: "11px", color: "var(--dt-color-slate)" }}>{label}</span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: scoreColor(val),
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {val.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p style={{ fontSize: "11px", color: "var(--dt-color-muted)", margin: 0 }}>Brak danych</p>
      )}
    </div>
  );
}

interface ScoreSidebarProps {
  scoreBefore: QualityScoreSnapshot | null;
  scoreAfter: QualityScoreSnapshot | null;
}

export default function ScoreSidebar({ scoreBefore, scoreAfter }: ScoreSidebarProps) {
  return (
    <div
      className="editor-panel"
      style={{
        backgroundColor: "var(--dt-color-canvas)",
        borderRight: "1px solid var(--dt-color-hairline)",
      }}
    >
      <ScoreSection title="Ocena przed" snapshot={scoreBefore} />
      <div style={{ height: "1px", backgroundColor: "var(--dt-color-hairline)" }} />
      <ScoreSection title="Ocena po" snapshot={scoreAfter} />
    </div>
  );
}
