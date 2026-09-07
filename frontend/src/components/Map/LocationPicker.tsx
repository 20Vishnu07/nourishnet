import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import { type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons in react-leaflet (known issue with webpack/vite)
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface LocationPickerProps {
  position: { lat: number; lng: number };
  onPositionChange: (lat: number, lng: number) => void;
  onDetectLocation?: () => void;
  isAutoDetected?: boolean;
}

function ClickHandler({
  onPositionChange,
}: {
  onPositionChange: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

export default function LocationPicker({
  position,
  onPositionChange,
  onDetectLocation,
  isAutoDetected,
}: LocationPickerProps) {
  const safeLat = typeof position?.lat === "number" && !isNaN(position.lat) ? position.lat : 13.0827;
  const safeLng = typeof position?.lng === "number" && !isNaN(position.lng) ? position.lng : 80.2707;
  const center: LatLngExpression = [safeLat, safeLng];

  return (
    <div style={{ height: "320px", borderRadius: "10px", overflow: "hidden", position: "relative" }}>
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[safeLat, safeLng]}>
          <Popup>Pickup location: {safeLat.toFixed(4)}, {safeLng.toFixed(4)}</Popup>
        </Marker>
        <ClickHandler onPositionChange={onPositionChange} />
        <RecenterMap lat={safeLat} lng={safeLng} />
      </MapContainer>

      {/* Auto Location Banner / Control */}
      <div style={{
        position: "absolute",
        bottom: "8px",
        left: "8px",
        right: "8px",
        zIndex: 1000,
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(4px)",
        padding: "6px 12px",
        borderRadius: "8px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "0.8rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#334155" }}>
          <span>{isAutoDetected ? "📍 Auto-detected GPS:" : "📍 Pickup location:"}</span>
          <strong style={{ color: "#059669" }}>
            {safeLat.toFixed(4)}, {safeLng.toFixed(4)}
          </strong>
        </div>
        {onDetectLocation && (
          <button
            type="button"
            onClick={onDetectLocation}
            style={{
              background: "#059669",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            🎯 Auto-Detect
          </button>
        )}
      </div>
    </div>
  );
}
