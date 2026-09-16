import { useEffect, useState, useRef, type FormEvent } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import { type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons in react-leaflet (known issue with webpack/vite)
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { reverseGeocodeAddress, searchAddressNominatim } from "../../hooks/useGeolocation";

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
  detecting?: boolean;
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

export default function LocationPicker({
  position,
  onPositionChange,
  onDetectLocation,
  isAutoDetected,
  detecting,
}: LocationPickerProps) {
  const safeLat = typeof position?.lat === "number" && !isNaN(position.lat) ? position.lat : 13.0827;
  const safeLng = typeof position?.lng === "number" && !isNaN(position.lng) ? position.lng : 80.2707;
  const center: LatLngExpression = [safeLat, safeLng];

  // Address search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ lat: number; lng: number; displayName: string }>>([]);
  const [readableAddress, setReadableAddress] = useState<string>("");
  const markerRef = useRef<any>(null);

  // Auto reverse-geocode whenever coordinates change
  useEffect(() => {
    let active = true;
    reverseGeocodeAddress(safeLat, safeLng).then((addr) => {
      if (active && addr) setReadableAddress(addr);
    });
    return () => {
      active = false;
    };
  }, [safeLat, safeLng]);

  const handleSearchSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchAddressNominatim(searchQuery);
      setSearchResults(results);
      if (results.length > 0 && results[0]) {
        const first = results[0];
        onPositionChange(first.lat, first.lng);
        setReadableAddress(first.displayName.split(",").slice(0, 3).join(",").trim());
      }
    } catch {
      // ignore
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (item: { lat: number; lng: number; displayName: string }) => {
    onPositionChange(item.lat, item.lng);
    setReadableAddress(item.displayName.split(",").slice(0, 3).join(",").trim());
    setSearchResults([]);
    setSearchQuery("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Search Bar & Instructions */}
      <div style={{ position: "relative" }}>
        <form
          onSubmit={handleSearchSubmit}
          style={{
            display: "flex",
            gap: "6px",
            alignItems: "center",
          }}
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
              placeholder="Search area, landmark, or street (e.g. Anna Nagar, Indiranagar)..."
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
              background: isSearching ? "#94a3b8" : "#059669",
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
            {isSearching ? "Searching..." : "Find"}
          </button>
        </form>

        {/* Search Results Dropdown */}
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
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0fdf4")}
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

      {/* Map Container */}
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
          <Marker
            ref={markerRef}
            position={[safeLat, safeLng]}
            draggable={true}
            eventHandlers={{
              dragend: () => {
                const marker = markerRef.current;
                if (marker != null) {
                  const newPos = marker.getLatLng();
                  onPositionChange(newPos.lat, newPos.lng);
                }
              },
            }}
          >
            <Popup>
              <strong>Pickup Location</strong>
              <br />
              {readableAddress || `${safeLat.toFixed(4)}, ${safeLng.toFixed(4)}`}
              <br />
              <small style={{ color: "#059669" }}>💡 Drag marker or click map to move</small>
            </Popup>
          </Marker>
          <ClickHandler onPositionChange={onPositionChange} />
          <RecenterMap lat={safeLat} lng={safeLng} />
        </MapContainer>

        {/* Bottom Location Info & GPS Button */}
        <div
          style={{
            position: "absolute",
            bottom: "8px",
            left: "8px",
            right: "8px",
            zIndex: 1000,
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(4px)",
            padding: "8px 12px",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "6px",
            fontSize: "0.8rem",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", maxWidth: "70%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#0f172a", fontWeight: 600 }}>
              <span>📍 {isAutoDetected ? "Detected Area:" : "Selected Location:"}</span>
              <span style={{ color: "#059669", fontWeight: 700 }}>
                {readableAddress || `${safeLat.toFixed(4)}, ${safeLng.toFixed(4)}`}
              </span>
            </div>
            <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
              Coords: ({safeLat.toFixed(4)}, {safeLng.toFixed(4)}) • <em>Click map or drag pin to adjust</em>
            </span>
          </div>

          {onDetectLocation && (
            <button
              type="button"
              onClick={onDetectLocation}
              disabled={detecting}
              style={{
                background: detecting ? "#94a3b8" : "#059669",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "0.75rem",
                fontWeight: 700,
                cursor: detecting ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
              }}
            >
              {detecting ? "⏳ Locating..." : "🎯 Pin Exact GPS"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
