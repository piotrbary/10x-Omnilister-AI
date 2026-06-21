import type { ObjectCategory } from "@/lib/config";

interface CategorySelectorProps {
  value: ObjectCategory;
  onChange: (c: ObjectCategory) => void;
}

const CATEGORY_OPTIONS: { value: ObjectCategory; label: string }[] = [
  { value: "car", label: "Samochód" },
  { value: "real-estate", label: "Nieruchomość" },
  { value: "item", label: "Przedmiot" },
];

export default function CategorySelector({ value, onChange }: CategorySelectorProps) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <label
        style={{
          display: "block",
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--dt-color-on-dark-muted)",
          marginBottom: "6px",
        }}
      >
        Kategoria obiektu
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ObjectCategory)}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: "var(--dt-radius-md)",
          border: "1px solid rgba(255,255,255,0.15)",
          backgroundColor: "rgba(255,255,255,0.08)",
          color: "var(--dt-color-on-dark)",
          fontSize: "14px",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {CATEGORY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ backgroundColor: "#1a1a2e", color: "#fff" }}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
