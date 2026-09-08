import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import type { LatLngExpression, LatLngBoundsExpression } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Configure default icons
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Custom DivIcons for visual distinction
const donorIcon = L.divIcon({
  className: "custom-map-marker",
  html: `<div style="
    background: #10b981;
    color: white;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 19px;
    box-shadow: 0 4px 10px rgba(16, 185, 129, 0.4);
    border: 2.5px solid #ffffff;
  ">🍲</div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -20],
});

const ngoIcon = L.divIcon({
  className: "custom-map-marker",
  html: `<div style="
    background: #0284c7;
    color: white;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 19px;
    box-shadow: 0 4px 10px rgba(2, 132, 199, 0.4);
    border: 2.5px solid #ffffff;
  ">🏢</div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -20],
});

const volunteerIcon = L.divIcon({
  className: "custom-map-marker-volunteer",
  html: `<div style="
    position: relative;
    width: 44px;
    height: 44px;
  ">
    <div class="pulse-ring" style="
      position: absolute;
      top: -6px;
      left: -6px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(245, 158, 11, 0.35);
      animation: pulseRadar 1.8s infinite ease-out;
    "></div>
    <div style="
      position: relative;
      background: #d97706;
      color: white;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      box-shadow: 0 4px 12px rgba(217, 119, 6, 0.5);
      border: 3px solid #ffffff;
    ">🚗</div>
  </div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  popupAnchor: [0, -24],
});

export interface LiveTrackingMapProps {
  pickup: { lat: number; lng: number; label?: string };
  destination?: { lat: number; lng: number; label?: string } | null;
  volunteer?: {
    lat: number;
    lng: number;
    name?: string;
    phone?: string;
    updatedAt?: string | null;
  } | null;
  status: string;
  height?: string;
}

function BoundsFitter({
  points,
}: {
  points: { lat: number; lng: number }[];
}) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    if (points.length === 0) return () => clearTimeout(timer);
    if (points.length === 1 && points[0] && !isNaN(points[0].lat) && !isNaN(points[0].lng)) {
      map.setView([points[0].lat, points[0].lng], 14);
      return () => clearTimeout(timer);
    }
    const validPoints = points.filter((p) => p && !isNaN(p.lat) && !isNaN(p.lng));
    if (validPoints.length > 0) {
      const bounds: LatLngBoundsExpression = validPoints.map((p) => [p.lat, p.lng]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
    return () => clearTimeout(timer);
  }, [map, points]);

  return null;
}

export default function LiveTrackingMap({
  pickup,
  destination,
  volunteer,
  status,
  height = "380px",
}: LiveTrackingMapProps) {
  // Collect all points to fit
  const activePoints = useMemo(() => {
    const pts = [{ lat: pickup.lat, lng: pickup.lng }];
    if (destination && destination.lat && destination.lng) {
      pts.push({ lat: destination.lat, lng: destination.lng });
    }
    if (volunteer && volunteer.lat && volunteer.lng) {
      pts.push({ lat: volunteer.lat, lng: volunteer.lng });
    }
    return pts;
  }, [pickup, destination, volunteer]);

  const defaultCenter: LatLngExpression = volunteer
    ? [volunteer.lat, volunteer.lng]
    : [pickup.lat, pickup.lng];

  return (
    <div
      style={{
        height,
        borderRadius: "14px",
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
        border: "1px solid #e2e8f0",
      }}
    >
      <style>{`
        @keyframes pulseRadar {
          0% { transform: scale(0.85); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 1. Donor Pickup Marker */}
        <Marker position={[pickup.lat, pickup.lng]} icon={donorIcon}>
          <Popup>
            <div style={{ fontSize: "0.85rem", lineHeight: 1.4 }}>
              <strong style={{ color: "#059669" }}>🍲 Pickup Location</strong>
              <br />
              <span>{pickup.label || "Donor establishment"}</span>
              <br />
              <small style={{ color: "#64748b" }}>
                {pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)}
              </small>
            </div>
          </Popup>
        </Marker>

        {/* 2. Destination NGO Marker */}
        {destination && destination.lat && destination.lng && (
          <Marker position={[destination.lat, destination.lng]} icon={ngoIcon}>
            <Popup>
              <div style={{ fontSize: "0.85rem", lineHeight: 1.4 }}>
                <strong style={{ color: "#0284c7" }}>🏢 Delivery Destination</strong>
                <br />
                <span>{destination.label || "NGO Facility / Shelter"}</span>
                <br />
                <small style={{ color: "#64748b" }}>
                  {destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}
                </small>
              </div>
            </Popup>
          </Marker>
        )}

        {/* 3. Live Volunteer Vehicle Marker */}
        {volunteer && volunteer.lat && volunteer.lng && (
          <Marker position={[volunteer.lat, volunteer.lng]} icon={volunteerIcon}>
            <Popup>
              <div style={{ fontSize: "0.85rem", lineHeight: 1.4 }}>
                <strong style={{ color: "#d97706" }}>🚗 Volunteer Courier (Live)</strong>
                <br />
                {volunteer.name && <span>Driver: {volunteer.name}</span>}
                {volunteer.phone && (
                  <div>
                    <a
                      href={`tel:${volunteer.phone}`}
                      style={{ color: "#0284c7", fontWeight: 600, textDecoration: "none" }}
                    >
                      📞 {volunteer.phone}
                    </a>
                  </div>
                )}
                <small style={{ color: "#64748b" }}>
                  GPS: {volunteer.lat.toFixed(4)}, {volunteer.lng.toFixed(4)}
                </small>
              </div>
            </Popup>
          </Marker>
        )}

        <BoundsFitter points={activePoints} />
      </MapContainer>

      {/* Top Floating Status Indicator */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          right: "10px",
          zIndex: 1000,
          background: "rgba(255, 255, 255, 0.94)",
          backdropFilter: "blur(6px)",
          borderRadius: "10px",
          padding: "8px 14px",
          boxShadow: "0 3px 10px rgba(0,0,0,0.12)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          fontSize: "0.8rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {volunteer ? (
            <>
              <span className="pulse-dot" style={{ background: "#d97706" }} />
              <strong style={{ color: "#92400e" }}>
                Live Tracking: {volunteer.name ? volunteer.name : "Volunteer Courier"}
              </strong>
            </>
          ) : (
            <>
              <span className="pulse-dot" style={{ background: "#0284c7" }} />
              <strong style={{ color: "#0369a1" }}>Waiting for volunteer driver</strong>
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "12px",
              fontSize: "0.72rem",
              fontWeight: 700,
              textTransform: "uppercase",
              background:
                status === "delivered"
                  ? "#d1fae5"
                  : status === "picked_up"
                  ? "#ede9fe"
                  : "#fef3c7",
              color:
                status === "delivered"
                  ? "#065f46"
                  : status === "picked_up"
                  ? "#5b21b6"
                  : "#92400e",
            }}
          >
            {status.replace("_", " ")}
          </span>

          {volunteer?.lat && (
            <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
              GPS: {volunteer.lat.toFixed(3)}, {volunteer.lng.toFixed(3)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

