import { useState, useRef, useCallback, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  auth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  firebaseConfig,
  type ConfirmationResult,
} from "../config/firebase";
import { useAuth, type UserRole } from "../contexts/AuthContext";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { colors, shadows } from "../styles/theme";

type LoginStep = "phone" | "otp" | "role";

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { verifyAndLogin, error, clearError, isLoading } = useAuth();

  const [step, setStep] = useState<LoginStep>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);
  const [isSimulatedAuth, setIsSimulatedAuth] = useState(false);

  // Role selection state
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("donor");

  const recaptchaRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const displayError = localError || error;

  const setupRecaptcha = useCallback(() => {
    if (recaptchaVerifierRef.current) return;
    const container = recaptchaRef.current || document.getElementById("recaptcha-container");
    if (!container) return;

    try {
      recaptchaVerifierRef.current = new RecaptchaVerifier(
        auth,
        container as HTMLElement,
        {
          size: "invisible",
          callback: () => {
            // Invisible reCAPTCHA resolved
          },
        }
      );
    } catch (err) {
      console.error("RecaptchaVerifier setup failed:", err);
    }
  }, []);

  const handleSendOTP = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!phone || phone.trim().length < 10) {
      setLocalError(t("auth.invalidPhone") || "Please enter a valid 10-digit mobile number");
      return;
    }

    const cleanPhone = phone.trim().replace(/[\s-]/g, "");
    const formattedPhone = cleanPhone.startsWith("+") ? cleanPhone : `+91${cleanPhone}`;

    const isFirebaseConfigured =
      Boolean(firebaseConfig.apiKey) &&
      !firebaseConfig.apiKey.includes("dummy") &&
      !firebaseConfig.apiKey.includes("ExampleApiKey");

    if (!isFirebaseConfigured) {
      setIsSimulatedAuth(true);
      setStep("otp");
      setOtp("123456");
      return;
    }

    try {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch { /* ignore */ }
        recaptchaVerifierRef.current = null;
      }

      setupRecaptcha();
      if (!recaptchaVerifierRef.current) {
        const container = recaptchaRef.current || document.getElementById("recaptcha-container");
        if (container) {
          recaptchaVerifierRef.current = new RecaptchaVerifier(auth, container as HTMLElement, {
            size: "invisible",
          });
        }
      }

      if (!recaptchaVerifierRef.current) {
        setLocalError("Verification container not ready. Please refresh.");
        return;
      }

      const result = await signInWithPhoneNumber(
        auth,
        formattedPhone,
        recaptchaVerifierRef.current,
      );
      setConfirmationResult(result);
      setStep("otp");
    } catch (err: any) {
      console.error("Firebase signInWithPhoneNumber error:", err);
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch { /* ignore */ }
        recaptchaVerifierRef.current = null;
      }

      const code = err?.code || "";
      const message = err instanceof Error ? err.message : "Failed to send OTP";

      if (code === "auth/unauthorized-domain" || message.includes("unauthorized-domain")) {
        setLocalError(
          "Domain not authorized in Firebase. Please add 'nourishnet-kappa.vercel.app' in Firebase Console > Authentication > Settings > Authorized domains."
        );
      } else if (code === "auth/operation-not-allowed" || message.includes("operation-not-allowed")) {
        setLocalError(
          "Phone Auth is not enabled in Firebase Console. Go to Authentication > Sign-in method > Phone and enable it."
        );
      } else if (code === "auth/too-many-requests" || message.includes("too-many-requests") || message.includes("quota-exceeded")) {
        setLocalError(
          "Firebase SMS limit reached. On Firebase Spark plan, Google limits SMS. Please use Firebase Test Numbers (e.g. +91 9876543210 / OTP 123456) or upgrade to Blaze."
        );
      } else if (code === "auth/invalid-phone-number" || message.includes("invalid-phone-number")) {
        setLocalError(t("auth.invalidPhone") || "Invalid phone number. Ensure it includes 10 digits or country code.");
      } else if (code === "auth/captcha-check-failed" || message.includes("captcha")) {
        setLocalError("reCAPTCHA check failed. Please refresh the page and try again.");
      } else {
        setLocalError(message);
      }
    }
  };

  const handleVerifyOTP = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    const cleanPhone = phone.trim().replace(/[\s-]/g, "");
    const formattedPhone = cleanPhone.startsWith("+") ? cleanPhone : `+91${cleanPhone}`;
    const defaultName = name.trim() || `User (${role.toUpperCase()})`;

    if (isSimulatedAuth) {
      if (!otp || otp.length < 6) {
        setLocalError(t("auth.invalidOtp"));
        return;
      }
      try {
        await verifyAndLogin(`phone_${cleanPhone}`, defaultName, role, i18n.language, formattedPhone);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("must provide name and role")) {
          setStep("role");
          return;
        }
        setLocalError(message || "Login failed");
      }
      return;
    }

    if (!confirmationResult) {
      setLocalError(t("auth.codeExpired"));
      setStep("phone");
      return;
    }

    if (!otp || otp.length < 6) {
      setLocalError(t("auth.invalidOtp"));
      return;
    }

    try {
      const userCredential = await confirmationResult.confirm(otp);
      const idToken = await userCredential.user.getIdToken();

      try {
        await verifyAndLogin(idToken, defaultName, role, i18n.language, formattedPhone);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("must provide name and role")) {
          setStep("role");
          return;
        }
        throw err;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "OTP verification failed";
      if (message.includes("invalid-verification-code")) {
        setLocalError(t("auth.invalidOtp") || "Invalid OTP entered. Please try again.");
      } else if (message.includes("code-expired")) {
        setLocalError(t("auth.codeExpired") || "OTP code has expired. Please request a new code.");
        setStep("phone");
      } else if (!message.includes("must provide name and role")) {
        setLocalError(message);
      }
    }
  };

  const handleRoleSelection = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!name.trim()) {
      setLocalError(t("auth.namePlaceholder"));
      return;
    }

    const cleanPhone = phone.trim().replace(/[\s-]/g, "");
    const formattedPhone = cleanPhone.startsWith("+") ? cleanPhone : `+91${cleanPhone}`;

    if (isSimulatedAuth) {
      try {
        await verifyAndLogin(`phone_${cleanPhone}`, name, role, i18n.language, formattedPhone);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : "Registration failed");
      }
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        setLocalError(t("auth.codeExpired"));
        setStep("phone");
        return;
      }
      const idToken = await user.getIdToken();
      await verifyAndLogin(idToken, name, role, i18n.language, formattedPhone);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setLocalError(message);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Demo login failed";
      setLocalError(message);
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

        {displayError && (
          <div style={styles.error}>
            <span>⚠️ {displayError}</span>
            <button onClick={() => { setLocalError(null); clearError(); }} style={styles.dismissBtn}>
              ✕
            </button>
          </div>
        )}

        {step === "phone" && (
          <form onSubmit={handleSendOTP} style={styles.form}>
            <label style={styles.label}>{t("auth.phoneLabel")}</label>
            <input
              type="tel"
              placeholder={t("auth.phonePlaceholder")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={styles.input}
              disabled={isLoading}
            />
            <button type="submit" style={styles.button} disabled={isLoading}>
              {isLoading ? t("auth.sending") : t("auth.sendOtp")}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOTP} style={styles.form}>
            <label style={styles.label}>{t("auth.enterOtp", { phone })}</label>
            <input
              type="text"
              placeholder={t("auth.otpPlaceholder")}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              style={styles.input}
              disabled={isLoading}
            />
            <button type="submit" style={styles.button} disabled={isLoading}>
              {isLoading ? t("auth.verifying") : t("auth.verifyOtp")}
            </button>
            <button
              type="button"
              onClick={() => { setStep("phone"); setOtp(""); recaptchaVerifierRef.current = null; }}
              style={styles.linkBtn}
            >
              {t("auth.backToPhone")}
            </button>
          </form>
        )}

        {step === "role" && (
          <form onSubmit={handleRoleSelection} style={styles.form}>
            <h3 style={{ margin: "0 0 0.5rem", color: colors.textDark }}>{t("auth.profileSetup")}</h3>

            <label style={styles.label}>{t("auth.yourName")}</label>
            <input
              type="text"
              placeholder={t("auth.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              disabled={isLoading}
            />

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

            <button type="submit" style={styles.button} disabled={isLoading}>
              {isLoading ? t("auth.settingUp") : t("auth.getStarted")}
            </button>
          </form>
        )}

        {/* DEMO LOGINS */}
        <div style={{ marginTop: "1.5rem", borderTop: `1px solid ${colors.border}`, paddingTop: "1rem" }}>
          <p style={{ fontSize: "0.75rem", color: colors.textMuted, textAlign: "center", marginBottom: "0.5rem" }}>
            Instant Demo Preview (No SMS required):
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

        <div ref={recaptchaRef} />
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
    background: "linear-gradient(135deg, #059669 0%, #047857 50%, #0f172a 100%)",
    fontFamily: "var(--font-main, system-ui, sans-serif)",
    padding: "1.5rem",
  },
  card: {
    background: "white",
    borderRadius: "20px",
    padding: "2.5rem",
    maxWidth: "420px",
    width: "100%",
    boxShadow: shadows.xl,
  },
  title: {
    margin: "0 0 0.25rem 0",
    fontSize: "1.75rem",
    fontWeight: 800,
    color: colors.primary,
    textAlign: "center" as const,
  },
  subtitle: {
    margin: "0 0 1rem 0",
    color: colors.textMuted,
    textAlign: "center" as const,
    fontSize: "0.9rem",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
  },
  label: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: colors.textDark,
  },
  input: {
    padding: "0.75rem",
    borderRadius: "8px",
    border: `1px solid ${colors.border}`,
    fontSize: "0.95rem",
    outline: "none",
  },
  button: {
    padding: "0.8rem",
    borderRadius: "8px",
    border: "none",
    background: colors.primary,
    color: "white",
    fontSize: "0.95rem",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: "0.5rem",
    boxShadow: shadows.sm,
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: colors.primary,
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    textAlign: "center" as const,
    marginTop: "0.5rem",
  },
  error: {
    background: "#fee2e2",
    border: "1px solid #fca5a5",
    borderRadius: "8px",
    padding: "0.75rem",
    color: "#b91c1c",
    fontSize: "0.85rem",
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
    fontSize: "1rem",
  },
  roleGroup: {
    display: "flex",
    gap: "0.5rem",
  },
  roleBtn: {
    flex: 1,
    padding: "0.75rem 0.5rem",
    borderRadius: "8px",
    border: `1px solid ${colors.border}`,
    background: "white",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    textAlign: "center" as const,
    color: colors.textMuted,
  },
  roleBtnActive: {
    borderColor: colors.primary,
    background: colors.primaryLight,
    color: colors.primary,
  },
  quickTestBtn: {
    flex: 1,
    padding: "0.4rem 0.2rem",
    borderRadius: "6px",
    border: `1px solid ${colors.border}`,
    background: colors.surfaceSubtle,
    fontSize: "0.7rem",
    fontWeight: 600,
    color: colors.textDark,
    cursor: "pointer",
    textAlign: "center" as const,
  },
};
