import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../config/api";
import { useGeolocation } from "../../hooks/useGeolocation";
import DonationMap, { type DonationMarker } from "../../components/Map/DonationMap";
import { useRealtimeUpdates } from "../../hooks/useRealtimeUpdates";

interface Donation extends DonationMarker {
  donor_id: number;
  created_at: string;
}

export default function NGODashboard() {
  const { t } = useTranslation();
  const { appUser, token } = useAuth();
  const { lat, lng, error: geoError } = useGeolocation();

  const [donations, setDonations] = useState<Donation[]>([]);
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [liveNotification, setLiveNotification] = useState<string | null>(null);

  const loadNearby = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<Donation[]>(
        `/donations/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`,
        { token },
      );
      setDonations(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load donations");
    } finally {
      setLoading(false);
    }
  }, [lat, lng, radiusKm, token]);

  const onNewDonation = useCallback((newDonation: Donation) => {
    setLiveNotification(`🔔 Real-time: New donation available! "${newDonation.food_type}" (${newDonation.quantity} ${newDonation.unit})`);
    loadNearby();
  }, [loadNearby]);

  const { isConnected, isFallbackMode } = useRealtimeUpdates({
    onNewDonation,
    onPollFallback: loadNearby,
    pollIntervalMs: 10000,
  });

  useEffect(() => {
    loadNearby();
  }, [loadNearby]);

  const handleClaim = async (donation: Donation) => {
    setError(null);
    setClaimSuccess(null);
    try {
      await apiFetch("/claims/", {
        method: "POST",
        token,
        body: {
          donation_id: donation.id,
          ngo_id: appUser?.id,
        },
      });
      setClaimSuccess(t("ngo.claimSuccess", { foodType: donation.food_type }));
      setSelectedDonation(null);
      // Refresh list
      await loadNearby();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim donation");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <h2>🏢 {t("ngo.title")}</h2>
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

      {liveNotification && (
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
          <span>{liveNotification}</span>
          <button
            onClick={() => setLiveNotification(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#1565c0" }}
          >
            ✕
          </button>
        </div>
      )}

      {geoError && (
        <div style={styles.warning}>📍 {geoError}</div>
      )}
      {error && (
        <div style={styles.error}>⚠️ {error}</div>
      )}
      {claimSuccess && (
        <div style={styles.success}>✅ {claimSuccess}</div>
      )}

      <div style={styles.controls}>
        <label style={styles.label}>
          {t("ngo.searchRadius")}{" "}
          <select
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            style={styles.select}
          >
            <option value={5}>5 {t("common.km")}</option>
            <option value={10}>10 {t("common.km")}</option>
            <option value={25}>25 {t("common.km")}</option>
            <option value={50}>50 {t("common.km")}</option>
          </select>
        </label>
        <button onClick={loadNearby} style={styles.refreshBtn} disabled={loading}>
          {loading ? t("common.loading") : `🔄 ${t("common.refresh")}`}
        </button>
      </div>

      <DonationMap
        center={{ lat, lng }}
        donations={donations}
        onDonationClick={(d) => setSelectedDonation(d as Donation)}
      />

      <p style={styles.count}>
        {t("ngo.foundWithin", { count: donations.length, radius: radiusKm })}
      </p>

      {selectedDonation && (
        <div style={styles.detail}>
          <h3>{selectedDonation.food_type}</h3>
          <p>
            {selectedDonation.quantity} {selectedDonation.unit}
          </p>
          <p>{t("ngo.expires")} {new Date(selectedDonation.expiry_time).toLocaleString()}</p>
          <p>{t("ngo.status")} {selectedDonation.status}</p>
          {selectedDonation.status === "available" && (
            <button onClick={() => handleClaim(selectedDonation)} style={styles.claimBtn}>
              📋 {t("ngo.claimThisDonation")}
            </button>
          )}
          <button
            onClick={() => setSelectedDonation(null)}
            style={styles.closeBtn}
          >
            {t("common.close")}
          </button>
        </div>
      )}

      {donations.length > 0 && (
        <>
          <h3 style={{ marginTop: "1.5rem" }}>{t("ngo.availableDonations")}</h3>
          <div style={styles.list}>
            {donations.map((d) => (
              <div
                key={d.id}
                style={styles.card}
                onClick={() => setSelectedDonation(d)}
              >
                <strong>{d.food_type}</strong>
                <span style={styles.qty}>
                  {d.quantity} {d.unit}
                </span>
                <span style={styles.expiry}>
                  {new Date(d.expiry_time).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  controls: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" as const, gap: "0.5rem" },
  label: { fontSize: "0.9rem", fontWeight: 600 as const },
  select: { padding: "0.4rem", borderRadius: "4px", border: "1px solid #ddd", marginLeft: "0.5rem" },
  refreshBtn: { padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid #ddd", background: "white", cursor: "pointer", fontSize: "0.85rem" },
  warning: { background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "8px", padding: "0.75rem", color: "#856404", fontSize: "0.85rem", marginBottom: "1rem" },
  error: { background: "#fee", border: "1px solid #fcc", borderRadius: "8px", padding: "0.75rem", color: "#c33", fontSize: "0.85rem", marginBottom: "1rem" },
  success: { background: "#efe", border: "1px solid #cfc", borderRadius: "8px", padding: "0.75rem", color: "#3a3", fontSize: "0.85rem", marginBottom: "1rem" },
  count: { color: "#666", fontSize: "0.85rem", textAlign: "center" as const, margin: "0.5rem 0" },
  detail: { background: "#f0f9ff", borderRadius: "16px", padding: "1.5rem", marginTop: "1rem", border: "2px solid #0284c7", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.08)" },
  claimBtn: { padding: "0.6rem 1.5rem", borderRadius: "8px", border: "none", background: "#0284c7", color: "white", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", marginRight: "0.5rem" },
  closeBtn: { padding: "0.6rem 1.5rem", borderRadius: "8px", border: "1px solid #cbd5e1", background: "white", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 },
  list: { display: "flex", flexDirection: "column" as const, gap: "0.5rem" },
  card: { background: "#ffffff", borderRadius: "10px", padding: "0.85rem 1.25rem", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: "0.5rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  qty: { color: "#0284c7", fontWeight: 700, fontSize: "0.95rem" },
  expiry: { color: "#64748b", fontSize: "0.8rem" },
};
