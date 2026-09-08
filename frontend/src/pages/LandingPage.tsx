import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { colors, shadows } from "../styles/theme";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useAuth, type UserRole } from "../contexts/AuthContext";

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { login, register, verifyAndLogin, error, clearError, isLoading, appUser, logout } = useAuth();

  // Auth modal states
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [selectedRole, setSelectedRole] = useState<UserRole>("donor");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orgName, setOrgName] = useState("");
  const [address, setAddress] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);

  const displayError = localError || error;

  const openSignIn = (role?: UserRole | React.MouseEvent) => {
    if (typeof role === "string") {
      setSelectedRole(role);
    }
    setAuthMode("signin");
    setLocalError(null);
    setLocalSuccess(null);
    clearError();
    setIsAuthOpen(true);
  };

  const openSignUp = (role?: UserRole | React.MouseEvent) => {
    if (typeof role === "string") {
      setSelectedRole(role);
    }
    setAuthMode("signup");
    setLocalError(null);
    setLocalSuccess(null);
    clearError();
    setIsAuthOpen(true);
  };

  const openAuthWithRole = (role: UserRole, mode: "signin" | "signup" = "signup") => {
    setSelectedRole(role);
    setAuthMode(mode);
    setLocalError(null);
    setLocalSuccess(null);
    clearError();
    setIsAuthOpen(true);
  };

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

    const roleName =
      selectedRole === "donor"
        ? "Food Donor"
        : selectedRole === "ngo"
        ? "NGO / Shelter"
        : "Volunteer Courier";

    try {
      await login(cleanEmail, password);
      // Only close modal and navigate on SUCCESS
      setIsAuthOpen(false);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      const lower = msg.toLowerCase();

      // DO NOT return to home page or close modal! Keep modal open and show clear message
      if (lower.includes("password") || lower.includes("unauthorized") || lower.includes("401")) {
        setLocalError(`⚠️ Wrong password entered for ${roleName}. Please check your password and try again.`);
      } else if (lower.includes("no account") || lower.includes("not found") || lower.includes("404")) {
        setLocalError(`⚠️ Wrong email ID. No ${roleName} account found with "${cleanEmail}". Please check your email ID or sign up.`);
      } else {
        setLocalError(`⚠️ Wrong email ID or password given for ${roleName}. Please check and try again.`);
      }
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setLocalSuccess(null);
    clearError();

    if (!name.trim()) {
      setLocalError("Please enter your full name.");
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
    if (selectedRole === "ngo" && !orgName.trim()) {
      setLocalError("Please enter your Organization / NGO name.");
      return;
    }

    try {
      await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: selectedRole,
        phone: phone.trim() || undefined,
        org_name: orgName.trim() || undefined,
        address: address.trim() || undefined,
        language_pref: i18n.language || "en",
      }, false);

      // Return to sign in tab, prefill email, clear password, and show success message
      setAuthMode("signin");
      setPassword("");
      const roleDisplayNames: Record<UserRole, string> = {
        donor: "Food Donor",
        ngo: "NGO / Shelter",
        volunteer: "Volunteer Courier",
      };
      setLocalSuccess(
        `🎉 Account created successfully for ${name.trim()} as ${roleDisplayNames[selectedRole]}! Please enter your password to sign in.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exists")) {
        setLocalError("⚠️ This email is already registered. Please sign in below with your password, or use a different email.");
      } else {
        setLocalError(msg);
      }
    }
  };

  // Instant demo preview login for evaluators / fast testing
  const handleQuickDemoLogin = async (role: UserRole) => {
    setLocalError(null);
    clearError();
    const demoNames: Record<UserRole, string> = {
      donor: "Green Leaf Cafe (Demo)",
      ngo: "Care & Share Shelter (Demo)",
      volunteer: "Alex Driver (Demo)",
    };
    const mockUid = `demo_${role}_${Date.now()}`;
    try {
      await verifyAndLogin(mockUid, demoNames[role], role, i18n.language);
      setIsAuthOpen(false);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Demo login failed";
      setLocalError(message);
    }
  };

  return (
    <div style={landingStyles.page}>
      {/* 1. TOP NAVBAR */}
      <header style={landingStyles.navbar}>
        <div style={landingStyles.navContent}>
          <div style={landingStyles.brandWrap} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <div style={landingStyles.brandLogo}>🌱</div>
            <div>
              <span style={landingStyles.brandName}>{t("common.appName")}</span>
              <span style={landingStyles.brandTag}>Zero Food Waste</span>
            </div>
          </div>

          <nav style={landingStyles.navLinks} className="landing-nav-links">
            <a href="#how-it-works" style={landingStyles.navLink}>
              {t("landing.howItWorksTitle")}
            </a>
            <a href="#roles" style={landingStyles.navLink}>
              {t("landing.rolesTitle")}
            </a>
            <a href="#impact" style={landingStyles.navLink}>
              {t("landing.impactShowcaseTitle")}
            </a>
          </nav>

          <div style={landingStyles.navRight}>
            <LanguageSwitcher />
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap" }}>
              <button
                onClick={() => openSignIn()}
                style={{
                  ...landingStyles.navSignInBtn,
                  backgroundColor: "#ffffff",
                  color: colors.primary,
                  border: `1.5px solid ${colors.primary}`,
                }}
              >
                {t("auth.signIn")}
              </button>
              <button
                onClick={() => openSignUp()}
                style={{
                  ...landingStyles.navSignInBtn,
                  backgroundColor: colors.primary,
                  color: "#ffffff",
                  border: `1.5px solid ${colors.primary}`,
                }}
              >
                {t("auth.signUp")}
              </button>
              {appUser && (
                <button
                  onClick={logout}
                  style={{
                    ...landingStyles.navSignInBtn,
                    backgroundColor: "transparent",
                    color: colors.textMuted,
                    border: `1.5px solid ${colors.border}`,
                  }}
                  title="Sign out of current account"
                >
                  {t("common.logout")}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section style={landingStyles.heroSection}>
        <div style={landingStyles.heroContainer}>
          {/* Left Hero Column */}
          <div style={landingStyles.heroLeft}>
            <div style={landingStyles.badge}>
              <span className="pulse-dot" />
              <span>{t("landing.badge")}</span>
            </div>

            <h1 style={landingStyles.heroTitle}>
              {t("landing.heroTitle")}
            </h1>

            <p style={landingStyles.heroSubtitle}>
              {t("landing.heroSubtitle")}
            </p>

            {/* Role Action CTAs */}
            <div style={landingStyles.heroActionGroup}>
              <button
                onClick={() => openAuthWithRole("donor", "signup")}
                style={landingStyles.heroBtnDonor}
              >
                🍲 {t("landing.donateFoodBtn")}
              </button>
              <button
                onClick={() => openAuthWithRole("ngo", "signup")}
                style={landingStyles.heroBtnNgo}
              >
                🏢 {t("landing.claimFoodBtn")}
              </button>
              <button
                onClick={() => openAuthWithRole("volunteer", "signup")}
                style={landingStyles.heroBtnVolunteer}
              >
                🚗 {t("landing.volunteerBtn")}
              </button>
            </div>

            {/* Quick Demo Preview Bar */}
            <div style={landingStyles.demoPreviewBar}>
              <span style={landingStyles.demoLabel}>⚡ Instant Test Login:</span>
              <button
                onClick={() => handleQuickDemoLogin("donor")}
                style={landingStyles.demoPill}
              >
                🍲 Demo Donor
              </button>
              <button
                onClick={() => handleQuickDemoLogin("ngo")}
                style={landingStyles.demoPill}
              >
                🏢 Demo NGO
              </button>
              <button
                onClick={() => handleQuickDemoLogin("volunteer")}
                style={landingStyles.demoPill}
              >
                🚗 Demo Volunteer
              </button>
            </div>
          </div>

          {/* Right Hero Column: Visual Cards */}
          <div style={landingStyles.heroRight}>
            <div style={landingStyles.heroImageCard}>
              <img
                src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1000&q=80"
                alt="Community Food Redistribution"
                style={landingStyles.heroMainImg}
              />
              <div style={landingStyles.heroImgGradient} />

              {/* Floating Live Radar Badge */}
              <div style={landingStyles.heroFloatingBadge}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="pulse-dot" />
                  <strong style={{ fontSize: "0.85rem", color: colors.primary }}>
                    Live Radar Active
                  </strong>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: colors.textMuted }}>
                  Grand Kitchen just posted 45 kg hot meals • 2m ago
                </p>
              </div>

              {/* Floating Bottom Milestone Badge */}
              <div style={landingStyles.heroFloatingBottom}>
                <div style={{ fontSize: "1.25rem" }}>🥗</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: colors.textDark }}>
                    Zero Waste Verified
                  </div>
                  <div style={{ fontSize: "0.75rem", color: colors.textMuted }}>
                    Instant claim & volunteer route tracking
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. METRICS / STATS BAR */}
      <section style={landingStyles.statsSection}>
        <div style={landingStyles.statsGrid}>
          <div style={landingStyles.statCard}>
            <div style={landingStyles.statNum}>46,350+</div>
            <div style={landingStyles.statLabel}>{t("landing.statMealsSaved")}</div>
          </div>
          <div style={landingStyles.statCard}>
            <div style={landingStyles.statNum}>18,540 kg</div>
            <div style={landingStyles.statLabel}>{t("landing.statFoodKg")}</div>
          </div>
          <div style={landingStyles.statCard}>
            <div style={landingStyles.statNum}>340+</div>
            <div style={landingStyles.statLabel}>{t("landing.statPartners")}</div>
          </div>
          <div style={landingStyles.statCard}>
            <div style={landingStyles.statNum}>&lt; 35 min</div>
            <div style={landingStyles.statLabel}>{t("landing.statAvgResponse")}</div>
          </div>
        </div>
      </section>

      {/* 4. CHOOSE YOUR ROLE SECTION */}
      <section id="roles" style={landingStyles.section}>
        <div style={landingStyles.sectionHeader}>
          <h2 style={landingStyles.sectionTitle}>{t("landing.rolesTitle")}</h2>
          <p style={landingStyles.sectionSubtitle}>{t("landing.rolesSubtitle")}</p>
        </div>

        <div style={landingStyles.roleCardsGrid}>
          {/* DONOR CARD */}
          <div style={landingStyles.roleCard}>
            <div style={landingStyles.roleCardImageWrap}>
              <img
                src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=700&q=80"
                alt="Food Donors"
                style={landingStyles.roleCardImg}
              />
              <span style={{ ...landingStyles.roleTag, background: colors.primaryLight, color: colors.primary }}>
                🍲 {t("auth.donorRole")}
              </span>
            </div>
            <div style={landingStyles.roleCardBody}>
              <h3 style={landingStyles.roleCardTitle}>{t("landing.donorCardTitle")}</h3>
              <p style={landingStyles.roleCardDesc}>{t("landing.donorCardDesc")}</p>
              <ul style={landingStyles.roleFeatureList}>
                <li>✓ 60-Second Instant Food Listing</li>
                <li>✓ AI Machine Learning Surplus Forecast</li>
                <li>✓ Map-based Geolocation Pinning</li>
              </ul>
              <button
                onClick={() => openAuthWithRole("donor", "signup")}
                style={landingStyles.roleActionBtnDonor}
              >
                {t("landing.donorCardAction")} →
              </button>
              <button
                type="button"
                onClick={() => openSignIn("donor")}
                style={{
                  background: "none",
                  border: "none",
                  color: colors.primary,
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginTop: "8px",
                  display: "block",
                  textAlign: "center",
                  width: "100%",
                }}
              >
                Already registered? Sign in as Donor →
              </button>
            </div>
          </div>

          {/* NGO CARD */}
          <div style={landingStyles.roleCard}>
            <div style={landingStyles.roleCardImageWrap}>
              <img
                src="https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=700&q=80"
                alt="NGOs and Shelters"
                style={landingStyles.roleCardImg}
              />
              <span style={{ ...landingStyles.roleTag, background: colors.ngoLight, color: colors.ngoAccent }}>
                🏢 {t("auth.ngoRole")}
              </span>
            </div>
            <div style={landingStyles.roleCardBody}>
              <h3 style={landingStyles.roleCardTitle}>{t("landing.ngoCardTitle")}</h3>
              <p style={landingStyles.roleCardDesc}>{t("landing.ngoCardDesc")}</p>
              <ul style={landingStyles.roleFeatureList}>
                <li>✓ Real-Time Radius Radar & Notifications</li>
                <li>✓ Instant One-Click Claims</li>
                <li>✓ Automated Volunteer Route Matching</li>
              </ul>
              <button
                onClick={() => openAuthWithRole("ngo", "signup")}
                style={landingStyles.roleActionBtnNgo}
              >
                {t("landing.ngoCardAction")} →
              </button>
              <button
                type="button"
                onClick={() => openSignIn("ngo")}
                style={{
                  background: "none",
                  border: "none",
                  color: colors.ngoAccent,
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginTop: "8px",
                  display: "block",
                  textAlign: "center",
                  width: "100%",
                }}
              >
                Already registered? Sign in as NGO →
              </button>
            </div>
          </div>

          {/* VOLUNTEER CARD */}
          <div style={landingStyles.roleCard}>
            <div style={landingStyles.roleCardImageWrap}>
              <img
                src="https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&w=700&q=80"
                alt="Volunteers"
                style={landingStyles.roleCardImg}
              />
              <span style={{ ...landingStyles.roleTag, background: colors.accentLight, color: colors.accentHover }}>
                🚗 {t("auth.volunteerRole")}
              </span>
            </div>
            <div style={landingStyles.roleCardBody}>
              <h3 style={landingStyles.roleCardTitle}>{t("landing.volunteerCardTitle")}</h3>
              <p style={landingStyles.roleCardDesc}>{t("landing.volunteerCardDesc")}</p>
              <ul style={landingStyles.roleFeatureList}>
                <li>✓ Step-by-Step Milestone Tracking</li>
                <li>✓ Live Pickup GPS & Delivery Confirmation</li>
                <li>✓ Zero Food Waste Community Hero</li>
              </ul>
              <button
                onClick={() => openAuthWithRole("volunteer", "signup")}
                style={landingStyles.roleActionBtnVolunteer}
              >
                {t("landing.volunteerCardAction")} →
              </button>
              <button
                type="button"
                onClick={() => openSignIn("volunteer")}
                style={{
                  background: "none",
                  border: "none",
                  color: colors.accentHover,
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginTop: "8px",
                  display: "block",
                  textAlign: "center",
                  width: "100%",
                }}
              >
                Already registered? Sign in as Volunteer →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 5. HOW IT WORKS SECTION */}
      <section id="how-it-works" style={{ ...landingStyles.section, background: "#ffffff" }}>
        <div style={landingStyles.sectionHeader}>
          <h2 style={landingStyles.sectionTitle}>{t("landing.howItWorksTitle")}</h2>
          <p style={landingStyles.sectionSubtitle}>{t("landing.howItWorksSubtitle")}</p>
        </div>

        <div style={landingStyles.workflowGrid}>
          <div style={landingStyles.stepCard}>
            <div style={{ ...landingStyles.stepNum, background: colors.primaryLight, color: colors.primary }}>
              1
            </div>
            <div style={landingStyles.stepIcon}>🍲</div>
            <h4 style={landingStyles.stepTitle}>{t("landing.step1Title")}</h4>
            <p style={landingStyles.stepDesc}>{t("landing.step1Desc")}</p>
          </div>

          <div style={landingStyles.stepCard}>
            <div style={{ ...landingStyles.stepNum, background: colors.ngoLight, color: colors.ngoAccent }}>
              2
            </div>
            <div style={landingStyles.stepIcon}>⚡</div>
            <h4 style={landingStyles.stepTitle}>{t("landing.step2Title")}</h4>
            <p style={landingStyles.stepDesc}>{t("landing.step2Desc")}</p>
          </div>

          <div style={landingStyles.stepCard}>
            <div style={{ ...landingStyles.stepNum, background: colors.accentLight, color: colors.accentHover }}>
              3
            </div>
            <div style={landingStyles.stepIcon}>🚗</div>
            <h4 style={landingStyles.stepTitle}>{t("landing.step3Title")}</h4>
            <p style={landingStyles.stepDesc}>{t("landing.step3Desc")}</p>
          </div>
        </div>
      </section>

      {/* 6. VISUAL GALLERY / COMMUNITY IMPACT STORIES */}
      <section id="impact" style={landingStyles.section}>
        <div style={landingStyles.sectionHeader}>
          <h2 style={landingStyles.sectionTitle}>{t("landing.impactShowcaseTitle")}</h2>
          <p style={landingStyles.sectionSubtitle}>{t("landing.impactShowcaseSubtitle")}</p>
        </div>

        <div style={landingStyles.galleryGrid}>
          <div style={landingStyles.galleryCard}>
            <img
              src="https://images.unsplash.com/photo-1519222970733-f546218fa6d7?auto=format&fit=crop&w=600&q=80"
              alt="Weddings and Banquets"
              style={landingStyles.galleryImg}
            />
            <div style={landingStyles.galleryOverlay}>
              <h4 style={landingStyles.galleryTitle}>{t("landing.galleryFeast")}</h4>
              <p style={landingStyles.galleryDesc}>{t("landing.galleryFeastDesc")}</p>
            </div>
          </div>

          <div style={landingStyles.galleryCard}>
            <img
              src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=600&q=80"
              alt="Fresh Produce"
              style={landingStyles.galleryImg}
            />
            <div style={landingStyles.galleryOverlay}>
              <h4 style={landingStyles.galleryTitle}>{t("landing.galleryProduce")}</h4>
              <p style={landingStyles.galleryDesc}>{t("landing.galleryProduceDesc")}</p>
            </div>
          </div>

          <div style={landingStyles.galleryCard}>
            <img
              src="https://images.unsplash.com/photo-1578357078586-491adf1aa5ba?auto=format&fit=crop&w=600&q=80"
              alt="Community Kitchens"
              style={landingStyles.galleryImg}
            />
            <div style={landingStyles.galleryOverlay}>
              <h4 style={landingStyles.galleryTitle}>{t("landing.galleryCommunity")}</h4>
              <p style={landingStyles.galleryDesc}>{t("landing.galleryCommunityDesc")}</p>
            </div>
          </div>

          <div style={landingStyles.galleryCard}>
            <img
              src="https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80"
              alt="AI Waste Prevention"
              style={landingStyles.galleryImg}
            />
            <div style={landingStyles.galleryOverlay}>
              <h4 style={landingStyles.galleryTitle}>{t("landing.galleryAi")}</h4>
              <p style={landingStyles.galleryDesc}>{t("landing.galleryAiDesc")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. CTA BANNER */}
      <section style={landingStyles.ctaSection}>
        <div style={landingStyles.ctaCard}>
          <h2 style={landingStyles.ctaTitle}>{t("landing.ctaTitle")}</h2>
          <p style={landingStyles.ctaSubtitle}>{t("landing.ctaSubtitle")}</p>
          <button
            onClick={() => openAuthWithRole("donor", "signup")}
            style={landingStyles.ctaBtn}
          >
            {t("landing.ctaAction")} ✨
          </button>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer style={landingStyles.footer}>
        <div style={landingStyles.footerContent}>
          <div style={landingStyles.footerBrand}>
            <div style={{ fontSize: "1.5rem" }}>🌱</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1.1rem", color: colors.textDark }}>
                {t("common.appName")}
              </div>
              <div style={{ fontSize: "0.8rem", color: colors.textMuted }}>
                {t("landing.footerTagline")}
              </div>
              <div style={{ fontSize: "0.75rem", color: colors.primary, fontWeight: 600, marginTop: "2px" }}>
                ✓ 100% Free Public Initiative • Zero Fees • Open Community
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <a href="mailto:contact@nourishnet.me" style={{ fontSize: "0.8rem", color: colors.textMuted, textDecoration: "none", fontWeight: 600 }}>
                📧 contact@nourishnet.me
              </a>
              <LanguageSwitcher />
            </div>
            <span style={{ fontSize: "0.75rem", color: colors.textMuted }}>
              © {new Date().getFullYear()} NourishNet. Connecting Surplus Food with Those in Need.
            </span>
          </div>
        </div>
      </footer>

      {/* 9. AUTH MODAL / POPUP */}
      {isAuthOpen && (
        <div style={landingStyles.modalBackdrop}>
          <div style={landingStyles.modalCard}>
            <button
              onClick={() => {
                setIsAuthOpen(false);
                setLocalError(null);
                clearError();
              }}
              style={landingStyles.modalCloseBtn}
            >
              ✕
            </button>

            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>🌱</div>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: colors.textDark, margin: "0 0 0.25rem" }}>
                {t("landing.authModalTitle")}
              </h2>
              <p style={{ fontSize: "0.85rem", color: colors.textMuted, margin: 0 }}>
                {t("landing.authModalSubtitle")}
              </p>
            </div>

            {displayError && (
              <div style={landingStyles.errorBox}>
                <span>⚠️ {displayError}</span>
                <button
                  onClick={() => {
                    setLocalError(null);
                    clearError();
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#c33" }}
                >
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
                <button
                  onClick={() => setLocalSuccess(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#065f46", fontSize: "0.9rem" }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* ROLE SELECTION TABS (Top of Modal) */}
            <div style={{ marginBottom: "1rem" }}>
              <div style={landingStyles.modalRoleTabs}>
                {(["donor", "ngo", "volunteer"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setSelectedRole(r); setLocalError(null); }}
                    style={{
                      ...landingStyles.modalRoleTab,
                      ...(selectedRole === r ? landingStyles.modalRoleTabActive : {}),
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
                fontSize: "0.78rem",
                color: colors.textMuted,
                textAlign: "center",
                background: "#f8fafc",
                padding: "4px 8px",
                borderRadius: "6px",
                border: "1px solid #e2e8f0",
              }}>
                {selectedRole === "donor" && "🍲 Food Donor: Donate surplus meals directly to local shelters"}
                {selectedRole === "ngo" && "🏢 NGO & Shelter: Claim surplus food & request volunteer couriers"}
                {selectedRole === "volunteer" && "🚗 Volunteer Courier: Pick up food & share live GPS tracking"}
              </div>
            </div>

            {/* AUTH MODE TOGGLE TABS */}
            <div style={{
              display: "flex",
              background: "#f1f5f9",
              padding: "4px",
              borderRadius: "10px",
              marginBottom: "1.25rem",
              gap: "4px",
            }}>
              <button
                type="button"
                onClick={() => { setAuthMode("signin"); setLocalError(null); clearError(); }}
                style={{
                  flex: 1,
                  padding: "8px",
                  border: "none",
                  background: authMode === "signin" ? "#ffffff" : "transparent",
                  color: authMode === "signin" ? colors.primary : "#64748b",
                  borderRadius: "7px",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  boxShadow: authMode === "signin" ? shadows.sm : "none",
                  transition: "all 0.2s",
                }}
              >
                {t("auth.signIn")}
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode("signup"); setLocalError(null); clearError(); }}
                style={{
                  flex: 1,
                  padding: "8px",
                  border: "none",
                  background: authMode === "signup" ? "#ffffff" : "transparent",
                  color: authMode === "signup" ? colors.primary : "#64748b",
                  borderRadius: "7px",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  boxShadow: authMode === "signup" ? shadows.sm : "none",
                  transition: "all 0.2s",
                }}
              >
                {t("auth.signUp")}
              </button>
            </div>

            {/* SIGN IN FORM */}
            {authMode === "signin" && (
              <form onSubmit={handleSignIn} style={landingStyles.modalForm}>
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
                  <span>{selectedRole === "donor" ? "🍲" : selectedRole === "ngo" ? "🏢" : "🚗"}</span>
                  <span>
                    Signing in as: <strong>{selectedRole === "donor" ? "Food Donor" : selectedRole === "ngo" ? "NGO / Shelter" : "Volunteer Courier"}</strong>
                  </span>
                </div>

                <label style={landingStyles.fieldLabel}>{t("auth.emailLabel")}</label>
                <input
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={landingStyles.modalInput}
                  disabled={isLoading}
                  required
                />

                <label style={landingStyles.fieldLabel}>{t("auth.passwordLabel")}</label>
                <input
                  type="password"
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={landingStyles.modalInput}
                  disabled={isLoading}
                  required
                />

                <button
                  type="submit"
                  style={landingStyles.modalSubmitBtn}
                  disabled={isLoading}
                >
                  {isLoading ? t("auth.signingIn") : `Sign In as ${selectedRole === "donor" ? "Donor" : selectedRole === "ngo" ? "NGO" : "Volunteer"}`}
                </button>

                <button
                  type="button"
                  onClick={() => { setAuthMode("signup"); setLocalError(null); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: colors.primaryDark,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                    padding: "4px",
                  }}
                >
                  Need an account? Sign up as {selectedRole === "donor" ? "Donor" : selectedRole === "ngo" ? "NGO" : "Volunteer"}
                </button>
              </form>
            )}

            {/* SIGN UP FORM */}
            {authMode === "signup" && (
              <form onSubmit={handleSignUp} style={landingStyles.modalForm}>
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
                  <span>{selectedRole === "donor" ? "🍲" : selectedRole === "ngo" ? "🏢" : "🚗"}</span>
                  <span>
                    Creating account as: <strong>{selectedRole === "donor" ? "Food Donor" : selectedRole === "ngo" ? "NGO / Shelter" : "Volunteer Courier"}</strong>
                  </span>
                </div>

                <label style={landingStyles.fieldLabel}>
                  {selectedRole === "ngo" ? "Representative / Contact Name *" : t("auth.yourName")}
                </label>
                <input
                  type="text"
                  placeholder={selectedRole === "ngo" ? "e.g. John Doe (Coordinator)" : t("auth.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={landingStyles.modalInput}
                  disabled={isLoading}
                  required
                />

                <label style={landingStyles.fieldLabel}>{t("auth.emailLabel")}</label>
                <input
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={landingStyles.modalInput}
                  disabled={isLoading}
                  required
                />

                <label style={landingStyles.fieldLabel}>{t("auth.passwordLabel")}</label>
                <input
                  type="password"
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={landingStyles.modalInput}
                  disabled={isLoading}
                  required
                />

                {(selectedRole === "ngo" || selectedRole === "donor") && (
                  <>
                    <label style={landingStyles.fieldLabel}>
                      {selectedRole === "ngo" ? "Organization / NGO Name *" : t("auth.orgLabel")}
                    </label>
                    <input
                      type="text"
                      placeholder={selectedRole === "ngo" ? "e.g. Care & Share Shelter, Food Hope" : t("auth.orgPlaceholder")}
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      style={landingStyles.modalInput}
                      disabled={isLoading}
                      required={selectedRole === "ngo"}
                    />
                  </>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div>
                    <label style={landingStyles.fieldLabel}>
                      {selectedRole === "volunteer" ? "Mobile Phone *" : t("auth.phoneOptional")}
                    </label>
                    <input
                      type="tel"
                      placeholder={selectedRole === "volunteer" ? "+91 98765 43210" : t("auth.phoneOptionalPlaceholder")}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      style={landingStyles.modalInput}
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <label style={landingStyles.fieldLabel}>{t("auth.addressLabel")}</label>
                    <input
                      type="text"
                      placeholder={t("auth.addressPlaceholder")}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      style={landingStyles.modalInput}
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  style={landingStyles.modalSubmitBtn}
                  disabled={isLoading}
                >
                  {isLoading ? t("auth.signingUp") : `Register as ${selectedRole === "donor" ? "Donor" : selectedRole === "ngo" ? "NGO" : "Volunteer"}`}
                </button>

                <button
                  type="button"
                  onClick={() => { setAuthMode("signin"); setLocalError(null); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: colors.primaryDark,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                    padding: "4px",
                  }}
                >
                  {t("auth.haveAccount")}
                </button>
              </form>
            )}

            {/* QUICK DEMO LOGIN SHORTCUTS */}
            <div style={{ marginTop: "1.25rem", borderTop: `1px solid ${colors.border}`, paddingTop: "0.75rem" }}>
              <p style={{ fontSize: "0.75rem", color: colors.textMuted, textAlign: "center", marginBottom: "0.5rem" }}>
                {t("landing.orQuickDemo")}
              </p>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => handleQuickDemoLogin("donor")}
                  style={landingStyles.quickTestBtn}
                >
                  🍲 Demo Donor
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemoLogin("ngo")}
                  style={landingStyles.quickTestBtn}
                >
                  🏢 Demo NGO
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemoLogin("volunteer")}
                  style={landingStyles.quickTestBtn}
                >
                  🚗 Demo Volunteer
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

const landingStyles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    color: colors.textDark,
  },
  navbar: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    backdropFilter: "blur(12px)",
    borderBottom: `1px solid ${colors.border}`,
    boxShadow: shadows.sm,
  },
  navContent: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "0.75rem 1.5rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "1rem",
    flexWrap: "nowrap",
  },
  brandWrap: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexShrink: 0,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  brandLogo: {
    fontSize: "1.8rem",
    lineHeight: 1,
  },
  brandName: {
    fontSize: "1.25rem",
    fontWeight: 800,
    color: colors.primary,
    letterSpacing: "-0.5px",
    display: "block",
  },
  brandTag: {
    fontSize: "0.7rem",
    color: colors.textMuted,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    display: "block",
  },
  navLinks: {
    display: "flex",
    gap: "1.5rem",
    alignItems: "center",
    flexShrink: 1,
  },
  navLink: {
    color: colors.textMuted,
    textDecoration: "none",
    fontSize: "0.9rem",
    fontWeight: 600,
    transition: "color 0.2s",
    whiteSpace: "nowrap",
  },
  navRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    flexShrink: 0,
  },
  navSignInBtn: {
    backgroundColor: colors.primary,
    color: "#ffffff",
    padding: "0.5rem 1.15rem",
    borderRadius: "8px",
    border: "none",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
    boxShadow: shadows.sm,
  },

  // HERO
  heroSection: {
    padding: "3.5rem 1.5rem 2.5rem",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  heroContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "2.5rem",
    alignItems: "center",
  },
  heroLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  badge: {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    padding: "6px 14px",
    borderRadius: "20px",
    fontSize: "0.8rem",
    fontWeight: 700,
    border: "1px solid rgba(5, 150, 105, 0.2)",
  },
  heroTitle: {
    fontSize: "clamp(2rem, 4vw, 3.2rem)",
    fontWeight: 800,
    lineHeight: 1.15,
    letterSpacing: "-0.02em",
    color: colors.textDark,
  },
  heroSubtitle: {
    fontSize: "1.05rem",
    lineHeight: 1.6,
    color: colors.textMuted,
    maxWidth: "540px",
  },
  heroActionGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
    marginTop: "0.5rem",
  },
  heroBtnDonor: {
    backgroundColor: colors.primary,
    color: "white",
    padding: "0.8rem 1.4rem",
    borderRadius: "10px",
    border: "none",
    fontSize: "0.95rem",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: shadows.md,
  },
  heroBtnNgo: {
    backgroundColor: colors.ngoAccent,
    color: "white",
    padding: "0.8rem 1.4rem",
    borderRadius: "10px",
    border: "none",
    fontSize: "0.95rem",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: shadows.md,
  },
  heroBtnVolunteer: {
    backgroundColor: colors.accent,
    color: "white",
    padding: "0.8rem 1.4rem",
    borderRadius: "10px",
    border: "none",
    fontSize: "0.95rem",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: shadows.md,
  },
  demoPreviewBar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "0.5rem",
    background: "#ffffff",
    padding: "8px 12px",
    borderRadius: "8px",
    border: `1px solid ${colors.border}`,
  },
  demoLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: colors.textMuted,
  },
  demoPill: {
    background: colors.surfaceSubtle,
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    padding: "4px 8px",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: colors.textDark,
    cursor: "pointer",
  },

  // HERO RIGHT IMAGE CARD
  heroRight: {
    position: "relative",
  },
  heroImageCard: {
    position: "relative",
    borderRadius: "20px",
    overflow: "hidden",
    boxShadow: shadows.xl,
    aspectRatio: "4 / 3",
    border: `1px solid ${colors.borderLight}`,
  },
  heroMainImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  heroImgGradient: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(to top, rgba(15, 23, 42, 0.4) 0%, transparent 60%)",
  },
  heroFloatingBadge: {
    position: "absolute",
    top: "16px",
    right: "16px",
    background: "rgba(255, 255, 255, 0.94)",
    backdropFilter: "blur(8px)",
    padding: "10px 14px",
    borderRadius: "12px",
    boxShadow: shadows.lg,
    border: "1px solid rgba(5, 150, 105, 0.2)",
  },
  heroFloatingBottom: {
    position: "absolute",
    bottom: "16px",
    left: "16px",
    background: "rgba(255, 255, 255, 0.94)",
    backdropFilter: "blur(8px)",
    padding: "10px 14px",
    borderRadius: "12px",
    boxShadow: shadows.lg,
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },

  // STATS
  statsSection: {
    maxWidth: "1200px",
    margin: "1rem auto 3rem",
    padding: "0 1.5rem",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "1rem",
  },
  statCard: {
    background: "#ffffff",
    padding: "1.5rem",
    borderRadius: "16px",
    border: `1px solid ${colors.border}`,
    textAlign: "center",
    boxShadow: shadows.sm,
  },
  statNum: {
    fontSize: "1.85rem",
    fontWeight: 800,
    color: colors.primary,
    marginBottom: "4px",
  },
  statLabel: {
    fontSize: "0.85rem",
    color: colors.textMuted,
    fontWeight: 600,
  },

  // SECTION BASE
  section: {
    padding: "4rem 1.5rem",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  sectionHeader: {
    textAlign: "center",
    marginBottom: "3rem",
  },
  sectionTitle: {
    fontSize: "2rem",
    fontWeight: 800,
    letterSpacing: "-0.01em",
    color: colors.textDark,
    marginBottom: "0.5rem",
  },
  sectionSubtitle: {
    fontSize: "1rem",
    color: colors.textMuted,
    maxWidth: "600px",
    margin: "0 auto",
  },

  // ROLES CARDS GRID
  roleCardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "2rem",
  },
  roleCard: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    border: `1px solid ${colors.border}`,
    overflow: "hidden",
    boxShadow: shadows.md,
    display: "flex",
    flexDirection: "column",
  },
  roleCardImageWrap: {
    position: "relative",
    height: "190px",
    overflow: "hidden",
  },
  roleCardImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  roleTag: {
    position: "absolute",
    top: "12px",
    left: "12px",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "0.75rem",
    fontWeight: 700,
  },
  roleCardBody: {
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    flex: 1,
  },
  roleCardTitle: {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: colors.textDark,
    margin: "0 0 0.5rem",
  },
  roleCardDesc: {
    fontSize: "0.85rem",
    color: colors.textMuted,
    lineHeight: 1.5,
    marginBottom: "1rem",
    flex: 1,
  },
  roleFeatureList: {
    listStyle: "none",
    padding: 0,
    margin: "0 0 1.25rem",
    fontSize: "0.8rem",
    color: colors.textDark,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  roleActionBtnDonor: {
    backgroundColor: colors.primary,
    color: "white",
    padding: "0.7rem",
    borderRadius: "8px",
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
  },
  roleActionBtnNgo: {
    backgroundColor: colors.ngoAccent,
    color: "white",
    padding: "0.7rem",
    borderRadius: "8px",
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
  },
  roleActionBtnVolunteer: {
    backgroundColor: colors.accent,
    color: "white",
    padding: "0.7rem",
    borderRadius: "8px",
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
  },

  // WORKFLOW
  workflowGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "2rem",
  },
  stepCard: {
    background: colors.surfaceSubtle,
    padding: "2rem 1.5rem",
    borderRadius: "16px",
    border: `1px solid ${colors.border}`,
    position: "relative",
    textAlign: "center",
  },
  stepNum: {
    position: "absolute",
    top: "12px",
    right: "12px",
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: "0.85rem",
  },
  stepIcon: {
    fontSize: "2.5rem",
    marginBottom: "1rem",
  },
  stepTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: colors.textDark,
    marginBottom: "0.5rem",
  },
  stepDesc: {
    fontSize: "0.85rem",
    color: colors.textMuted,
    lineHeight: 1.6,
  },

  // GALLERY
  galleryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "1.25rem",
  },
  galleryCard: {
    position: "relative",
    borderRadius: "14px",
    overflow: "hidden",
    height: "240px",
    boxShadow: shadows.md,
  },
  galleryImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  galleryOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(to top, rgba(15, 23, 42, 0.85) 0%, rgba(15, 23, 42, 0.1) 70%)",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    color: "#ffffff",
  },
  galleryTitle: {
    fontSize: "1.05rem",
    fontWeight: 700,
    margin: "0 0 4px",
  },
  galleryDesc: {
    fontSize: "0.75rem",
    color: "#cbd5e1",
    lineHeight: 1.4,
    margin: 0,
  },

  // CTA
  ctaSection: {
    maxWidth: "1200px",
    margin: "2rem auto 4rem",
    padding: "0 1.5rem",
  },
  ctaCard: {
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryHover} 100%)`,
    borderRadius: "24px",
    padding: "3.5rem 2rem",
    textAlign: "center",
    color: "#ffffff",
    boxShadow: shadows.xl,
  },
  ctaTitle: {
    fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
    fontWeight: 800,
    marginBottom: "0.75rem",
  },
  ctaSubtitle: {
    fontSize: "1.05rem",
    color: "#d1fae5",
    maxWidth: "540px",
    margin: "0 auto 1.75rem",
    lineHeight: 1.6,
  },
  ctaBtn: {
    backgroundColor: "#ffffff",
    color: colors.primary,
    padding: "0.9rem 2rem",
    borderRadius: "12px",
    border: "none",
    fontWeight: 800,
    fontSize: "1rem",
    cursor: "pointer",
    boxShadow: shadows.lg,
  },

  // FOOTER
  footer: {
    backgroundColor: "#ffffff",
    borderTop: `1px solid ${colors.border}`,
    padding: "2rem 1.5rem",
  },
  footerContent: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "1rem",
  },
  footerBrand: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },

  // MODAL
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "1rem",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: "20px",
    padding: "2rem",
    maxWidth: "440px",
    width: "100%",
    boxShadow: shadows.xl,
    position: "relative",
  },
  modalCloseBtn: {
    position: "absolute",
    top: "16px",
    right: "16px",
    background: colors.surfaceSubtle,
    border: "none",
    borderRadius: "50%",
    width: "32px",
    height: "32px",
    cursor: "pointer",
    fontSize: "0.9rem",
    color: colors.textMuted,
  },
  errorBox: {
    backgroundColor: "#fee2e2",
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
  fieldLabel: {
    display: "block",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: colors.textDark,
    marginBottom: "6px",
  },
  modalRoleTabs: {
    display: "flex",
    gap: "6px",
  },
  modalRoleTab: {
    flex: 1,
    padding: "0.6rem 0.4rem",
    borderRadius: "8px",
    border: `1px solid ${colors.border}`,
    backgroundColor: "#ffffff",
    fontSize: "0.8rem",
    fontWeight: 600,
    color: colors.textMuted,
    cursor: "pointer",
    textAlign: "center",
  },
  modalRoleTabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    color: colors.primary,
  },
  modalForm: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  modalInput: {
    padding: "0.75rem",
    borderRadius: "8px",
    border: `1px solid ${colors.border}`,
    fontSize: "0.95rem",
    outline: "none",
  },
  modalSubmitBtn: {
    backgroundColor: colors.primary,
    color: "#ffffff",
    padding: "0.75rem",
    borderRadius: "8px",
    border: "none",
    fontWeight: 700,
    fontSize: "0.95rem",
    cursor: "pointer",
    marginTop: "0.25rem",
  },
  modalBackBtn: {
    background: "none",
    border: "none",
    color: colors.primary,
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
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
    textAlign: "center",
  },
};
