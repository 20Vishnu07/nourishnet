import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, type UserRole } from "../contexts/AuthContext";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { colors, shadows } from "../styles/theme";

type AuthMode = "signin" | "signup";

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, register, verifyAndLogin, error, clearError, isLoading } = useAuth();

  const initialRole = (searchParams.get("role") as UserRole) || "donor";
  const initialMode = (searchParams.get("mode") as AuthMode) || "signin";

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>(["donor", "ngo", "volunteer"].includes(initialRole) ? initialRole : "donor");
  const [phone, setPhone] = useState("");
  const [orgName, setOrgName] = useState("");
  const [address, setAddress] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);
  const [signupSuccessData, setSignupSuccessData] = useState<{
    name: string;
    email: string;
    role: UserRole;
  } | null>(null);

  const displayError = localError || error;

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setLocalSuccess(null);
    clearError();

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setLocalError("⚠️ Please enter both your email ID and password.");
      return;
    }

    const currentRoleTitle = roleTitles[role]?.title || "Account";

    try {
      await login(cleanEmail, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      const lower = msg.toLowerCase();

      // DO NOT return to home page or change tab! Keep user on sign-in and show clear message
      if (lower.includes("password") || lower.includes("unauthorized") || lower.includes("401")) {
        setLocalError(`⚠️ Wrong password entered for ${currentRoleTitle}. Please check your password and try again.`);
      } else if (lower.includes("no account") || lower.includes("not found") || lower.includes("404")) {
        setLocalError(`⚠️ Wrong email ID. No ${currentRoleTitle} account found with "${cleanEmail}". Please check your email ID or sign up.`);
      } else {
        setLocalError(`⚠️ Wrong email ID or password given for ${currentRoleTitle}. Please check and try again.`);
      }
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
      }, false);

      // Return to sign in form, prefill email, clear password & show success
      setMode("signin");
      setPassword("");
      setLocalSuccess(
        `🎉 Account successfully created for ${roleTitles[role].title}! Please enter your password to sign in.`
      );
      setSignupSuccessData({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      if (
        msg.toLowerCase().includes("already registered") ||
        msg.toLowerCase().includes("already exists")
      ) {
        setLocalError("⚠️ This email is already registered. Please switch to Sign In or use another email.");
      } else {
        setLocalError(msg);
      }
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

  const roleTitles = {
    donor: { title: "Food Donor", icon: "🍲", desc: "Donate surplus meals to local communities" },
    ngo: { title: "NGO & Shelter", icon: "🏢", desc: "Claim food donations & dispatch volunteer couriers" },
    volunteer: { title: "Volunteer Courier", icon: "🚗", desc: "Deliver food with step-by-step live tracking" },
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

        {/* ROLE SELECTION TABS (Visible for both Sign In and Sign Up) */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={{ ...styles.label, display: "block", marginBottom: "6px" }}>
            Select Your Role:
          </label>
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
          <div style={{
            marginTop: "6px",
            fontSize: "0.76rem",
            color: colors.textMuted,
            textAlign: "center",
            background: "#f8fafc",
            padding: "4px 8px",
            borderRadius: "6px",
            border: "1px solid #e2e8f0",
          }}>
            {roleTitles[role].icon} <strong>{roleTitles[role].title}</strong>: {roleTitles[role].desc}
          </div>
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

        {localSuccess && (
          <div style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            color: "#065f46",
            fontSize: "0.85rem",
            fontWeight: 600,
            marginBottom: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span>{localSuccess}</span>
            <button onClick={() => setLocalSuccess(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#065f46", fontSize: "0.9rem" }}>
              ✕
            </button>
          </div>
        )}

        {/* SIGN IN FORM */}
        {mode === "signin" && (
          <form onSubmit={handleSignIn} style={styles.form}>
            <div style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "8px",
              padding: "6px 10px",
              fontSize: "0.8rem",
              color: "#15803d",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}>
              <span>{roleTitles[role].icon}</span>
              <span>Signing in as: <strong>{roleTitles[role].title}</strong></span>
            </div>

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
              {isLoading ? t("auth.signingIn") : `Sign In as ${roleTitles[role].title}`}
            </button>

            <button
              type="button"
              onClick={() => { setMode("signup"); setLocalError(null); }}
              style={styles.linkBtn}
            >
              Need an account? Sign up as {roleTitles[role].title}
            </button>
          </form>
        )}

        {/* SIGN UP FORM */}
        {mode === "signup" && (
          <form onSubmit={handleSignUp} style={styles.form}>
            <div style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              padding: "6px 10px",
              fontSize: "0.8rem",
              color: "#1d4ed8",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}>
              <span>{roleTitles[role].icon}</span>
              <span>Creating account as: <strong>{roleTitles[role].title}</strong></span>
            </div>

            <label style={styles.label}>
              {role === "ngo" ? "Contact Person / Representative Name *" : t("auth.yourName")}
            </label>
            <input
              type="text"
              placeholder={role === "ngo" ? "e.g. Sarah Jenkins (Coordinator)" : t("auth.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
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

      {/* CELEBRATION / ACCOUNT CREATED SUCCESS POPUP MODAL */}
      {signupSuccessData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
            padding: "1rem",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSignupSuccessData(null);
            }
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "24px",
              padding: "2.5rem 2rem",
              maxWidth: "460px",
              width: "100%",
              textAlign: "center",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              position: "relative",
              border: "2px solid #86efac",
            }}
          >
            <button
              onClick={() => setSignupSuccessData(null)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "#f1f5f9",
                border: "none",
                borderRadius: "50%",
                width: "34px",
                height: "34px",
                cursor: "pointer",
                fontSize: "1.1rem",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
              title="Close"
            >
              ✕
            </button>

            {/* Glowing Success Badge */}
            <div
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                backgroundColor: "#dcfce7",
                color: "#16a34a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "2.75rem",
                margin: "0 auto 1.25rem",
                boxShadow: "0 0 0 10px #f0fdf4",
              }}
            >
              🎉
            </div>

            {/* Title */}
            <h2
              style={{
                fontSize: "1.55rem",
                fontWeight: 800,
                color: "#0f172a",
                margin: "0 0 0.5rem",
              }}
            >
              Account Successfully Created!
            </h2>

            <p
              style={{
                fontSize: "0.95rem",
                color: "#475569",
                lineHeight: 1.5,
                margin: "0 0 1.25rem",
              }}
            >
              Welcome to NourishNet, <strong>{signupSuccessData.name}</strong>! Your account has been registered successfully.
            </p>

            {/* Account Details Box */}
            <div
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "14px",
                padding: "1rem",
                marginBottom: "1.5rem",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ color: "#64748b" }}>Registered Role:</span>
                <span
                  style={{
                    fontWeight: 700,
                    color:
                      signupSuccessData.role === "donor"
                        ? colors.primary
                        : signupSuccessData.role === "ngo"
                        ? colors.ngoAccent
                        : colors.accentHover,
                    backgroundColor: "#f1f5f9",
                    padding: "2px 8px",
                    borderRadius: "6px",
                  }}
                >
                  {signupSuccessData.role === "donor" && "🍲 Food Donor"}
                  {signupSuccessData.role === "ngo" && "🏢 NGO & Shelter"}
                  {signupSuccessData.role === "volunteer" && "🚗 Volunteer Courier"}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ color: "#64748b" }}>Email ID:</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>
                  {signupSuccessData.email}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ color: "#64748b" }}>Status:</span>
                <span style={{ fontWeight: 700, color: "#16a34a" }}>
                  ● Ready to Sign In
                </span>
              </div>
            </div>

            {/* Proceed to Sign In button */}
            <button
              onClick={() => {
                setSignupSuccessData(null);
                setMode("signin");
              }}
              style={{
                width: "100%",
                padding: "0.9rem",
                borderRadius: "12px",
                border: "none",
                backgroundColor: colors.primary,
                color: "#ffffff",
                fontSize: "1rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: shadows.md,
                transition: "all 0.2s",
              }}
            >
              👉 Proceed to Sign In →
            </button>
          </div>
        </div>
      )}
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
