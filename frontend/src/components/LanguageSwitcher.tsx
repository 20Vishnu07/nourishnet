import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ta", label: "தமிழ்" },
  { code: "hi", label: "हिन्दी" },
  { code: "kn", label: "ಕನ್ನಡ" },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { updateLanguagePref } = useAuth();

  const handleLanguageChange = (newLang: string) => {
    i18n.changeLanguage(newLang);
    localStorage.setItem("nourishnet_lang", newLang);
    if (updateLanguagePref) {
      updateLanguagePref(newLang);
    }
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "0.85rem" }}>🌐</span>
      <select
        value={i18n.language}
        onChange={(e) => handleLanguageChange(e.target.value)}
        style={{
          padding: "4px 8px",
          borderRadius: "6px",
          border: "1px solid #cbd5e1",
          background: "#ffffff",
          fontSize: "0.8rem",
          fontWeight: 600,
          color: "#334155",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
