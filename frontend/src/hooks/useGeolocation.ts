import { useState, useEffect, useCallback } from "react";

interface LocationState {
  lat: number;
  lng: number;
  city?: string;
  error: string | null;
  loading: boolean;
  isAutoDetected: boolean;
}

export const DEFAULT_LOCATION = { lat: 13.0827, lng: 80.2707, city: "Chennai" }; // Default fallback

export function useGeolocation() {
  const [location, setLocation] = useState<LocationState>({
    ...DEFAULT_LOCATION,
    error: null,
    loading: true,
    isAutoDetected: false,
  });

  // Fallback to IP-based approximate location if GPS is blocked or unavailable
  const fetchIpLocation = useCallback(async () => {
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude) {
          setLocation({
            lat: data.latitude,
            lng: data.longitude,
            city: data.city || data.region || "Your Area",
            error: null,
            loading: false,
            isAutoDetected: true,
          });
          return true;
        }
      }
    } catch {
      // Fallback silently
    }
    return false;
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      fetchIpLocation().then((success) => {
        if (!success) {
          setLocation((prev) => ({
            ...prev,
            error: "Geolocation is not supported by your browser",
            loading: false,
            isAutoDetected: false,
          }));
        }
      });
      return;
    }

    setLocation((prev) => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          error: null,
          loading: false,
          isAutoDetected: true,
        });
      },
      async (err) => {
        // If GPS is denied or unavailable, auto-detect location via IP
        const ipSuccess = await fetchIpLocation();
        if (ipSuccess) return;

        let errorMessage = "Unable to get your location";
        if (err.code === err.PERMISSION_DENIED) {
          errorMessage =
            "Location permission was denied. You can manually pick a location or click 'Detect My Location'.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          errorMessage = "Location unavailable. Using default location.";
        } else if (err.code === err.TIMEOUT) {
          errorMessage = "Location request timed out. Using default location.";
        }
        setLocation({
          ...DEFAULT_LOCATION,
          error: errorMessage,
          loading: false,
          isAutoDetected: false,
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }, [fetchIpLocation]);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return { ...location, requestLocation, DEFAULT_LOCATION };
}
