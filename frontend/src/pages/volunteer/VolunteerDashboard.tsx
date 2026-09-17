import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../config/api";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useRealtimeUpdates } from "../../hooks/useRealtimeUpdates";
import { blastPaperConfetti } from "../../utils/confetti";

interface Donation {
  id: number;
  food_type: string;
  quantity: number;
  unit: string;
  status: string;
  pickup_lat: number;
  pickup_lng: number;
  expiry_time: string;
  image_url?: string | null;
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
  delivery_photo?: string | null;
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

  const [currentLat, setCurrentLat] = useState(userLat);
  const [currentLng, setCurrentLng] = useState(userLng);
  const [detectingGps, setDetectingGps] = useState(false);

  useEffect(() => {
    if (userLat && userLng) {
      setCurrentLat(userLat);
      setCurrentLng(userLng);
    }
  }, [userLat, userLng]);

  const [activeTab, setActiveTab] = useState<"overview" | "available" | "my_deliveries">("overview");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [availableClaims, setAvailableClaims] = useState<Claim[]>([]);
  const [donationDetails, setDonationDetails] = useState<Record<number, Donation>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [isSharingLocation, setIsSharingLocation] = useState(true);
  const [deliveryPhotoMap, setDeliveryPhotoMap] = useState<Record<number, string>>({});
  const [simStep, setSimStep] = useState(0);
  const [showMissionCelebration, setShowMissionCelebration] = useState(false);

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

  const handleAutoDetectGps = async () => {
    setDetectingGps(true);
    setError(null);
    try {
      const coords = await requestLocation();
      if (coords) {
        setCurrentLat(coords.lat);
        setCurrentLng(coords.lng);
        setSuccess(
          `🎯 Location auto-detected: ${coords.city || "Current Area"} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
        );
        if (activeDelivery) {
          await postLocation(activeDelivery.id, coords.lat, coords.lng);
          setSuccess(
            `🎯 GPS auto-detected & broadcasted to NGO: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
          );
        }
      }
    } catch {
      setError("Failed to auto-detect location. Please check browser permissions.");
    } finally {
      setDetectingGps(false);
    }
  };

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
      postLocation(claimId, currentLat, currentLng);

      // Colorful blasting papers confetti celebration for accepting delivery mission
      blastPaperConfetti({
        particleCount: 220,
        colors: ["#f59e0b", "#d97706", "#fbbf24", "#10b981", "#3b82f6", "#ef4444", "#ec4899", "#8b5cf6"],
      });
      setShowMissionCelebration(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept delivery");
    }
  };

  const handleVolunteerPhotoSelect = (claimId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
          const compressed = canvas.toDataURL("image/jpeg", 0.78);
          setDeliveryPhotoMap((prev) => ({ ...prev, [claimId]: compressed }));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const updateStatus = async (claimId: number, newStatus: string, deliveryPhoto?: string | null) => {
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/claims/${claimId}/status`, {
        method: "PATCH",
        token,
        body: { status: newStatus, delivery_photo: deliveryPhoto || undefined },
      });
      setSuccess(t("volunteer.claimUpdated", { status: newStatus }));
      setDeliveryPhotoMap((prev) => {
        const copy = { ...prev };
        delete copy[claimId];
        return copy;
      });
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

  const completedClaims = claims.filter((c) => c.status === "delivered");
  const activeMissions = claims.filter((c) => c.status === "claimed" || c.status === "picked_up");
  const primaryActiveMission = activeMissions[0];
  const totalKgTransported = completedClaims.reduce((acc, c) => {
    const d = donationDetails[c.donation_id];
    return acc + (d ? (d.unit === "kg" ? Number(d.quantity) : Number(d.quantity) * 0.5) : 10);
  }, 0);
  const rankTitle = completedClaims.length >= 10 ? "🥇 Gold Champion" : completedClaims.length >= 3 ? "🥈 Silver Guardian" : "🥉 Bronze Courier";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800, color: "#0f172a" }}>
            🚗 {t("volunteer.title")}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
            Pick up surplus food from donors and transport it directly to local shelters in need.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              fontSize: "0.75rem",
              padding: "5px 12px",
              borderRadius: "20px",
              background: isConnected ? "#fffbeb" : isFallbackMode ? "#fef3c7" : "#f1f5f9",
              color: isConnected ? "#b45309" : isFallbackMode ? "#92400e" : "#475569",
              border: `1px solid ${isConnected ? "#fde68a" : isFallbackMode ? "#fde68a" : "#cbd5e1"}`,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {isConnected ? `🟢 Live Network Active` : isFallbackMode ? `🟡 Syncing via Polling` : `⚪ Connecting...`}
          </span>
          <button
            onClick={() => setActiveTab(activeTab === "available" ? "overview" : "available")}
            style={{
              background: activeTab === "available" ? "#f1f5f9" : "#d97706",
              color: activeTab === "available" ? "#0f172a" : "#ffffff",
              border: activeTab === "available" ? "1px solid #cbd5e1" : "none",
              padding: "7px 16px",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              boxShadow: activeTab === "available" ? "none" : "0 2px 6px rgba(217, 119, 6, 0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {activeTab === "available" ? "← Back to Homepage" : "🚗 Available Delivery Missions"}
          </button>
        </div>
      </div>

      {liveNotice && (
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
          <span>{liveNotice}</span>
          <button
            onClick={() => setLiveNotice(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#1e40af", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {showMissionCelebration && (
        <div
          style={{
            background: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)",
            color: "#ffffff",
            padding: "1.25rem 1.5rem",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 8px 25px rgba(217, 119, 6, 0.35)",
            border: "2px solid #fde68a",
            marginBottom: "0.75rem",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{ fontSize: "2.4rem" }}>🎉</span>
            <div>
              <h4 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>
                🎊 Delivery Mission Accepted! You Are A Hero!
              </h4>
              <p style={{ margin: "4px 0 0", fontSize: "0.9rem", opacity: 0.95 }}>
                Follow the live route and step-by-step directions below to pick up the food and deliver it to the shelter.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowMissionCelebration(false)}
            style={{
              background: "rgba(255,255,255,0.25)",
              border: "none",
              color: "#ffffff",
              borderRadius: "8px",
              padding: "7px 14px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.85rem",
            }}
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {error && <div style={styles.error}>⚠️ {error}</div>}
      {success && <div style={styles.success}>{success}</div>}

      {/* 1. VOLUNTEER MILESTONES & STATS CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "1rem",
        }}
      >
        <div style={statsCardStyle}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>🎯</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#d97706" }}>{completedClaims.length}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Missions Completed</div>
        </div>
        <div style={statsCardStyle}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>🚗</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a" }}>{activeMissions.length}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Active Deliveries In Progress</div>
        </div>
        <div style={statsCardStyle}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>📦</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#059669" }}>~{totalKgTransported.toFixed(1)} kg</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Food Rescued & Delivered</div>
        </div>
        <div style={statsCardStyle}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>🏅</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#b45309" }}>{rankTitle}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Courier Status Tier</div>
        </div>
      </div>

      {/* PINNED ACTIVE MISSION COCKPIT */}
      {primaryActiveMission && (
        <div
          style={{
            background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
            border: "2px solid #f59e0b",
            borderRadius: "14px",
            padding: "1.25rem 1.5rem",
            boxShadow: "0 4px 12px rgba(217, 119, 6, 0.12)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="pulse-dot" style={{ background: "#d97706" }} />
              <strong style={{ fontSize: "1.05rem", color: "#92400e" }}>
                🚨 Active Delivery Mission #{primaryActiveMission.id} in Progress
              </strong>
            </div>
            <button
              onClick={() => setActiveTab("my_deliveries")}
              style={{
                background: "#d97706",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Open Mission Cockpit & Complete →
            </button>
          </div>
          <div style={{ fontSize: "0.9rem", color: "#78350f" }}>
            Food: <strong>{donationDetails[primaryActiveMission.donation_id]?.food_type || "Surplus Food"}</strong> ({donationDetails[primaryActiveMission.donation_id]?.quantity || "10"} {donationDetails[primaryActiveMission.donation_id]?.unit || "kg"})
            {" • "}
            Status: <strong>{primaryActiveMission.status === "picked_up" ? "📦 Food Picked Up - Heading to Shelter" : "🚗 Assigned - Head to Donor for Pickup"}</strong>
          </div>
        </div>
      )}

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
          📍 {isAutoDetected ? "Location Auto-Detected" : "Volunteer Location"}: {currentLat.toFixed(4)}, {currentLng.toFixed(4)}
        </span>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleAutoDetectGps}
            disabled={detectingGps}
            style={{
              ...styles.refreshBtn,
              background: detectingGps ? "#94a3b8" : "#d97706",
              color: "#ffffff",
              border: "none",
              fontWeight: 700,
              marginBottom: 0,
              cursor: detectingGps ? "not-allowed" : "pointer",
            }}
          >
            {detectingGps ? "⏳ Detecting..." : "🎯 Auto-Detect / Recalibrate GPS"}
          </button>
          <button onClick={refreshAll} style={{ ...styles.refreshBtn, marginBottom: 0 }} disabled={loading || detectingGps}>
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
        overflowX: "auto",
      }}>
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          style={{
            flex: 1,
            padding: "10px",
            border: "none",
            borderRadius: "8px",
            fontWeight: 700,
            fontSize: "0.88rem",
            cursor: "pointer",
            background: activeTab === "overview" ? "#ffffff" : "transparent",
            color: activeTab === "overview" ? "#d97706" : "#64748b",
            boxShadow: activeTab === "overview" ? "0 2px 4px rgba(0,0,0,0.06)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            whiteSpace: "nowrap",
          }}
        >
          <span>🏠 Overview Homepage</span>
        </button>

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
            whiteSpace: "nowrap",
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
            whiteSpace: "nowrap",
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

      {/* TAB 0: VOLUNTEER OVERVIEW HOMEPAGE */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Welcome Action Hero Banner */}
          <div
            style={{
              background: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
              borderRadius: "16px",
              padding: "2rem",
              color: "#ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1.25rem",
              boxShadow: "0 4px 14px rgba(217, 119, 6, 0.25)",
            }}
          >
            <div style={{ maxWidth: "600px" }}>
              <div style={{ display: "inline-block", background: "rgba(255,255,255,0.2)", padding: "3px 10px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: 700, marginBottom: "8px" }}>
                🚗 Volunteer Courier Command Center
              </div>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.5rem", fontWeight: 800 }}>
                Welcome, {appUser?.name}! ⚡
              </h3>
              <p style={{ margin: 0, fontSize: "0.92rem", opacity: 0.95, lineHeight: 1.5 }}>
                Help rescue surplus food from local restaurants and banquet halls and deliver it to shelters in need. Accept available rescue missions, follow live GPS routes, and make an immediate community impact.
              </p>
            </div>
            <button
              onClick={() => setActiveTab("available")}
              style={{
                background: "#ffffff",
                color: "#b45309",
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
              <span>🚗 Available Delivery Missions</span>
              <span>→</span>
            </button>
          </div>

          {/* Active Mission Cockpit Card */}
          <div style={{ background: "#ffffff", borderRadius: "16px", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                  📍 Active Mission Cockpit & Live Status
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                  Step-by-step progress for deliveries currently assigned to you.
                </p>
              </div>
              {claims.length > 0 && (
                <button
                  onClick={() => setActiveTab("my_deliveries")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#d97706",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  View All Deliveries ({claims.length}) →
                </button>
              )}
            </div>

            {primaryActiveMission ? (
              <div
                style={{
                  background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
                  border: "2px solid #f59e0b",
                  borderRadius: "14px",
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#b45309", background: "#fde68a", padding: "3px 8px", borderRadius: "10px" }}>
                      ⚡ Mission #{primaryActiveMission.id} in Progress
                    </span>
                    <h5 style={{ margin: "6px 0 2px", fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>
                      {donationDetails[primaryActiveMission.donation_id]?.food_type || "Surplus Food Rescue"}
                    </h5>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#475569" }}>
                      Quantity: <strong>{donationDetails[primaryActiveMission.donation_id]?.quantity} {donationDetails[primaryActiveMission.donation_id]?.unit}</strong>
                    </p>
                  </div>

                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      padding: "4px 12px",
                      borderRadius: "12px",
                      background: primaryActiveMission.status === "picked_up" ? "#ecfdf5" : "#eff6ff",
                      color: primaryActiveMission.status === "picked_up" ? "#065f46" : "#1e40af",
                      border: `1px solid ${primaryActiveMission.status === "picked_up" ? "#a7f3d0" : "#bfdbfe"}`,
                    }}
                  >
                    {primaryActiveMission.status === "picked_up" ? "🚗 On Route to Shelter" : "📍 Heading to Donor"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", background: "#ffffff", padding: "1rem", borderRadius: "10px", border: "1px solid #fed7aa" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b" }}>1. PICKUP POINT (Donor)</div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                      {donationDetails[primaryActiveMission.donation_id]?.donor?.name || "Registered Food Donor"}
                    </div>
                    {donationDetails[primaryActiveMission.donation_id]?.donor?.phone && (
                      <a href={`tel:${donationDetails[primaryActiveMission.donation_id]?.donor?.phone}`} style={{ fontSize: "0.8rem", color: "#0284c7", textDecoration: "none", fontWeight: 600 }}>
                        📞 {donationDetails[primaryActiveMission.donation_id]?.donor?.phone}
                      </a>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b" }}>2. DROPOFF POINT (Shelter)</div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                      {primaryActiveMission.ngo?.org_name || primaryActiveMission.ngo?.name || "Local Community Shelter"}
                    </div>
                    {primaryActiveMission.ngo?.phone && (
                      <a href={`tel:${primaryActiveMission.ngo?.phone}`} style={{ fontSize: "0.8rem", color: "#0284c7", textDecoration: "none", fontWeight: 600 }}>
                        📞 {primaryActiveMission.ngo?.phone}
                      </a>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setActiveTab("my_deliveries")}
                    style={{
                      background: "#d97706",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      padding: "8px 16px",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    Open Live Delivery Cockpit & Camera →
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "2.5rem 1rem", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🚗</div>
                <h5 style={{ margin: "0 0 0.25rem", fontSize: "1rem", color: "#334155", fontWeight: 700 }}>No Active Delivery In Progress</h5>
                <p style={{ margin: "0 0 1rem", fontSize: "0.82rem", color: "#64748b" }}>
                  Explore the open missions pool to claim a delivery and bring fresh meals to hungry families.
                </p>
                <button
                  onClick={() => setActiveTab("available")}
                  style={{
                    background: "#d97706",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 18px",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  🚗 View Available Rescue Missions ({availableClaims.length})
                </button>
              </div>
            )}
          </div>

          {/* Courier Safety & Thermal Bag Standards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
            <div style={{ background: "#ffffff", borderRadius: "14px", padding: "1.25rem", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🧊</div>
              <h5 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>
                Temperature Protection
              </h5>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b", lineHeight: 1.5 }}>
                Carry thermal insulated delivery bags or clean containers to keep cooked meals warm or chilled during travel.
              </p>
            </div>

            <div style={{ background: "#ffffff", borderRadius: "14px", padding: "1.25rem", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>⚡</div>
              <h5 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>
                Direct Route Transit
              </h5>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b", lineHeight: 1.5 }}>
                Head straight from the donor to the shelter dropoff within 30-45 minutes to guarantee peak nutrition and taste.
              </p>
            </div>

            <div style={{ background: "#ffffff", borderRadius: "14px", padding: "1.25rem", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>📸</div>
              <h5 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>
                Dropoff Photo Verification
              </h5>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b", lineHeight: 1.5 }}>
                Snap a clear confirmation photo of the food batch handed over at the shelter to complete your mission and earn courier points!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: AVAILABLE DELIVERIES */}
      {activeTab === "available" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <button
              onClick={() => setActiveTab("overview")}
              style={{
                background: "none",
                border: "none",
                color: "#d97706",
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
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Available Surplus Delivery Dispatches</span>
          </div>

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
                        {donation.image_url && (
                          <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#fff", borderRadius: "8px", border: "1px solid #fde68a", display: "flex", alignItems: "center", gap: "10px" }}>
                            <img
                              src={donation.image_url}
                              alt="Packaging condition"
                              style={{
                                width: "70px",
                                height: "52px",
                                objectFit: "cover",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                flexShrink: 0,
                              }}
                            />
                            <div>
                              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#92400e" }}>
                                📸 Packaging Condition
                              </div>
                              <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                                Check package size & form before driving
                              </div>
                            </div>
                          </div>
                        )}
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
                      {donation.image_url && (
                        <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #cbd5e1", display: "flex", alignItems: "center", gap: "10px" }}>
                          <img
                            src={donation.image_url}
                            alt="Packaging condition"
                            style={{
                              width: "70px",
                              height: "52px",
                              objectFit: "cover",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              flexShrink: 0,
                            }}
                          />
                          <div>
                            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155" }}>
                              📸 Visual Package Reference
                            </div>
                            <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                              Verify this package when collecting from donor
                            </div>
                          </div>
                        </div>
                      )}
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

                    {/* OPTIONAL DELIVERY / PICKUP PHOTO UPLOAD */}
                    {nextAction && (
                      <div style={{
                        margin: "0.75rem 0",
                        padding: "0.6rem 0.85rem",
                        background: "#f8fafc",
                        border: "1px dashed #cbd5e1",
                        borderRadius: "8px",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155" }}>
                            📸 {nextAction.next === "picked_up" ? "Pickup Package Photo (Optional)" : "Delivery Confirmation Photo (Optional)"}
                          </span>
                          {deliveryPhotoMap[claim.id] && (
                            <button
                              type="button"
                              onClick={() => setDeliveryPhotoMap((prev) => {
                                const copy = { ...prev };
                                delete copy[claim.id];
                                return copy;
                              })}
                              style={{ background: "none", border: "none", color: "#ef4444", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}
                            >
                              ✕ Remove Photo
                            </button>
                          )}
                        </div>

                        {deliveryPhotoMap[claim.id] ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <img
                              src={deliveryPhotoMap[claim.id]}
                              alt="Attached photo"
                              style={{ width: "65px", height: "48px", objectFit: "cover", borderRadius: "6px", border: "1.5px solid #10b981" }}
                            />
                            <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 600 }}>
                              ✓ Photo attached — will be shared with NGO upon confirming below!
                            </span>
                          </div>
                        ) : (
                          <label style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            cursor: "pointer",
                            fontSize: "0.78rem",
                            color: "#0284c7",
                            fontWeight: 600,
                            padding: "4px 8px",
                            background: "#eff6ff",
                            borderRadius: "6px",
                            border: "1px solid #bfdbfe",
                          }}>
                            <span>📷 Take / Upload Photo</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => handleVolunteerPhotoSelect(claim.id, e)}
                              style={{ display: "none" }}
                            />
                          </label>
                        )}
                      </div>
                    )}

                    {claim.delivery_photo && (
                      <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: "10px" }}>
                        <img
                          src={claim.delivery_photo}
                          alt="Delivery confirmation"
                          style={{ width: "70px", height: "52px", objectFit: "cover", borderRadius: "6px", border: "1px solid #86efac" }}
                        />
                        <div>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#166534" }}>
                            📸 Delivery Confirmation Photo
                          </div>
                          <div style={{ fontSize: "0.74rem", color: "#15803d" }}>
                            Saved and transmitted to NGO & Food Donor
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={styles.cardActions}>
                      {nextAction && (
                        <button
                          onClick={() => updateStatus(claim.id, nextAction.next, deliveryPhotoMap[claim.id])}
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

const statsCardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "14px",
  padding: "1.25rem",
  border: "1px solid #e2e8f0",
  boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
  textAlign: "center",
};
