import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
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

export default function LocationPicker({
  position,
  onPositionChange,
}: LocationPickerProps) {
  const center: LatLngExpression = [position.lat, position.lng];

  return (
    <div style={{ height: "300px", borderRadius: "8px", overflow: "hidden" }}>
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[position.lat, position.lng]}>
          <Popup>Pickup location</Popup>
        </Marker>
        <ClickHandler onPositionChange={onPositionChange} />
      </MapContainer>
      <p style={{ fontSize: "0.75rem", color: "#999", marginTop: "4px" }}>
        📍 Click the map to set pickup location ({position.lat.toFixed(4)},{" "}
        {position.lng.toFixed(4)})
      </p>
    </div>
  );
}
