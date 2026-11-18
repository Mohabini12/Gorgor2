"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  FileArchive,
  FolderUp,
  HardDrive,
  Layers,
  Map as MapIcon,
  Square,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  buildMbtilesFromRegion,
  countRegionTiles,
  deleteMbtilesArchive,
  deleteOfflineRegion,
  downloadOfflineRegion,
  getMbtilesRawBytes,
  importMbtilesBytes,
  importMbtilesFile,
  MAX_REGION_TILES,
} from "@/lib/offlineStorage";
import { formatBytes, formatMGRS } from "@/lib/coordinates";
import type { OfflineRegionRecord, OfflineTileSource } from "@/types/gorgor";

const SECTOR_PRESETS: {
  name: string;
  bounds: [number, number, number, number];
  minZ: number;
  maxZ: number;
}[] = [
  {
    name: "Mogadishu — Sector 38N",
    bounds: [45.295, 2.005, 45.365, 2.062],
    minZ: 11,
    maxZ: 13,
  },
  {
    name: "Hargeisa Corridor",
    bounds: [44.02, 9.52, 44.11, 9.59],
    minZ: 11,
    maxZ: 13,
  },
  {
    name: "Kismayo Coastal Sector",
    bounds: [42.5, -0.4, 42.59, -0.32],
    minZ: 11,
    maxZ: 13,
  },
  {
    name: "Garowe Junction",
    bounds: [48.44, 8.37, 48.53, 8.44],
    minZ: 11,
    maxZ: 13,
  },
];

function triggerBinaryDownload(bytes: Uint8Array, fileName: string) {
  const safeBuf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(safeBuf).set(bytes);
  const blob = new Blob([safeBuf], { type: "application/x-sqlite3" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function OfflineManagerScreen() {
  const {
    t,
    isOnline,
    swReady,
    offlineRegions,
    mbtilesArchives,
    storageStats,
    refreshOfflineData,
    lastMapViewport,
    pendingOfflineBounds,
    setPendingOfflineBounds,
    pendingOfflineSource,
    setPendingOfflineSource,
    activeMbtilesId,
    setActiveMbtilesId,
    jumpToMap,
    showToast,
  } = useApp();

  const [section, setSection] = useState<"download" | "mbtiles">("download");

  // Downloader form state
  const [packName, setPackName] = useState(SECTOR_PRESETS[0].name);
  const [sourceStyle, setSourceStyle] =
    useState<OfflineTileSource>("satellite");
  const [west, setWest] = useState(String(SECTOR_PRESETS[0].bounds[0]));
  const [south, setSouth] = useState(String(SECTOR_PRESETS[0].bounds[1]));
  const [east, setEast] = useState(String(SECTOR_PRESETS[0].bounds[2]));
  const [north, setNorth] = useState(String(SECTOR_PRESETS[0].bounds[3]));
  const [minZoom, setMinZoom] = useState(11);
  const [maxZoom, setMaxZoom] = useState(13);

  const [activeJob, setActiveJob] = useState<OfflineRegionRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [importingMbt, setImportingMbt] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Pick up bounds & tile source sent from MapScreen "Cache Current View"
  useEffect(() => {
    if (!pendingOfflineBounds) return;
    const [w, s, e, n] = pendingOfflineBounds;
    setWest(String(w));
    setSouth(String(s));
    setEast(String(e));
    setNorth(String(n));
    if (pendingOfflineSource) {
      setSourceStyle(pendingOfflineSource);
      setPendingOfflineSource(null);
    }
    const centerMgrs = formatMGRS((s + n) / 2, (w + e) / 2, 2);
    setPackName(`Sector ${centerMgrs}`);
    setSection("download");
    setPendingOfflineBounds(null);
  }, [
    pendingOfflineBounds,
    setPendingOfflineBounds,
    pendingOfflineSource,
    setPendingOfflineSource,
  ]);

  const numericBounds = useMemo<[number, number, number, number] | null>(() => {
    const nums = [Number(west), Number(south), Number(east), Number(north)];
    if (nums.some((n) => !Number.isFinite(n))) return null;
    if (nums[0] >= nums[2] || nums[1] >= nums[3]) return null;
    if (nums[1] < -85 || nums[3] > 85 || nums[0] < -180 || nums[2] > 180)
      return null;
    return [nums[0], nums[1], nums[2], nums[3]];
  }, [west, south, east, north]);

  const tileEstimate = useMemo(() => {
    if (!numericBounds) return 0;
    return countRegionTiles(numericBounds, minZoom, maxZoom);
  }, [numericBounds, minZoom, maxZoom]);

  const applyPreset = (p: (typeof SECTOR_PRESETS)[number]) => {
    setPackName(p.name);
    setWest(String(p.bounds[0]));
    setSouth(String(p.bounds[1]));
    setEast(String(p.bounds[2]));
    setNorth(String(p.bounds[3]));
    setMinZoom(p.minZ);
    setMaxZoom(p.maxZ);
    setErrorMsg(null);
  };

  const applyMapViewport = () => {
    const [w, s, e, n] = lastMapViewport.bounds;
    setWest(String(w));
    setSouth(String(s));
    setEast(String(e));
    setNorth(String(n));
    const zBase = Math.max(8, Math.min(14, Math.round(lastMapViewport.zoom)));
    setMinZoom(Math.max(8, zBase - 1));
    setMaxZoom(Math.min(15, zBase + 1));
    setPackName(`Viewport ${formatMGRS((s + n) / 2, (w + e) / 2, 2)}`);
    setErrorMsg(null);
  };

  const handleStartDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!numericBounds) {
      setErrorMsg("Invalid geographic bounding box.");
      return;
    }
    setErrorMsg(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await downloadOfflineRegion({
        name: packName,
        sourceStyle,
        bounds: numericBounds,
        minZoom,
        maxZoom,
        signal: controller.signal,
        onProgress: (rec) => {
          setActiveJob(rec);
        },
      });
      await refreshOfflineData();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Offline tile download failed."
      );
    } finally {
      abortRef.current = null;
      setActiveJob(null);
    }
  };

  const handleCancelDownload = () => {
    abortRef.current?.abort();
  };

  const handleDeleteRegion = async (id: string) => {
    await deleteOfflineRegion(id);
    await refreshOfflineData();
  };

  const handleExportMbtiles = async (
    regionId: string,
    mode: "download" | "library"
  ) => {
    setErrorMsg(null);
    setExportingId(regionId);
    try {
      const { data, fileName } = await buildMbtilesFromRegion(regionId);
      if (mode === "download") {
        triggerBinaryDownload(data, fileName);
        showToast(`${fileName} (${formatBytes(data.byteLength)})`);
      } else {
        await importMbtilesBytes(data, fileName);
        await refreshOfflineData();
        setSection("mbtiles");
        showToast(t.offline.importSuccess);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to build MBTiles file."
      );
    } finally {
      setExportingId(null);
    }
  };

  const handleMbtilesFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setErrorMsg(null);
    setImportingMbt(true);
    try {
      await importMbtilesFile(file);
      await refreshOfflineData();
      showToast(t.offline.importSuccess);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Invalid or corrupted MBTiles file."
      );
    } finally {
      setImportingMbt(false);
    }
  };

  const handleDownloadStoredMbtiles = async (id: string) => {
    const raw = await getMbtilesRawBytes(id);
    if (raw) {
      triggerBinaryDownload(raw.data, raw.fileName);
    }
  };

  const handleDeleteMbtiles = async (id: string) => {
    if (activeMbtilesId === id) {
      setActiveMbtilesId(null);
    }
    await deleteMbtilesArchive(id);
    await refreshOfflineData();
  };

  const quotaPct =
    storageStats?.browserUsageBytes && storageStats?.browserQuotaBytes
      ? Math.min(
          100,
          (storageStats.browserUsageBytes / storageStats.browserQuotaBytes) *
            100
        )
      : 0;

  return (
    <div className="h-full overflow-y-auto px-4 pt-4 pb-24 lg:pb-8">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-white">{t.offline.title}</h2>
          <p className="text-xs text-[#B8C7DC] mt-0.5">{t.offline.subtitle}</p>
        </div>

        {/* Real Storage & Connectivity Card */}
        <section className="rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#2D8CFF]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#B8C7DC]">
                {t.offline.storageTitle}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono-grid border bg-[#132642] border-[#94B8E8]/20 text-[#B8C7DC]">
                {swReady ? t.offline.swReady : t.offline.swPending}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono-grid font-semibold border ${
                  isOnline
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/35"
                    : "bg-amber-500/15 text-amber-200 border-amber-400/35"
                }`}
              >
                {isOnline ? (
                  <Wifi className="w-3 h-3" />
                ) : (
                  <WifiOff className="w-3 h-3" />
                )}
                {isOnline ? t.app.online : t.app.offline}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl bg-[#071120] border border-[#94B8E8]/12 p-3">
              <div className="text-[10px] text-[#7F95B2] uppercase">
                {t.offline.gorgorUsed}
              </div>
              <div className="text-base font-mono-grid font-bold text-[#53A4FF] mt-0.5">
                {formatBytes(storageStats?.totalGorgorBytes ?? 0)}
              </div>
            </div>
            <div className="rounded-xl bg-[#071120] border border-[#94B8E8]/12 p-3">
              <div className="text-[10px] text-[#7F95B2] uppercase">
                {t.offline.tabRegions}
              </div>
              <div className="text-base font-mono-grid font-bold text-white mt-0.5">
                {storageStats?.regionCount ?? 0}{" "}
                <span className="text-xs font-normal text-[#7F95B2]">
                  ({storageStats?.cachedTileCount ?? 0} tiles)
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-[#071120] border border-[#94B8E8]/12 p-3">
              <div className="text-[10px] text-[#7F95B2] uppercase">
                MBTiles SQLite
              </div>
              <div className="text-base font-mono-grid font-bold text-white mt-0.5">
                {storageStats?.mbtilesCount ?? 0}{" "}
                <span className="text-xs font-normal text-[#7F95B2]">
                  ({formatBytes(storageStats?.mbtilesBytes ?? 0)})
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-[#071120] border border-[#94B8E8]/12 p-3">
              <div className="text-[10px] text-[#7F95B2] uppercase">
                {t.offline.browserQuota}
              </div>
              <div className="text-sm font-mono-grid font-semibold text-white mt-0.5">
                {storageStats?.browserQuotaBytes
                  ? `${formatBytes(storageStats.browserUsageBytes ?? 0)} / ${formatBytes(storageStats.browserQuotaBytes)}`
                  : "IndexedDB"}
              </div>
            </div>
          </div>

          {storageStats?.browserQuotaBytes ? (
            <div className="mt-3 h-1.5 rounded-full bg-[#071120] overflow-hidden">
              <div
                className="h-full bg-[#2D8CFF] transition-all"
                style={{ width: `${Math.max(quotaPct, storageStats.totalGorgorBytes > 0 ? 1.5 : 0)}%` }}
              />
            </div>
          ) : null}
        </section>

        {/* Segmented Control: Tile Pack Downloader & Regions vs MBTiles Manager */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16">
          <button
            type="button"
            onClick={() => {
              setSection("download");
              setErrorMsg(null);
            }}
            className={`min-h-[46px] rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
              section === "download"
                ? "bg-[#2D8CFF] text-white"
                : "text-[#B8C7DC] hover:text-white"
            }`}
          >
            <Download className="w-4 h-4" />
            {t.offline.tabRegions} ({offlineRegions.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setSection("mbtiles");
              setErrorMsg(null);
            }}
            className={`min-h-[46px] rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
              section === "mbtiles"
                ? "bg-[#2D8CFF] text-white"
                : "text-[#B8C7DC] hover:text-white"
            }`}
          >
            <FileArchive className="w-4 h-4" />
            {t.offline.tabMbtiles} ({mbtilesArchives.length})
          </button>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-500/12 border border-red-400/35 text-xs text-red-200 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {section === "download" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Real Tile Pack Downloader Form */}
            <form
              onSubmit={handleStartDownload}
              className="lg:col-span-6 rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-4 sm:p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">
                  {t.offline.tabDownload}
                </h3>
                <button
                  type="button"
                  onClick={applyMapViewport}
                  className="min-h-[34px] px-2.5 rounded-lg bg-[#132642] hover:bg-[#1B3458] border border-[#2D8CFF]/35 text-[11px] font-medium text-[#53A4FF]"
                >
                  {t.offline.useMapViewport}
                </button>
              </div>

              {/* Sector Presets */}
              <div>
                <label className="block text-[11px] text-[#7F95B2] mb-1.5">
                  {t.offline.presets}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SECTOR_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#071120] hover:bg-[#132642] border border-[#94B8E8]/16 text-[11px] text-[#B8C7DC] hover:text-white transition-colors"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#B8C7DC] mb-1">
                    {t.offline.packName}
                  </label>
                  <input
                    type="text"
                    required
                    value={packName}
                    onChange={(e) => setPackName(e.target.value)}
                    placeholder={t.offline.packNamePlaceholder}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-xs text-white focus:outline-none focus:border-[#2D8CFF]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#B8C7DC] mb-1">
                    {t.offline.tileSource}
                  </label>
                  <select
                    value={sourceStyle}
                    onChange={(e) =>
                      setSourceStyle(e.target.value as OfflineTileSource)
                    }
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-xs text-white"
                  >
                    <option value="satellite">
                      {t.offline.sourceSatellite}
                    </option>
                    <option value="standard">{t.offline.sourceStandard}</option>
                    <option value="topo">{t.offline.sourceTopo}</option>
                  </select>
                </div>
              </div>

              {/* Bounding Box */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: t.offline.west, val: west, set: setWest },
                  { label: t.offline.south, val: south, set: setSouth },
                  { label: t.offline.east, val: east, set: setEast },
                  { label: t.offline.north, val: north, set: setNorth },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="block text-[10px] text-[#7F95B2] mb-1">
                      {f.label}
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={f.val}
                      onChange={(e) => f.set(e.target.value)}
                      className="w-full min-h-[40px] px-2.5 rounded-lg bg-[#071120] border border-[#94B8E8]/18 text-xs font-mono-grid text-white focus:outline-none focus:border-[#2D8CFF]"
                    />
                  </div>
                ))}
              </div>

              {/* Zoom Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#B8C7DC] mb-1">
                    {t.offline.minZoom}:{" "}
                    <strong className="font-mono-grid">z{minZoom}</strong>
                  </label>
                  <input
                    type="range"
                    min={7}
                    max={15}
                    value={minZoom}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMinZoom(v);
                      if (v > maxZoom) setMaxZoom(v);
                    }}
                    className="w-full accent-[#2D8CFF]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#B8C7DC] mb-1">
                    {t.offline.maxZoom}:{" "}
                    <strong className="font-mono-grid">z{maxZoom}</strong>
                  </label>
                  <input
                    type="range"
                    min={7}
                    max={15}
                    value={maxZoom}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMaxZoom(v);
                      if (v < minZoom) setMinZoom(v);
                    }}
                    className="w-full accent-[#2D8CFF]"
                  />
                </div>
              </div>

              {/* Honest Exact Tile Count Preview */}
              <div className="rounded-xl bg-[#071120] border border-[#94B8E8]/14 px-3.5 py-2.5 flex items-center justify-between">
                <span className="text-xs text-[#B8C7DC]">
                  {t.offline.estimatedTiles}
                </span>
                <span
                  className={`text-sm font-mono-grid font-bold ${
                    tileEstimate > MAX_REGION_TILES || tileEstimate === 0
                      ? "text-amber-300"
                      : "text-[#53A4FF]"
                  }`}
                >
                  {tileEstimate.toLocaleString()} / {MAX_REGION_TILES} tiles
                </span>
              </div>

              {tileEstimate > MAX_REGION_TILES && (
                <p className="text-xs text-amber-300">
                  {t.offline.maxTilesWarning}
                </p>
              )}

              {/* Live Real Download Progress */}
              {activeJob ? (
                <div className="rounded-xl bg-[#071120] border border-[#2D8CFF]/45 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#53A4FF] font-semibold">
                      {t.offline.downloading}
                    </span>
                    <span className="font-mono-grid text-white">
                      {activeJob.downloadedTiles + activeJob.failedTiles}/
                      {activeJob.totalTiles} ({formatBytes(activeJob.byteSize)})
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#132642] overflow-hidden">
                    <div
                      className="h-full bg-[#2D8CFF] transition-all duration-150"
                      style={{
                        width: `${Math.round(
                          ((activeJob.downloadedTiles + activeJob.failedTiles) /
                            Math.max(1, activeJob.totalTiles)) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelDownload}
                    className="w-full min-h-[44px] rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 text-xs font-semibold text-red-200 flex items-center justify-center gap-2"
                  >
                    <Square className="w-3.5 h-3.5" />
                    {t.offline.cancelDownload}
                  </button>
                </div>
              ) : !isOnline ? (
                <div className="p-3 rounded-xl bg-amber-500/12 border border-amber-400/30 text-xs text-amber-200">
                  {t.offline.offlineCannotDownload}
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={
                    tileEstimate === 0 || tileEstimate > MAX_REGION_TILES
                  }
                  className="w-full min-h-[48px] rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] active:bg-[#1A6ED8] disabled:opacity-50 text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  {t.offline.startDownload}
                </button>
              )}
            </form>

            {/* Saved Offline Regions List */}
            <div className="lg:col-span-6 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7F95B2]">
                {t.offline.tabRegions} ({offlineRegions.length})
              </h3>
              {offlineRegions.length === 0 ? (
                <div className="rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/14 p-6 text-center">
                  <Database className="w-8 h-8 text-[#2D8CFF]/60 mx-auto mb-2" />
                  <p className="text-xs text-[#B8C7DC] leading-relaxed">
                    {t.offline.noRegions}
                  </p>
                </div>
              ) : (
                offlineRegions.map((reg) => (
                  <div
                    key={reg.id}
                    className="rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold text-white">
                            {reg.name}
                          </h4>
                          <span
                            className={`text-[10px] font-mono-grid font-bold px-2 py-0.5 rounded-full border ${
                              reg.status === "complete"
                                ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/35"
                                : "bg-amber-500/15 text-amber-200 border-amber-400/35"
                            }`}
                          >
                            {reg.status === "complete"
                              ? t.offline.statusComplete
                              : reg.status === "cancelled"
                              ? t.offline.statusCancelled
                              : t.offline.statusPartial}
                          </span>
                        </div>
                        <div className="text-xs font-mono-grid text-[#B8C7DC] mt-1">
                          {reg.downloadedTiles}/{reg.totalTiles}{" "}
                          {t.offline.tilesStored} · {formatBytes(reg.byteSize)}{" "}
                          · z{reg.minZoom}–z{reg.maxZoom} ·{" "}
                          {reg.sourceStyle.toUpperCase()}
                        </div>
                        {reg.failedTiles > 0 && (
                          <div className="text-[11px] text-amber-300 mt-0.5">
                            {reg.failedTiles} {t.offline.failed}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRegion(reg.id)}
                        aria-label={t.app.delete}
                        className="w-9 h-9 rounded-xl bg-[#132642] hover:bg-red-500/20 text-[#7F95B2] hover:text-red-300 flex items-center justify-center shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-[#94B8E8]/12">
                      <button
                        type="button"
                        onClick={() =>
                          jumpToMap({
                            lat: (reg.bounds[1] + reg.bounds[3]) / 2,
                            lon: (reg.bounds[0] + reg.bounds[2]) / 2,
                            bounds: reg.bounds,
                            preferredBasemap:
                              reg.sourceStyle === "satellite"
                                ? "satellite"
                                : reg.sourceStyle === "topo"
                                ? "topo"
                                : "standard",
                            activateOfflineRegionId: reg.id,
                          })
                        }
                        className="flex-1 min-w-[110px] min-h-[42px] px-3 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                      >
                        <MapIcon className="w-3.5 h-3.5" />
                        {t.offline.loadOnMap}
                      </button>
                      <button
                        type="button"
                        disabled={
                          exportingId === reg.id || reg.downloadedTiles === 0
                        }
                        onClick={() => handleExportMbtiles(reg.id, "download")}
                        className="min-h-[42px] px-3 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 text-xs font-medium text-white flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <FileArchive className="w-3.5 h-3.5 text-[#53A4FF]" />
                        {exportingId === reg.id
                          ? t.offline.exporting
                          : t.offline.exportMbtiles}
                      </button>
                      <button
                        type="button"
                        disabled={
                          exportingId === reg.id || reg.downloadedTiles === 0
                        }
                        onClick={() => handleExportMbtiles(reg.id, "library")}
                        className="min-h-[42px] px-3 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 text-xs font-medium text-[#53A4FF] flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        {t.offline.saveToLibrary}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* SQLite .mbtiles Archive Manager */
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#0D1B30] border border-[#2D8CFF]/35 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <FileArchive className="w-5 h-5 text-[#2D8CFF]" />
                  {t.offline.importTitle}
                </h3>
                <p className="text-xs text-[#B8C7DC] leading-relaxed">
                  {t.offline.importDesc}
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".mbtiles,.sqlite,.sqlite3,.db,application/x-sqlite3,application/octet-stream"
                onChange={handleMbtilesFileSelected}
                className="hidden"
              />
              <button
                type="button"
                disabled={importingMbt}
                onClick={() => fileInputRef.current?.click()}
                className="w-full sm:w-auto min-h-[48px] px-5 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] disabled:opacity-60 text-sm font-semibold text-white flex items-center justify-center gap-2 shrink-0 transition-colors"
              >
                <FolderUp className="w-4 h-4" />
                {importingMbt
                  ? t.offline.importing
                  : t.offline.selectMbtilesBtn}
              </button>
            </div>

            {mbtilesArchives.length === 0 ? (
              <div className="rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/14 p-8 text-center">
                <FileArchive className="w-9 h-9 text-[#2D8CFF]/55 mx-auto mb-2.5" />
                <p className="text-xs text-[#B8C7DC] max-w-md mx-auto leading-relaxed">
                  {t.offline.noMbtiles}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {mbtilesArchives.map((mbt) => {
                  const isActive = activeMbtilesId === mbt.id;
                  return (
                    <div
                      key={mbt.id}
                      className={`rounded-2xl bg-[#0D1B30] border p-4 space-y-3 ${
                        isActive
                          ? "border-[#2D8CFF]"
                          : "border-[#94B8E8]/16"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-white truncate">
                              {mbt.name}
                            </h4>
                            {isActive && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <div className="text-[11px] font-mono-grid text-[#7F95B2] truncate">
                            {mbt.fileName}
                          </div>
                          {mbt.description && (
                            <p className="text-xs text-[#B8C7DC] mt-1 line-clamp-2">
                              {mbt.description}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteMbtiles(mbt.id)}
                          aria-label={t.app.delete}
                          className="w-9 h-9 rounded-xl bg-[#132642] hover:bg-red-500/20 text-[#7F95B2] hover:text-red-300 flex items-center justify-center shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs font-mono-grid">
                        <div className="rounded-lg bg-[#071120] p-2 border border-[#94B8E8]/10">
                          <div className="text-[10px] text-[#7F95B2]">
                            {t.offline.format}
                          </div>
                          <div className="text-white uppercase font-semibold">
                            {mbt.format}
                          </div>
                        </div>
                        <div className="rounded-lg bg-[#071120] p-2 border border-[#94B8E8]/10">
                          <div className="text-[10px] text-[#7F95B2]">
                            {t.offline.zoomRange}
                          </div>
                          <div className="text-white font-semibold">
                            z{mbt.minZoom}–z{mbt.maxZoom}
                          </div>
                        </div>
                        <div className="rounded-lg bg-[#071120] p-2 border border-[#94B8E8]/10">
                          <div className="text-[10px] text-[#7F95B2]">
                            {t.offline.tileCount}
                          </div>
                          <div className="text-[#53A4FF] font-semibold">
                            {mbt.tileCount} ({formatBytes(mbt.byteSize)})
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            jumpToMap({
                              lat: mbt.center ? mbt.center[1] : 2.037,
                              lon: mbt.center ? mbt.center[0] : 45.343,
                              bounds: mbt.bounds ?? undefined,
                              activateMbtilesId: mbt.id,
                            })
                          }
                          className="flex-1 min-h-[42px] rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                        >
                          <MapIcon className="w-3.5 h-3.5" />
                          {t.offline.loadOnMap}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadStoredMbtiles(mbt.id)}
                          className="min-h-[42px] px-3.5 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 text-xs font-medium text-white flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5 text-[#53A4FF]" />
                          {t.offline.downloadFile}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
