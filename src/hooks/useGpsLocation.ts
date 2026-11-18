"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GpsPositionData, GpsStatus } from "@/types/gorgor";
import { formatDD, formatDMS, formatMGRS } from "@/lib/coordinates";

export interface UseGpsResult {
  status: GpsStatus;
  isTracking: boolean;
  position: GpsPositionData | null;
  permissionState: PermissionState | "unknown";
  acquireOnce: () => void;
  startTracking: () => void;
  stopTracking: () => void;
  toggleTracking: () => void;
}

/**
 * Strictly genuine Geolocation API hook.
 * Never returns simulated, hardcoded, or IP-guessed GPS coordinates.
 */
export function useGpsLocation(): UseGpsResult {
  const [status, setStatus] = useState<GpsStatus>("idle");
  const [isTracking, setIsTracking] = useState(false);
  const [position, setPosition] = useState<GpsPositionData | null>(null);
  const [permissionState, setPermissionState] = useState<
    PermissionState | "unknown"
  >("unknown");
  const watchIdRef = useRef<number | null>(null);

  // Observe navigator.permissions if supported
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    let permStatus: PermissionStatus | null = null;
    const handleChange = () => {
      if (!permStatus) return;
      setPermissionState(permStatus.state);
      if (permStatus.state === "denied") {
        setStatus("denied");
        setIsTracking(false);
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      }
    };

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((res) => {
          permStatus = res;
          setPermissionState(res.state);
          if (res.state === "denied") {
            setStatus("denied");
          }
          res.addEventListener("change", handleChange);
        })
        .catch(() => {
          // Permissions API optional
        });
    }

    return () => {
      if (permStatus) {
        permStatus.removeEventListener("change", handleChange);
      }
      if (watchIdRef.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  const handleSuccess = useCallback((pos: GeolocationPosition) => {
    const {
      latitude,
      longitude,
      accuracy,
      altitude,
      altitudeAccuracy,
      heading,
      speed,
    } = pos.coords;

    setPosition({
      lat: latitude,
      lon: longitude,
      accuracy,
      altitude,
      altitudeAccuracy,
      heading: heading !== null && Number.isFinite(heading) ? heading : null,
      speed: speed !== null && Number.isFinite(speed) ? speed : null,
      timestamp: pos.timestamp,
      mgrs: formatMGRS(latitude, longitude, 5),
      dms: formatDMS(latitude, longitude),
      dd: formatDD(latitude, longitude),
    });
    setStatus("active");
    setPermissionState("granted");
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setStatus("insecure_context");
      } else {
        setStatus("denied");
        setPermissionState("denied");
      }
      setIsTracking(false);
      if (watchIdRef.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    } else if (err.code === err.TIMEOUT) {
      setStatus("timeout");
    } else {
      setStatus("position_unavailable");
    }
  }, []);

  const checkSupported = useCallback((): boolean => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      return false;
    }
    if (
      !window.isSecureContext &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      setStatus("insecure_context");
      return false;
    }
    return true;
  }, []);

  const acquireOnce = useCallback(() => {
    if (!checkSupported()) return;
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    });
  }, [checkSupported, handleError, handleSuccess]);

  const startTracking = useCallback(() => {
    if (!checkSupported()) return;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    setStatus("requesting");
    setIsTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 3000,
      }
    );
  }, [checkSupported, handleError, handleSuccess]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setStatus((prev) => (prev === "active" ? "idle" : prev));
  }, []);

  const toggleTracking = useCallback(() => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  }, [isTracking, startTracking, stopTracking]);

  return {
    status,
    isTracking,
    position,
    permissionState,
    acquireOnce,
    startTracking,
    stopTracking,
    toggleTracking,
  };
}
