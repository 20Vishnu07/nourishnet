import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    // Fix leaflet grey tiles on hidden or resized containers
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      map.setView([lat, lng], map.getZoom());
    }
    return () => clearTimeout(timer);
  }, [lat, lng, map]);
  return null;
}

import { useState, type FormEvent } from "react";
import { searchAddressNominatim } from "../../hooks/useGeolocation";

export interface DonationMarker {
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
    id?: number;
    name: string;
    phone: string;
    role?: string;
  } | null;
}

interface DonationMapProps {
  center: { lat: number; lng: number };
  donations: DonationMarker[];
  onDonationClick?: (donation: DonationMarker) => void;
  onCenterChange?: (lat: number, lng: number) => void;
  onDetectLocation?: () => void;
  detecting?: boolean;
}

export default function DonationMap({
  center,
  donations,
  onDonationClick,
  onCenterChange,
  onDetectLocation,
  detecting,
}: DonationMapProps) {
  const safeLat = typeof center?.lat === "number" && !isNaN(center.lat) ? center.lat : 13.0827;
  const safeLng = typeof center?.lng === "number" && !isNaN(center.lng) ? center.lng : 80.2707;
  const mapCenter: LatLngExpression = [safeLat, safeLng];

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ lat: number; lng: number; displayName: string }>>([]);

  const handleSearchSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || !onCenterChange) return;
    setIsSearching(true);
    try {
      const results = await searchAddressNominatim(searchQuery);
      setSearchResults(results);
      if (results.length > 0 && results[0]) {
        onCenterChange(results[0].lat, results[0].lng);
      }
    } catch {
      // ignore
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (item: { lat: number; lng: number; displayName: string }) => {
    if (onCenterChange) {
      onCenterChange(item.lat, item.lng);
    }
    setSearchResults([]);
    setSearchQuery("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Search & Location Bar */}
      <div style={{ position: "relative" }}>
        <form
          onSubmit={handleSearchSubmit}
          style={{ display: "flex", gap: "6px", alignItems: "center" }}
        >
          <div style={{ position: "relative", flex: 1 }}>
            <span
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "0.9rem",
                color: "#64748b",
              }}
            >
              🔍
            </span>
            <input
              type="text"
              placeholder="Search area or city to center radar (e.g. Adyar, Chennai)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px 8px 32px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "0.85rem",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            style={{
              background: isSearching ? "#94a3b8" : "#0284c7",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "8px 14px",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: isSearching ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {isSearching ? "Searching..." : "Center Radar"}
          </button>
          {onDetectLocation && (
            <button
              type="button"
              onClick={onDetectLocation}
              disabled={detecting}
              style={{
                background: detecting ? "#94a3b8" : "#059669",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "8px 12px",
                fontWeight: 700,
                fontSize: "0.82rem",
                cursor: detecting ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {detecting ? "⏳" : "🎯 My GPS"}
            </button>
          )}
        </form>

        {searchResults.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: "4px",
              background: "#ffffff",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              zIndex: 2000,
              maxHeight: "180px",
              overflowY: "auto",
            }}
          >
            {searchResults.map((item, idx) => (
              <div
                key={idx}
                onClick={() => selectSearchResult(item)}
                style={{
                  padding: "8px 12px",
                  fontSize: "0.82rem",
                  color: "#334155",
                  borderBottom: idx < searchResults.length - 1 ? "1px solid #f1f5f9" : "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0f9ff")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ffffff")}
              >
                <span>📍</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.displayName}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ height: "400px", borderRadius: "8px", overflow: "hidden", position: "relative" }}>
        <MapContainer
          center={mapCenter}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RecenterMap lat={safeLat} lng={safeLng} />
        {donations.length === 0 && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 1000,
              background: "rgba(255,255,255,0.9)",
              padding: "1rem 2rem",
              borderRadius: "8px",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <p style={{ margin: 0, color: "#666" }}>
              No donations available in this area
            </p>
          </div>
        )}
        {donations.map((d) => (
          <Marker
            key={d.id}
            position={[d.pickup_lat, d.pickup_lng]}
            eventHandlers={{
              click: () => onDonationClick?.(d),
            }}
          >
            <Popup>
              <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
                <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{d.food_type}</strong>
                {d.image_url && (
                  <div style={{ margin: "6px 0" }}>
                    <img
                      src={d.image_url}
                      alt="Packaging"
                      style={{
                        width: "100%",
                        maxHeight: "90px",
                        objectFit: "cover",
                        borderRadius: "6px",
                        display: "block",
                      }}
                    />
                  </div>
                )}
                <br />
                <span style={{ color: "#0284c7", fontWeight: 700 }}>
                  {d.quantity} {d.unit}
                </span>
                <br />
                <strong>Status:</strong>{" "}
                <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{d.status}</span>
                <br />
                {d.donor && (
                  <>
                    <strong>Donor:</strong> {d.donor.name} ({d.donor.phone})
                    <br />
                  </>
                )}
                <strong>Location:</strong> {d.pickup_lat.toFixed(4)}, {d.pickup_lng.toFixed(4)}
                <br />
                <small style={{ color: "#64748b" }}>
                  Expires: {new Date(d.expiry_time).toLocaleString()}
                </small>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  </div>
  );
}
