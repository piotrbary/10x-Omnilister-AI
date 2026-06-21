const GUARDRAILS = [
  "Nie usuwaj widocznych wad bez oznaczenia",
  "Zachowaj zgodność z rzeczywistym wyglądem",
  "Używaj stylu stosownego do kategorii",
  "Skonsultuj z kupującym przed publikacją",
];

export default function GuardrailBox() {
  return (
    <div
      style={{
        marginTop: "16px",
        padding: "14px",
        borderRadius: "var(--dt-radius-lg)",
        border: "1px solid rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.05)",
      }}
    >
      <p
        style={{
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--dt-color-on-dark-muted)",
          marginBottom: "8px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Zasady rzetelnego ogłoszenia
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
        {GUARDRAILS.map((rule) => (
          <li
            key={rule}
            style={{
              fontSize: "12px",
              color: "var(--dt-color-on-dark-muted)",
              paddingLeft: "12px",
              position: "relative",
            }}
          >
            <span style={{ position: "absolute", left: 0 }}>·</span>
            {rule}
          </li>
        ))}
      </ul>
    </div>
  );
}
