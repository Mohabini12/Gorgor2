"use client";

import React, { useState } from "react";
import {
  Compass,
  Crosshair,
  Copy,
  HardDriveDownload,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Navigation,
  Radio,
  Search,
  Share2,
  Users,
  ChevronRight,
  Database,
  AlertTriangle,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { formatBytes, formatByPreference } from "@/lib/coordinates";

const WP_CATEGORY_BADGE: Record<string, string> = {
  rally: "text-[#53A4FF] bg-[#2D8CFF]/15 border-[#2D8CFF]/35",
  observation: "text-sky-300 bg-sky-500/15 border-sky-400/35",
  checkpoint: "text-blue-200 bg-blue-500/15 border-blue-400/35",
  hazard: "text-red-300 bg-red-500/15 border-red-400/35",
  medevac: "text-emerald-300 bg-emerald-500/15 border-emerald-400/35",
  objective: "text-amber-200 bg-amber-500/15 border-amber-400/35",
};

export function DashboardScreen() {
  const {
    user,
    t,
    coordFormat,
    gps,
    syncGpsToSquad,
    groups,
    waypoints,
    unreadCount,
    offlineRegions,
    mbtilesArchives,
    storageStats,
    setActiveTab,
    setCommsView,
    openGroupChat,
    jumpToMap,
    copyText,
    showToast,
  } = useApp();

  const [syncing, setSyncing] = useState(false);

  const handleBroadcastGps = async () => {
    setSyncing(true);
    const res = await syncGpsToSquad();
    setSyncing(false);
    if (res.ok) {
      showToast(t.dashboard.broadcasted);
    } else {
      showToast(res.error || t.dashboard.broadcastBlockedByPrivacy);
    }
  };

  const getGpsStatusPresentation = () => {
    switch (gps.status) {
      case "active":
        return {
          label: gps.isTracking
            ? t.dashboard.gpsTracking
            : t.dashboard.gpsActive,
          desc: "",
          dot: "bg-emerald-400 animate-pulse",
          badge: "bg-emerald-500/15 text-emerald-300 border-emerald-400/35",
          isError: false,
        };
      case "requesting":
        return {
          label: t.dashboard.gpsRequesting,
          desc: "",
          dot: "bg-amber-400 animate-pulse",
          badge: "bg-amber-500/15 text-amber-200 border-amber-400/35",
          isError: false,
        };
      case "denied":
        return {
          label: t.dashboard.gpsDenied,
          desc: t.dashboard.gpsDeniedDesc,
          dot: "bg-red-400",
          badge: "bg-red-500/15 text-red-200 border-red-400/35",
          isError: true,
        };
      case "unavailable":
        return {
          label: t.dashboard.gpsUnavailable,
          desc: t.dashboard.gpsUnavailableDesc,
          dot: "bg-red-400",
          badge: "bg-red-500/15 text-red-200 border-red-400/35",
          isError: true,
        };
      case "timeout":
        return {
          label: t.dashboard.gpsTimeout,
          desc: t.dashboard.gpsTimeoutDesc,
          dot: "bg-amber-400",
          badge: "bg-amber-500/15 text-amber-200 border-amber-400/35",
          isError: true,
        };
      case "position_unavailable":
        return {
          label: t.dashboard.gpsPosUnavailable,
          desc: t.dashboard.gpsPosUnavailableDesc,
          dot: "bg-amber-400",
          badge: "bg-amber-500/15 text-amber-200 border-amber-400/35",
          isError: true,
        };
      case "insecure_context":
        return {
          label: t.dashboard.gpsInsecure,
          desc: t.dashboard.gpsInsecureDesc,
          dot: "bg-red-400",
          badge: "bg-red-500/15 text-red-200 border-red-400/35",
          isError: true,
        };
      default:
        return {
          label: t.dashboard.gpsIdle,
          desc: t.dashboard.gpsIdleDesc,
          dot: "bg-[#53A4FF]",
          badge: "bg-[#2D8CFF]/15 text-[#53A4FF] border-[#2D8CFF]/35",
          isError: false,
        };
    }
  };

  const gpsInfo = getGpsStatusPresentation();

  return (
    <div className="h-full overflow-y-auto px-4 pt-4 pb-24 lg:pb-8">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Operator Identity Banner */}
        {user && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 px-4 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold font-mono-grid text-white shrink-0 border border-white/15"
                style={{ backgroundColor: user.avatarColor }}
              >
                {user.callsign.slice(0, 3)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono-grid font-semibold text-[#53A4FF] tracking-wider">
                    {user.callsign}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#132642] text-[#B8C7DC] font-mono-grid">
                    {coordFormat}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-white truncate">
                  {user.displayName}
                </h2>
                <p className="text-xs text-[#7F95B2] truncate">
                  {user.rankRole}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("account")}
              className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/16 text-xs font-medium text-[#B8C7DC] hover:text-white flex items-center gap-1 transition-colors shrink-0"
            >
              <span className="hidden sm:inline">{t.nav.account}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Top Desktop Grid: Live GPS Card + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Live Real GPS & Grid Position Card */}
          <section className="lg:col-span-7 rounded-2xl bg-[#0D1B30] border border-[#2D8CFF]/30 p-4 sm:p-5 flex flex-col justify-between shadow-lg">
            <div>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                <div className="flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-[#2D8CFF]" />
                  <h3 className="text-xs font-semibold tracking-[0.1em] uppercase text-[#B8C7DC]">
                    {t.dashboard.gpsCardTitle}
                  </h3>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono-grid font-semibold ${gpsInfo.badge}`}
                >
                  <span className={`w-2 h-2 rounded-full ${gpsInfo.dot}`} />
                  {gpsInfo.label}
                </span>
              </div>

              {gps.position ? (
                <div className="space-y-3 my-2">
                  <div className="rounded-xl bg-[#071120] border border-[#94B8E8]/15 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-mono-grid uppercase tracking-wider text-[#53A4FF]">
                          MGRS (1M GRID)
                        </div>
                        <div className="text-lg sm:text-xl font-mono-grid font-bold text-white tracking-wide mt-0.5 break-all">
                          {gps.position.mgrs}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          copyText(
                            formatByPreference(
                              gps.position!.lat,
                              gps.position!.lon,
                              coordFormat
                            )
                          )
                        }
                        aria-label={t.dashboard.copyGrid}
                        className="min-h-[44px] min-w-[44px] rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 flex items-center justify-center text-[#53A4FF] transition-colors shrink-0"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mt-2.5 pt-2.5 border-t border-[#94B8E8]/12 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs font-mono-grid">
                      <div>
                        <span className="text-[#7F95B2]">DMS: </span>
                        <span className="text-[#B8C7DC]">
                          {gps.position.dms}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7F95B2]">DD: </span>
                        <span className="text-[#B8C7DC]">{gps.position.dd}</span>
                      </div>
                    </div>
                  </div>

                  {/* Telemetry Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-xl bg-[#132642]/75 px-3 py-2 border border-[#94B8E8]/12">
                      <div className="text-[10px] text-[#7F95B2] uppercase">
                        {t.dashboard.accuracy}
                      </div>
                      <div className="text-sm font-mono-grid font-semibold text-white">
                        ±{Math.round(gps.position.accuracy)} m
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#132642]/75 px-3 py-2 border border-[#94B8E8]/12">
                      <div className="text-[10px] text-[#7F95B2] uppercase">
                        {t.dashboard.altitude}
                      </div>
                      <div className="text-sm font-mono-grid font-semibold text-white">
                        {gps.position.altitude !== null
                          ? `${Math.round(gps.position.altitude)} m`
                          : "—"}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#132642]/75 px-3 py-2 border border-[#94B8E8]/12">
                      <div className="text-[10px] text-[#7F95B2] uppercase">
                        {t.dashboard.heading}
                      </div>
                      <div className="text-sm font-mono-grid font-semibold text-white">
                        {gps.position.heading !== null
                          ? `${Math.round(gps.position.heading)}°`
                          : "—"}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#132642]/75 px-3 py-2 border border-[#94B8E8]/12">
                      <div className="text-[10px] text-[#7F95B2] uppercase">
                        {t.dashboard.speed}
                      </div>
                      <div className="text-sm font-mono-grid font-semibold text-white">
                        {gps.position.speed !== null
                          ? `${(gps.position.speed * 3.6).toFixed(1)} km/h`
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-[#071120] border border-[#94B8E8]/14 p-4 my-2 flex items-start gap-3">
                  {gpsInfo.isError ? (
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <Navigation className="w-5 h-5 text-[#2D8CFF] shrink-0 mt-0.5" />
                  )}
                  <p className="text-xs text-[#B8C7DC] leading-relaxed">
                    {gpsInfo.desc || t.dashboard.gpsRequesting}
                  </p>
                </div>
              )}
            </div>

            {/* GPS Action Controls (all 48dp Android touch targets) */}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={gps.acquireOnce}
                disabled={gps.status === "requesting"}
                className="flex-1 min-w-[130px] min-h-[48px] px-4 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] active:bg-[#1A6ED8] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Crosshair className="w-4 h-4" />
                {t.dashboard.acquireGps}
              </button>

              <button
                type="button"
                onClick={gps.toggleTracking}
                className={`flex-1 min-w-[130px] min-h-[48px] px-4 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                  gps.isTracking
                    ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200"
                    : "bg-[#132642] hover:bg-[#1B3458] border-[#94B8E8]/20 text-white"
                }`}
              >
                <Radio className="w-4 h-4" />
                {gps.isTracking
                  ? t.dashboard.stopTrack
                  : t.dashboard.startTrack}
              </button>

              {gps.position && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      jumpToMap({
                        lat: gps.position!.lat,
                        lon: gps.position!.lon,
                        zoom: 15,
                        label: "GPS",
                        mgrs: gps.position!.mgrs,
                      })
                    }
                    className="min-h-[48px] px-3.5 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 text-xs font-medium text-white flex items-center gap-1.5 transition-colors"
                  >
                    <MapIcon className="w-4 h-4 text-[#53A4FF]" />
                    {t.dashboard.viewOnMap}
                  </button>
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={handleBroadcastGps}
                    className="min-h-[48px] px-3.5 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 text-xs font-medium text-white flex items-center gap-1.5 transition-colors"
                  >
                    <Share2 className="w-4 h-4 text-[#53A4FF]" />
                    {t.dashboard.broadcastGps}
                  </button>
                </>
              )}
            </div>
          </section>

          {/* 2x2 Tactical Quick Actions */}
          <section className="lg:col-span-5 flex flex-col">
            <h3 className="text-xs font-semibold tracking-[0.1em] uppercase text-[#7F95B2] mb-2.5">
              {t.dashboard.quickActions}
            </h3>
            <div className="grid grid-cols-2 gap-3 flex-1">
              <button
                type="button"
                onClick={() => setActiveTab("map")}
                className="min-h-[104px] p-4 rounded-2xl bg-[#0D1B30] hover:bg-[#132642] border border-[#94B8E8]/16 hover:border-[#2D8CFF]/50 text-left flex flex-col justify-between transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-[#2D8CFF]/15 border border-[#2D8CFF]/35 flex items-center justify-center text-[#53A4FF]">
                  <MapIcon className="w-5 h-5" />
                </div>
                <div className="mt-3">
                  <div className="text-sm font-semibold text-white">
                    {t.dashboard.qaMap}
                  </div>
                  <div className="text-[11px] text-[#7F95B2] mt-0.5">
                    {t.dashboard.qaMapSub}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  jumpToMap({
                    lat: 2.0371,
                    lon: 45.3436,
                    openSearch: true,
                  })
                }
                className="min-h-[104px] p-4 rounded-2xl bg-[#0D1B30] hover:bg-[#132642] border border-[#94B8E8]/16 hover:border-[#2D8CFF]/50 text-left flex flex-col justify-between transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-[#2D8CFF]/15 border border-[#2D8CFF]/35 flex items-center justify-center text-[#53A4FF]">
                  <Search className="w-5 h-5" />
                </div>
                <div className="mt-3">
                  <div className="text-sm font-semibold text-white">
                    {t.dashboard.qaCoordSearch}
                  </div>
                  <div className="text-[11px] text-[#7F95B2] mt-0.5">
                    {t.dashboard.qaCoordSearchSub}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("offline")}
                className="min-h-[104px] p-4 rounded-2xl bg-[#0D1B30] hover:bg-[#132642] border border-[#94B8E8]/16 hover:border-[#2D8CFF]/50 text-left flex flex-col justify-between transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-[#2D8CFF]/15 border border-[#2D8CFF]/35 flex items-center justify-center text-[#53A4FF]">
                  <HardDriveDownload className="w-5 h-5" />
                </div>
                <div className="mt-3">
                  <div className="text-sm font-semibold text-white">
                    {t.dashboard.qaOffline}
                  </div>
                  <div className="text-[11px] text-[#7F95B2] mt-0.5">
                    {t.dashboard.qaOfflineSub}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("comms")}
                className="relative min-h-[104px] p-4 rounded-2xl bg-[#0D1B30] hover:bg-[#132642] border border-[#94B8E8]/16 hover:border-[#2D8CFF]/50 text-left flex flex-col justify-between transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#2D8CFF]/15 border border-[#2D8CFF]/35 flex items-center justify-center text-[#53A4FF]">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#2D8CFF] text-white text-xs font-mono-grid font-bold">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <div className="text-sm font-semibold text-white">
                    {t.dashboard.qaComms}
                  </div>
                  <div className="text-[11px] text-[#7F95B2] mt-0.5">
                    {t.dashboard.qaCommsSub}
                  </div>
                </div>
              </button>
            </div>
          </section>
        </div>

        {/* Assigned Squads (5–6 Members) */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-semibold tracking-[0.1em] uppercase text-[#7F95B2] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#2D8CFF]" />
              {t.dashboard.activeSquads}
            </h3>
            <button
              type="button"
              onClick={() => {
                setCommsView("groups");
                setActiveTab("comms");
              }}
              className="min-h-[36px] px-2.5 text-xs font-medium text-[#53A4FF] hover:text-white flex items-center gap-1"
            >
              {t.dashboard.manageSquads}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {groups.map((grp) => (
              <div
                key={grp.id}
                className="rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono-grid font-bold text-[#53A4FF] tracking-wider">
                      {grp.code}
                    </span>
                    <span
                      className={`text-[11px] font-mono-grid font-semibold px-2.5 py-0.5 rounded-full border ${
                        grp.memberCount >= 5
                          ? "bg-[#2D8CFF]/15 text-[#53A4FF] border-[#2D8CFF]/35"
                          : "bg-amber-500/15 text-amber-200 border-amber-400/35"
                      }`}
                    >
                      {grp.memberCount}/{grp.maxMembers} {t.dashboard.operators}
                    </span>
                  </div>
                  <h4 className="text-base font-semibold text-white mt-1">
                    {grp.name}
                  </h4>
                  <p className="text-xs font-mono-grid text-[#7F95B2] mt-0.5">
                    {grp.sector}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#94B8E8]/12">
                  <div className="flex -space-x-2">
                    {grp.members.slice(0, 6).map((m) => (
                      <div
                        key={m.id}
                        title={`${m.operator.callsign} — ${m.operator.displayName}`}
                        className="w-8 h-8 rounded-full border-2 border-[#0D1B30] flex items-center justify-center text-[10px] font-mono-grid font-bold text-white"
                        style={{ backgroundColor: m.operator.avatarColor }}
                      >
                        {m.operator.displayName
                          .replace(/^(Col\.|Capt\.|Lt\.|Sgt\.|Cpl\.)\s*/i, "")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => openGroupChat(grp.id)}
                    className="min-h-[42px] px-3.5 rounded-xl bg-[#132642] hover:bg-[#2D8CFF] border border-[#2D8CFF]/35 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    {t.dashboard.openChannel}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom Grid: Real Offline Storage Readiness + Saved Tactical Waypoints */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Real Offline Readiness */}
          <section className="lg:col-span-5 rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold tracking-[0.1em] uppercase text-[#7F95B2] flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#2D8CFF]" />
                  {t.dashboard.offlineReadiness}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab("offline")}
                  className="text-xs font-medium text-[#53A4FF] hover:text-white"
                >
                  {t.app.open}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-[#071120] border border-[#94B8E8]/12 p-3">
                  <div className="text-lg font-mono-grid font-bold text-white">
                    {offlineRegions.length}
                  </div>
                  <div className="text-[11px] text-[#7F95B2] mt-0.5">
                    {t.dashboard.cachedRegions}
                  </div>
                </div>
                <div className="rounded-xl bg-[#071120] border border-[#94B8E8]/12 p-3">
                  <div className="text-lg font-mono-grid font-bold text-white">
                    {mbtilesArchives.length}
                  </div>
                  <div className="text-[11px] text-[#7F95B2] mt-0.5">
                    {t.dashboard.mbtilesPacks}
                  </div>
                </div>
                <div className="rounded-xl bg-[#071120] border border-[#94B8E8]/12 p-3">
                  <div className="text-base font-mono-grid font-bold text-[#53A4FF]">
                    {formatBytes(storageStats?.totalGorgorBytes ?? 0)}
                  </div>
                  <div className="text-[11px] text-[#7F95B2] mt-0.5">
                    {t.dashboard.storedSize}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("offline")}
              className="mt-3 w-full min-h-[46px] rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/18 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors"
            >
              <HardDriveDownload className="w-4 h-4 text-[#53A4FF]" />
              {t.map.manageOffline}
            </button>
          </section>

          {/* Tactical Waypoints */}
          <section className="lg:col-span-7 rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold tracking-[0.1em] uppercase text-[#7F95B2] flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#2D8CFF]" />
                {t.dashboard.waypointsTitle}
              </h3>
              <button
                type="button"
                onClick={() => setActiveTab("map")}
                className="text-xs font-medium text-[#53A4FF] hover:text-white"
              >
                {t.dashboard.viewAllMap}
              </button>
            </div>

            {waypoints.length === 0 ? (
              <p className="text-xs text-[#7F95B2] py-4">
                {t.dashboard.noWaypoints}
              </p>
            ) : (
              <div className="space-y-2">
                {waypoints.slice(0, 4).map((wp) => {
                  const catKey =
                    `cat_${wp.category}` as keyof typeof t.map;
                  return (
                    <button
                      key={wp.id}
                      type="button"
                      onClick={() =>
                        jumpToMap({
                          lat: wp.lat,
                          lon: wp.lon,
                          zoom: 14,
                          label: wp.name,
                          mgrs: wp.mgrs,
                        })
                      }
                      className="w-full min-h-[54px] px-3 py-2.5 rounded-xl bg-[#071120] hover:bg-[#132642] border border-[#94B8E8]/12 hover:border-[#2D8CFF]/40 flex items-center justify-between gap-3 text-left transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MapPin className="w-4 h-4 text-[#2D8CFF] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {wp.name}
                          </div>
                          <div className="text-xs font-mono-grid text-[#7F95B2] truncate">
                            {formatByPreference(wp.lat, wp.lon, coordFormat)}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-md border shrink-0 ${
                          WP_CATEGORY_BADGE[wp.category] ||
                          WP_CATEGORY_BADGE.rally
                        }`}
                      >
                        {t.map[catKey] as string}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
