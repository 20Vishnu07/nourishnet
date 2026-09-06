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
  created_at: string;
}

export default function DonorDashboard() {
  const { t } = useTranslation();
  const { appUser, token } = useAuth();
  const { lat, lng } = useGeolocation();

  const [foodType, setFoodType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [expiryHours, setExpiryHours] = useState("6");
  const [pickupLat, setPickupLat] = useState(lat);
  const [pickupLng, setPickupLng] = useState(lng);
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
          },
        },
      );

      setMyDonations((prev) => [donation, ...prev]);
      setSuccess(t("donor.createdSuccess", { foodType }));
      setFoodType("");
      setQuantity("");
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
            background: "linear-gradient(135deg, #f3e8ff 0%, #e0e7ff 100%)",
            border: "1px solid #c084fc",
            borderRadius: "10px",
            padding: "1rem",
            marginBottom: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, color: "#6b21a8", fontSize: "0.95rem" }}>
              🤖 {t("donor.aiForecastTitle")}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: "10px",
                background: prediction.model_status === "trained_prediction" ? "#dcfce7" : "#fef9c3",
                color: prediction.model_status === "trained_prediction" ? "#15803d" : "#854d0e",
                fontWeight: 600,
              }}
            >
              {prediction.model_status === "trained_prediction" ? t("donor.personalizedModel") : t("donor.regionalBaseline")}
            </span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "0.9rem", color: "#374151" }}>
            {t("donor.expectedSurplus")}{" "}
            <strong style={{ color: "#4338ca", fontSize: "1.05rem" }}>
              ~{prediction.predicted_surplus_kg} kg
            </strong>{" "}
            <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
              ({t("donor.confidence")} {Math.round(prediction.confidence * 100)}%)
            </span>
          </p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280" }}>
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
                style={{ ...styles.input, width: "80px" }}
              >
                <option value="kg">kg</option>
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
          <label style={styles.label}>{t("donor.pickupLocation")}</label>
          <LocationPicker
            position={{ lat: pickupLat, lng: pickupLng }}
            onPositionChange={(newLat, newLng) => {
              setPickupLat(newLat);
              setPickupLng(newLng);
            }}
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
                {d.quantity} {d.unit} · {new Date(d.expiry_time).toLocaleString()}
              </p>
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
  button: { padding: "0.75rem", borderRadius: "8px", border: "none", background: "#4caf50", color: "white", fontSize: "1rem", fontWeight: 600, cursor: "pointer" },
  error: { background: "#fee", border: "1px solid #fcc", borderRadius: "8px", padding: "0.75rem", color: "#c33", fontSize: "0.85rem", marginBottom: "1rem" },
  success: { background: "#efe", border: "1px solid #cfc", borderRadius: "8px", padding: "0.75rem", color: "#3a3", fontSize: "0.85rem", marginBottom: "1rem" },
  hr: { border: "none", borderTop: "1px solid #eee", margin: "2rem 0" },
  empty: { color: "#999", textAlign: "center" as const, padding: "2rem" },
  list: { display: "flex", flexDirection: "column" as const, gap: "0.5rem" },
  card: { background: "#f9f9f9", borderRadius: "8px", padding: "1rem" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardInfo: { margin: "0.25rem 0 0", color: "#666", fontSize: "0.85rem" },
  status: (s: string) => ({
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: "12px",
    color: "white",
    background: statusColors[s] || "#999",
  }),
};
