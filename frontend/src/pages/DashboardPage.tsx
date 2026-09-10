import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import DonorDashboard from "./donor/DonorDashboard";
import NGODashboard from "./ngo/NGODashboard";
import VolunteerDashboard from "./volunteer/VolunteerDashboard";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { colors, shadows } from "../styles/theme";

import type { UserRole } from "../contexts/AuthContext";

export default function DashboardPage() {
  const { t } = useTranslation();
  const { appUser, logout } = useAuth();

  if (!appUser) return null;

  const activeRole: UserRole = (appUser.role?.toLowerCase() as UserRole) || "donor";

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
    donor: {
      bg: "#ecfdf5",
      color: "#059669",
      border: "rgba(5, 150, 105, 0.25)",
      gradient: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
      portalTitle: "Food Donor Portal",
      portalDesc: "Publish surplus food, coordinate pickups, and track your environmental & community impact in real-time.",
    },
    ngo: {
      bg: "#f0f9ff",
      color: "#0284c7",
      border: "rgba(2, 132, 199, 0.25)",
      gradient: "linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)",
      portalTitle: "NGO & Shelter Portal",
      portalDesc: "Scan local surplus food, claim meals for your shelter, and coordinate volunteer couriers.",
    },
    volunteer: {
      bg: "#fffbeb",
      color: "#d97706",
      border: "rgba(217, 119, 6, 0.25)",
      gradient: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)",
      portalTitle: "Volunteer Courier Portal",
      portalDesc: "Accept rescue missions, navigate pickup-to-shelter routes, and deliver vital food to people in need.",
    },
  };

  const currentTheme = roleTheme[activeRole] ?? roleTheme.donor;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <Link to="/" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.5rem" }}>🌱</span>
            <div>
              <h1 style={styles.title}>{t("common.appName")}</h1>
              <div style={styles.liveIndicator}>
                <span className="pulse-dot" />
                <span style={{ fontSize: "0.7rem", color: colors.textMuted, fontWeight: 600 }}>
                  Live Redistribution Network
                </span>
              </div>
            </div>
          </Link>

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
              <span>{roleEmoji[activeRole]}</span>
              <span>{roleLabels[activeRole] || activeRole}</span>
            </div>

            <div style={styles.userProfile}>
              <div
                style={{
                  ...styles.avatar,
                  background: currentTheme.bg,
                  color: currentTheme.color,
                  border: `1px solid ${currentTheme.border}`,
                }}
              >
                {appUser.name.charAt(0).toUpperCase()}
              </div>
              <span style={styles.userName}>{appUser.name}</span>
            </div>

            <button onClick={logout} style={styles.logoutBtn} title="Sign out">
              {t("common.logout")}
            </button>
          </div>
        </div>
      </header>

      {/* Role Portal Accent Sub-bar */}
      <div
        style={{
          background: currentTheme.gradient,
          color: "#ffffff",
          padding: "1.1rem 1.5rem",
          boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ maxWidth: "1180px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.4rem" }}>{roleEmoji[activeRole]}</span>
              <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, letterSpacing: "-0.3px" }}>
                {currentTheme.portalTitle}
              </h2>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", opacity: 0.92, maxWidth: "680px" }}>
              {currentTheme.portalDesc}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.18)", padding: "6px 14px", borderRadius: "20px", backdropFilter: "blur(4px)" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>
              👤 Logged in as <strong>{appUser.name}</strong> ({roleLabels[activeRole]})
            </span>
          </div>
        </div>
      </div>

      <main style={styles.main}>
        {activeRole === "donor" && <DonorDashboard />}
        {activeRole === "ngo" && <NGODashboard />}
        {activeRole === "volunteer" && <VolunteerDashboard />}
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
    backgroundColor: "rgba(255, 255, 255, 0.98)",
    backdropFilter: "blur(10px)",
    boxShadow: shadows.sm,
    borderBottom: `1px solid ${colors.border}`,
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
  },
  headerContent: {
    maxWidth: "1180px",
    margin: "0 auto",
    padding: "0.75rem 1.25rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.75rem",
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
    flexWrap: "wrap",
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
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    fontWeight: 800,
    fontSize: "0.85rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
    maxWidth: "1180px",
    margin: "1.5rem auto",
    padding: "0 1.25rem 3.5rem",
  },
};
