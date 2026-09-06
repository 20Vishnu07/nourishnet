import { useState, useEffect, useCallback } from "react";

interface LocationState {
  lat: number;
  lng: number;
  error: string | null;
  loading: boolean;
}

const DEFAULT_LOCATION = { lat: 13.0827, lng: 80.2707 }; // Chennai

export function useGeolocation() {
  const [location, setLocation] = useState<LocationState>({
    ...DEFAULT_LOCATION,
    error: null,
    loading: true,
  });

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation((prev) => ({
        ...prev,
        error: "Geolocation is not supported by your browser",
        loading: false,
      }));
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
        });
      },
      (err) => {
        let errorMessage = "Unable to get your location";
        if (err.code === err.PERMISSION_DENIED) {
          errorMessage =
            "Location permission denied. You can manually set your location on the map.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          errorMessage = "Location unavailable. Using default location.";
        } else if (err.code === err.TIMEOUT) {
          errorMessage = "Location request timed out. Using default location.";
        }
        setLocation({
          ...DEFAULT_LOCATION,
          error: errorMessage,
          loading: false,
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return { ...location, requestLocation, DEFAULT_LOCATION };
}
