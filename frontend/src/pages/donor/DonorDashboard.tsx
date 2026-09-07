import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../config/api";
import { useGeolocation } from "../../hooks/useGeolocation";
import LocationPicker from "../../components/Map/LocationPicker";
import { useRealtimeUpdates } from "../../hooks/useRealtimeUpdates";

interface Donation {
  id: number;
  donor_id: number;
  food_type: string;
  quantity: number;
  unit: string;
  expiry_time: string;
  status: string;
  pickup_lat: number;
  pickup_lng: number;
  image_url?: string | null;
  created_at: string;
}

export default function DonorDashboard() {
  const { t } = useTranslation();
  const { appUser, token } = useAuth();
  const { lat, lng, isAutoDetected, requestLocation } = useGeolocation();

  const [foodType, setFoodType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [expiryHours, setExpiryHours] = useState("6");
  const [pickupLat, setPickupLat] = useState(lat);
  const [pickupLng, setPickupLng] = useState(lng);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [foodPhoto, setFoodPhoto] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Client-side auto-downsampling for fast, lightweight base64 photo storage
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPEG, PNG, WebP).");
      return;
    }

    setPhotoUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.78);
          setFoodPhoto(compressedDataUrl);
        }
        setPhotoUploading(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Automatically update pickup coordinates when GPS/IP auto-detection succeeds on mount
  useEffect(() => {
    if (lat && lng) {
      setPickupLat(lat);
      setPickupLng(lng);
    }
  }, [lat, lng]);

  const handleAutoDetect = async () => {
    setDetectingLocation(true);
    setError(null);
    try {
      const coords = await requestLocation();
      if (coords) {
        setPickupLat(coords.lat);
        setPickupLng(coords.lng);
        setSuccess(
          `📍 Location auto-detected: ${coords.city || "Current Location"} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
        );
      }
    } catch {
      setError("Failed to auto-detect location. You can select coordinates directly on the map.");
    } finally {
      setDetectingLocation(false);
    }
  };
  const [myDonations, setMyDonations] = useState<Donation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMyDonations = useCallback(async () => {
    try {
      const donations = await apiFetch<Donation[]>("/donations/", { token });
      setMyDonations(
        donations.filter((d) => d.donor_id === appUser?.id),
      );
    } catch {
      // Silently fail — non-critical
    }
  }, [appUser?.id, token]);

  const onClaimStatusUpdated = useCallback((claim: any) => {
    setLiveNotice(`🔔 Real-time: Your donation #${claim.donation_id} status updated to "${claim.status}"!`);
    loadMyDonations();
  }, [loadMyDonations]);

  const { isConnected, isFallbackMode } = useRealtimeUpdates({
    onClaimStatusUpdated,
    onPollFallback: loadMyDonations,
    pollIntervalMs: 10000,
  });

  const [prediction, setPrediction] = useState<{
    predicted_surplus_kg: number;
    confidence: number;
    model_status: string;
    message: string;
  } | null>(null);

  const loadPrediction = useCallback(async () => {
    if (!appUser?.id) return;
    try {
      const pred = await apiFetch<any>(`/predictions/${appUser.id}`, { token });
      setPrediction(pred);
    } catch {
      // Non-critical ML widget
    }
  }, [appUser?.id, token]);

  useEffect(() => {
    loadMyDonations();
    loadPrediction();
  }, [loadMyDonations, loadPrediction]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!foodType.trim() || !quantity) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const expiry = new Date(
        Date.now() + Number(expiryHours) * 3600000,
      ).toISOString();

      const donation = await apiFetch<Donation>(
        `/donations/?donor_id=${appUser?.id}`,
        {
          method: "POST",
          token,
          body: {
            food_type: foodType,
            quantity: Number(quantity),
            unit,
            expiry_time: expiry,
            pickup_lat: pickupLat,
            pickup_lng: pickupLng,
            image_url: foodPhoto || undefined,
          },
        },
      );

      setMyDonations((prev) => [donation, ...prev]);
      setSuccess(t("donor.createdSuccess", { foodType }));
      setFoodType("");
      setQuantity("");
      setFoodPhoto(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create donation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <h2>🍲 {t("donor.title")}</h2>
        <span
          style={{
            fontSize: "0.75rem",
            padding: "4px 10px",
            borderRadius: "12px",
            background: isConnected ? "#e8f5e9" : isFallbackMode ? "#fff8e1" : "#f5f5f5",
            color: isConnected ? "#2e7d32" : isFallbackMode ? "#f57f17" : "#757575",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {isConnected ? `🟢 ${t("common.liveActive")}` : isFallbackMode ? `🟡 ${t("common.fallbackPolling")}` : `⚪ ${t("common.connecting")}`}
        </span>
      </div>

      {liveNotice && (
        <div
          style={{
            background: "#e3f2fd",
            border: "1px solid #90caf9",
            borderRadius: "8px",
            padding: "0.75rem",
            color: "#1565c0",
            fontSize: "0.85rem",
            marginBottom: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{liveNotice}</span>
          <button
            onClick={() => setLiveNotice(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#1565c0" }}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div style={styles.error}>⚠️ {error}</div>
      )}
      {success && (
        <div style={styles.success}>✅ {success}</div>
      )}

      {prediction && (
        <div
          style={{
            background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)",
            border: "1px solid #a7f3d0",
            borderRadius: "14px",
            padding: "1.25rem",
            marginBottom: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
            boxShadow: "0 2px 4px rgba(5, 150, 105, 0.06)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 800, color: "#065f46", fontSize: "0.95rem" }}>
              🤖 {t("donor.aiForecastTitle")}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "3px 10px",
                borderRadius: "12px",
                background: prediction.model_status === "trained_prediction" ? "#dcfce7" : "#fef3c7",
                color: prediction.model_status === "trained_prediction" ? "#166534" : "#92400e",
                fontWeight: 700,
              }}
            >
              {prediction.model_status === "trained_prediction" ? t("donor.personalizedModel") : t("donor.regionalBaseline")}
            </span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "0.9rem", color: "#334155" }}>
            {t("donor.expectedSurplus")}{" "}
            <strong style={{ color: "#059669", fontSize: "1.15rem" }}>
              ~{prediction.predicted_surplus_kg} kg
            </strong>{" "}
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              ({t("donor.confidence")} {Math.round(prediction.confidence * 100)}%)
            </span>
          </p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>
            {prediction.message}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>{t("donor.foodType")}</label>
            <input
              type="text"
              placeholder={t("donor.foodPlaceholder")}
              value={foodType}
              onChange={(e) => setFoodType(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>{t("donor.quantity")}</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="number"
                placeholder="10"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                style={{ ...styles.input, flex: 1 }}
                min="0.1"
                step="0.1"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={{ ...styles.input, width: "95px" }}
              >
                <option value="kg">kg</option>
                <option value="pieces">pieces</option>
                <option value="liters">liters</option>
                <option value="plates">plates</option>
                <option value="packets">packets</option>
                <option value="boxes">boxes</option>
              </select>
            </div>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>{t("donor.expiresHours")}</label>
          <input
            type="number"
            value={expiryHours}
            onChange={(e) => setExpiryHours(e.target.value)}
            style={styles.input}
            min="1"
            max="72"
          />
        </div>

        <div style={styles.field}>
          <label style={{ ...styles.label, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>📸 Food & Packaging Photo <span style={{ fontWeight: 400, color: "#64748b", fontSize: "0.8rem" }}>(Optional)</span></span>
            <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 600 }}>Helps NGO & Volunteer inspect packaging</span>
          </label>
          {foodPhoto ? (
            <div style={{ position: "relative", display: "inline-block", marginTop: "0.35rem" }}>
              <img
                src={foodPhoto}
                alt="Food packaging preview"
                style={{
                  width: "140px",
                  height: "105px",
                  objectFit: "cover",
                  borderRadius: "10px",
                  border: "2px solid #10b981",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                  display: "block",
                }}
              />
              <button
                type="button"
                onClick={() => setFoodPhoto(null)}
                style={{
                  position: "absolute",
                  top: "-8px",
                  right: "-8px",
                  background: "#ef4444",
                  color: "#fff",
                  border: "none",
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                }}
                title="Remove photo"
              >
                ✕
              </button>
            </div>
          ) : (
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                padding: "1rem",
                border: "2px dashed #cbd5e1",
                borderRadius: "10px",
                background: "#f8fafc",
                cursor: "pointer",
                transition: "border-color 0.2s, background 0.2s",
                marginTop: "0.35rem",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#10b981";
                e.currentTarget.style.background = "#f0fdf4";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#cbd5e1";
                e.currentTarget.style.background = "#f8fafc";
              }}
            >
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelect}
                style={{ display: "none" }}
              />
              <span style={{ fontSize: "1.5rem" }}>📷</span>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#334155" }}>
                {photoUploading ? "Compressing photo..." : "Upload or take photo of packed food"}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Max size auto-compressed · JPG, PNG, WebP
              </span>
            </label>
          )}
        </div>

        <div style={styles.field}>
          <label style={styles.label}>{t("donor.pickupLocation")}</label>
          <LocationPicker
            position={{ lat: pickupLat, lng: pickupLng }}
            onPositionChange={(newLat, newLng) => {
              setPickupLat(newLat);
              setPickupLng(newLng);
            }}
            onDetectLocation={handleAutoDetect}
            isAutoDetected={isAutoDetected}
            detecting={detectingLocation}
          />
        </div>

        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? t("donor.donating") : `🍽️ ${t("donor.donateButton")}`}
        </button>
      </form>

      <hr style={styles.hr} />

      <h3>{t("donor.myDonations")}</h3>
      {myDonations.length === 0 ? (
        <p style={styles.empty}>{t("donor.noDonationsYet")}</p>
      ) : (
        <div style={styles.list}>
          {myDonations.map((d) => (
            <div key={d.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <strong>{d.food_type}</strong>
                <span style={styles.status(d.status)}>{d.status}</span>
              </div>
              <p style={styles.cardInfo}>
                📦 <strong>{d.quantity} {d.unit}</strong> · ⏰ Expires: {new Date(d.expiry_time).toLocaleString()}
              </p>
              {d.image_url && (
                <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <img
                    src={d.image_url}
                    alt="Packaging condition"
                    style={{
                      width: "72px",
                      height: "54px",
                      objectFit: "cover",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                    }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    📸 Packaging photo attached
                  </span>
                </div>
              )}
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#475569", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
                <span>📍 <strong>Pickup:</strong> {d.pickup_lat != null ? Number(d.pickup_lat).toFixed(4) : "13.0827"}, {d.pickup_lng != null ? Number(d.pickup_lng).toFixed(4) : "80.2707"}</span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${d.pickup_lat ?? 13.0827},${d.pickup_lng ?? 80.2707}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#059669",
                    textDecoration: "none",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                  }}
                >
                  🗺️ Open in Google Maps
                </a>
              </div>
              {d.status === "claimed" && (
                <div style={{
                  marginTop: "0.6rem",
                  padding: "0.6rem 0.8rem",
                  background: "#eff6ff",
                  borderRadius: "8px",
                  border: "1px solid #bfdbfe",
                  fontSize: "0.85rem",
                  color: "#1e40af",
                }}>
                  🤝 <strong>Food Claimed!</strong> An NGO has reserved this food and is dispatching pickup.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const statusColors: Record<string, string> = {
  available: "#4caf50",
  claimed: "#2196f3",
  picked_up: "#ff9800",
  delivered: "#9c27b0",
  expired: "#f44336",
};

const styles = {
  form: { display: "flex", flexDirection: "column" as const, gap: "1rem" },
  row: { display: "flex", gap: "1rem", flexWrap: "wrap" as const },
  field: { flex: 1, minWidth: "200px" },
  label: { display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px", color: "#333" },
  input: { width: "100%", padding: "0.6rem", borderRadius: "6px", border: "1px solid #ddd", fontSize: "0.9rem", boxSizing: "border-box" as const },
  button: { padding: "0.8rem", borderRadius: "10px", border: "none", background: "#059669", color: "white", fontSize: "1rem", fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 4px rgba(5, 150, 105, 0.2)" },
  error: { background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "0.75rem", color: "#b91c1c", fontSize: "0.85rem", marginBottom: "1rem" },
  success: { background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "8px", padding: "0.75rem", color: "#065f46", fontSize: "0.85rem", marginBottom: "1rem" },
  hr: { border: "none", borderTop: "1px solid #e2e8f0", margin: "2rem 0" },
  empty: { color: "#94a3b8", textAlign: "center" as const, padding: "2rem" },
  list: { display: "flex", flexDirection: "column" as const, gap: "0.5rem" },
  card: { background: "#ffffff", borderRadius: "10px", padding: "1rem 1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardInfo: { margin: "0.25rem 0 0", color: "#64748b", fontSize: "0.85rem" },
  status: (s: string) => ({
    fontSize: "0.75rem",
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: "12px",
    color: "white",
    background: statusColors[s] || "#64748b",
    textTransform: "uppercase" as const,
  }),
};
