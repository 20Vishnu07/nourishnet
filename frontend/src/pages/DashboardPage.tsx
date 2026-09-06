import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import DonorDashboard from "./donor/DonorDashboard";
import NGODashboard from "./ngo/NGODashboard";
import VolunteerDashboard from "./volunteer/VolunteerDashboard";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { colors, shadows } from "../styles/theme";

export default function DashboardPage() {
  const { t } = useTranslation();
  const { appUser, logout } = useAuth();

  if (!appUser) return null;

  const roleEmoji: Record<string, string> = {
    donor: "🍲",
    ngo: "🏢",
    volunteer: "🚗",
  };

  const roleLabels: Record<string, string> = {
    donor: t("auth.donorRole"),
    ngo: t("auth.ngoRole"),
    volunteer: t("auth.volunteerRole"),
  };

  const roleTheme = {
    donor: { bg: colors.primaryLight, color: colors.primary, border: "rgba(5, 150, 105, 0.2)" },
    ngo: { bg: colors.ngoLight, color: colors.ngoAccent, border: "rgba(2, 132, 199, 0.2)" },
    volunteer: { bg: colors.accentLight, color: colors.accentHover, border: "rgba(217, 119, 6, 0.2)" },
  };

  const currentTheme = roleTheme[appUser.role] ?? roleTheme.donor;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.brand}>
            <span style={{ fontSize: "1.5rem" }}>🌱</span>
            <div>
              <h1 style={styles.title}>{t("common.appName")}</h1>
              <div style={styles.liveIndicator}>
                <span className="pulse-dot" />
                <span style={{ fontSize: "0.7rem", color: colors.textMuted, fontWeight: 600 }}>
                  Live Redistribution
                </span>
              </div>
            </div>
          </div>

          <div style={styles.userInfo}>
            <LanguageSwitcher />
            <div
              style={{
                ...styles.roleBadge,
                backgroundColor: currentTheme.bg,
                color: currentTheme.color,
                border: `1px solid ${currentTheme.border}`,
              }}
            >
              <span>{roleEmoji[appUser.role]}</span>
              <span>{roleLabels[appUser.role] || appUser.role}</span>
            </div>

            <div style={styles.userProfile}>
              <div style={styles.avatar}>
                {appUser.name.charAt(0).toUpperCase()}
              </div>
              <span style={styles.userName}>{appUser.name}</span>
            </div>

            <button onClick={logout} style={styles.logoutBtn}>
              {t("common.logout")}
            </button>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        {appUser.role === "donor" && <DonorDashboard />}
        {appUser.role === "ngo" && <NGODashboard />}
        {appUser.role === "volunteer" && <VolunteerDashboard />}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#f8fafc",
    fontFamily: "var(--font-main, system-ui, sans-serif)",
  },
  header: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    backdropFilter: "blur(10px)",
    boxShadow: shadows.sm,
    borderBottom: `1px solid ${colors.border}`,
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
  },
  headerContent: {
    maxWidth: "1100px",
    margin: "0 auto",
    padding: "0.75rem 1.5rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.75rem",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  title: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: 800,
    color: colors.primary,
    letterSpacing: "-0.5px",
    lineHeight: 1.1,
  },
  liveIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginTop: "2px",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  roleBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 12px",
    borderRadius: "20px",
    fontSize: "0.75rem",
    fontWeight: 700,
    textTransform: "uppercase",
  },
  userProfile: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  avatar: {
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    fontWeight: 700,
    fontSize: "0.85rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid rgba(5, 150, 105, 0.3)`,
  },
  userName: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: colors.textDark,
  },
  logoutBtn: {
    padding: "0.45rem 0.85rem",
    borderRadius: "8px",
    border: `1px solid ${colors.border}`,
    background: "#ffffff",
    color: colors.textMuted,
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  main: {
    maxWidth: "960px",
    margin: "1.75rem auto",
    padding: "0 1.25rem 3rem",
  },
};
