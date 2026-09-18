import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../config/api";
import { useGeolocation } from "../../hooks/useGeolocation";
import DonationMap, { type DonationMarker } from "../../components/Map/DonationMap";
import LiveTrackingMap from "../../components/Map/LiveTrackingMap";
import { useRealtimeUpdates } from "../../hooks/useRealtimeUpdates";

interface Donation extends DonationMarker {
  donor_id: number;
  created_at?: string;
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
  delivery_photo?: string | null;
  status: string;
  claimed_at: string;
  donation?: Donation | null;
  volunteer?: {
    id: number;
    name: string;
    phone?: string | null;
  } | null;
}

export default function NGODashboard() {
  const { t } = useTranslation();
  const { appUser, token } = useAuth();
  const {
    lat,
    lng,
    error: geoError,
    isAutoDetected,
    isGpsPrecise,
    accuracy,
    refreshExactGps,
  } = useGeolocation();

  const [donations, setDonations] = useState<Donation[]>([]);
  const [myClaims, setMyClaims] = useState<Claim[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "radar" | "claims">("overview");
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [showAllRegional, setShowAllRegional] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [liveNotification, setLiveNotification] = useState<string | null>(null);
  const [expandedTrackingId, setExpandedTrackingId] = useState<number | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [radarLat, setRadarLat] = useState(lat);
  const [radarLng, setRadarLng] = useState(lng);
  const [detectingLocation, setDetectingLocation] = useState(false);

  useEffect(() => {
    if (lat && lng) {
      setRadarLat(lat);
      setRadarLng(lng);
    }
  }, [lat, lng]);

  const loadNearby = useCallback(async (targetLat?: number, targetLng?: number, forceRegional?: boolean) => {
    const isRegional = forceRegional !== undefined ? forceRegional : showAllRegional;
    const qLat = typeof targetLat === "number" ? targetLat : radarLat;
    const qLng = typeof targetLng === "number" ? targetLng : radarLng;
    setLoading(true);
    setError(null);
    try {
      let result: Donation[] = [];
      if (isRegional || radiusKm >= 500) {
        result = await apiFetch<Donation[]>("/donations/?status=available", { token });
      } else {
        result = await apiFetch<Donation[]>(
          `/donations/nearby?lat=${qLat}&lng=${qLng}&radius_km=${radiusKm}`,
          { token },
        );
        // Smart fast detection: If local radius yielded 0 donations, automatically check regional surplus
        // so NGO instantly sees any active donations
        if (result.length === 0) {
          const all = await apiFetch<Donation[]>("/donations/?status=available", { token });
          if (all.length > 0) {
            result = all;
            setShowAllRegional(true);
            setLiveNotification("💡 Showing all active regional food surplus so you don't miss any meals!");
          }
        }
      }
      setDonations(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load donations");
    } finally {
      setLoading(false);
    }
  }, [radarLat, radarLng, radiusKm, showAllRegional, token]);

  const handleAutoDetectLocation = async () => {
    setDetectingLocation(true);
    setError(null);
    try {
      const coords = await refreshExactGps();
      if (coords) {
        setRadarLat(coords.lat);
        setRadarLng(coords.lng);
        setLiveNotification(
          `🎯 Live GPS locked (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}) - Accuracy: ~${Math.round(coords.accuracy || 25)}m`
        );
        await loadNearby(coords.lat, coords.lng);
      }
    } catch {
      setError("Failed to auto-detect location. Please check browser permissions.");
    } finally {
      setDetectingLocation(false);
    }
  };

  const loadMyClaims = useCallback(async () => {
    if (!appUser?.id) return;
    try {
      const claims = await apiFetch<Claim[]>(`/claims/?ngo_id=${appUser.id}`, { token });
      setMyClaims(claims);
    } catch {
      // Silently fail if claims error
    }
  }, [appUser?.id, token]);

  const onNewDonation = useCallback((newDonation: { food_type: string; quantity: number; unit: string }) => {
    setLiveNotification(`🔔 Real-time: New donation available! "${newDonation.food_type}" (${newDonation.quantity} ${newDonation.unit})`);
    loadNearby();
  }, [loadNearby]);

  const onClaimStatusUpdated = useCallback((updatedClaim: { id: number; status: string }) => {
    setLiveNotification(`🔔 Real-time: Claim #${updatedClaim.id} updated (${updatedClaim.status})`);
    loadNearby();
    loadMyClaims();
  }, [loadNearby, loadMyClaims]);

  const onVolunteerLocationUpdated = useCallback((data: { claim_id: number; lat: number; lng: number; status?: string }) => {
    setMyClaims((prev) =>
      prev.map((c) => {
        if (c.id === data.claim_id) {
          return {
            ...c,
            volunteer_lat: data.lat,
            volunteer_lng: data.lng,
            volunteer_updated_at: new Date().toISOString(),
            status: data.status || c.status,
          };
        }
        return c;
      })
    );
  }, []);

  const { isConnected, isFallbackMode } = useRealtimeUpdates({
    onNewDonation,
    onClaimStatusUpdated,
    onVolunteerLocationUpdated,
    onPollFallback: () => {
      loadNearby();
      loadMyClaims();
    },
    pollIntervalMs: 3000,
  });

  useEffect(() => {
    loadNearby();
    loadMyClaims();

    const handleSync = () => {
      loadNearby();
      loadMyClaims();
    };
    window.addEventListener("focus", handleSync);
    document.addEventListener("visibilitychange", handleSync);
    return () => {
      window.removeEventListener("focus", handleSync);
      document.removeEventListener("visibilitychange", handleSync);
    };
  }, [loadNearby, loadMyClaims]);

  const handleClaim = async (donation: Donation, requestVolunteerDelivery: boolean = false) => {
    setError(null);
    setClaimSuccess(null);
    try {
      await apiFetch("/claims/", {
        method: "POST",
        token,
        body: {
          donation_id: donation.id,
          ngo_id: appUser?.id,
          needs_volunteer: requestVolunteerDelivery,
        },
      });
      setClaimSuccess(t("ngo.claimSuccess", { foodType: donation.food_type }));
      setSelectedDonation(null);
      setActiveTab("claims");
      await loadNearby();
      await loadMyClaims();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim donation");
    }
  };

  const handleToggleVolunteerRequest = async (claimId: number, needsVolunteer: boolean) => {
    setActionLoadingId(claimId);
    setError(null);
    try {
      await apiFetch(`/claims/${claimId}/request-volunteer?needs_volunteer=${needsVolunteer}`, {
        method: "POST",
        token,
      });
      setLiveNotification(
        needsVolunteer
          ? "🚗 Volunteer delivery requested! Available couriers have been notified."
          : "Volunteer request cancelled (set to self-pickup)."
      );
      await loadMyClaims();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update volunteer request");
    } finally {
      setActionLoadingId(null);
    }
  };

  const activeIncomingCount = myClaims.filter((c) => c.status !== "delivered").length;
  const completedClaimsCount = myClaims.filter((c) => c.status === "delivered").length;
  const courierAssignedCount = myClaims.filter((c) => c.volunteer_id && c.status !== "delivered").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800, color: "#0f172a" }}>
            🏢 {t("ngo.title")}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
            Real-time surplus food discovery, meal reservation, and volunteer courier dispatch.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              fontSize: "0.75rem",
              padding: "5px 12px",
              borderRadius: "20px",
              background: isConnected ? "#f0f9ff" : isFallbackMode ? "#fef3c7" : "#f1f5f9",
              color: isConnected ? "#0369a1" : isFallbackMode ? "#92400e" : "#475569",
              border: `1px solid ${isConnected ? "#bae6fd" : isFallbackMode ? "#fde68a" : "#cbd5e1"}`,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {isConnected ? `🟢 Live Network Active` : isFallbackMode ? `🟡 Syncing via Polling` : `⚪ Connecting...`}
          </span>
          <button
            onClick={() => setActiveTab(activeTab === "radar" ? "overview" : "radar")}
            style={{
              background: activeTab === "radar" ? "#f1f5f9" : "#0284c7",
              color: activeTab === "radar" ? "#0f172a" : "#ffffff",
              border: activeTab === "radar" ? "1px solid #cbd5e1" : "none",
              padding: "7px 16px",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              boxShadow: activeTab === "radar" ? "none" : "0 2px 6px rgba(2, 132, 199, 0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {activeTab === "radar" ? "← Back to Homepage" : "🔍 Find & Claim Food"}
          </button>
        </div>
      </div>

      {liveNotification && (
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "10px",
            padding: "0.85rem 1.25rem",
            color: "#1e40af",
            fontSize: "0.9rem",
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{liveNotification}</span>
          <button
            onClick={() => setLiveNotification(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#1e40af", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {geoError && <div style={styles.warning}>📍 {geoError}</div>}
      {error && <div style={styles.error}>⚠️ {error}</div>}
      {claimSuccess && <div style={styles.success}>✅ {claimSuccess}</div>}

      {/* 1. OPERATIONAL METRICS CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "1rem",
        }}
      >
        <div style={statsCardStyle}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>📡</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0284c7" }}>{donations.length}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Surplus Lots in {radiusKm}km</div>
        </div>
        <div style={statsCardStyle}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>📦</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a" }}>{activeIncomingCount}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Active Incoming Deliveries</div>
        </div>
        <div style={statsCardStyle}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>🚗</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#d97706" }}>{courierAssignedCount}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Volunteer Couriers Assigned</div>
        </div>
        <div style={statsCardStyle}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>✅</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#16a34a" }}>{completedClaimsCount}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Total Deliveries Received</div>
        </div>
      </div>

      {/* 2. TAB CONTROLS */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "2px solid #e2e8f0",
          paddingBottom: "4px",
          overflowX: "auto",
        }}
      >
        <button
          onClick={() => setActiveTab("overview")}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "overview" ? "3px solid #0284c7" : "3px solid transparent",
            padding: "10px 18px",
            fontSize: "0.95rem",
            fontWeight: 700,
            color: activeTab === "overview" ? "#0284c7" : "#64748b",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span>🏠 Overview Homepage</span>
        </button>

        <button
          onClick={() => setActiveTab("radar")}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "radar" ? "3px solid #0284c7" : "3px solid transparent",
            padding: "10px 18px",
            fontSize: "0.95rem",
            fontWeight: 700,
            color: activeTab === "radar" ? "#0284c7" : "#64748b",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span>📡 Available Surplus Radar</span>
          <span
            style={{
              fontSize: "0.75rem",
              background: activeTab === "radar" ? "#e0f2fe" : "#f1f5f9",
              color: activeTab === "radar" ? "#0284c7" : "#64748b",
              padding: "2px 8px",
              borderRadius: "12px",
            }}
          >
            {donations.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("claims")}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "claims" ? "3px solid #0284c7" : "3px solid transparent",
            padding: "10px 18px",
            fontSize: "0.95rem",
            fontWeight: 700,
            color: activeTab === "claims" ? "#0284c7" : "#64748b",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span>📦 Incoming Deliveries & Claims</span>
          <span
            style={{
              fontSize: "0.75rem",
              background: activeTab === "claims" ? "#e0f2fe" : "#f1f5f9",
              color: activeTab === "claims" ? "#0284c7" : "#64748b",
              padding: "2px 8px",
              borderRadius: "12px",
            }}
          >
            {myClaims.length}
          </span>
        </button>
      </div>

      {/* TAB 0: NGO OVERVIEW HOMEPAGE */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Welcome Action Hero Banner */}
          <div
            style={{
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              borderRadius: "16px",
              padding: "2rem",
              color: "#ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1.25rem",
              boxShadow: "0 4px 14px rgba(2, 132, 199, 0.25)",
            }}
          >
            <div style={{ maxWidth: "600px" }}>
              <div style={{ display: "inline-block", background: "rgba(255,255,255,0.2)", padding: "3px 10px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: 700, marginBottom: "8px" }}>
                🏢 Shelter & NGO Command Center
              </div>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.5rem", fontWeight: 800 }}>
                Welcome, {appUser?.org_name || appUser?.name}! 🍲
              </h3>
              <p style={{ margin: 0, fontSize: "0.92rem", opacity: 0.95, lineHeight: 1.5 }}>
                Discover available surplus food from local restaurants, cafes, and events. Claim batches for your community shelter and dispatch volunteer couriers with automated live GPS tracking.
              </p>
            </div>
            <button
              onClick={() => setActiveTab("radar")}
              style={{
                background: "#ffffff",
                color: "#0369a1",
                border: "none",
                borderRadius: "12px",
                padding: "12px 24px",
                fontWeight: 800,
                fontSize: "1rem",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                transition: "transform 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.03)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <span>🔍 Find & Claim Food</span>
              <span>→</span>
            </button>
          </div>

          {/* Incoming Deliveries & Status Updates */}
          <div style={{ background: "#ffffff", borderRadius: "16px", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                  🚚 Incoming Food Deliveries & Real-Time Status
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                  Live overview of claimed food batches and active volunteer courier handovers.
                </p>
              </div>
              {myClaims.length > 0 && (
                <button
                  onClick={() => setActiveTab("claims")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#0284c7",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  View All ({myClaims.length}) →
                </button>
              )}
            </div>

            {myClaims.filter((c) => c.status !== "delivered").length === 0 ? (
              <div style={{ textAlign: "center", padding: "2.5rem 1rem", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📡</div>
                <h5 style={{ margin: "0 0 0.25rem", fontSize: "1rem", color: "#334155", fontWeight: 700 }}>No Incoming Deliveries Right Now</h5>
                <p style={{ margin: "0 0 1rem", fontSize: "0.82rem", color: "#64748b" }}>
                  Explore the live radar to find and claim nearby cooked meals, bakery goods, or fresh produce for your shelter.
                </p>
                <button
                  onClick={() => setActiveTab("radar")}
                  style={{
                    background: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 18px",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  🔍 Open Surplus Food Radar
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
                {myClaims.filter((c) => c.status !== "delivered").slice(0, 4).map((claim) => (
                  <div
                    key={claim.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      padding: "1rem",
                      background: "#f8fafc",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                        <span style={{ fontWeight: 800, fontSize: "0.98rem", color: "#0f172a" }}>
                          Claim #{claim.id} • {claim.donation?.food_type || "Surplus Meal"}
                        </span>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "12px",
                            background:
                              claim.status === "claimed"
                                ? "#eff6ff"
                                : claim.status === "picked_up"
                                ? "#fffbeb"
                                : "#ecfdf5",
                            color:
                              claim.status === "claimed"
                                ? "#1e40af"
                                : claim.status === "picked_up"
                                ? "#b45309"
                                : "#065f46",
                            border: `1px solid ${
                              claim.status === "claimed"
                                ? "#bfdbfe"
                                : claim.status === "picked_up"
                                ? "#fde68a"
                                : "#a7f3d0"
                            }`,
                            textTransform: "capitalize",
                          }}
                        >
                          {claim.status === "claimed"
                            ? "🔵 Order Reserved"
                            : claim.status === "picked_up"
                            ? "🚗 Courier In Transit"
                            : "✅ Delivered"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#475569" }}>
                        <strong>Quantity:</strong> {claim.donation ? `${claim.donation.quantity} ${claim.donation.unit}` : "Batch"}
                      </div>
                      {claim.volunteer ? (
                        <div style={{ fontSize: "0.8rem", color: "#0284c7", marginTop: "4px", fontWeight: 600 }}>
                          🚗 Courier: {claim.volunteer.name}{" "}
                          {claim.volunteer.phone && (
                            <a href={`tel:${claim.volunteer.phone}`} style={{ color: "#0284c7", marginLeft: "4px" }}>
                              📞 {claim.volunteer.phone}
                            </a>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: "0.8rem", color: "#d97706", marginTop: "4px", fontWeight: 600 }}>
                          ⏳ Awaiting volunteer courier pickup
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "6px" }}>
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        {new Date(claim.claimed_at).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => {
                          setActiveTab("claims");
                          setExpandedTrackingId(claim.id);
                        }}
                        style={{
                          background: "#e0f2fe",
                          color: "#0284c7",
                          border: "none",
                          borderRadius: "6px",
                          padding: "4px 10px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Track Delivery →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shelter Operations & Food Safety Guidelines */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
            <div style={{ background: "#ffffff", borderRadius: "14px", padding: "1.25rem", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🍲</div>
              <h5 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>
                Hot Holding & Prompt Serving
              </h5>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b", lineHeight: 1.5 }}>
                Ensure incoming cooked meals are served promptly or stored in thermal holding equipment at safe temperatures.
              </p>
            </div>

            <div style={{ background: "#ffffff", borderRadius: "14px", padding: "1.25rem", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🏷️</div>
              <h5 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>
                Intake & Allergen Inspection
              </h5>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b", lineHeight: 1.5 }}>
                Check donor packaging seals and dietary indicators (Vegetarian / Halal / Dairy) before serving shelter beneficiaries.
              </p>
            </div>

            <div style={{ background: "#ffffff", borderRadius: "14px", padding: "1.25rem", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>📸</div>
              <h5 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>
                Verified Delivery Proofs
              </h5>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b", lineHeight: 1.5 }}>
                Volunteer couriers take a photo proof upon dropoff to guarantee accountability and complete transparency.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: RADAR */}
      {activeTab === "radar" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <button
              onClick={() => setActiveTab("overview")}
              style={{
                background: "none",
                border: "none",
                color: "#0284c7",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: 0,
              }}
            >
              ← Back to Overview Homepage
            </button>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Live Surplus Map & Discovery Radar</span>
          </div>

      <div style={styles.controls}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <label style={styles.label}>
            {t("ngo.searchRadius")}{" "}
            <select
              value={showAllRegional ? 999 : radiusKm}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val >= 500) {
                  setShowAllRegional(true);
                  loadNearby(radarLat, radarLng, true);
                } else {
                  setShowAllRegional(false);
                  setRadiusKm(val);
                  loadNearby(radarLat, radarLng, false);
                }
              }}
              style={styles.select}
            >
              <option value={5}>5 {t("common.km")}</option>
              <option value={10}>10 {t("common.km")}</option>
              <option value={25}>25 {t("common.km")}</option>
              <option value={50}>50 {t("common.km")}</option>
              <option value={100}>100 {t("common.km")} (District)</option>
              <option value={999}>🌐 All Regional Surplus</option>
            </select>
          </label>

          <span style={{
            fontSize: "0.8rem",
            color: isGpsPrecise ? "#059669" : isAutoDetected ? "#0284c7" : "#475569",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            background: isGpsPrecise ? "#ecfdf5" : isAutoDetected ? "#f0f9ff" : "#f1f5f9",
            padding: "4px 10px",
            borderRadius: "8px",
            border: isGpsPrecise ? "1px solid #a7f3d0" : isAutoDetected ? "1px solid #bae6fd" : "1px solid #e2e8f0",
          }}>
            📍 {isGpsPrecise ? `Exact Satellite GPS (~${Math.round(accuracy || 20)}m)` : isAutoDetected ? "Auto-Detected Area" : "Radar"}: {radarLat.toFixed(4)}, {radarLng.toFixed(4)}
          </span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleAutoDetectLocation}
            disabled={detectingLocation || loading}
            style={{
              ...styles.refreshBtn,
              background: detectingLocation ? "#94a3b8" : isGpsPrecise ? "#059669" : "#0284c7",
              color: "#ffffff",
              border: "none",
              fontWeight: 700,
              cursor: detectingLocation ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
            title="Acquire highest accuracy GPS satellite/device fix"
          >
            {detectingLocation ? "⏳ Locking GPS..." : isGpsPrecise ? "🎯 GPS Locked ✓" : "🎯 Lock Exact Live GPS"}
          </button>
          <button
            onClick={() => loadNearby()}
            style={{
              ...styles.refreshBtn,
              background: "#0284c7",
              color: "#ffffff",
              border: "none",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
            disabled={loading || detectingLocation}
          >
            {loading ? "⏳ Scanning..." : `⚡ Instant Radar Scan (${donations.length})`}
          </button>
        </div>
      </div>

      {showAllRegional && (
        <div style={{
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: "10px",
          padding: "8px 14px",
          fontSize: "0.82rem",
          color: "#1e40af",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "0.75rem",
        }}>
          <span>🌐 <strong>Regional Discovery Active:</strong> Displaying all available surplus donations so no food goes unnoticed.</span>
          <button
            type="button"
            onClick={() => {
              setShowAllRegional(false);
              loadNearby(radarLat, radarLng, false);
            }}
            style={{
              background: "#ffffff",
              border: "1px solid #bfdbfe",
              color: "#1e40af",
              borderRadius: "6px",
              padding: "3px 8px",
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Filter by {radiusKm} km Radius
          </button>
        </div>
      )}

      <DonationMap
        center={{ lat: radarLat, lng: radarLng }}
        donations={donations}
        onDonationClick={(d) => setSelectedDonation(d as Donation)}
        onCenterChange={(newLat, newLng) => {
          setRadarLat(newLat);
          setRadarLng(newLng);
          loadNearby(newLat, newLng);
        }}
        onDetectLocation={handleAutoDetectLocation}
        detecting={detectingLocation}
      />

      <p style={styles.count}>
        {t("ngo.foundWithin", { count: donations.length, radius: radiusKm })}
      </p>

      {selectedDonation && (
        <div style={styles.detail}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ margin: "0 0 0.25rem", color: "#0f172a", fontSize: "1.3rem" }}>
                🍲 {selectedDonation.food_type}
              </h3>
              <p style={{ margin: "0 0 0.5rem", color: "#0284c7", fontWeight: 700, fontSize: "1.05rem" }}>
                📦 {selectedDonation.quantity} {selectedDonation.unit}
              </p>
            </div>
            <span style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: "12px",
              color: "white",
              background: selectedDonation.status === "available" ? "#10b981" : "#0284c7",
              textTransform: "uppercase",
            }}>
              {selectedDonation.status}
            </span>
          </div>

          {selectedDonation.image_url && (
            <div style={{
              marginTop: "0.75rem",
              borderRadius: "10px",
              overflow: "hidden",
              border: "1px solid #bfdbfe",
              background: "#0f172a",
              display: "flex",
              flexDirection: "column",
            }}>
              <div style={{
                background: "linear-gradient(to right, #0284c7, #0ea5e9)",
                color: "#ffffff",
                padding: "4px 12px",
                fontSize: "0.78rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}>
                📸 Food & Packaging Condition (Uploaded by Donor)
              </div>
              <img
                src={selectedDonation.image_url}
                alt="Food packaging condition"
                style={{
                  width: "100%",
                  maxHeight: "240px",
                  objectFit: "contain",
                  background: "#0f172a",
                }}
              />
            </div>
          )}

          <div style={{
            background: "#ffffff",
            padding: "1rem",
            borderRadius: "10px",
            border: "1px solid #bfdbfe",
            marginTop: "0.75rem",
            marginBottom: "1rem",
            fontSize: "0.9rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}>
            <div>
              ⏰ <strong>{t("ngo.expires")}:</strong> {new Date(selectedDonation.expiry_time).toLocaleString()}
            </div>
            <div>
              📍 <strong>{t("ngo.pickupCoordinates")}:</strong> {selectedDonation.pickup_lat.toFixed(4)}, {selectedDonation.pickup_lng.toFixed(4)}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${selectedDonation.pickup_lat},${selectedDonation.pickup_lng}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginLeft: "0.5rem",
                  color: "#0284c7",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "0.8rem",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: "#e0f2fe",
                  border: "1px solid #bae6fd",
                }}
              >
                🗺️ {t("ngo.viewOnMap")}
              </a>
            </div>
            {selectedDonation.donor && (
              <div style={{
                marginTop: "0.4rem",
                paddingTop: "0.4rem",
                borderTop: "1px dashed #cbd5e1",
              }}>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "2px" }}>
                  👤 {t("ngo.donorDetails")}:
                </div>
                <div style={{ color: "#334155" }}>
                  <strong>{t("ngo.donorName")}:</strong> {selectedDonation.donor.name}
                </div>
                <div style={{ color: "#334155" }}>
                  <strong>{t("ngo.donorPhone")}:</strong>{" "}
                  <a href={`tel:${selectedDonation.donor.phone}`} style={{ color: "#0284c7", fontWeight: 600, textDecoration: "none" }}>
                    📞 {selectedDonation.donor.phone}
                  </a>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            {selectedDonation.status === "available" && (
              <>
                <button
                  onClick={() => handleClaim(selectedDonation, false)}
                  style={styles.claimBtn}
                >
                  📋 Claim (NGO Self-Pickup)
                </button>
                <button
                  onClick={() => handleClaim(selectedDonation, true)}
                  style={{
                    ...styles.claimBtn,
                    background: "#d97706",
                  }}
                >
                  🚗 Claim & Request Volunteer Courier
                </button>
              </>
            )}
            <button
              onClick={() => setSelectedDonation(null)}
              style={styles.closeBtn}
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      )}

      {/* AVAILABLE DONATIONS LIST */}
      {donations.length > 0 && (
        <>
          <h3 style={{ marginTop: "1.75rem" }}>{t("ngo.availableDonations")}</h3>
          <div style={styles.list}>
            {donations.map((d) => (
              <div
                key={d.id}
                style={styles.card}
                onClick={() => setSelectedDonation(d)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {d.image_url && (
                    <img
                      src={d.image_url}
                      alt="Food packaging"
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "8px",
                        objectFit: "cover",
                        border: "1px solid #cbd5e1",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div>
                    <strong>🍲 {d.food_type}</strong>
                    {d.donor && (
                      <span style={{ fontSize: "0.8rem", color: "#64748b", marginLeft: "8px" }}>
                        by {d.donor.name}
                      </span>
                    )}
                    {d.image_url && (
                      <div style={{ fontSize: "0.72rem", color: "#059669", fontWeight: 600 }}>
                        📸 Photo attached
                      </div>
                    )}
                  </div>
                </div>
                <span style={styles.qty}>
                  {d.quantity} {d.unit}
                </span>
                <span style={styles.expiry}>
                  ⏰ {new Date(d.expiry_time).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      </div>
      )}

      {/* TAB 2: INCOMING DELIVERIES & CLAIMS */}
      {activeTab === "claims" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", fontSize: "1.25rem", color: "#0f172a" }}>
              📋 {t("ngo.myClaimedFood")}
              <span style={{
                fontSize: "0.75rem",
                background: "#0284c7",
                color: "white",
                padding: "2px 8px",
                borderRadius: "12px",
                fontWeight: 700,
              }}>
                {myClaims.length}
              </span>
            </h3>
            <button
              onClick={() => loadMyClaims()}
              style={{
                background: "#f1f5f9",
                border: "1px solid #cbd5e1",
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🔄 Refresh Claims
            </button>
          </div>

      {myClaims.length === 0 ? (
        <p style={{ color: "#94a3b8", textAlign: "center", padding: "1.5rem", background: "#f8fafc", borderRadius: "10px", border: "1px dashed #cbd5e1" }}>
          {t("ngo.noClaimedYet")}
        </p>
      ) : (
        <div style={styles.list}>
          {myClaims.map((claim) => {
            const donation = claim.donation;
            const isTracking = expandedTrackingId === claim.id || (!expandedTrackingId && claim.status === "picked_up");
            const hasVolunteer = Boolean(claim.volunteer_id);

            return (
              <div
                key={claim.id}
                style={{
                  ...styles.card,
                  borderLeft: `5px solid ${hasVolunteer ? "#d97706" : "#0284c7"}`,
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: "0.75rem",
                  cursor: "default",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <div>
                    <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>
                      🍲 {donation ? donation.food_type : `Claim #${claim.id}`}
                    </strong>
                    {donation && (
                      <span style={{ marginLeft: "8px", fontWeight: 700, color: "#0284c7", fontSize: "0.95rem" }}>
                        ({donation.quantity} {donation.unit})
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {claim.needs_volunteer && !hasVolunteer && (
                      <span style={{
                        fontSize: "0.72rem",
                        padding: "3px 8px",
                        borderRadius: "10px",
                        background: "#fef3c7",
                        color: "#b45309",
                        fontWeight: 700,
                      }}>
                        ⏳ Volunteer Requested
                      </span>
                    )}
                    <span style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: "12px",
                      color: "white",
                      background: claim.status === "delivered" ? "#10b981" : claim.status === "picked_up" ? "#8b5cf6" : "#0284c7",
                      textTransform: "uppercase",
                    }}>
                      {claim.status.replace("_", " ")}
                    </span>
                  </div>
                </div>

                {donation && (
                  <div style={{ fontSize: "0.85rem", color: "#475569", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {donation.donor && (
                      <div>
                        👤 <strong>{t("ngo.donorDetails")}:</strong> {donation.donor.name} •{" "}
                        <a href={`tel:${donation.donor.phone}`} style={{ color: "#0284c7", textDecoration: "none", fontWeight: 600 }}>
                          📞 {donation.donor.phone}
                        </a>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span>📍 <strong>{t("ngo.pickupCoordinates")}:</strong> {donation.pickup_lat.toFixed(4)}, {donation.pickup_lng.toFixed(4)}</span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${donation.pickup_lat},${donation.pickup_lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#0284c7",
                          textDecoration: "none",
                          fontWeight: 600,
                          fontSize: "0.8rem",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background: "#e0f2fe",
                          border: "1px solid #bae6fd",
                        }}
                      >
                        🗺️ Google Maps
                      </a>
                    </div>
                    {donation.image_url && (
                      <div style={{ marginTop: "0.4rem", display: "flex", alignItems: "center", gap: "10px" }}>
                        <img
                          src={donation.image_url}
                          alt="Packaging condition"
                          style={{
                            width: "80px",
                            height: "60px",
                            objectFit: "cover",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                          }}
                        />
                        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                          📸 Donor's food packaging photo
                        </span>
                      </div>
                    )}
                    {claim.delivery_photo && (
                      <div style={{ marginTop: "0.4rem", display: "flex", alignItems: "center", gap: "10px", background: "#f0fdf4", padding: "6px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                        <img
                          src={claim.delivery_photo}
                          alt="Volunteer delivery proof"
                          style={{
                            width: "80px",
                            height: "60px",
                            objectFit: "cover",
                            borderRadius: "6px",
                            border: "1px solid #86efac",
                          }}
                        />
                        <div>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#166534" }}>
                            📸 Volunteer Delivery Confirmation Photo
                          </div>
                          <div style={{ fontSize: "0.74rem", color: "#15803d" }}>
                            Captured by courier during pickup / delivery
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* VOLUNTEER COORDINATION & LIVE TRACKING PANEL */}
                <div style={{
                  background: "#f8fafc",
                  borderRadius: "10px",
                  padding: "0.85rem",
                  border: "1px solid #e2e8f0",
                  marginTop: "0.25rem",
                }}>
                  {hasVolunteer ? (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "1.2rem" }}>🚗</span>
                          <div>
                            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.9rem" }}>
                              Volunteer Driver: {claim.volunteer?.name || "Assigned Volunteer Courier"}
                            </div>
                            {claim.volunteer?.phone && (
                              <div style={{ fontSize: "0.8rem" }}>
                                <a href={`tel:${claim.volunteer.phone}`} style={{ color: "#d97706", fontWeight: 700, textDecoration: "none" }}>
                                  📞 Call Courier: {claim.volunteer.phone}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => setExpandedTrackingId(isTracking ? -1 : claim.id)}
                          style={{
                            background: isTracking ? "#0f172a" : "#d97706",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "8px",
                            padding: "6px 12px",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          🗺️ {isTracking ? "Hide Live Map" : "View Live Driver GPS Map"}
                        </button>
                      </div>

                      {/* Render Live Tracking Map */}
                      {isTracking && donation && (
                        <div style={{ marginTop: "0.75rem" }}>
                          <LiveTrackingMap
                            pickup={{
                              lat: donation.pickup_lat,
                              lng: donation.pickup_lng,
                              label: `${donation.food_type} (${donation.donor?.name || "Donor"})`,
                            }}
                            destination={{
                              lat: lat,
                              lng: lng,
                              label: appUser?.org_name || appUser?.name || "NGO Facility",
                            }}
                            volunteer={
                              claim.volunteer_lat && claim.volunteer_lng
                                ? {
                                    lat: claim.volunteer_lat,
                                    lng: claim.volunteer_lng,
                                    name: claim.volunteer?.name,
                                    phone: claim.volunteer?.phone || undefined,
                                    updatedAt: claim.volunteer_updated_at,
                                  }
                                : {
                                    lat: donation.pickup_lat + 0.002,
                                    lng: donation.pickup_lng + 0.002,
                                    name: claim.volunteer?.name,
                                    phone: claim.volunteer?.phone || undefined,
                                  }
                            }
                            status={claim.status}
                            height="320px"
                          />
                        </div>
                      )}
                    </div>
                  ) : claim.needs_volunteer ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="pulse-dot" style={{ background: "#d97706" }} />
                        <span style={{ fontSize: "0.85rem", color: "#92400e", fontWeight: 600 }}>
                          Searching for nearby volunteer couriers...
                        </span>
                      </div>
                      <button
                        onClick={() => handleToggleVolunteerRequest(claim.id, false)}
                        disabled={actionLoadingId === claim.id}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          color: "#64748b",
                          borderRadius: "6px",
                          padding: "4px 10px",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Cancel Request (Pick Up Myself)
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
                        Need help picking up this food?
                      </span>
                      <button
                        onClick={() => handleToggleVolunteerRequest(claim.id, true)}
                        disabled={actionLoadingId === claim.id}
                        style={{
                          background: "#d97706",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "6px",
                          padding: "5px 12px",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        🚗 Request Volunteer Delivery
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
        </div>
      )}
    </div>
  );
}

const statsCardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "14px",
  padding: "1.25rem",
  border: "1px solid #e2e8f0",
  boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
  textAlign: "center",
};

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
