interface AppNavBarProps {
  user: { email: string } | null;
  onSignIn: () => void;
  onBrowseObjects: () => void;
  onNewProject: () => void;
}

export default function AppNavBar({ user, onSignIn, onBrowseObjects, onNewProject }: AppNavBarProps) {
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
      <span
        style={{
          fontSize: "14px",
          fontWeight: 700,
          color: "#fff",
          marginRight: "28px",
          whiteSpace: "nowrap",
          letterSpacing: "-0.01em",
          cursor: "default",
        }}
      >
        Omnilister AI
      </span>

      {/* Nav actions */}
      <div style={{ display: "flex", gap: "4px", flex: 1 }}>
        <button
          onClick={onNewProject}
          style={{
            fontSize: "13px",
            fontWeight: 400,
            color: "rgba(255,255,255,0.5)",
            background: "none",
            border: "none",
            padding: "5px 10px",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          + Nowy
        </button>

        {user && (
          <button
            onClick={onBrowseObjects}
            style={{
              fontSize: "13px",
              fontWeight: 400,
              color: "rgba(255,255,255,0.5)",
              background: "none",
              border: "none",
              padding: "5px 10px",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Obiekty
          </button>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
        {user ? (
          <>
            <span
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.35)",
                maxWidth: "200px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user.email}
            </span>
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
          </>
        ) : (
          <button
            onClick={onSignIn}
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#fff",
              background: "rgba(99,102,241,0.85)",
              border: "none",
              borderRadius: "6px",
              padding: "5px 14px",
              cursor: "pointer",
            }}
          >
            Zaloguj się
          </button>
        )}
      </div>
    </nav>
  );
}
