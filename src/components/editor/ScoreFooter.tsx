import type { QualityScoreSnapshot } from "@/types/transformations";
import ScoreBreakdown from "./ScoreBreakdown";

interface ScoreFooterProps {
  scoreBefore: QualityScoreSnapshot | null;
  scoreAfter: QualityScoreSnapshot | null;
}

function ScoreColumn({ label, snapshot }: { label: string; snapshot: QualityScoreSnapshot | null }) {
  return (
    <div style={{ flex: 1, padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--dt-color-steel)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </span>
        {snapshot !== null ? (
          <>
            <span style={{ fontSize: "28px", fontWeight: 700, color: "var(--dt-color-ink)", lineHeight: 1 }}>
              {snapshot.overall.toFixed(1)}
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "var(--dt-radius-full)",
                backgroundColor: snapshot.is_sales_ready ? "var(--dt-color-tint-mint)" : "var(--dt-color-tint-yellow)",
                color: snapshot.is_sales_ready ? "#10b981" : "#d97706",
              }}
            >
              {snapshot.is_sales_ready ? "Gotowe do sprzedaży" : "Wymaga poprawy"}
            </span>
          </>
        ) : (
          <span style={{ fontSize: "28px", fontWeight: 700, color: "var(--dt-color-muted)", lineHeight: 1 }}>—</span>
        )}
      </div>
      {snapshot !== null ? (
        <ScoreBreakdown snapshot={snapshot} />
      ) : (
        <p style={{ fontSize: "13px", color: "var(--dt-color-muted)", margin: 0 }}>Brak danych</p>
      )}
    </div>
  );
}

export default function ScoreFooter({ scoreBefore, scoreAfter }: ScoreFooterProps) {
  return (
    <div
      className="sticky bottom-0"
      style={{
        backgroundColor: "var(--dt-color-canvas)",
        borderTop: "1px solid var(--dt-color-hairline)",
        display: "flex",
        maxHeight: "240px",
        overflowY: "auto",
      }}
    >
      <ScoreColumn label="Ocena przed" snapshot={scoreBefore} />
      <div style={{ width: "1px", backgroundColor: "var(--dt-color-hairline)", flexShrink: 0 }} />
      <ScoreColumn label="Ocena po" snapshot={scoreAfter} />
    </div>
  );
}
