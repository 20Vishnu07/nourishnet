import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
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

export interface DonationMarker {
  id: number;
  food_type: string;
  quantity: number;
  unit: string;
  status: string;
  pickup_lat: number;
  pickup_lng: number;
  expiry_time: string;
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
}

export default function DonationMap({
  center,
  donations,
  onDonationClick,
}: DonationMapProps) {
  const mapCenter: LatLngExpression = [center.lat, center.lng];

  return (
    <div style={{ height: "400px", borderRadius: "8px", overflow: "hidden" }}>
      <MapContainer
        center={mapCenter}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
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
  );
}
