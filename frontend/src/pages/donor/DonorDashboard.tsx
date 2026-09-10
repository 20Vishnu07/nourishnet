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
  const [activeTab, setActiveTab] = useState<"donations" | "create">("donations");
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "claimed" | "delivered">("all");
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
      setActiveTab("donations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create donation");
    } finally {
      setLoading(false);
    }
  };

  const totalKg = myDonations.reduce(
    (acc, d) => acc + (d.unit === "kg" ? Number(d.quantity) : Number(d.quantity) * 0.5),
    0
  );
  const totalMeals = Math.round(totalKg * 2);
  const co2Prevented = (totalKg * 2.5).toFixed(1);
  const availableCount = myDonations.filter((d) => d.status === "available").length;
  const activeCount = myDonations.filter(
    (d) => d.status === "claimed" || d.status === "picked_up"
  ).length;
  const deliveredCount = myDonations.filter((d) => d.status === "delivered").length;

  const filteredDonations = myDonations.filter((d) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "available") return d.status === "available";
    if (statusFilter === "claimed")
      return d.status === "claimed" || d.status === "picked_up";
    if (statusFilter === "delivered") return d.status === "delivered";
    return true;
  });

  const quickCategories = [
    { label: "🍲 Cooked Meals", val: "Cooked Meals" },
    { label: "🍞 Bread & Bakery", val: "Fresh Bakery & Bread" },
    { label: "🥗 Fresh Produce", val: "Fresh Fruits & Vegetables" },
    { label: "📦 Packaged Food", val: "Packaged Dry Groceries" },
    { label: "🥛 Dairy", val: "Milk & Dairy Products" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Top Real-time Network Indicator */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800, color: "#0f172a" }}>
            🍲 {t("donor.title")}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
            Manage your surplus food donations and track pickups by local shelters.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              fontSize: "0.75rem",
              padding: "5px 12px",
              borderRadius: "20px",
              background: isConnected ? "#ecfdf5" : isFallbackMode ? "#fef3c7" : "#f1f5f9",
              color: isConnected ? "#065f46" : isFallbackMode ? "#92400e" : "#475569",
              border: `1px solid ${isConnected ? "#a7f3d0" : isFallbackMode ? "#fde68a" : "#cbd5e1"}`,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {isConnected ? `🟢 Live Network Active` : isFallbackMode ? `🟡 Syncing via Polling` : `⚪ Connecting...`}
          </span>
          <button
            onClick={() => setActiveTab(activeTab === "create" ? "donations" : "create")}
            style={{
              background: activeTab === "create" ? "#f1f5f9" : "#059669",
              color: activeTab === "create" ? "#0f172a" : "#ffffff",
              border: activeTab === "create" ? "1px solid #cbd5e1" : "none",
              padding: "7px 16px",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              boxShadow: activeTab === "create" ? "none" : "0 2px 6px rgba(5, 150, 105, 0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {activeTab === "create" ? "📋 View My Donations" : "➕ Post Surplus Food"}
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

      {error && <div style={styles.error}>⚠️ {error}</div>}
      {success && <div style={styles.success}>✅ {success}</div>}

      {/* 1. IMPACT & OVERVIEW METRICS CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "1rem",
        }}
      >
        <div style={statsCardStyle}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>🍲</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a" }}>{myDonations.length}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Total Donations Posted</div>
        </div>
        <div style={statsCardStyle}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>⚖️</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#059669" }}>{totalKg.toFixed(1)} kg</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Surplus Food Rescued</div>
        </div>
        <div style={statsCardStyle}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>🍽️</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0284c7" }}>~{totalMeals}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Meals Provided</div>
        </div>
        <div style={statsCardStyle}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>🌿</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#16a34a" }}>~{co2Prevented} kg</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>CO₂ Emissions Saved</div>
        </div>
      </div>

      {/* 2. TAB CONTROLS */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "2px solid #e2e8f0",
          paddingBottom: "4px",
        }}
      >
        <button
          onClick={() => setActiveTab("donations")}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "donations" ? "3px solid #059669" : "3px solid transparent",
            padding: "10px 18px",
            fontSize: "0.95rem",
            fontWeight: 700,
            color: activeTab === "donations" ? "#059669" : "#64748b",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease",
          }}
        >
          <span>📋 My Donations & Tracking</span>
          <span
            style={{
              fontSize: "0.75rem",
              background: activeTab === "donations" ? "#ecfdf5" : "#f1f5f9",
              color: activeTab === "donations" ? "#059669" : "#64748b",
              padding: "2px 8px",
              borderRadius: "12px",
            }}
          >
            {myDonations.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("create")}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "create" ? "3px solid #059669" : "3px solid transparent",
            padding: "10px 18px",
            fontSize: "0.95rem",
            fontWeight: 700,
            color: activeTab === "create" ? "#059669" : "#64748b",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease",
          }}
        >
          <span>➕ Post Surplus Food Donation</span>
        </button>
      </div>

      {/* TAB 1: MY DONATIONS & TRACKING */}
      {activeTab === "donations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Sub-filter chips */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#64748b", marginRight: "4px" }}>Filter:</span>
            {[
              { id: "all", label: "All Donations", count: myDonations.length },
              { id: "available", label: "🟢 Available", count: availableCount },
              { id: "claimed", label: "🔵 Claimed / In Transit", count: activeCount },
              { id: "delivered", label: "✅ Delivered", count: deliveredCount },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id as any)}
                style={{
                  background: statusFilter === f.id ? "#059669" : "#ffffff",
                  color: statusFilter === f.id ? "#ffffff" : "#475569",
                  border: `1px solid ${statusFilter === f.id ? "#059669" : "#cbd5e1"}`,
                  borderRadius: "20px",
                  padding: "5px 14px",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>

          {filteredDonations.length === 0 ? (
            <div
              style={{
                background: "#ffffff",
                border: "2px dashed #cbd5e1",
                borderRadius: "16px",
                padding: "3.5rem 1.5rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🍲</div>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem", color: "#0f172a" }}>
                {statusFilter === "all" ? "No donations posted yet" : `No donations matching "${statusFilter}"`}
              </h3>
              <p style={{ margin: "0 auto 1.25rem", color: "#64748b", fontSize: "0.9rem", maxWidth: "420px" }}>
                {statusFilter === "all"
                  ? "Post your surplus cooked meals, bakery goods, or produce to share with local community shelters."
                  : "Try clearing your filter or post a new donation."}
              </p>
              <button
                onClick={() => setActiveTab("create")}
                style={{
                  background: "#059669",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 22px",
                  borderRadius: "10px",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 4px 10px rgba(5, 150, 105, 0.25)",
                }}
              >
                ➕ Post Food Donation Now
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
              {filteredDonations.map((d) => (
                <div
                  key={d.id}
                  style={{
                    background: "#ffffff",
                    borderRadius: "14px",
                    padding: "1.25rem",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "0.85rem",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                      <h4 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                        {d.food_type}
                      </h4>
                      <span style={styles.status(d.status)}>
                        {d.status === "available" ? "🟢 Available" : d.status === "claimed" ? "🔵 Claimed" : d.status === "picked_up" ? "🟡 In Transit" : d.status === "delivered" ? "✅ Delivered" : d.status}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                      <span style={{ fontSize: "1rem", fontWeight: 800, color: "#059669" }}>
                        📦 {d.quantity} {d.unit}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>•</span>
                      <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                        ⏰ Expires: {new Date(d.expiry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(d.expiry_time).toLocaleDateString()})
                      </span>
                    </div>

                    {d.image_url && (
                      <div style={{ marginTop: "0.75rem" }}>
                        <img
                          src={d.image_url}
                          alt={d.food_type}
                          style={{
                            width: "100%",
                            height: "140px",
                            objectFit: "cover",
                            borderRadius: "10px",
                            border: "1px solid #e2e8f0",
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "0.75rem", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "#475569" }}>
                      <span>📍 Pickup: {d.pickup_lat != null ? Number(d.pickup_lat).toFixed(4) : "13.0827"}, {d.pickup_lng != null ? Number(d.pickup_lng).toFixed(4) : "80.2707"}</span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${d.pickup_lat ?? 13.0827},${d.pickup_lng ?? 80.2707}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#059669",
                          textDecoration: "none",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          background: "#ecfdf5",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          border: "1px solid #a7f3d0",
                        }}
                      >
                        🗺️ Maps
                      </a>
                    </div>

                    {d.status === "claimed" && (
                      <div
                        style={{
                          padding: "6px 10px",
                          background: "#eff6ff",
                          borderRadius: "8px",
                          border: "1px solid #bfdbfe",
                          fontSize: "0.8rem",
                          color: "#1e40af",
                          fontWeight: 600,
                        }}
                      >
                        🤝 <strong>Claimed by NGO!</strong> Volunteer dispatch in progress.
                      </div>
                    )}

                    {d.status === "picked_up" && (
                      <div
                        style={{
                          padding: "6px 10px",
                          background: "#fef3c7",
                          borderRadius: "8px",
                          border: "1px solid #fde68a",
                          fontSize: "0.8rem",
                          color: "#92400e",
                          fontWeight: 600,
                        }}
                      >
                        🚗 <strong>In Transit:</strong> Volunteer picked up and is en route to shelter.
                      </div>
                    )}

                    {d.status === "delivered" && (
                      <div
                        style={{
                          padding: "6px 10px",
                          background: "#f0fdf4",
                          borderRadius: "8px",
                          border: "1px solid #bbf7d0",
                          fontSize: "0.8rem",
                          color: "#166534",
                          fontWeight: 600,
                        }}
                      >
                        ✅ <strong>Delivered!</strong> Meals distributed to shelter residents.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: POST SURPLUS FOOD */}
      {activeTab === "create" && (
        <div style={{ background: "#ffffff", borderRadius: "16px", padding: "1.75rem", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem", color: "#0f172a", fontWeight: 800 }}>
            ➕ Post Surplus Food for Redistribution
          </h3>
          <p style={{ margin: "0 0 1.25rem", fontSize: "0.85rem", color: "#64748b" }}>
            Fill in details of your surplus food. It will immediately appear on the live radar for nearby verified shelters to claim.
          </p>

          {prediction && (
            <div
              style={{
                background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)",
                border: "1px solid #a7f3d0",
                borderRadius: "14px",
                padding: "1rem 1.25rem",
                marginBottom: "1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
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
              <p style={{ margin: "2px 0 0", fontSize: "0.9rem", color: "#334155" }}>
                {t("donor.expectedSurplus")}{" "}
                <strong style={{ color: "#059669", fontSize: "1.1rem" }}>
                  ~{prediction.predicted_surplus_kg} kg
                </strong>{" "}
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  ({t("donor.confidence")} {Math.round(prediction.confidence * 100)}%)
                </span>
              </p>
            </div>
          )}

          {/* Quick Categories Selection */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ ...styles.label, marginBottom: "6px" }}>⚡ Quick Select Category:</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {quickCategories.map((c) => (
                <button
                  type="button"
                  key={c.label}
                  onClick={() => setFoodType(c.val)}
                  style={{
                    background: foodType === c.val ? "#ecfdf5" : "#f8fafc",
                    color: foodType === c.val ? "#059669" : "#334155",
                    border: `1px solid ${foodType === c.val ? "#10b981" : "#e2e8f0"}`,
                    borderRadius: "18px",
                    padding: "6px 14px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.row}>
              <div style={styles.field}>
                <label style={styles.label}>{t("donor.foodType")} *</label>
                <input
                  type="text"
                  placeholder={t("donor.foodPlaceholder")}
                  value={foodType}
                  onChange={(e) => setFoodType(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>{t("donor.quantity")} *</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="number"
                    placeholder="10"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    style={{ ...styles.input, flex: 1 }}
                    min="0.1"
                    step="0.1"
                    required
                  />
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    style={{ ...styles.input, width: "105px" }}
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
