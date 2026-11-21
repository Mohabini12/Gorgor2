"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AppTab,
  CommsView,
  CoordFormat,
  CurrentUser,
  DirectThread,
  Language,
  MapFocusTarget,
  MbtilesArchiveMeta,
  OfflineRegionRecord,
  OfflineTileSource,
  PendingCoordShare,
  TacticalGroup,
  TacticalWaypoint,
} from "@/types/gorgor";
import { setToken, clearToken } from "@/lib/api";
import { translations, type TranslationDict } from "@/i18n/translations";
import { useGpsLocation, type UseGpsResult } from "@/hooks/useGpsLocation";
import type { BrandingState, EmblemVariant } from "@/lib/emblem";
import {
  getStorageBreakdown,
  listMbtilesArchives,
  listOfflineRegions,
  type StorageBreakdown,
} from "@/lib/offlineStorage";

interface AppContextValue {
  user: CurrentUser | null;
  authLoading: boolean;
  setUser: React.Dispatch<React.SetStateAction<CurrentUser | null>>;
  signOut: (allSessions?: boolean) => Promise<void>;
  updateAccount: (
    patch: Record<string, unknown>
  ) => Promise<{ ok: boolean; error?: string }>;

  lang: Language;
  setLang: (next: Language) => void;
  t: TranslationDict;

  coordFormat: CoordFormat;
  setCoordFormat: (fmt: CoordFormat) => void;

  isOnline: boolean;
  swReady: boolean;

  branding: BrandingState | null;
  refreshBranding: () => Promise<void>;
  updateBranding: (patch: {
    appName?: string;
    subtitleEn?: string;
    subtitleSo?: string;
    variant?: EmblemVariant;
    ringText?: string;
    gold?: string;
    goldDeep?: string;
    red?: string;
    redDeep?: string;
    ink?: string;
    ringInk?: string;
    plate?: string;
  }) => Promise<{ ok: boolean; error?: string }>;

  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;

  commsView: CommsView;
  setCommsView: (view: CommsView) => void;
  activeGroupId: string | null;
  setActiveGroupId: (id: string | null) => void;
  activePeerId: string | null;
  setActivePeerId: (id: string | null) => void;
  openGroupChat: (groupId: string) => void;
  openPrivateChat: (peerId: string) => void;

  gps: UseGpsResult;
  syncGpsToSquad: () => Promise<{ ok: boolean; error?: string }>;

  groups: TacticalGroup[];
  refreshGroups: () => Promise<void>;
  threads: DirectThread[];
  unreadCount: number;
  refreshThreads: () => Promise<void>;
  waypoints: TacticalWaypoint[];
  refreshWaypoints: () => Promise<void>;

  offlineRegions: OfflineRegionRecord[];
  mbtilesArchives: MbtilesArchiveMeta[];
  storageStats: StorageBreakdown | null;
  refreshOfflineData: () => Promise<void>;

  mapFocus: MapFocusTarget | null;
  clearMapFocus: () => void;
  jumpToMap: (target: Omit<MapFocusTarget, "timestamp">) => void;

  lastMapViewport: {
    bounds: [number, number, number, number];
    center: [number, number];
    zoom: number;
  };
  setLastMapViewport: (v: {
    bounds: [number, number, number, number];
    center: [number, number];
    zoom: number;
  }) => void;
  pendingOfflineBounds: [number, number, number, number] | null;
  setPendingOfflineBounds: (b: [number, number, number, number] | null) => void;
  pendingOfflineSource: OfflineTileSource | null;
  setPendingOfflineSource: (s: OfflineTileSource | null) => void;
  sendViewportToOffline: (
    bounds: [number, number, number, number],
    source?: OfflineTileSource
  ) => void;

  activeMbtilesId: string | null;
  setActiveMbtilesId: (id: string | null) => void;
  showOfflineTilesOverlay: boolean;
  setShowOfflineTilesOverlay: (show: boolean) => void;

  pendingCoordShare: PendingCoordShare | null;
  setPendingCoordShare: (pin: PendingCoordShare | null) => void;
  shareCoordToComms: (pin: PendingCoordShare) => void;

  toast: string | null;
  showToast: (msg: string) => void;
  copyText: (text: string, customMsg?: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

// Default initial viewport centered on Mogadishu / Sector 38N NM (map view only — NOT GPS)
const INITIAL_VIEWPORT = {
  bounds: [45.265, 1.995, 45.385, 2.085] as [number, number, number, number],
  center: [45.325, 2.037] as [number, number],
  zoom: 12,
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [lang, setLangState] = useState<Language>("en");
  const [coordFormat, setCoordFormatState] = useState<CoordFormat>("MGRS");
  const [isOnline, setIsOnline] = useState(true);
  const [swReady, setSwReady] = useState(false);
  const [branding, setBranding] = useState<BrandingState | null>(null);

  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [commsView, setCommsView] = useState<CommsView>("groups");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activePeerId, setActivePeerId] = useState<string | null>(null);

  const [groups, setGroups] = useState<TacticalGroup[]>([]);
  const [threads, setThreads] = useState<DirectThread[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [waypoints, setWaypoints] = useState<TacticalWaypoint[]>([]);

  const [offlineRegions, setOfflineRegions] = useState<OfflineRegionRecord[]>(
    []
  );
  const [mbtilesArchives, setMbtilesArchives] = useState<MbtilesArchiveMeta[]>(
    []
  );
  const [storageStats, setStorageStats] = useState<StorageBreakdown | null>(
    null
  );

  const [mapFocus, setMapFocus] = useState<MapFocusTarget | null>(null);
  const [lastMapViewport, setLastMapViewport] = useState(INITIAL_VIEWPORT);
  const [pendingOfflineBounds, setPendingOfflineBounds] = useState<
    [number, number, number, number] | null
  >(null);
  const [pendingOfflineSource, setPendingOfflineSource] =
    useState<OfflineTileSource | null>(null);

  const [activeMbtilesId, setActiveMbtilesId] = useState<string | null>(null);
  const [showOfflineTilesOverlay, setShowOfflineTilesOverlay] = useState(true);
  const [pendingCoordShare, setPendingCoordShare] =
    useState<PendingCoordShare | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gps = useGpsLocation();

  // Load backend-managed branding / emblem configuration
  const refreshBranding = useCallback(async () => {
    try {
      const res = await fetch("/api/branding", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data?.appName) setBranding(data as BrandingState);
      }
    } catch {
      // keep defaults when offline
    }
  }, []);

  useEffect(() => {
    refreshBranding();
  }, [refreshBranding]);

  const updateBranding = useCallback(
    async (patch: Record<string, unknown>): Promise<{
      ok: boolean;
      error?: string;
    }> => {
      try {
        const res = await fetch("/api/branding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.error || "Update failed." };
        }
        if (data.branding) setBranding(data.branding);
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error saving branding." };
      }
    },
    []
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 2800);
  }, []);

  // Online/offline listeners + Service Worker registration
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const savedLang = window.localStorage.getItem("gorgor_lang");
    if (savedLang === "en" || savedLang === "so") {
      setLangState(savedLang);
      document.documentElement.lang = savedLang;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => setSwReady(true))
        .catch(() => setSwReady(false));
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Load authenticated user session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.user) {
            setToken(data.token);
            setUser(data.user);
            const savedLang = window.localStorage.getItem("gorgor_lang");
            if (!savedLang && (data.user.preferredLanguage === "en" || data.user.preferredLanguage === "so")) {
              setLangState(data.user.preferredLanguage);
              document.documentElement.lang = data.user.preferredLanguage;
            }
            setCoordFormatState(data.user.preferredCoordFormat || "MGRS");
          }
        }
      } catch {
        // Offline startup ok
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshGroups = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/groups", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const list: TacticalGroup[] = data.groups ?? [];
        setGroups(list);
        setActiveGroupId((prev) =>
          prev && list.some((g) => g.id === prev) ? prev : list[0]?.id ?? null
        );
      }
    } catch {
      // keep cached state if offline
    }
  }, [user]);

  const refreshThreads = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
        setUnreadCount(data.totalUnread ?? 0);
      }
    } catch {
      // keep cached state if offline
    }
  }, [user]);

  const refreshWaypoints = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/waypoints", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setWaypoints(data.waypoints ?? []);
      }
    } catch {
      // keep cached state if offline
    }
  }, [user]);

  const refreshOfflineData = useCallback(async () => {
    try {
      const [regs, mbts, stats] = await Promise.all([
        listOfflineRegions(),
        listMbtilesArchives(),
        getStorageBreakdown(),
      ]);
      setOfflineRegions(regs);
      setMbtilesArchives(mbts);
      setStorageStats(stats);
    } catch {
      // ignore on SSR
    }
  }, []);

  useEffect(() => {
    refreshOfflineData();
  }, [refreshOfflineData]);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setThreads([]);
      setUnreadCount(0);
      setWaypoints([]);
      return;
    }
    refreshGroups();
    refreshThreads();
    refreshWaypoints();

    // Poll unread DM counts every 8s while online
    const interval = setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") {
        refreshThreads();
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [user, refreshGroups, refreshThreads, refreshWaypoints]);

  const updateAccount = useCallback(
    async (
      patch: Record<string, unknown>
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/users/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.error || "Update failed." };
        }
        if (data.user) {
          setUser(data.user);
          if (data.user.preferredCoordFormat) {
            setCoordFormatState(data.user.preferredCoordFormat);
          }
        }
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error while saving settings." };
      }
    },
    []
  );

  const setLang = useCallback(
    (next: Language) => {
      setLangState(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("gorgor_lang", next);
        document.documentElement.lang = next;
      }
      if (user) {
        fetch("/api/users/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferredLanguage: next }),
        }).catch(() => undefined);
      }
    },
    [user]
  );

  const setCoordFormat = useCallback(
    (fmt: CoordFormat) => {
      setCoordFormatState(fmt);
      if (user) {
        updateAccount({ preferredCoordFormat: fmt });
      }
    },
    [user, updateAccount]
  );

  const signOut = useCallback(
    async (allSessions = false) => {
      gps.stopTracking();
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: allSessions }),
        });
      } catch {
        // ignore
      }
      clearToken();
      setUser(null);
      setActiveTab("home");
    },
    [gps]
  );

  const syncGpsToSquad = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (!gps.position) {
      return { ok: false, error: "Acquire live GPS fix first." };
    }
    try {
      const res = await fetch("/api/users/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: gps.position.lat,
          lon: gps.position.lon,
          accuracy: gps.position.accuracy,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || "Location sync failed." };
      }
      if (data.user) setUser(data.user);
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error syncing location." };
    }
  }, [gps.position]);

  const jumpToMap = useCallback((target: Omit<MapFocusTarget, "timestamp">) => {
    if (target.activateMbtilesId) {
      setActiveMbtilesId(target.activateMbtilesId);
    }
    if (target.activateOfflineRegionId) {
      setShowOfflineTilesOverlay(true);
    }
    setMapFocus({ ...target, timestamp: Date.now() });
    setActiveTab("map");
  }, []);

  const clearMapFocus = useCallback(() => setMapFocus(null), []);

  const openGroupChat = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    setCommsView("group_chat");
    setActiveTab("comms");
  }, []);

  const openPrivateChat = useCallback((peerId: string) => {
    setActivePeerId(peerId);
    setCommsView("private");
    setActiveTab("comms");
  }, []);

  const shareCoordToComms = useCallback(
    (pin: PendingCoordShare) => {
      setPendingCoordShare(pin);
      if (commsView === "groups") {
        setCommsView(activeGroupId ? "group_chat" : "private");
      }
      setActiveTab("comms");
    },
    [activeGroupId, commsView]
  );

  const sendViewportToOffline = useCallback(
    (
      bounds: [number, number, number, number],
      source?: OfflineTileSource
    ) => {
      setPendingOfflineBounds(bounds);
      if (source) setPendingOfflineSource(source);
      setActiveTab("offline");
    },
    []
  );

  const t = useMemo(() => translations[lang], [lang]);

  const copyText = useCallback(
    async (text: string, customMsg?: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast(customMsg || t.app.copied);
      } catch {
        showToast(text);
      }
    },
    [showToast, t.app.copied]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      authLoading,
      setUser,
      signOut,
      updateAccount,
      lang,
      setLang,
      t,
      coordFormat,
      setCoordFormat,
      isOnline,
      swReady,
      branding,
      refreshBranding,
      updateBranding,
      activeTab,
      setActiveTab,
      commsView,
      setCommsView,
      activeGroupId,
      setActiveGroupId,
      activePeerId,
      setActivePeerId,
      openGroupChat,
      openPrivateChat,
      gps,
      syncGpsToSquad,
      groups,
      refreshGroups,
      threads,
      unreadCount,
      refreshThreads,
      waypoints,
      refreshWaypoints,
      offlineRegions,
      mbtilesArchives,
      storageStats,
      refreshOfflineData,
      mapFocus,
      clearMapFocus,
      jumpToMap,
      lastMapViewport,
      setLastMapViewport,
      pendingOfflineBounds,
      setPendingOfflineBounds,
      pendingOfflineSource,
      setPendingOfflineSource,
      sendViewportToOffline,
      activeMbtilesId,
      setActiveMbtilesId,
      showOfflineTilesOverlay,
      setShowOfflineTilesOverlay,
      pendingCoordShare,
      setPendingCoordShare,
      shareCoordToComms,
      toast,
      showToast,
      copyText,
    }),
    [
      user,
      authLoading,
      signOut,
      updateAccount,
      lang,
      setLang,
      t,
      coordFormat,
      setCoordFormat,
      isOnline,
      swReady,
      branding,
      refreshBranding,
      updateBranding,
      activeTab,
      commsView,
      activeGroupId,
      activePeerId,
      openGroupChat,
      openPrivateChat,
      gps,
      syncGpsToSquad,
      groups,
      refreshGroups,
      threads,
      unreadCount,
      refreshThreads,
      waypoints,
      refreshWaypoints,
      offlineRegions,
      mbtilesArchives,
      storageStats,
      refreshOfflineData,
      mapFocus,
      clearMapFocus,
      jumpToMap,
      lastMapViewport,
      pendingOfflineBounds,
      sendViewportToOffline,
      activeMbtilesId,
      showOfflineTilesOverlay,
      pendingCoordShare,
      shareCoordToComms,
      toast,
      showToast,
      copyText,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
