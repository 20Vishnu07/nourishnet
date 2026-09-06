import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, type UserRole } from "../contexts/AuthContext";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { colors, shadows } from "../styles/theme";

type AuthMode = "signin" | "signup";

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { login, register, verifyAndLogin, error, clearError, isLoading } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("donor");
  const [phone, setPhone] = useState("");
  const [orgName, setOrgName] = useState("");
  const [address, setAddress] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = localError || error;

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim() || !password) {
      setLocalError("Please enter both email and password.");
      return;
    }

    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Sign in failed");
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!name.trim()) {
      setLocalError("Please enter your name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setLocalError("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 6) {
      setLocalError("Password must be at least 6 characters.");
      return;
    }

    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        phone: phone.trim() || undefined,
        org_name: orgName.trim() || undefined,
        address: address.trim() || undefined,
        language_pref: i18n.language || "en",
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Registration failed");
    }
  };

  const handleQuickDemo = async (demoRole: UserRole) => {
    setLocalError(null);
    clearError();
    const demoNames: Record<UserRole, string> = {
      donor: "Green Leaf Cafe (Demo)",
      ngo: "Care & Share Shelter (Demo)",
      volunteer: "Alex Driver (Demo)",
    };
    const mockUid = `demo_${demoRole}_${Date.now()}`;
    try {
      await verifyAndLogin(mockUid, demoNames[demoRole], demoRole, i18n.language);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Demo login failed");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <Link to="/" style={{ textDecoration: "none", color: colors.primary, fontSize: "0.85rem", fontWeight: 700 }}>
            ← Home
          </Link>
          <LanguageSwitcher />
        </div>

        <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "4px" }}>🌱</div>
          <h1 style={styles.title}>{t("common.appName")}</h1>
          <p style={styles.subtitle}>{t("common.subtitle")}</p>
        </div>

        {/* MODE TABS (Sign In / Sign Up) */}
        <div style={styles.modeTabs}>
          <button
            type="button"
            onClick={() => { setMode("signin"); setLocalError(null); clearError(); }}
            style={{
              ...styles.modeTab,
              ...(mode === "signin" ? styles.modeTabActive : {}),
            }}
          >
            {t("auth.signIn")}
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setLocalError(null); clearError(); }}
            style={{
              ...styles.modeTab,
              ...(mode === "signup" ? styles.modeTabActive : {}),
            }}
          >
            {t("auth.signUp")}
          </button>
        </div>

        {displayError && (
          <div style={styles.error}>
            <span>⚠️ {displayError}</span>
            <button onClick={() => { setLocalError(null); clearError(); }} style={styles.dismissBtn}>
              ✕
            </button>
          </div>
        )}

        {/* SIGN IN FORM */}
        {mode === "signin" && (
          <form onSubmit={handleSignIn} style={styles.form}>
            <label style={styles.label}>{t("auth.emailLabel")}</label>
            <input
              type="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              disabled={isLoading}
              required
            />

            <label style={styles.label}>{t("auth.passwordLabel")}</label>
            <input
              type="password"
              placeholder={t("auth.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              disabled={isLoading}
              required
            />

            <button type="submit" style={styles.button} disabled={isLoading}>
              {isLoading ? t("auth.signingIn") : t("auth.signIn")}
            </button>

            <button
              type="button"
              onClick={() => { setMode("signup"); setLocalError(null); }}
              style={styles.linkBtn}
            >
              {t("auth.noAccount")}
            </button>
          </form>
        )}

        {/* SIGN UP FORM */}
        {mode === "signup" && (
          <form onSubmit={handleSignUp} style={styles.form}>
            <label style={styles.label}>{t("auth.iAmA")}</label>
            <div style={styles.roleGroup}>
              {(["donor", "ngo", "volunteer"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  style={{
                    ...styles.roleBtn,
                    ...(role === r ? styles.roleBtnActive : {}),
                  }}
                >
                  {r === "donor" && `🍲 ${t("auth.donorRole")}`}
                  {r === "ngo" && `🏢 ${t("auth.ngoRole")}`}
                  {r === "volunteer" && `🚗 ${t("auth.volunteerRole")}`}
                </button>
              ))}
            </div>

            <label style={styles.label}>{t("auth.yourName")}</label>
            <input
              type="text"
              placeholder={t("auth.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              disabled={isLoading}
              required
            />

            <label style={styles.label}>{t("auth.emailLabel")}</label>
            <input
              type="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              disabled={isLoading}
              required
            />

            <label style={styles.label}>{t("auth.passwordLabel")}</label>
            <input
              type="password"
              placeholder={t("auth.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              disabled={isLoading}
              required
            />

            {(role === "ngo" || role === "donor") && (
              <>
                <label style={styles.label}>{t("auth.orgLabel")}</label>
                <input
                  type="text"
                  placeholder={t("auth.orgPlaceholder")}
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  style={styles.input}
                  disabled={isLoading}
                />
              </>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={styles.label}>{t("auth.phoneOptional")}</label>
                <input
                  type="tel"
                  placeholder={t("auth.phoneOptionalPlaceholder")}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={styles.input}
                  disabled={isLoading}
                />
              </div>
              <div>
                <label style={styles.label}>{t("auth.addressLabel")}</label>
                <input
                  type="text"
                  placeholder={t("auth.addressPlaceholder")}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  style={styles.input}
                  disabled={isLoading}
                />
              </div>
            </div>

            <button type="submit" style={styles.button} disabled={isLoading}>
              {isLoading ? t("auth.signingUp") : t("auth.signUp")}
            </button>

            <button
              type="button"
              onClick={() => { setMode("signin"); setLocalError(null); }}
              style={styles.linkBtn}
            >
              {t("auth.haveAccount")}
            </button>
          </form>
        )}

        {/* QUICK DEMO SHORTCUTS */}
        <div style={{ marginTop: "1.25rem", borderTop: `1px solid ${colors.border}`, paddingTop: "1rem" }}>
          <p style={{ fontSize: "0.75rem", color: colors.textMuted, textAlign: "center", marginBottom: "0.5rem" }}>
            Instant Evaluation Shortcuts (1-Click Login):
          </p>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={() => handleQuickDemo("donor")}
              style={styles.quickTestBtn}
            >
              🍲 Donor
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo("ngo")}
              style={styles.quickTestBtn}
            >
              🏢 NGO
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo("volunteer")}
              style={styles.quickTestBtn}
            >
              🚗 Volunteer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    padding: "1rem",
    fontFamily: "var(--font-main, system-ui, sans-serif)",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: shadows.lg,
    padding: "2rem",
    width: "100%",
    maxWidth: "460px",
    border: `1px solid ${colors.border}`,
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 800,
    color: colors.primaryDark,
    margin: "0 0 0.25rem 0",
  },
  subtitle: {
    fontSize: "0.85rem",
    color: colors.textMuted,
    margin: 0,
  },
  modeTabs: {
    display: "flex",
    background: "#f1f5f9",
    padding: "4px",
    borderRadius: "10px",
    marginBottom: "1.25rem",
    gap: "4px",
  },
  modeTab: {
    flex: 1,
    padding: "8px",
    border: "none",
    background: "transparent",
    borderRadius: "7px",
    fontWeight: 700,
    fontSize: "0.85rem",
    color: "#64748b",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  modeTabActive: {
    background: "#ffffff",
    color: colors.primary,
    boxShadow: shadows.sm,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  label: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: colors.textDark,
    marginBottom: "-0.35rem",
  },
  input: {
    padding: "0.75rem 1rem",
    borderRadius: "10px",
    border: `1px solid ${colors.border}`,
    fontSize: "0.95rem",
    outline: "none",
    transition: "border-color 0.2s",
    width: "100%",
    boxSizing: "border-box",
  },
  button: {
    padding: "0.85rem",
    borderRadius: "10px",
    border: "none",
    backgroundColor: colors.primary,
    color: "#ffffff",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: "0.25rem",
    transition: "background-color 0.2s",
    boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: colors.primaryDark,
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
    padding: "4px",
    marginTop: "2px",
  },
  roleGroup: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "0.5rem",
  },
  roleBtn: {
    padding: "0.6rem 0.4rem",
    borderRadius: "8px",
    border: `1.5px solid ${colors.border}`,
    backgroundColor: "#ffffff",
    color: colors.textDark,
    fontSize: "0.75rem",
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "center",
  },
  roleBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    color: colors.primaryDark,
  },
  error: {
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    padding: "0.65rem 0.85rem",
    borderRadius: "8px",
    fontSize: "0.82rem",
    marginBottom: "1rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dismissBtn: {
    background: "none",
    border: "none",
    color: "#b91c1c",
    cursor: "pointer",
    fontWeight: 700,
  },
  quickTestBtn: {
    flex: 1,
    padding: "6px 8px",
    borderRadius: "6px",
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#475569",
    cursor: "pointer",
  },
};
