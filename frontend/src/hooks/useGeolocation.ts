import { useState, useEffect, useCallback } from "react";

export interface LocationCoords {
  lat: number;
  lng: number;
  city?: string;
  source?: "gps" | "ip" | "default";
}

interface LocationState extends LocationCoords {
  error: string | null;
  loading: boolean;
  isAutoDetected: boolean;
}

export const DEFAULT_LOCATION: LocationCoords = {
  lat: 13.0827,
  lng: 80.2707,
  city: "Chennai",
  source: "default",
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

export function useGeolocation() {
  const [location, setLocation] = useState<LocationState>({
    ...DEFAULT_LOCATION,
    error: null,
    loading: true,
    isAutoDetected: false,
  });

  const requestLocation = useCallback(async (): Promise<LocationCoords> => {
    setLocation((prev) => ({ ...prev, loading: true, error: null }));

    // Step 1: Try HTML5 Browser GPS (3.5s timeout, standard accuracy for immediate network/wifi lock)
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      try {
        const gpsCoords = await new Promise<LocationCoords | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                city: "GPS Location",
                source: "gps",
              });
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
          );
        });

        if (gpsCoords) {
          setLocation({
            ...gpsCoords,
            error: null,
            loading: false,
            isAutoDetected: true,
          });
          return gpsCoords;
        }
      } catch {
        // Fall through to IP geolocation
      }
    }

    // Step 2: If GPS is unavailable, denied, or timed out, query high-reliability IP geolocation
    const ipCoords = await queryIpLocation();
    if (ipCoords) {
      setLocation({
        ...ipCoords,
        error: null,
        loading: false,
        isAutoDetected: true,
      });
      return ipCoords;
    }

    // Step 3: Default fallback
    const fallback: LocationCoords = { ...DEFAULT_LOCATION };
    setLocation({
      ...fallback,
      error: "Location auto-detection unavailable. Using default location.",
      loading: false,
      isAutoDetected: false,
    });
    return fallback;
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return { ...location, requestLocation, DEFAULT_LOCATION };
}
