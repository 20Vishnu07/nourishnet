import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../config/api";
import { useRealtimeUpdates } from "../../hooks/useRealtimeUpdates";

interface Claim {
  id: number;
  donation_id: number;
  ngo_id: number;
  volunteer_id: number | null;
  status: string;
  claimed_at: string;
}

interface Donation {
  id: number;
  food_type: string;
  quantity: number;
  unit: string;
  status: string;
  pickup_lat: number;
  pickup_lng: number;
  expiry_time: string;
}

export default function VolunteerDashboard() {
  const { t } = useTranslation();
  const { appUser, token } = useAuth();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [donationDetails, setDonationDetails] = useState<Record<number, Donation>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);

  const loadClaims = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<Claim[]>(
        `/claims/?volunteer_id=${appUser?.id}`,
        { token },
      );
      setClaims(result);

      // Load donation details for each claim
      const details: Record<number, Donation> = {};
      for (const claim of result) {
        try {
          const donation = await apiFetch<Donation>(
            `/donations/${claim.donation_id}`,
            { token },
          );
          details[claim.donation_id] = donation;
        } catch {
          // Skip if donation not found
        }
      }
      setDonationDetails(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load claims");
    } finally {
      setLoading(false);
    }
  }, [appUser?.id, token]);

  const onClaimStatusUpdated = useCallback((claim: any) => {
    setLiveNotice(`🔔 Real-time: Claim #${claim.id} updated to status "${claim.status}"`);
    loadClaims();
  }, [loadClaims]);

  const { isConnected, isFallbackMode } = useRealtimeUpdates({
    onClaimStatusUpdated,
    onPollFallback: loadClaims,
    pollIntervalMs: 10000,
  });

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  const updateStatus = async (claimId: number, newStatus: string) => {
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/claims/${claimId}/status`, {
        method: "PATCH",
        token,
        body: { status: newStatus },
      });
      setSuccess(t("volunteer.claimUpdated", { status: newStatus }));
      await loadClaims();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const statusFlow: Record<string, { next: string; label: string; emoji: string }> = {
    pending: { next: "picked_up", label: t("volunteer.markPickedUp"), emoji: "📦" },
    assigned: { next: "picked_up", label: t("volunteer.markPickedUp"), emoji: "📦" },
    picked_up: { next: "delivered", label: t("volunteer.markDelivered"), emoji: "✅" },
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <h2>🚗 {t("volunteer.title")}</h2>
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

      {error && <div style={styles.error}>⚠️ {error}</div>}
      {success && <div style={styles.success}>✅ {success}</div>}

      <button onClick={loadClaims} style={styles.refreshBtn} disabled={loading}>
        {loading ? t("common.loading") : `🔄 ${t("common.refresh")}`}
      </button>

      {claims.length === 0 && !loading && (
        <div style={styles.empty}>
          <p>{t("volunteer.noClaimsYet")}</p>
          <p style={{ fontSize: "0.85rem", color: "#999" }}>
            {t("volunteer.ngoWillAssignNotice")}
          </p>
        </div>
      )}

      <div style={styles.list}>
        {claims.map((claim) => {
          const donation = donationDetails[claim.donation_id];
          const nextAction = statusFlow[claim.status];

          return (
            <div key={claim.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <strong>
                  {donation ? donation.food_type : `Donation #${claim.donation_id}`}
                </strong>
                <span style={styles.statusBadge(claim.status)}>
                  {claim.status.replace("_", " ")}
                </span>
              </div>

              {donation && (
                <div style={styles.cardBody}>
                  <p>
                    📦 {donation.quantity} {donation.unit}
                  </p>
                  <p>
                    📍 {t("volunteer.location")} {donation.pickup_lat.toFixed(4)},{" "}
                    {donation.pickup_lng.toFixed(4)}
                  </p>
                  <p>
                    ⏰ {t("volunteer.expires")} {new Date(donation.expiry_time).toLocaleString()}
                  </p>
                </div>
              )}

              <div style={styles.cardActions}>
                {nextAction && (
                  <button
                    onClick={() => updateStatus(claim.id, nextAction.next)}
                    style={styles.actionBtn}
                  >
                    {nextAction.emoji} {nextAction.label}
                  </button>
                )}
                {claim.status === "delivered" && (
                  <span style={styles.done}>✅ {t("volunteer.completed")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const statusColors: Record<string, string> = {
  pending: "#ff9800",
  assigned: "#2196f3",
  picked_up: "#9c27b0",
  delivered: "#4caf50",
  cancelled: "#f44336",
};

const styles = {
  error: { background: "#fee", border: "1px solid #fcc", borderRadius: "8px", padding: "0.75rem", color: "#c33", fontSize: "0.85rem", marginBottom: "1rem" },
  success: { background: "#efe", border: "1px solid #cfc", borderRadius: "8px", padding: "0.75rem", color: "#3a3", fontSize: "0.85rem", marginBottom: "1rem" },
  refreshBtn: { padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid #ddd", background: "white", cursor: "pointer", fontSize: "0.85rem", marginBottom: "1rem" },
  empty: { textAlign: "center" as const, padding: "3rem", color: "#666" },
  list: { display: "flex", flexDirection: "column" as const, gap: "0.75rem" },
  card: { background: "#ffffff", borderRadius: "14px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" },
  cardBody: { fontSize: "0.85rem", color: "#475569", lineHeight: 1.6 },
  cardActions: { marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" },
  actionBtn: { padding: "0.55rem 1.35rem", borderRadius: "8px", border: "none", background: "#d97706", color: "white", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 4px rgba(217, 119, 6, 0.2)" },
  done: { color: "#059669", fontWeight: 700, fontSize: "0.9rem" },
  statusBadge: (s: string) => ({
    fontSize: "0.75rem",
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: "12px",
    color: "white",
    background: statusColors[s] || "#64748b",
    textTransform: "uppercase" as const,
  }),
};
