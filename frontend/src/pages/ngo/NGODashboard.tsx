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
  created_at: string;
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
  volunteer?: {
    id: number;
    name: string;
    phone?: string | null;
  } | null;
}

export default function NGODashboard() {
  const { t } = useTranslation();
  const { appUser, token } = useAuth();
  const { lat, lng, error: geoError, isAutoDetected, requestLocation } = useGeolocation();

  const [donations, setDonations] = useState<Donation[]>([]);
  const [myClaims, setMyClaims] = useState<Claim[]>([]);
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);
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

  const loadNearby = useCallback(async (targetLat?: number, targetLng?: number) => {
    const qLat = typeof targetLat === "number" ? targetLat : radarLat;
    const qLng = typeof targetLng === "number" ? targetLng : radarLng;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<Donation[]>(
        `/donations/nearby?lat=${qLat}&lng=${qLng}&radius_km=${radiusKm}`,
        { token },
      );
      setDonations(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load donations");
    } finally {
      setLoading(false);
    }
  }, [radarLat, radarLng, radiusKm, token]);

  const handleAutoDetectLocation = async () => {
    setDetectingLocation(true);
    setError(null);
    try {
      const coords = await requestLocation();
      if (coords) {
        setRadarLat(coords.lat);
        setRadarLng(coords.lng);
        setLiveNotification(
          `🎯 Radar auto-detected: ${coords.city || "Current Area"} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}) — map updated!`
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

  const onNewDonation = useCallback((newDonation: Donation) => {
    setLiveNotification(`🔔 Real-time: New donation available! "${newDonation.food_type}" (${newDonation.quantity} ${newDonation.unit})`);
    loadNearby();
  }, [loadNearby]);

  const onClaimStatusUpdated = useCallback((updatedClaim: any) => {
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
    pollIntervalMs: 10000,
  });

  useEffect(() => {
    loadNearby();
    loadMyClaims();
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
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

          <span style={{
            fontSize: "0.8rem",
            color: isAutoDetected ? "#059669" : "#475569",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            background: isAutoDetected ? "#ecfdf5" : "#f1f5f9",
            padding: "4px 10px",
            borderRadius: "8px",
            border: isAutoDetected ? "1px solid #a7f3d0" : "1px solid #e2e8f0",
          }}>
            📍 {isAutoDetected ? "Location Auto-Detected" : "Current Radar"}: {radarLat.toFixed(4)}, {radarLng.toFixed(4)}
          </span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleAutoDetectLocation}
            disabled={detectingLocation || loading}
            style={{
              ...styles.refreshBtn,
              background: detectingLocation ? "#94a3b8" : "#0284c7",
              color: "#ffffff",
              border: "none",
              fontWeight: 700,
              cursor: detectingLocation ? "not-allowed" : "pointer",
            }}
          >
            {detectingLocation ? "⏳ Detecting..." : "🎯 Auto-Detect Location"}
          </button>
          <button onClick={() => loadNearby()} style={styles.refreshBtn} disabled={loading || detectingLocation}>
            {loading ? t("common.loading") : `🔄 ${t("common.refresh")}`}
          </button>
        </div>
      </div>

      <DonationMap
        center={{ lat: radarLat, lng: radarLng }}
        donations={donations}
        onDonationClick={(d) => setSelectedDonation(d as Donation)}
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
                <div>
                  <strong>🍲 {d.food_type}</strong>
                  {d.donor && (
                    <span style={{ fontSize: "0.8rem", color: "#64748b", marginLeft: "8px" }}>
                      by {d.donor.name}
                    </span>
                  )}
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

      {/* CLAIMED FOOD LIST SECTION */}
      <h3 style={{ marginTop: "2rem", display: "flex", alignItems: "center", gap: "8px" }}>
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
