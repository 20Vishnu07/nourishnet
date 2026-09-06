import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import DonorDashboard from "./donor/DonorDashboard";
import NGODashboard from "./ngo/NGODashboard";
import VolunteerDashboard from "./volunteer/VolunteerDashboard";
import LanguageSwitcher from "../components/LanguageSwitcher";

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

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>🍽️ {t("common.appName")}</h1>
        <div style={styles.userInfo}>
          <LanguageSwitcher />
          <span style={styles.roleBadge}>
            {roleEmoji[appUser.role]} {roleLabels[appUser.role] || appUser.role}
          </span>
          <span>{appUser.name}</span>
          <button onClick={logout} style={styles.logoutBtn}>
            {t("common.logout")}
          </button>
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
    background: "#f5f5f5",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    background: "white",
    padding: "0.75rem 2rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
  },
  title: {
    margin: 0,
    fontSize: "1.25rem",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    fontSize: "0.9rem",
  },
  roleBadge: {
    background: "#f0f2ff",
    color: "#667eea",
    padding: "4px 12px",
    borderRadius: "16px",
    fontSize: "0.75rem",
    fontWeight: 700,
  },
  logoutBtn: {
    padding: "0.4rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  main: {
    maxWidth: "800px",
    margin: "1.5rem auto",
    padding: "0 1rem",
  },
};
