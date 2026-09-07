import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";

export interface WebSocketMessage {
  type: "NEW_DONATION" | "CLAIM_STATUS_UPDATED" | "VOLUNTEER_LOCATION_UPDATED" | "VOLUNTEER_REQUEST_CREATED";
  donation?: any;
  claim?: any;
  claim_id?: number;
  ngo_id?: number;
  volunteer_id?: number;
  lat?: number;
  lng?: number;
  status?: string;
}

interface UseRealtimeOptions {
  onNewDonation?: (donation: any) => void;
  onClaimStatusUpdated?: (claim: any) => void;
  onVolunteerLocationUpdated?: (data: any) => void;
  onVolunteerRequestCreated?: (claim: any) => void;
  onPollFallback?: () => void;
  pollIntervalMs?: number;
}

export function useRealtimeUpdates({
  onNewDonation,
  onClaimStatusUpdated,
  onVolunteerLocationUpdated,
  onVolunteerRequestCreated,
  onPollFallback,
  pollIntervalMs = 10000,
}: UseRealtimeOptions = {}) {
  const { token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  const startFallbackPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;
    setIsFallbackMode(true);
    console.info("[Realtime] WebSocket unavailable. Activating fallback REST polling.");
    if (onPollFallback) {
      onPollFallback();
      pollingIntervalRef.current = window.setInterval(() => {
        onPollFallback();
      }, pollIntervalMs);
    }
  }, [onPollFallback, pollIntervalMs]);

  const stopFallbackPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsFallbackMode(false);
  }, []);

  const connect = useCallback(() => {
    if (!token) {
      setIsConnected(false);
      return;
    }

    const defaultWsFromApi = import.meta.env.VITE_API_BASE_URL
      ? `${import.meta.env.VITE_API_BASE_URL.replace(/^http/, "ws")}/ws`
      : "wss://nourishnet-yrql.onrender.com/ws";
    const wsBaseUrl = import.meta.env.VITE_WS_URL || defaultWsFromApi;
    const wsUrl = `${wsBaseUrl}?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        stopFallbackPolling();
        console.info("[Realtime] WebSocket connected.");
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          if (data.type === "NEW_DONATION" && onNewDonation && data.donation) {
            onNewDonation(data.donation);
          } else if (data.type === "CLAIM_STATUS_UPDATED" && onClaimStatusUpdated && data.claim) {
            onClaimStatusUpdated(data.claim);
          } else if (data.type === "VOLUNTEER_LOCATION_UPDATED" && onVolunteerLocationUpdated) {
            onVolunteerLocationUpdated(data);
          } else if (data.type === "VOLUNTEER_REQUEST_CREATED" && onVolunteerRequestCreated && data.claim) {
            onVolunteerRequestCreated(data.claim);
          }
        } catch (err) {
          console.warn("[Realtime] Malformed message received:", err);
        }
      };

      ws.onerror = (err) => {
        console.warn("[Realtime] WebSocket error observed:", err);
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        wsRef.current = null;

        // If rejected due to auth (policy violation 1008), do not reconnect
        if (event.code === 1008) {
          console.error("[Realtime] WebSocket connection rejected: unauthorized.");
          startFallbackPolling();
          return;
        }

        // Retry connection with exponential backoff up to 3 times before activating polling
        if (reconnectAttemptsRef.current < 3) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 8000);
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = window.setTimeout(connect, delay);
        } else {
          startFallbackPolling();
        }
      };
    } catch (err) {
      console.warn("[Realtime] Failed to initialize WebSocket:", err);
      startFallbackPolling();
    }
  }, [
    token,
    onNewDonation,
    onClaimStatusUpdated,
    onVolunteerLocationUpdated,
    onVolunteerRequestCreated,
    startFallbackPolling,
    stopFallbackPolling,
  ]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      stopFallbackPolling();
    };
  }, [connect, stopFallbackPolling]);

  return { isConnected, isFallbackMode };
}
