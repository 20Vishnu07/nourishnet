import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../config/api";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useRealtimeUpdates } from "../../hooks/useRealtimeUpdates";

interface Donation {
  id: number;
  food_type: string;
  quantity: number;
  unit: string;
  status: string;
  pickup_lat: number;
  pickup_lng: number;
  expiry_time: string;
  donor?: {
    name: string;
    phone: string;
  } | null;
}

interface Claim {
  id: number;
  donation_id: number;
  ngo_id: number;
  volunteer_id: number | null;
  needs_volunteer?: boolean;
  volunteer_lat?: number | null;
  volunteer_lng?: number | null;
  volunteer_updated_at?: string | null;
  status: string;
  claimed_at: string;
  donation?: Donation | null;
  ngo?: {
    id: number;
    name: string;
    org_name?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null;
}

export default function VolunteerDashboard() {
  const { t } = useTranslation();
  const { appUser, token } = useAuth();
  const { lat: userLat, lng: userLng, isAutoDetected, requestLocation } = useGeolocation();

  const [activeTab, setActiveTab] = useState<"available" | "my_deliveries">("available");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [availableClaims, setAvailableClaims] = useState<Claim[]>([]);
  const [donationDetails, setDonationDetails] = useState<Record<number, Donation>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [isSharingLocation, setIsSharingLocation] = useState(true);
  const [simStep, setSimStep] = useState(0);

  const locationWatchIdRef = useRef<number | null>(null);

  const loadClaims = useCallback(async () => {
    if (!appUser?.id) return;
    try {
      const result = await apiFetch<Claim[]>(
        `/claims/?volunteer_id=${appUser.id}`,
        { token },
      );
      setClaims(result);

      // Fetch donation details
      const details: Record<number, Donation> = {};
      for (const claim of result) {
        if (claim.donation) {
          details[claim.donation_id] = claim.donation;
        } else {
          try {
            const d = await apiFetch<Donation>(`/donations/${claim.donation_id}`, { token });
            details[claim.donation_id] = d;
          } catch {
            // ignore
          }
        }
      }
      setDonationDetails((prev) => ({ ...prev, ...details }));
    } catch (err) {
      console.warn("Failed to load volunteer claims:", err);
    }
  }, [appUser?.id, token]);

  const loadAvailableClaims = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<Claim[]>(
        `/claims/?available_for_volunteer=true`,
        { token },
      );
      setAvailableClaims(result);

      const details: Record<number, Donation> = {};
      for (const claim of result) {
        if (claim.donation) {
          details[claim.donation_id] = claim.donation;
        } else {
          try {
            const d = await apiFetch<Donation>(`/donations/${claim.donation_id}`, { token });
            details[claim.donation_id] = d;
          } catch {
            // ignore
          }
        }
      }
      setDonationDetails((prev) => ({ ...prev, ...details }));
    } catch (err) {
      console.warn("Failed to load available volunteer deliveries:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadClaims(), loadAvailableClaims()]);
  }, [loadClaims, loadAvailableClaims]);

  const onClaimStatusUpdated = useCallback((claim: any) => {
    setLiveNotice(`🔔 Real-time: Claim #${claim.id} updated to status "${claim.status}"`);
    refreshAll();
  }, [refreshAll]);

  const onVolunteerRequestCreated = useCallback((claim: any) => {
    setLiveNotice(`🚨 Real-time: An NGO just requested a volunteer courier for claim #${claim.id}!`);
    refreshAll();
  }, [refreshAll]);

  const { isConnected, isFallbackMode } = useRealtimeUpdates({
    onClaimStatusUpdated,
    onVolunteerRequestCreated,
    onPollFallback: refreshAll,
    pollIntervalMs: 8000,
  });

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Post location update to backend for active delivery
  const postLocation = useCallback(
    async (claimId: number, lat: number, lng: number) => {
      try {
        await apiFetch(`/claims/${claimId}/location`, {
          method: "POST",
          token,
          body: { lat, lng },
        });
      } catch (err) {
        console.warn("Failed to stream volunteer location:", err);
      }
    },
    [token],
  );

  // Active delivery that needs location tracking
  const activeDelivery = claims.find(
    (c) => c.status === "assigned" || c.status === "picked_up",
  );

  // Real-time GPS streaming effect
  useEffect(() => {
    if (!isSharingLocation || !activeDelivery) {
      if (locationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current);
        locationWatchIdRef.current = null;
      }
      return;
    }

    if ("geolocation" in navigator) {
      locationWatchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          postLocation(
            activeDelivery.id,
            pos.coords.latitude,
            pos.coords.longitude,
          );
        },
        (err) => {
          console.warn("GPS watch error:", err);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
      );
    }

    return () => {
      if (locationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current);
        locationWatchIdRef.current = null;
      }
    };
  }, [isSharingLocation, activeDelivery, postLocation]);

  // Accept a delivery request
  const handleAcceptDelivery = async (claimId: number) => {
    if (!appUser?.id) return;
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/claims/${claimId}/accept?volunteer_id=${appUser.id}`, {
        method: "POST",
        token,
      });
      setSuccess("🎉 Delivery accepted! You are now assigned to this pickup.");
      setActiveTab("my_deliveries");
      await refreshAll();

      // Immediately post initial location
      postLocation(claimId, userLat, userLng);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept delivery");
    }
  };

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
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  // Simulated GPS movement stepper for desktop testing
  const handleSimulateMovement = (claim: Claim) => {
    const donation = donationDetails[claim.donation_id];
    if (!donation) return;

    const nextStep = simStep + 1;
    setSimStep(nextStep);

    // Calculate simulated path between user and donor/destination
    const tRatio = Math.min(nextStep * 0.2, 1.0);
    const targetLat = claim.status === "picked_up" ? userLat : donation.pickup_lat;
    const targetLng = claim.status === "picked_up" ? userLng : donation.pickup_lng;

    const simLat = userLat + (targetLat - userLat) * tRatio;
    const simLng = userLng + (targetLng - userLng) * tRatio;

    postLocation(claim.id, simLat, simLng);
    setSuccess(`🚗 Simulated location advance: (${simLat.toFixed(4)}, ${simLng.toFixed(4)}) transmitted live to NGO!`);
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
      {success && <div style={styles.success}>{success}</div>}

      {/* GPS BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <span style={{
          fontSize: "0.8rem",
          color: isAutoDetected ? "#059669" : "#475569",
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          background: isAutoDetected ? "#ecfdf5" : "#f1f5f9",
          padding: "5px 12px",
          borderRadius: "8px",
          border: isAutoDetected ? "1px solid #a7f3d0" : "1px solid #e2e8f0",
        }}>
          📍 {isAutoDetected ? "GPS Auto-Detected" : "Volunteer GPS"}: {userLat.toFixed(4)}, {userLng.toFixed(4)}
        </span>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={requestLocation}
            style={{
              ...styles.refreshBtn,
              background: "#d97706",
              color: "#ffffff",
              border: "none",
              fontWeight: 700,
              marginBottom: 0,
            }}
          >
            🎯 Recalibrate GPS
          </button>
          <button onClick={refreshAll} style={{ ...styles.refreshBtn, marginBottom: 0 }} disabled={loading}>
            {loading ? t("common.loading") : `🔄 ${t("common.refresh")}`}
          </button>
        </div>
      </div>

      {/* TABS NAVIGATION */}
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
          onClick={() => setActiveTab("available")}
          style={{
            flex: 1,
            padding: "10px",
            border: "none",
            borderRadius: "8px",
            fontWeight: 700,
            fontSize: "0.88rem",
            cursor: "pointer",
            background: activeTab === "available" ? "#ffffff" : "transparent",
            color: activeTab === "available" ? "#d97706" : "#64748b",
            boxShadow: activeTab === "available" ? "0 2px 4px rgba(0,0,0,0.06)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <span>📍 Open Delivery Requests</span>
          <span style={{
            background: activeTab === "available" ? "#fef3c7" : "#e2e8f0",
            color: activeTab === "available" ? "#b45309" : "#64748b",
            padding: "2px 7px",
            borderRadius: "10px",
            fontSize: "0.75rem",
          }}>
            {availableClaims.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("my_deliveries")}
          style={{
            flex: 1,
            padding: "10px",
            border: "none",
            borderRadius: "8px",
            fontWeight: 700,
            fontSize: "0.88rem",
            cursor: "pointer",
            background: activeTab === "my_deliveries" ? "#ffffff" : "transparent",
            color: activeTab === "my_deliveries" ? "#d97706" : "#64748b",
            boxShadow: activeTab === "my_deliveries" ? "0 2px 4px rgba(0,0,0,0.06)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <span>🚗 My Deliveries</span>
          <span style={{
            background: activeTab === "my_deliveries" ? "#fef3c7" : "#e2e8f0",
            color: activeTab === "my_deliveries" ? "#b45309" : "#64748b",
            padding: "2px 7px",
            borderRadius: "10px",
            fontSize: "0.75rem",
          }}>
            {claims.length}
          </span>
        </button>
      </div>

      {/* TAB 1: AVAILABLE DELIVERIES */}
      {activeTab === "available" && (
        <div>
          {availableClaims.length === 0 ? (
            <div style={styles.empty}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🌿</div>
              <h3 style={{ margin: "0 0 0.5rem", color: "#334155" }}>No open delivery requests</h3>
              <p style={{ color: "#64748b", fontSize: "0.88rem", margin: 0 }}>
                When NGOs claim food and request a volunteer courier, available deliveries will appear here in real time!
              </p>
            </div>
          ) : (
            <div style={styles.list}>
              {availableClaims.map((claim) => {
                const donation = donationDetails[claim.donation_id];
                return (
                  <div key={claim.id} style={{ ...styles.card, borderLeft: "5px solid #d97706" }}>
                    <div style={styles.cardHeader}>
                      <div>
                        <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>
                          🍲 {donation ? donation.food_type : `Claim #${claim.id}`}
                        </strong>
                        {donation && (
                          <span style={{ marginLeft: "8px", fontWeight: 700, color: "#d97706" }}>
                            ({donation.quantity} {donation.unit})
                          </span>
                        )}
                      </div>
                      <span style={{
                        background: "#fef3c7",
                        color: "#b45309",
                        padding: "3px 10px",
                        borderRadius: "12px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}>
                        Needs Courier
                      </span>
                    </div>

                    {donation && (
                      <div style={styles.cardBody}>
                        {donation.donor && (
                          <p style={{ margin: "4px 0" }}>
                            👤 <strong>Pickup from Donor:</strong> {donation.donor.name} •{" "}
                            <a href={`tel:${donation.donor.phone}`} style={{ color: "#d97706", fontWeight: 700, textDecoration: "none" }}>
                              📞 {donation.donor.phone}
                            </a>
                          </p>
                        )}
                        {claim.ngo && (
                          <p style={{ margin: "4px 0" }}>
                            🏢 <strong>Deliver to NGO:</strong> {claim.ngo.org_name || claim.ngo.name}
                            {claim.ngo.phone && ` • 📞 ${claim.ngo.phone}`}
                          </p>
                        )}
                        <p style={{ margin: "4px 0", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span>
                            📍 <strong>Pickup Location:</strong> {donation.pickup_lat.toFixed(4)}, {donation.pickup_lng.toFixed(4)}
                          </span>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${donation.pickup_lat},${donation.pickup_lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: "#fef3c7",
                              color: "#b45309",
                              border: "1px solid #fde68a",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontWeight: 700,
                              fontSize: "0.8rem",
                              textDecoration: "none",
                            }}
                          >
                            🗺️ Preview Route
                          </a>
                        </p>
                      </div>
                    )}

                    <div style={{ marginTop: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid #f1f5f9" }}>
                      <button
                        onClick={() => handleAcceptDelivery(claim.id)}
                        style={{
                          ...styles.actionBtn,
                          background: "#059669",
                          fontSize: "0.9rem",
                          padding: "0.65rem 1.5rem",
                        }}
                      >
                        🚀 Accept This Delivery
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY DELIVERIES */}
      {activeTab === "my_deliveries" && (
        <div>
          {claims.length === 0 && !loading && (
            <div style={styles.empty}>
              <p>{t("volunteer.noClaimsYet")}</p>
              <p style={{ fontSize: "0.85rem", color: "#999" }}>
                Switch to "Open Delivery Requests" to claim available deliveries!
              </p>
            </div>
          )}

          <div style={styles.list}>
            {claims.map((claim) => {
              const donation = donationDetails[claim.donation_id];
              const nextAction = statusFlow[claim.status];
              const isCurrentActive = claim.status === "assigned" || claim.status === "picked_up";

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
                        📦 <strong>Quantity:</strong> {donation.quantity} {donation.unit}
                      </p>
                      {donation.donor && (
                        <p>
                          👤 <strong>Donor:</strong> {donation.donor.name} •{" "}
                          <a href={`tel:${donation.donor.phone}`} style={{ color: "#d97706", fontWeight: 700, textDecoration: "none" }}>
                            📞 {donation.donor.phone}
                          </a>
                        </p>
                      )}
                      {claim.ngo && (
                        <p>
                          🏢 <strong>NGO Destination:</strong> {claim.ngo.org_name || claim.ngo.name}
                          {claim.ngo.phone && ` • 📞 ${claim.ngo.phone}`}
                        </p>
                      )}
                      <p style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span>
                          📍 {t("volunteer.location")}: {donation.pickup_lat.toFixed(4)},{" "}
                          {donation.pickup_lng.toFixed(4)}
                        </span>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${donation.pickup_lat},${donation.pickup_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: "#fef3c7",
                            color: "#b45309",
                            border: "1px solid #fde68a",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontWeight: 700,
                            fontSize: "0.8rem",
                            textDecoration: "none",
                          }}
                        >
                          🧭 Google Maps Navigation
                        </a>
                      </p>
                      <p>
                        ⏰ {t("volunteer.expires")}: {new Date(donation.expiry_time).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {/* LIVE LOCATION STREAMING CONTROLS */}
                  {isCurrentActive && (
                    <div style={{
                      background: "#fffbeb",
                      border: "1px solid #fef3c7",
                      borderRadius: "10px",
                      padding: "0.75rem 1rem",
                      marginTop: "0.75rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="pulse-dot" style={{ background: isSharingLocation ? "#d97706" : "#94a3b8" }} />
                        <span style={{ fontSize: "0.82rem", color: "#92400e", fontWeight: 600 }}>
                          {isSharingLocation
                            ? "📡 Live GPS Broadcasting Active (Streaming to NGO)"
                            : "Live GPS Broadcasting Paused"}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={() => setIsSharingLocation(!isSharingLocation)}
                          style={{
                            background: "#ffffff",
                            border: "1px solid #d97706",
                            color: "#b45309",
                            borderRadius: "6px",
                            padding: "4px 10px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {isSharingLocation ? "Pause GPS" : "Resume GPS"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSimulateMovement(claim)}
                          style={{
                            background: "#d97706",
                            border: "none",
                            color: "#ffffff",
                            borderRadius: "6px",
                            padding: "4px 10px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          🧪 Advance GPS (Test)
                        </button>
                      </div>
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
      )}
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
