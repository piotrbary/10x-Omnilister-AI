interface AppNavBarProps {
  userEmail: string;
}

export default function AppNavBar({ userEmail }: AppNavBarProps) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        height: "48px",
        backgroundColor: "#07071a",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
        gap: 0,
      }}
    >
      {/* Logo */}
      <a
        href="/"
        style={{
          fontSize: "14px",
          fontWeight: 700,
          color: "#fff",
          textDecoration: "none",
          marginRight: "28px",
          whiteSpace: "nowrap",
          letterSpacing: "-0.01em",
        }}
      >
        Omnilister AI
      </a>

      {/* Nav links */}
      <div style={{ display: "flex", gap: "2px", flex: 1 }}>
        {(
          [
            { href: "/dashboard", label: "Dashboard" },
            { href: "/objects", label: "Obiekty" },
            { href: "/styles", label: "Style" },
            { href: "/app/editor", label: "Studio", active: true },
          ] as { href: string; label: string; active?: boolean }[]
        ).map(({ href, label, active }) => (
          <a
            key={href}
            href={href}
            style={{
              fontSize: "13px",
              fontWeight: active ? 600 : 400,
              color: active ? "#fff" : "rgba(255,255,255,0.5)",
              textDecoration: "none",
              padding: "5px 10px",
              borderRadius: "6px",
              backgroundColor: active ? "rgba(255,255,255,0.08)" : "transparent",
            }}
          >
            {label}
          </a>
        ))}
      </div>

      {/* Right: user info + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", flexShrink: 0 }}>
        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {userEmail}
        </span>
        <a
          href="/objects"
          style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", textDecoration: "none" }}
        >
          Profil
        </a>
        <form method="POST" action="/api/auth/signout" style={{ margin: 0, padding: 0 }}>
          <button
            type="submit"
            style={{
              fontSize: "12px",
              color: "rgba(255,255,255,0.55)",
              background: "none",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "6px",
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            Wyloguj
          </button>
        </form>
      </div>
    </nav>
  );
}
