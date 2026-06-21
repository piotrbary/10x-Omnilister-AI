import type { QualityScoreSnapshot } from "@/types/transformations";

const DIMENSIONS: { key: keyof Omit<QualityScoreSnapshot, "overall" | "is_sales_ready">; label: string }[] = [
  { key: "sharpness", label: "Ostrość" },
  { key: "lighting", label: "Oświetlenie" },
  { key: "background", label: "Tło" },
  { key: "object_features", label: "Cechy obiektu" },
  { key: "damage_defects", label: "Wady i uszkodzenia" },
  { key: "labels", label: "Oznaczenia" },
  { key: "angle_coverage", label: "Kąt i pokrycie" },
  { key: "sales_readiness", label: "Gotowość sprzedażowa" },
];

function scoreBarColor(score: number): { fill: string; text: string } {
  if (score >= 7) return { fill: "var(--dt-color-tint-mint)", text: "#10b981" };
  if (score >= 4) return { fill: "#fef3c7", text: "#d97706" };
  return { fill: "#fee2e2", text: "#dc2626" };
}

interface ScoreBreakdownProps {
  snapshot: QualityScoreSnapshot;
}

export default function ScoreBreakdown({ snapshot }: ScoreBreakdownProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", maxWidth: "360px" }}>
      {DIMENSIONS.map(({ key, label }) => {
        const val = snapshot[key] as number;
        const { fill, text } = scoreBarColor(val);
        return (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 0",
              borderTop: "1px solid var(--dt-color-hairline)",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                color: "var(--dt-color-steel)",
                width: "110px",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
            <div
              style={{
                width: "140px",
                flexShrink: 0,
                height: "4px",
                borderRadius: "2px",
                backgroundColor: "var(--dt-color-hairline)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(val / 10) * 100}%`,
                  height: "100%",
                  borderRadius: "2px",
                  backgroundColor: fill,
                }}
              />
            </div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 500,
                color: text,
                width: "28px",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {val.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
