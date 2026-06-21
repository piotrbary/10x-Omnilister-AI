import { useState, useRef, useEffect } from "react";

export type StatusType = "idle" | "info" | "progress" | "success" | "error";

export interface StatusEntry {
  type: StatusType;
  message?: string;
  percent?: number;
}

const COLORS: Record<
  StatusType,
  { bar: string; dot: string; text: string; border: string; btnBorder: string }
> = {
  idle:     { bar: "var(--dt-color-surface)",    dot: "#d1d5db", text: "var(--dt-color-steel)", border: "var(--dt-color-hairline)", btnBorder: "#d1d5db" },
  info:     { bar: "var(--dt-color-surface)",    dot: "#6b7280", text: "var(--dt-color-slate)", border: "var(--dt-color-hairline)", btnBorder: "#d1d5db" },
  progress: { bar: "#eff6ff",                    dot: "#3b82f6", text: "#1e40af",               border: "#bfdbfe",                  btnBorder: "#93c5fd" },
  success:  { bar: "#f0fdf4",                    dot: "#22c55e", text: "#15803d",               border: "#bbf7d0",                  btnBorder: "#86efac" },
  error:    { bar: "#fef2f2",                    dot: "#ef4444", text: "#dc2626",               border: "#fecaca",                  btnBorder: "#fca5a5" },
};

interface StatusBarProps {
  entry: StatusEntry;
}

export default function StatusBar({ entry }: StatusBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const c = COLORS[entry.type];

  useEffect(() => {
    setExpanded(false);
    const timer = setTimeout(() => {
      if (textRef.current) {
        setIsClamped(textRef.current.scrollHeight > textRef.current.clientHeight + 2);
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [entry.message, entry.type]);

  const message = entry.message ?? (entry.type === "idle" ? "Gotowy" : "");

  return (
    <div style={{ backgroundColor: c.bar, borderBottom: `1px solid ${c.border}` }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          padding: "5px 20px",
          gap: "8px",
          minHeight: "30px",
        }}
      >
        {/* Indicator dot */}
        <div
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: c.dot,
            flexShrink: 0,
            marginTop: "5px",
          }}
        />

        {/* Message text — clamped to 2 lines unless expanded */}
        <span
          ref={textRef}
          style={
            {
              fontSize: "12px",
              color: c.text,
              flex: 1,
              lineHeight: "1.5",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: expanded ? "unset" : 2,
            } as React.CSSProperties
          }
        >
          {message}
        </span>

        {/* Progress bar */}
        {entry.type === "progress" && entry.percent !== undefined && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, paddingTop: "3px" }}>
            <div
              style={{
                width: "90px",
                height: "3px",
                backgroundColor: "#bfdbfe",
                borderRadius: "2px",
              }}
            >
              <div
                style={{
                  width: `${entry.percent}%`,
                  height: "100%",
                  backgroundColor: "#3b82f6",
                  borderRadius: "2px",
                  transition: "width 0.2s",
                }}
              />
            </div>
            <span
              style={{ fontSize: "11px", color: "#1e40af", fontVariantNumeric: "tabular-nums" }}
            >
              {entry.percent}%
            </span>
          </div>
        )}

        {/* Szczegóły / Zwiń */}
        {isClamped && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              fontSize: "11px",
              color: c.text,
              background: "none",
              border: `1px solid ${c.btnBorder}`,
              borderRadius: "4px",
              padding: "1px 8px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              marginTop: "2px",
            }}
          >
            Szczegóły
          </button>
        )}
        {expanded && (
          <button
            onClick={() => setExpanded(false)}
            style={{
              fontSize: "11px",
              color: c.text,
              background: "none",
              border: `1px solid ${c.btnBorder}`,
              borderRadius: "4px",
              padding: "1px 8px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              marginTop: "2px",
            }}
          >
            Zwiń
          </button>
        )}
      </div>
    </div>
  );
}
