import { useState, useEffect, useCallback } from "react";

export interface LocationCoords {
  lat: number;
  lng: number;
  city?: string;
  source?: "gps" | "ip" | "default";
  accuracy?: number;
}

interface LocationState extends LocationCoords {
  error: string | null;
  loading: boolean;
  isAutoDetected: boolean;
  isGpsPrecise: boolean;
}

export const DEFAULT_LOCATION: LocationCoords = {
  lat: 13.0827,
  lng: 80.2707,
  city: "Chennai",
  source: "default",
  accuracy: 100,
};

import { apiFetch } from "../config/api";

// Fast, resilient IP Geolocation with backend proxy + multiple fallback providers
async function queryIpLocation(): Promise<LocationCoords | null> {
  // Provider 1: NourishNet Backend IP proxy (Bypasses all client adblockers and CORS restrictions)
  try {
    const data = await apiFetch<LocationCoords>("/auth/detect-location");
    if (data && typeof data.lat === "number" && typeof data.lng === "number") {
      return {
        lat: data.lat,
        lng: data.lng,
        city: data.city || "Current Area",
        source: "ip",
      };
    }
  } catch {
    // fallback to direct providers
  }

  // Provider 2: ipwho.is (fast, HTTPS, CORS, no key)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch("https://ipwho.is/", { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.latitude === "number" && typeof data.longitude === "number") {
        return {
          lat: data.latitude,
          lng: data.longitude,
          city: data.city || data.region || "Your City",
          source: "ip",
        };
      }
    }
  } catch {
    // try next provider
  }

  // Provider 3: freeipapi.com (fast, HTTPS, CORS, no key)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch("https://freeipapi.com/api/json", { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.latitude === "number" && typeof data.longitude === "number") {
        return {
          lat: data.latitude,
          lng: data.longitude,
          city: data.cityName || "Your City",
          source: "ip",
        };
      }
    }
  } catch {
    // try next provider
  }

  // Provider 4: bigdatacloud reverse-geocode client
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client", { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.latitude === "number" && typeof data.longitude === "number") {
        return {
          lat: data.latitude,
          lng: data.longitude,
          city: data.city || data.locality || "Your City",
          source: "ip",
        };
      }
    }
  } catch {
    // all providers failed
  }

  return null;
}

// Fast reverse geocoding to human-readable address
export async function reverseGeocodeAddress(lat: number, lng: number): Promise<string> {
  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
    return "";
  }
  // Try BigDataCloud first (fast, CORS-friendly)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const parts = [data.locality || data.city, data.principalSubdivision, data.countryName].filter(Boolean);
      if (parts.length > 0) return parts.join(", ");
    }
  } catch {
    // fallback
  }

  // Fallback to OpenStreetMap Nominatim
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { signal: controller.signal, headers: { "Accept-Language": "en" } }
    );
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data.display_name) {
        // Return first 3 comma separated parts for concise readability
        return data.display_name.split(",").slice(0, 3).join(",").trim();
      }
    }
  } catch {
    // fallback
  }

  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// Forward address search using OpenStreetMap Nominatim
interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
}

export async function searchAddressNominatim(
  query: string
): Promise<Array<{ lat: number; lng: number; displayName: string }>> {
  const clean = query.trim();
  if (!clean || clean.length < 2) return [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(clean)}&limit=5&addressdetails=1`,
      { signal: controller.signal, headers: { "Accept-Language": "en" } }
    );
    clearTimeout(timeoutId);
    if (res.ok) {
      const items = (await res.json()) as NominatimItem[];
      return items.map((item: NominatimItem) => ({
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        displayName: item.display_name,
      }));
    }
  } catch {
    // return empty on network/timeout
  }
  return [];
}

export function useGeolocation() {
  const [location, setLocation] = useState<LocationState>({
    ...DEFAULT_LOCATION,
    error: null,
    loading: true,
    isAutoDetected: false,
    isGpsPrecise: false,
  });

  const requestLocation = useCallback(async (): Promise<LocationCoords> => {
    setLocation((prev) => ({ ...prev, loading: true, error: null }));

    // Step 1: Try HTML5 Browser GPS (High accuracy, 12s timeout)
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      try {
        const gpsCoords = await new Promise<LocationCoords | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              const detectedLat = pos.coords.latitude;
              const detectedLng = pos.coords.longitude;
              const accuracy = pos.coords.accuracy;
              let humanCity = "Exact GPS Location";
              try {
                const addr = await reverseGeocodeAddress(detectedLat, detectedLng);
                if (addr) humanCity = addr;
              } catch {
                /* ignore reverse geocode error */
              }

              resolve({
                lat: detectedLat,
                lng: detectedLng,
                city: humanCity,
                source: "gps",
                accuracy,
              });
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
          );
        });

        if (gpsCoords) {
          const isPrecise = (gpsCoords.accuracy || 999) <= 100;
          setLocation({
            ...gpsCoords,
            error: null,
            loading: false,
            isAutoDetected: true,
            isGpsPrecise: isPrecise,
          });
          return gpsCoords;
        }
      } catch {
        // Fall through to IP geolocation
      }
    }

    // Step 2: If GPS is unavailable or timed out, query high-reliability IP geolocation
    const ipCoords = await queryIpLocation();
    if (ipCoords) {
      let readableName = ipCoords.city;
      try {
        const addr = await reverseGeocodeAddress(ipCoords.lat, ipCoords.lng);
        if (addr) readableName = addr;
      } catch {
        /* ignore reverse geocode error */
      }

      const resolvedCoords = { ...ipCoords, city: readableName, accuracy: 2500 };
      setLocation({
        ...resolvedCoords,
        error: null,
        loading: false,
        isAutoDetected: true,
        isGpsPrecise: false,
      });
      return resolvedCoords;
    }

    // Step 3: Default fallback
    const fallback: LocationCoords = { ...DEFAULT_LOCATION };
    setLocation({
      ...fallback,
      error: "Location auto-detection unavailable. You can search or select on the map.",
      loading: false,
      isAutoDetected: false,
      isGpsPrecise: false,
    });
    return fallback;
  }, []);

  // Continuous high-precision GPS watcher for mobile & active device movement
  useEffect(() => {
    requestLocation();

    let watchId: number | null = null;
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      try {
        watchId = navigator.geolocation.watchPosition(
          async (pos) => {
            const detectedLat = pos.coords.latitude;
            const detectedLng = pos.coords.longitude;
            const acc = pos.coords.accuracy;

            // Only override if accuracy is good (<= 150m) or previous source wasn't precise GPS
            setLocation((prev) => {
              if (prev.source === "gps" && (prev.accuracy || 999) < acc && acc > 50) {
                return prev;
              }
              return {
                ...prev,
                lat: detectedLat,
                lng: detectedLng,
                accuracy: acc,
                source: "gps",
                isAutoDetected: true,
                isGpsPrecise: acc <= 100,
                loading: false,
                error: null,
              };
            });
          },
          () => {
            /* ignore watch error */
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      } catch {
        /* ignore watchPosition error */
      }
    }

    return () => {
      if (watchId !== null && typeof window !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [requestLocation]);

  return {
    ...location,
    requestLocation,
    refreshExactGps: requestLocation,
    DEFAULT_LOCATION,
  };
}

