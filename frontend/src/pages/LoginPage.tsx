import { useState, useRef, useCallback, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  auth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "../config/firebase";
import { useAuth } from "../contexts/AuthContext";
import LanguageSwitcher from "../components/LanguageSwitcher";

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

  // Role selection state
  const [name, setName] = useState("");
  const [role, setRole] = useState<"donor" | "ngo" | "volunteer">("donor");

  const recaptchaRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const displayError = localError || error;

  const setupRecaptcha = useCallback(() => {
    if (recaptchaVerifierRef.current) return;
    if (!recaptchaRef.current) return;

    try {
      recaptchaVerifierRef.current = new RecaptchaVerifier(
        auth,
        recaptchaRef.current,
        { size: "invisible" },
      );
    } catch (err) {
      console.error("RecaptchaVerifier setup failed:", err);
      setLocalError("Failed to set up verification. Please refresh the page.");
    }
  }, []);

  const handleSendOTP = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!phone || phone.length < 10) {
      setLocalError(t("auth.invalidPhone"));
      return;
    }

    const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;

    try {
      setupRecaptcha();
      if (!recaptchaVerifierRef.current) {
        setLocalError("Verification not ready. Please refresh.");
        return;
      }

      const result = await signInWithPhoneNumber(
        auth,
        formattedPhone,
        recaptchaVerifierRef.current,
      );
      setConfirmationResult(result);
      setStep("otp");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send OTP";
      if (message.includes("too-many-requests")) {
        setLocalError(t("auth.rateLimitError"));
      } else if (message.includes("invalid-phone-number")) {
        setLocalError(t("auth.invalidPhone"));
      } else {
        setLocalError(message);
      }
      recaptchaVerifierRef.current = null;
    }
  };

  const handleVerifyOTP = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

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
        await verifyAndLogin(idToken, undefined, undefined, i18n.language);
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
        setLocalError(t("auth.invalidOtp"));
      } else if (message.includes("code-expired")) {
        setLocalError(t("auth.codeExpired"));
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

    try {
      const user = auth.currentUser;
      if (!user) {
        setLocalError(t("auth.codeExpired"));
        setStep("phone");
        return;
      }
      const idToken = await user.getIdToken();
      await verifyAndLogin(idToken, name, role, i18n.language);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setLocalError(message);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
          <LanguageSwitcher />
        </div>
        <h1 style={styles.title}>🍽️ {t("common.appName")}</h1>
        <p style={styles.subtitle}>{t("common.subtitle")}</p>

        {displayError && (
          <div style={styles.error}>
            ⚠️ {displayError}
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
            <h3 style={{ marginBottom: "0.5rem" }}>{t("auth.profileSetup")}</h3>

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
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    fontFamily: "system-ui, sans-serif",
    padding: "1rem",
  },
  card: {
    background: "white",
    borderRadius: "16px",
    padding: "2.5rem",
    maxWidth: "400px",
    width: "100%",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  title: {
    margin: "0 0 0.25rem 0",
    fontSize: "1.75rem",
    textAlign: "center" as const,
  },
  subtitle: {
    margin: "0 0 1.5rem 0",
    color: "#666",
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
    color: "#333",
  },
  input: {
    padding: "0.75rem",
    borderRadius: "8px",
    border: "1px solid #ddd",
    fontSize: "1rem",
    outline: "none",
  },
  button: {
    padding: "0.75rem",
    borderRadius: "8px",
    border: "none",
    background: "#667eea",
    color: "white",
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "0.5rem",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#667eea",
    cursor: "pointer",
    fontSize: "0.85rem",
    textAlign: "center" as const,
  },
  error: {
    background: "#fee",
    border: "1px solid #fcc",
    borderRadius: "8px",
    padding: "0.75rem",
    color: "#c33",
    fontSize: "0.85rem",
    marginBottom: "1rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dismissBtn: {
    background: "none",
    border: "none",
    color: "#c33",
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
    border: "2px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    textAlign: "center" as const,
  },
  roleBtnActive: {
    borderColor: "#667eea",
    background: "#f0f2ff",
    color: "#667eea",
  },
};
