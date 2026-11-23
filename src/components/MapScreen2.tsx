"use client";

import { apiUrl } from "@/lib/api";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import {
  Compass,
  Copy,
  Crosshair,
  Flag,
  Grid,
  HardDriveDownload,
  Layers,
  MapPin,
  Navigation,
  Plus,
  Ruler,
  Satellite,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { registerGorgorMapProtocols } from "@/lib/mapProtocols";
import {
  computeDistanceAndBearing,
  createAccuracyCircleGeoJSON,
  formatByPreference,
  formatDD,
  formatDistance,
  formatDMS,
  formatMGRS,
  generateGraticuleGeoJSON,
  parseCoordinateInput,
  type ParsedCoordinate,
} from "@/lib/coordinates";
import type {
  BasemapStyleId,
  CoordFormat,
  TacticalWaypoint,
  WaypointCategory,
} from "@/types/gorgor";

const COORD_EXAMPLES = [
  { label: "MGRS 1m (KM4)", value: "38N NH 38210 25165" },
  { label: "MGRS 100m (AAIA)", value: "38N NH 339 227" },
  { label: "DMS (Mogadishu)", value: `02°02'13.6"N 045°20'37.0"E` },
  { label: "DMS (Hargeisa)", value: `09°33'36.0"N 044°03'54.0"E` },
  { label: "MGRS (Kismayo)", value: "38M KE 2678 6037" },
];

const WAYPOINT_COLORS: Record<WaypointCategory, string> = {
  rally: "#2D8CFF",
  observation: "#38BDF8",
  checkpoint: "#60A5FA",
  hazard: "#EF4444",
  medevac: "#22C55E",
  objective: "#F59E0B",
};

function buildBaseStyle(basemap: BasemapStyleId): StyleSpecification {
  const isSat = basemap === "satellite" || basemap === "hybrid";

  const tiles = isSat
    ? [apiUrl("/api/tiles/satellite/{z}/{x}/{y}")]
    : basemap === "topo"
    ? [apiUrl("/api/tiles/topo/{z}/{x}/{y}")]
    : basemap === "offline_only"
    ? ["gorgorcache://any/{z}/{x}/{y}"]
    : [apiUrl("/api/tiles/standard/{z}/{x}/{y}")];

  const offlineCacheScope = isSat
    ? "satellite"
    : basemap === "topo"
    ? "topo"
    : basemap === "offline_only"
    ? "any"
    : "standard";

  const attribution = isSat
    ? "Source: Esri, Maxar, Earthstar Geographics"
    : basemap === "topo"
    ? "© OpenTopoMap · © OpenStreetMap contributors"
    : basemap === "offline_only"
    ? "GORGOR IndexedDB Offline Cache"
    : "© OpenStreetMap contributors";

  const sources: StyleSpecification["sources"] = {
    basemap: {
      type: "raster",
      tiles,
      tileSize: 256,
      maxzoom: isSat ? 19 : 18,
      attribution,
    },
    "offline-cache": {
      type: "raster",
      tiles: [`gorgorcache://${offlineCacheScope}/{z}/{x}/{y}`],
      tileSize: 256,
      maxzoom: 19,
    },
    graticule: {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    },
    "gps-accuracy": {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    },
    "search-bbox": {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    },
    measure: {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    },
    range: {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    },
  };

  if (basemap === "hybrid") {
    sources["sat-roads"] = {
      type: "raster",
      tiles: [apiUrl("/api/tiles/sat_roads/{z}/{x}/{y}")],
      tileSize: 256,
      maxzoom: 19,
    };
    sources["sat-labels"] = {
      type: "raster",
      tiles: [apiUrl("/api/tiles/sat_labels/{z}/{x}/{y}")],
      tileSize: 256,
      maxzoom: 19,
    };
  }

  const hybridLayers: StyleSpecification["layers"] =
    basemap === "hybrid"
      ? [
          {
            id: "sat-roads-layer",
            type: "raster",
            source: "sat-roads",
            paint: {
              "raster-opacity": 0.85,
              "raster-fade-duration": 120,
            },
          },
          {
            id: "sat-labels-layer",
            type: "raster",
            source: "sat-labels",
            paint: {
              "raster-opacity": 0.95,
              "raster-fade-duration": 120,
            },
          },
        ]
      : [];

  return {
    version: 8,
    sources,
    layers: [
      {
        id: "bg",
        type: "background",
        paint: {
          "background-color": basemap === "tactical" ? "#f4f6f9" : "#071120",
        },
      },
      {
        id: "basemap-layer",
        type: "raster",
        source: "basemap",
        paint: {
          "raster-fade-duration": 150,
        },
      },
      {
        id: "offline-cache-layer",
        type: "raster",
        source: "offline-cache",
        layout: {
          visibility: basemap === "offline_only" ? "none" : "visible",
        },
        paint: {
          "raster-opacity": 1,
          "raster-fade-duration": 0,
        },
      },
      ...hybridLayers,
      {
        id: "graticule-lines",
        type: "line",
        source: "graticule",
        filter: ["==", ["get", "kind"], "line"],
        paint: {
          "line-color":
            basemap === "tactical"
              ? "#b85500"
              : isSat
              ? "#53A4FF"
              : "#2D8CFF",
          "line-width": isSat ? 1.15 : 1,
          "line-opacity": isSat ? 0.52 : 0.38,
          "line-dasharray": [4, 4],
        },
      },
      {
        id: "search-bbox-fill",
        type: "fill",
        source: "search-bbox",
        paint: {
          "fill-color": basemap === "tactical" ? "#d96600" : "#2D8CFF",
          "fill-opacity": 0.16,
        },
      },
      {
        id: "search-bbox-line",
        type: "line",
        source: "search-bbox",
        paint: {
          "line-color": basemap === "tactical" ? "#d96600" : "#53A4FF",
          "line-width": 2,
        },
      },
      {
        id: "gps-accuracy-fill",
        type: "fill",
        source: "gps-accuracy",
        paint: {
          "fill-color": basemap === "tactical" ? "#d96600" : "#2D8CFF",
          "fill-opacity": 0.18,
        },
      },
      {
        id: "gps-accuracy-line",
        type: "line",
        source: "gps-accuracy",
        paint: {
          "line-color": basemap === "tactical" ? "#d96600" : "#53A4FF",
          "line-width": 1.8,
        },
      },
      {
        id: "measure-line",
        type: "line",
        source: "measure",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": basemap === "tactical" ? "#d95b00" : "#2D8CFF",
          "line-width": 3,
          "line-dasharray": [2, 1.5],
        },
      },
      {
        id: "measure-points",
        type: "circle",
        source: "measure",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": basemap === "tactical" ? "#000000" : "#FFFFFF",
          "circle-stroke-color": basemap === "tactical" ? "#d95b00" : "#2D8CFF",
          "circle-stroke-width": 2.5,
        },
      },
      {
        id: "range-pointer-line",
        type: "line",
        source: "range",
        filter: [
          "all",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["get", "kind"], "pointer"],
        ],
        paint: { "line-color": "#1D6FE0", "line-width": 3 },
      },
      {
        id: "range-target-line",
        type: "line",
        source: "range",
        filter: [
          "all",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["get", "kind"], "target"],
        ],
        paint: { "line-color": "#D6249F", "line-width": 3 },
      },
      {
        id: "range-target-point",
        type: "circle",
        source: "range",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 7,
          "circle-color": "#D6249F",
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 2,
        },
      },
    ],
  };
}

const LOCAL_WP_KEY = "gorgor_local_waypoints";

type LocalWp = {
  id: string;
  name: string;
  category: WaypointCategory;
  notes: string;
  lat: number;
  lon: number;
  groupId: string | null;
};

function loadLocalWps(): LocalWp[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_WP_KEY);
    return raw ? (JSON.parse(raw) as LocalWp[]) : [];
  } catch {
    return [];
  }
}

function saveLocalWps(list: LocalWp[]) {
  try {
    window.localStorage.setItem(LOCAL_WP_KEY, JSON.stringify(list));
  } catch {
    // ignore storage restrictions
  }
}

export function MapScreen() {
  const {
    user,
    t,
    coordFormat,
    setCoordFormat,
    isOnline,
    gps,
    groups,
    waypoints,
    refreshWaypoints,
    offlineRegions,
    mbtilesArchives,
    mapFocus,
    clearMapFocus,
    lastMapViewport,
    setLastMapViewport,
    sendViewportToOffline,
    activeMbtilesId,
    setActiveMbtilesId,
    showOfflineTilesOverlay,
    setShowOfflineTilesOverlay,
    shareCoordToComms,
    setActiveTab,
    copyText,
    showToast,
  } = useApp();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const gpsMarkerRef = useRef<Marker | null>(null);
  const searchMarkerRef = useRef<Marker | null>(null);
  const wpMarkersRef = useRef<Marker[]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [basemap, setBasemap] = useState<BasemapStyleId>("tactical");
  const [showGrid, setShowGrid] = useState(true);
  const [showWaypoints, setShowWaypoints] = useState(true);
  const [mbtilesOpacity, setMbtilesOpacity] = useState(0.95);
  const [bearing, setBearing] = useState(0);
  const [target, setTarget] = useState<{ lat: number; lon: number } | null>(
    null
  );
  const [styleVersion, setStyleVersion] = useState(0);
  const rangeLabelsRef = useRef<{ pointer?: Marker; target?: Marker }>({});

  const [centerCoord, setCenterCoord] = useState<{
    lat: number;
    lon: number;
    zoom: number;
  }>({
    lat: lastMapViewport.center[1],
    lon: lastMapViewport.center[0],
    zoom: lastMapViewport.zoom,
  });

  // Coordinate Search & Converter
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [parsedCoord, setParsedCoord] = useState<ParsedCoordinate | null>(null);
  const [showConverter, setShowConverter] = useState(false);

  // Drawers / Modals
  const [showLayers, setShowLayers] = useState(false);
  const [selectedWaypoint, setSelectedWaypoint] =
    useState<TacticalWaypoint | null>(null);
  const [waypointDraft, setWaypointDraft] = useState<{
    lat: number;
    lon: number;
    name: string;
    category: WaypointCategory;
    notes: string;
    groupId: string;
  } | null>(null);
  const [savingWp, setSavingWp] = useState(false);

  // ---- Offline waypoint storage (localStorage) ----
  const [localWps, setLocalWps] = useState<LocalWp[]>([]);
  useEffect(() => {
    setLocalWps(loadLocalWps());
  }, []);

  const updateLocalWps = (next: LocalWp[]) => {
    setLocalWps(next);
    saveLocalWps(next);
  };

  const allWaypoints = useMemo(
    () => [...waypoints, ...(localWps as unknown as TacticalWaypoint[])],
    [waypoints, localWps]
  );

  const refreshRef = useRef(refreshWaypoints);
  refreshRef.current = refreshWaypoints;
  const syncingRef = useRef(false);

  const syncLocalWps = async () => {
    if (syncingRef.current) return;
    const pending = loadLocalWps();
    if (pending.length === 0) return;
    syncingRef.current = true;
    try {
      const remaining: LocalWp[] = [];
      for (const wp of pending) {
        const { id, ...body } = wp;
        void id;
        try {
          const res = await fetch(apiUrl("/api/waypoints"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) remaining.push(wp);
        } catch {
          remaining.push(wp);
        }
      }
      if (remaining.length !== pending.length) {
        saveLocalWps(remaining);
        setLocalWps(remaining);
        await refreshRef.current();
      }
    } finally {
      syncingRef.current = false;
    }
  };

  useEffect(() => {
    if (isOnline) void syncLocalWps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Measure Tool
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePts, setMeasurePts] = useState<[number, number][]>([]);
  const measureModeRef = useRef(false);
  measureModeRef.current = measureMode;

  // Track if user tapped GPS button to fly once fix arrives
  const pendingFlyToGpsRef = useRef(false);

  // Update graticule overlay
  const updateGraticule = useCallback(
    (map: MapLibreMap, visible: boolean) => {
      const src = map.getSource("graticule") as GeoJSONSource | undefined;
      if (!src) return;
      if (!visible) {
        src.setData({ type: "FeatureCollection", features: [] });
        return;
      }
      const b = map.getBounds();
      src.setData(
        generateGraticuleGeoJSON(
          {
            west: b.getWest(),
            south: b.getSouth(),
            east: b.getEast(),
            north: b.getNorth(),
          },
          map.getZoom()
        )
      );
    },
    []
  );

  // Sync MBTiles overlay layer onto map
  const syncMbtilesLayer = useCallback(
    (map: MapLibreMap, archiveId: string | null, opacity: number) => {
      if (!map.isStyleLoaded()) return;
      if (map.getLayer("mbtiles-active-layer")) {
        map.removeLayer("mbtiles-active-layer");
      }
      if (map.getSource("mbtiles-active")) {
        map.removeSource("mbtiles-active");
      }
      if (!archiveId) return;

      const meta = mbtilesArchives.find((m) => m.id === archiveId);
      map.addSource("mbtiles-active", {
        type: "raster",
        tiles: [`mbtiles://${archiveId}/{z}/{x}/{y}`],
        tileSize: 256,
        minzoom: meta ? Math.max(0, meta.minZoom) : 0,
        maxzoom: meta ? Math.min(20, meta.maxZoom) : 18,
        ...(meta?.bounds ? { bounds: meta.bounds } : {}),
      });
      map.addLayer(
        {
          id: "mbtiles-active-layer",
          type: "raster",
          source: "mbtiles-active",
          paint: {
            "raster-opacity": opacity,
            "raster-fade-duration": 0,
          },
        },
        "graticule-lines"
      );
    },
    [mbtilesArchives]
  );

  const selectBasemap = useCallback((next: BasemapStyleId) => {
    setBasemap(next);
    if (typeof window !== "undefined" && next !== "offline_only") {
      try {
        window.localStorage.setItem("gorgor_basemap", next);
      } catch {
        // ignore storage restrictions
      }
    }
  }, []);

  // Initialize MapLibre instance
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    registerGorgorMapProtocols();

    let savedStyle: BasemapStyleId = "tactical";
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("gorgor_basemap");
      if (
        stored === "tactical" ||
        stored === "satellite" ||
        stored === "hybrid" ||
        stored === "standard" ||
        stored === "topo"
      ) {
        savedStyle = stored;
      }
    }

    const initialBasemap: BasemapStyleId =
      typeof navigator !== "undefined" && !navigator.onLine
        ? "offline_only"
        : savedStyle;
    prevBasemapRef.current = initialBasemap;
    setBasemap(initialBasemap);

    const map = new MapLibreMap({
      container: containerRef.current,
      style: buildBaseStyle(initialBasemap),
      center: lastMapViewport.center,
      zoom: lastMapViewport.zoom,
      attributionControl: { compact: true },
      maxPitch: 60,
    });

    mapRef.current = map;

    const syncViewportState = () => {
      const c = map.getCenter();
      const z = map.getZoom();
      const b = map.getBounds();
      setCenterCoord({ lat: c.lat, lon: c.lng, zoom: z });
      setBearing(map.getBearing());
      setLastMapViewport({
        bounds: [
          Number(b.getWest().toFixed(5)),
          Number(b.getSouth().toFixed(5)),
          Number(b.getEast().toFixed(5)),
          Number(b.getNorth().toFixed(5)),
        ],
        center: [c.lng, c.lat],
        zoom: z,
      });
    };

    map.on("load", () => {
      setMapReady(true);
      syncViewportState();
      updateGraticule(map, true);
    });

    map.on("move", () => {
      const c = map.getCenter();
      setCenterCoord({ lat: c.lat, lon: c.lng, zoom: map.getZoom() });
      setBearing(map.getBearing());
    });

    map.on("moveend", () => {
      syncViewportState();
      updateGraticule(map, showGridRef.current);
    });

    map.on("click", (e) => {
      if (!measureModeRef.current) return;
      setMeasurePts((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
    });

    return () => {
      gpsMarkerRef.current?.remove();
      gpsMarkerRef.current = null;
      searchMarkerRef.current?.remove();
      searchMarkerRef.current = null;
      wpMarkersRef.current.forEach((m) => m.remove());
      wpMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showGridRef = useRef(showGrid);
  showGridRef.current = showGrid;

  // Handle basemap changes cleanly preserving overlays
  const prevBasemapRef = useRef<BasemapStyleId>(basemap);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (prevBasemapRef.current === basemap) return;
    prevBasemapRef.current = basemap;

    map.setStyle(buildBaseStyle(basemap));
    map.once("styledata", () => {
      setStyleVersion((v) => v + 1);
      updateGraticule(map, showGrid);
      syncMbtilesLayer(map, activeMbtilesId, mbtilesOpacity);
      if (map.getLayer("offline-cache-layer")) {
        map.setLayoutProperty(
          "offline-cache-layer",
          "visibility",
          showOfflineTilesOverlay && basemap !== "offline_only"
            ? "visible"
            : "none"
        );
      }
      // Restore GPS accuracy polygon if active
      if (gps.position) {
        const gpsSrc = map.getSource("gps-accuracy") as
          | GeoJSONSource
          | undefined;
        gpsSrc?.setData(
          createAccuracyCircleGeoJSON(
            gps.position.lat,
            gps.position.lon,
            gps.position.accuracy
          )
        );
      }
      // Restore active measurement polyline & vertices across basemap switch
      if (measurePts.length > 0) {
        const measureSrc = map.getSource("measure") as
          | GeoJSONSource
          | undefined;
        const features: GeoJSON.Feature[] = measurePts.map((pt) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: pt },
        }));
        if (measurePts.length >= 2) {
          features.push({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: measurePts },
          });
        }
        measureSrc?.setData({ type: "FeatureCollection", features });
      }
    });
  }, [
    basemap,
    mapReady,
    showGrid,
    activeMbtilesId,
    mbtilesOpacity,
    showOfflineTilesOverlay,
    gps.position,
    measurePts,
    updateGraticule,
    syncMbtilesLayer,
  ]);

  // Toggle graticule visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    updateGraticule(map, showGrid);
  }, [showGrid, mapReady, updateGraticule]);

  // Toggle offline IndexedDB overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;
    if (map.getLayer("offline-cache-layer")) {
      map.setLayoutProperty(
        "offline-cache-layer",
        "visibility",
        showOfflineTilesOverlay && basemap !== "offline_only"
          ? "visible"
          : "none"
      );
    }
  }, [showOfflineTilesOverlay, basemap, mapReady]);

  // Sync active imported .mbtiles layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.isStyleLoaded()) {
      syncMbtilesLayer(map, activeMbtilesId, mbtilesOpacity);
    } else {
      map.once("idle", () =>
        syncMbtilesLayer(map, activeMbtilesId, mbtilesOpacity)
      );
    }
  }, [activeMbtilesId, mbtilesOpacity, mapReady, syncMbtilesLayer]);

  // Render real GPS position marker & geodesic accuracy circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const accSrc = map.getSource("gps-accuracy") as GeoJSONSource | undefined;
    if (!gps.position) {
      accSrc?.setData({ type: "FeatureCollection", features: [] });
      gpsMarkerRef.current?.remove();
      gpsMarkerRef.current = null;
      return;
    }

    accSrc?.setData(
      createAccuracyCircleGeoJSON(
        gps.position.lat,
        gps.position.lon,
        gps.position.accuracy
      )
    );

    if (!gpsMarkerRef.current) {
      const el = document.createElement("div");
      el.className =
        "w-5 h-5 rounded-full bg-[#2D8CFF] border-[3px] border-white shadow-[0_0_0_5px_rgba(45,140,255,0.35)]";
      el.title = `GPS: ${gps.position.mgrs}`;
      gpsMarkerRef.current = new Marker({ element: el })
        .setLngLat([gps.position.lon, gps.position.lat])
        .addTo(map);
    } else {
      gpsMarkerRef.current.setLngLat([gps.position.lon, gps.position.lat]);
    }

    if (pendingFlyToGpsRef.current) {
      pendingFlyToGpsRef.current = false;
      map.flyTo({
        center: [gps.position.lon, gps.position.lat],
        zoom: Math.max(map.getZoom(), 15),
        duration: 900,
      });
    }
  }, [gps.position, mapReady]);

  // Surface real GPS errors when user taps GPS button
  useEffect(() => {
    if (!pendingFlyToGpsRef.current) return;
    if (gps.status === "denied") {
      pendingFlyToGpsRef.current = false;
      showToast(t.dashboard.gpsDenied);
    } else if (gps.status === "timeout") {
      pendingFlyToGpsRef.current = false;
      showToast(t.dashboard.gpsTimeout);
    } else if (
      gps.status === "unavailable" ||
      gps.status === "position_unavailable" ||
      gps.status === "insecure_context"
    ) {
      pendingFlyToGpsRef.current = false;
      showToast(t.dashboard.gpsPosUnavailable);
    }
  }, [gps.status, showToast, t.dashboard]);

  // Render saved tactical waypoints on MapLibre
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    wpMarkersRef.current.forEach((m) => m.remove());
    wpMarkersRef.current = [];

    if (!showWaypoints) return;

    for (const wp of allWaypoints) {
      const color = WAYPOINT_COLORS[wp.category] || "#2D8CFF";
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", wp.name);
      el.style.cssText = `
        display:flex;align-items:center;gap:5px;
        padding:3px 7px 3px 5px;border-radius:8px;
        background:rgba(7,17,32,0.92);color:#fff;
        border:1.5px solid ${color};
        box-shadow:0 3px 10px rgba(0,0,0,0.5);
        font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;
      `;
      const dot = document.createElement("span");
      dot.style.cssText = `width:8px;height:8px;border-radius:2px;transform:rotate(45deg);background:${color};flex-shrink:0;`;
      const lbl = document.createElement("span");
      const isLocal = String(wp.id).startsWith("local-");
      lbl.textContent =
        (isLocal ? "⏳ " : "") +
        (wp.name.length > 18 ? wp.name.slice(0, 17) + "…" : wp.name);
      el.appendChild(dot);
      el.appendChild(lbl);

      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setSelectedWaypoint(wp);
        map.flyTo({
          center: [wp.lon, wp.lat],
          zoom: Math.max(map.getZoom(), 13.5),
          duration: 600,
        });
      });

      const marker = new Marker({ element: el, anchor: "bottom" })
        .setLngLat([wp.lon, wp.lat])
        .addTo(map);
      wpMarkersRef.current.push(marker);
    }
  }, [allWaypoints, showWaypoints, mapReady]);

  // Render measurement polyline & points
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource("measure") as GeoJSONSource | undefined;
    if (!src) return;

    const features: GeoJSON.Feature[] = measurePts.map((pt) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: pt },
    }));
    if (measurePts.length >= 2) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: measurePts },
      });
    }
    src.setData({ type: "FeatureCollection", features });
  }, [measurePts, mapReady]);

  const measureStats = useMemo(() => {
    if (measurePts.length < 2) return null;
    let total = 0;
    let lastBearing = 0;
    let lastMils = 0;
    for (let i = 1; i < measurePts.length; i++) {
      const [lon1, lat1] = measurePts[i - 1];
      const [lon2, lat2] = measurePts[i];
      const seg = computeDistanceAndBearing(lat1, lon1, lat2, lon2);
      total += seg.distanceMeters;
      lastBearing = seg.bearingDeg;
      lastMils = seg.bearingMils;
    }
    return { total, lastBearing, lastMils };
  }, [measurePts]);

  // Live range lines: GPS -> crosshair (blue) and GPS -> target (magenta)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource("range") as GeoJSONSource | undefined;
    if (!src) return;

    const labels = rangeLabelsRef.current;
    const features: GeoJSON.Feature[] = [];
    const keep = { pointer: false, target: false };

    const upsertLine = (
      key: "pointer" | "target",
      a: { lat: number; lon: number },
      b: { lat: number; lon: number },
      color: string
    ) => {
      const r = computeDistanceAndBearing(a.lat, a.lon, b.lat, b.lon);
      features.push({
        type: "Feature",
        properties: { kind: key },
        geometry: {
          type: "LineString",
          coordinates: [
            [a.lon, a.lat],
            [b.lon, b.lat],
          ],
        },
      });
      const mid: [number, number] = [(a.lon + b.lon) / 2, (a.lat + b.lat) / 2];
      let mk = labels[key];
      if (!mk) {
        const el = document.createElement("div");
        el.style.cssText = `padding:2px 6px;border-radius:6px;background:rgba(255,255,255,0.93);color:${color};font-size:11px;font-weight:700;white-space:nowrap;pointer-events:none;`;
        mk = new Marker({ element: el }).setLngLat(mid).addTo(map);
        labels[key] = mk;
      }
      mk.getElement().textContent = `${formatDistance(
        r.distanceMeters
      )} · ${Math.round(r.bearingDeg)}°`;
      mk.setLngLat(mid);
      keep[key] = true;
    };

    if (gps.position) {
      const me = { lat: gps.position.lat, lon: gps.position.lon };
      const c = { lat: centerCoord.lat, lon: centerCoord.lon };
      const d = computeDistanceAndBearing(me.lat, me.lon, c.lat, c.lon);
      if (d.distanceMeters > 5) upsertLine("pointer", me, c, "#1D6FE0");
      if (target) upsertLine("target", me, target, "#C2188A");
    }
    if (target) {
      features.push({
        type: "Feature",
        properties: { kind: "target-point" },
        geometry: { type: "Point", coordinates: [target.lon, target.lat] },
      });
    }

    (["pointer", "target"] as const).forEach((k) => {
      if (!keep[k] && labels[k]) {
        labels[k]!.remove();
        delete labels[k];
      }
    });
    src.setData({ type: "FeatureCollection", features });
  }, [
    gps.position,
    centerCoord.lat,
    centerCoord.lon,
    target,
    mapReady,
    styleVersion,
  ]);

  // Place search target marker and optional MGRS grid cell polygon
  const focusParsedCoordinate = useCallback(
    (coord: ParsedCoordinate, label?: string) => {
      const map = mapRef.current;
      if (!map) return;

      searchMarkerRef.current?.remove();
      const el = document.createElement("div");
      el.style.cssText = `
        width:26px;height:26px;border-radius:9999px;
        border:2.5px solid #2D8CFF;background:rgba(45,140,255,0.22);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 16px rgba(45,140,255,0.65);
      `;
      const core = document.createElement("div");
      core.style.cssText = `width:8px;height:8px;border-radius:9999px;background:#FFFFFF;`;
      el.title = label || coord.mgrs;
      el.appendChild(core);

      searchMarkerRef.current = new Marker({ element: el })
        .setLngLat([coord.lon, coord.lat])
        .addTo(map);

      const bboxSrc = map.getSource("search-bbox") as GeoJSONSource | undefined;
      if (bboxSrc) {
        if (coord.bbox && coord.precisionMeters >= 100) {
          const [w, s, e, n] = coord.bbox;
          bboxSrc.setData({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [w, s],
                      [e, s],
                      [e, n],
                      [w, n],
                      [w, s],
                    ],
                  ],
                },
              },
            ],
          });
        } else {
          bboxSrc.setData({ type: "FeatureCollection", features: [] });
        }
      }

      const targetZoom =
        coord.precisionMeters >= 10000
          ? 10
          : coord.precisionMeters >= 1000
          ? 13
          : coord.precisionMeters >= 100
          ? 15
          : 15.5;

      map.flyTo({
        center: [coord.lon, coord.lat],
        zoom: targetZoom,
        duration: 850,
      });
    },
    []
  );

  // React to cross-screen jumpToMap requests (from Dashboard, Offline Manager, or Chat Pins)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !mapFocus) return;

    if (mapFocus.openSearch) {
      setShowConverter(true);
      clearMapFocus();
      return;
    }

    if (mapFocus.activateMbtilesId && !isOnline) {
      setBasemap("offline_only");
    } else if (mapFocus.activateOfflineRegionId && !isOnline) {
      setBasemap("offline_only");
    } else if (mapFocus.preferredBasemap) {
      selectBasemap(mapFocus.preferredBasemap);
    }

    if (mapFocus.bounds) {
      const [w, s, e, n] = mapFocus.bounds;
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 48, maxZoom: 15, duration: 850 }
      );
    } else {
      const synthetic: ParsedCoordinate = {
        lat: mapFocus.lat,
        lon: mapFocus.lon,
        detectedFormat: "MGRS",
        mgrs: mapFocus.mgrs || formatMGRS(mapFocus.lat, mapFocus.lon, 5),
        mgrs1km: formatMGRS(mapFocus.lat, mapFocus.lon, 2),
        dms: formatDMS(mapFocus.lat, mapFocus.lon),
        dd: formatDD(mapFocus.lat, mapFocus.lon),
        precisionMeters: 1,
      };
      setParsedCoord(synthetic);
      focusParsedCoordinate(synthetic, mapFocus.label);
      if (mapFocus.zoom) {
        map.flyTo({
          center: [mapFocus.lon, mapFocus.lat],
          zoom: mapFocus.zoom,
          duration: 850,
        });
      }
    }

    clearMapFocus();
  }, [
    mapFocus,
    mapReady,
    clearMapFocus,
    focusParsedCoordinate,
    isOnline,
    selectBasemap,
  ]);

  // Execute MGRS / DMS / DD Search
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = parseCoordinateInput(searchQuery);
    if (!res.ok) {
      const errKey = `err_${res.errorCode}` as keyof typeof t.map;
      setSearchError(t.map[errKey] as string);
      setParsedCoord(null);
      return;
    }
    setSearchError(null);
    setParsedCoord(res.data);
    focusParsedCoordinate(res.data);
  };

  const handleSearchInputChange = (val: string) => {
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchError(null);
      setParsedCoord(null);
      return;
    }
    const res = parseCoordinateInput(val);
    if (res.ok) {
      setSearchError(null);
      setParsedCoord(res.data);
    } else if (showConverter) {
      const errKey = `err_${res.errorCode}` as keyof typeof t.map;
      setSearchError(t.map[errKey] as string);
      setParsedCoord(null);
    }
  };

  const handleLocateGps = () => {
    if (gps.position && mapRef.current) {
      mapRef.current.flyTo({
        center: [gps.position.lon, gps.position.lat],
        zoom: Math.max(mapRef.current.getZoom(), 15),
        duration: 800,
      });
    } else {
      pendingFlyToGpsRef.current = true;
    }
    gps.acquireOnce();
  };

  const cycleCoordFormat = () => {
    const order: CoordFormat[] = ["MGRS", "DMS", "DD"];
    const next = order[(order.indexOf(coordFormat) + 1) % order.length];
    setCoordFormat(next);
  };

  const openWaypointModalAt = (lat: number, lon: number, defaultName = "") => {
    setWaypointDraft({
      lat,
      lon,
      name: defaultName,
      category: "rally",
      notes: "",
      groupId: groups[0]?.id ?? "",
    });
  };

  const handleSaveWaypoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waypointDraft || !waypointDraft.name.trim()) return;
    setSavingWp(true);
    const payload = {
      name: waypointDraft.name.trim(),
      category: waypointDraft.category,
      notes: waypointDraft.notes.trim(),
      lat: waypointDraft.lat,
      lon: waypointDraft.lon,
      groupId: waypointDraft.groupId || null,
    };
    try {
      const res = await fetch(apiUrl("/api/waypoints"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save_failed");
      await refreshWaypoints();
      showToast(t.app.save + " ✓");
      void syncLocalWps();
    } catch {
      updateLocalWps([...localWps, { id: `local-${Date.now()}`, ...payload }]);
      showToast("Waa la kaydiyay taleefanka (offline) ⏳");
    } finally {
      setWaypointDraft(null);
      setSavingWp(false);
    }
  };

  const handleDeleteWaypoint = async (wp: TacticalWaypoint) => {
    if (String(wp.id).startsWith("local-")) {
      updateLocalWps(localWps.filter((w) => w.id !== String(wp.id)));
      setSelectedWaypoint(null);
      return;
    }
    const res = await fetch(apiUrl(`/api/waypoints/${wp.id}`), {
      method: "DELETE",
    });
    if (res.ok) {
      setSelectedWaypoint(null);
      await refreshWaypoints();
    }
  };

  const refOrigin = gps.position
    ? { lat: gps.position.lat, lon: gps.position.lon }
    : { lat: centerCoord.lat, lon: centerCoord.lon };

  const parsedRange = parsedCoord
    ? computeDistanceAndBearing(
        refOrigin.lat,
        refOrigin.lon,
        parsedCoord.lat,
        parsedCoord.lon
      )
    : null;

  const crosshairReadout = formatByPreference(
    centerCoord.lat,
    centerCoord.lon,
    coordFormat
  );

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#071120] select-none">
      {/* MapLibre Canvas Container */}
      <div
        ref={containerRef}
        className={`w-full h-full ${
          basemap === "tactical" ? "gorgor-map-tactical" : ""
        }`}
      />

      {/* Center Tactical Precision Crosshair Reticle */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center z-10"
        aria-hidden="true"
      >
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <circle
            cx="22"
            cy="22"
            r="11"
            stroke="#2D8CFF"
            strokeWidth="1.5"
            strokeOpacity="0.85"
          />
          <path
            d="M22 3V14M22 30V41M3 22H14M30 22H41"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeOpacity="0.9"
          />
          <circle cx="22" cy="22" r="2" fill="#2D8CFF" />
        </svg>
      </div>

      {/* Top Floating MGRS / DMS Coordinate Search Bar */}
      <div className="absolute top-3 left-3 right-3 z-20 max-w-2xl">
        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center gap-1.5 rounded-2xl bg-[#071120]/92 backdrop-blur-md border border-[#94B8E8]/24 focus-within:border-[#2D8CFF] px-2.5 py-1.5 shadow-xl"
        >
          <Search className="w-4 h-4 text-[#53A4FF] shrink-0 ml-1" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            placeholder={t.map.searchPlaceholder}
            aria-label={t.map.searchPlaceholder}
            className="flex-1 min-w-0 h-9 bg-transparent text-xs sm:text-sm font-mono-grid text-white placeholder:text-[#7F95B2] placeholder:font-sans focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchError(null);
                setParsedCoord(null);
                searchMarkerRef.current?.remove();
                searchMarkerRef.current = null;
                const src = mapRef.current?.getSource("search-bbox") as
                  | GeoJSONSource
                  | undefined;
                src?.setData({ type: "FeatureCollection", features: [] });
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7F95B2] hover:text-white"
              aria-label={t.app.close}
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            className="min-h-[38px] px-3 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] text-xs font-semibold text-white shrink-0 transition-colors"
          >
            {t.map.searchBtn}
          </button>
          <button
            type="button"
            onClick={() => setShowConverter((v) => !v)}
            title={t.map.converterTitle}
            className={`min-h-[38px] min-w-[38px] px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1 shrink-0 transition-colors ${
              showConverter
                ? "bg-[#2D8CFF]/25 border-[#2D8CFF] text-white"
                : "bg-[#132642] border-[#94B8E8]/20 text-[#B8C7DC] hover:text-white"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.map.converterBtn}</span>
          </button>
        </form>

        {/* Inline search validation error */}
        {searchError && !showConverter && (
          <div className="mt-1.5 px-3 py-2 rounded-xl bg-[#0D1B30]/95 border border-red-400/40 text-xs text-red-200 shadow-lg">
            {searchError}
          </div>
        )}

        {/* Quick parsed coordinate result pill */}
        {parsedCoord && !showConverter && (
          <div className="mt-1.5 p-2.5 rounded-xl bg-[#0D1B30]/95 backdrop-blur-md border border-[#2D8CFF]/45 shadow-xl flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 text-xs font-mono-grid">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-[#2D8CFF]/20 text-[#53A4FF] text-[10px] font-bold">
                  {parsedCoord.detectedFormat}
                </span>
                <span className="font-semibold text-white">
                  {parsedCoord.mgrs}
                </span>
              </div>
              <div className="text-[11px] text-[#B8C7DC] mt-0.5">
                {parsedCoord.dms}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  openWaypointModalAt(
                    parsedCoord.lat,
                    parsedCoord.lon,
                    parsedCoord.mgrs
                  )
                }
                className="min-h-[36px] px-2.5 rounded-lg bg-[#132642] hover:bg-[#2D8CFF] text-xs font-medium text-white flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t.map.markCenter}
              </button>
              <button
                type="button"
                onClick={() =>
                  setTarget({ lat: parsedCoord.lat, lon: parsedCoord.lon })
                }
                className="min-h-[36px] px-2.5 rounded-lg bg-[#132642] hover:bg-[#D6249F] text-xs font-medium text-white flex items-center gap-1 transition-colors"
              >
                <Flag className="w-3.5 h-3.5" />
                Hadaf
              </button>
              <button
                type="button"
                onClick={() =>
                  shareCoordToComms({
                    lat: parsedCoord.lat,
                    lon: parsedCoord.lon,
                    mgrs: parsedCoord.mgrs,
                    label: parsedCoord.mgrs,
                  })
                }
                className="min-h-[36px] px-2.5 rounded-lg bg-[#132642] hover:bg-[#2D8CFF] text-xs font-medium text-white flex items-center gap-1 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                {t.app.share}
              </button>
            </div>
          </div>
        )}

        {/* Active Measure Banner */}
        {measureMode && (
          <div className="mt-2 p-2.5 rounded-xl bg-[#0D1B30]/95 backdrop-blur-md border border-[#2D8CFF]/50 shadow-xl flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs">
              <div className="font-semibold text-[#53A4FF]">
                {t.map.measureActive}
              </div>
              {measureStats && (
                <div className="font-mono-grid text-white mt-0.5">
                  {t.map.totalDistance}:{" "}
                  <strong>{formatDistance(measureStats.total)}</strong> ·{" "}
                  {t.map.azimuth}:{" "}
                  <strong>
                    {Math.round(measureStats.lastBearing)
                      .toString()
                      .padStart(3, "0")}
                    ° ({measureStats.lastMils} mil)
                  </strong>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {gps.position && (
                <button
                  type="button"
                  onClick={() =>
                    setMeasurePts([[gps.position!.lon, gps.position!.lat]])
                  }
                  className="min-h-[36px] px-2.5 rounded-lg bg-[#132642] text-xs text-[#B8C7DC] hover:text-white"
                >
                  A = GPS
                </button>
              )}
              {parsedCoord && (
                <button
                  type="button"
                  onClick={() =>
                    setMeasurePts((prev) => [
                      ...prev,
                      [parsedCoord.lon, parsedCoord.lat],
                    ])
                  }
                  className="min-h-[36px] px-2.5 rounded-lg bg-[#132642] text-xs text-[#B8C7DC] hover:text-white"
                >
                  + Target
                </button>
              )}
              <button
                type="button"
                onClick={() => setMeasurePts([])}
                className="min-h-[36px] px-2.5 rounded-lg bg-[#132642] text-xs text-[#B8C7DC] hover:text-white"
              >
                {t.map.measureClear}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMeasureMode(false);
                  setMeasurePts([]);
                }}
                className="min-h-[36px] px-3 rounded-lg bg-[#2D8CFF] text-xs font-semibold text-white"
              >
                {t.map.measureDone}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right-Edge Tactical Floating Action Controls (48dp Android friendly) */}
      <div className="absolute right-3 top-20 z-20 flex flex-col gap-2">
        {/* Real GPS Acquire / Center */}
        <button
          type="button"
          onClick={handleLocateGps}
          title={t.dashboard.acquireGps}
          aria-label={t.dashboard.acquireGps}
          className={`w-11 h-11 rounded-xl backdrop-blur-md border shadow-lg flex items-center justify-center transition-colors ${
            gps.status === "active"
              ? "bg-[#2D8CFF] border-white/30 text-white"
              : gps.status === "requesting"
              ? "bg-amber-500/25 border-amber-400 text-amber-200 animate-pulse"
              : "bg-[#071120]/90 border-[#94B8E8]/25 text-white hover:border-[#2D8CFF]"
          }`}
        >
          <Navigation className="w-5 h-5" />
        </button>

        {/* Compass / Reset North */}
        <button
          type="button"
          onClick={() => mapRef.current?.resetNorthPitch({ duration: 400 })}
          title="North Up"
          aria-label="Reset North"
          className="w-11 h-11 rounded-xl bg-[#071120]/90 backdrop-blur-md border border-[#94B8E8]/25 hover:border-[#2D8CFF] text-white shadow-lg flex items-center justify-center transition-colors"
        >
          <Compass
            className="w-5 h-5 text-[#53A4FF]"
            style={{ transform: `rotate(${-bearing}deg)` }}
          />
        </button>

        {/* 1-Tap Satellite Map Toggle (Khariidadda Dayax-gacmeedka) */}
        <button
          type="button"
          onClick={() => {
            if (basemap === "satellite") {
              selectBasemap("hybrid");
              showToast(t.map.styleHybrid);
            } else if (basemap === "hybrid") {
              selectBasemap("tactical");
              showToast(t.map.styleTactical);
            } else {
              selectBasemap("satellite");
              showToast(t.map.styleSatellite);
            }
          }}
          title={t.map.styleSatellite}
          aria-label={t.map.styleSatellite}
          className={`w-11 h-11 rounded-xl backdrop-blur-md border shadow-lg flex items-center justify-center transition-colors ${
            basemap === "satellite" || basemap === "hybrid"
              ? "bg-[#2D8CFF] border-white/35 text-white"
              : "bg-[#071120]/90 border-[#94B8E8]/25 text-white hover:border-[#2D8CFF]"
          }`}
        >
          <Satellite className="w-5 h-5" />
        </button>

        {/* Layers & MBTiles Switcher */}
        <button
          type="button"
          onClick={() => setShowLayers((v) => !v)}
          title={t.map.layersTitle}
          aria-label={t.map.layersTitle}
          className={`w-11 h-11 rounded-xl backdrop-blur-md border shadow-lg flex items-center justify-center transition-colors ${
            showLayers || activeMbtilesId
              ? "bg-[#2D8CFF] border-white/30 text-white"
              : "bg-[#071120]/90 border-[#94B8E8]/25 text-white hover:border-[#2D8CFF]"
          }`}
        >
          <Layers className="w-5 h-5" />
        </button>

        {/* Toggle MGRS Graticule */}
        <button
          type="button"
          onClick={() => setShowGrid((v) => !v)}
          title={t.map.gridOverlay}
          aria-label={t.map.gridOverlay}
          className={`w-11 h-11 rounded-xl backdrop-blur-md border shadow-lg flex items-center justify-center transition-colors ${
            showGrid
              ? "bg-[#132642] border-[#2D8CFF] text-[#53A4FF]"
              : "bg-[#071120]/90 border-[#94B8E8]/25 text-[#B8C7DC]"
          }`}
        >
          <Grid className="w-5 h-5" />
        </button>

        {/* Range & Azimuth Ruler */}
        <button
          type="button"
          onClick={() => {
            setMeasureMode((v) => {
              if (v) setMeasurePts([]);
              return !v;
            });
          }}
          title={t.map.measureTool}
          aria-label={t.map.measureTool}
          className={`w-11 h-11 rounded-xl backdrop-blur-md border shadow-lg flex items-center justify-center transition-colors ${
            measureMode
              ? "bg-[#2D8CFF] border-white/30 text-white"
              : "bg-[#071120]/90 border-[#94B8E8]/25 text-white hover:border-[#2D8CFF]"
          }`}
        >
          <Ruler className="w-5 h-5" />
        </button>

        {/* Hadaf (Target): tap = set at crosshair, tap again = clear */}
        <button
          type="button"
          onClick={() => {
            if (target) setTarget(null);
            else {
              setTarget({ lat: centerCoord.lat, lon: centerCoord.lon });
              showToast("Hadaf waa la dejiyay");
            }
          }}
          title="Hadaf (Target)"
          aria-label="Hadaf (Target)"
          className={`w-11 h-11 rounded-xl backdrop-blur-md border shadow-lg flex items-center justify-center transition-colors ${
            target
              ? "bg-[#D6249F] border-white/30 text-white"
              : "bg-[#071120]/90 border-[#94B8E8]/25 text-white hover:border-[#D6249F]"
          }`}
        >
          <Flag className="w-5 h-5" />
        </button>

        {/* Zoom Controls */}
        <div className="hidden sm:flex flex-col rounded-xl bg-[#071120]/90 backdrop-blur-md border border-[#94B8E8]/25 overflow-hidden shadow-lg">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
            aria-label="Zoom in"
            className="w-11 h-10 flex items-center justify-center text-white hover:bg-[#132642] border-b border-[#94B8E8]/15"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
            aria-label="Zoom out"
            className="w-11 h-10 flex items-center justify-center text-white hover:bg-[#132642]"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Live Crosshair Coordinate HUD Strip */}
      <div className="absolute left-3 right-3 bottom-3 z-20 flex items-center justify-between gap-2 rounded-2xl bg-[#071120]/92 backdrop-blur-md border border-[#94B8E8]/24 px-3 py-2 shadow-xl max-w-2xl">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={cycleCoordFormat}
            className="min-h-[34px] px-2 rounded-lg bg-[#2D8CFF]/20 border border-[#2D8CFF]/45 text-[11px] font-mono-grid font-bold text-[#53A4FF] shrink-0"
          >
            {coordFormat}
          </button>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-mono-grid font-semibold text-white truncate">
              {crosshairReadout}
            </div>
            <div className="text-[10px] font-mono-grid text-[#7F95B2]">
              {t.map.zoom} {centerCoord.zoom.toFixed(1)}
              {basemap === "satellite"
                ? ` · ${t.map.styleSatellite.toUpperCase()}`
                : basemap === "hybrid"
                ? ` · ${t.map.styleHybrid.toUpperCase()}`
                : basemap === "topo"
                ? " · TOPO"
                : basemap === "offline_only"
                ? " · OFFLINE"
                : ""}
              {activeMbtilesId ? " · MBTILES" : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => copyText(crosshairReadout)}
            aria-label={t.dashboard.copyGrid}
            className="w-9 h-9 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 flex items-center justify-center text-[#B8C7DC] hover:text-white"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              openWaypointModalAt(centerCoord.lat, centerCoord.lon, "")
            }
            className="min-h-[36px] px-2.5 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] text-xs font-semibold text-white flex items-center gap-1"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{t.map.markCenter}</span>
          </button>
        </div>
      </div>

      {/* MGRS / DMS Coordinate Converter Modal / Sheet */}
      {showConverter && (
        <div className="absolute inset-0 z-30 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/22 p-5 shadow-2xl max-h-[85dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-[#2D8CFF]" />
                {t.map.converterTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowConverter(false)}
                className="w-9 h-9 rounded-xl bg-[#132642] flex items-center justify-center text-[#B8C7DC] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#B8C7DC] mb-3">{t.map.converterDesc}</p>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              placeholder="38N NH 38210 25165  |  02°02'13.6&quot;N 045°20'37.0&quot;E"
              className="w-full min-h-[48px] px-3.5 rounded-xl bg-[#071120] border border-[#2D8CFF]/45 text-sm font-mono-grid text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
            />

            {/* Quick Format Preset Chips */}
            <div className="mt-3">
              <div className="text-[11px] text-[#7F95B2] mb-1.5">
                {t.map.examples}:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COORD_EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => handleSearchInputChange(ex.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/18 text-[11px] font-mono-grid text-[#B8C7DC] hover:text-white"
                  >
                    {ex.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    handleSearchInputChange(
                      formatMGRS(centerCoord.lat, centerCoord.lon, 5)
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-[#2D8CFF]/15 border border-[#2D8CFF]/35 text-[11px] font-mono-grid text-[#53A4FF]"
                >
                  {t.map.crosshairGrid}
                </button>
              </div>
            </div>

            {searchError && (
              <div className="mt-3 p-3 rounded-xl bg-red-500/12 border border-red-400/35 text-xs text-red-200">
                {searchError}
              </div>
            )}

            {parsedCoord && (
              <div className="mt-4 space-y-2 rounded-xl bg-[#071120] border border-[#94B8E8]/16 p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#7F95B2]">{t.map.detectedFormat}</span>
                  <span className="font-mono-grid font-semibold text-[#53A4FF]">
                    {parsedCoord.detectedFormat} (±{parsedCoord.precisionMeters}
                    m)
                  </span>
                </div>
                {[
                  { label: "MGRS (1m)", val: parsedCoord.mgrs },
                  { label: "MGRS (1km)", val: parsedCoord.mgrs1km },
                  { label: "DMS", val: parsedCoord.dms },
                  { label: "Decimal", val: parsedCoord.dd },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-2 pt-2 border-t border-[#94B8E8]/10"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] text-[#7F95B2] uppercase">
                        {row.label}
                      </div>
                      <div className="text-xs sm:text-sm font-mono-grid text-white break-all">
                        {row.val}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(row.val)}
                      className="w-8 h-8 rounded-lg bg-[#132642] flex items-center justify-center text-[#53A4FF] shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {parsedRange && (
                  <div className="pt-2 border-t border-[#94B8E8]/10 flex items-center justify-between text-xs">
                    <span className="text-[#7F95B2]">
                      {t.map.rangeFromCenter}
                    </span>
                    <span className="font-mono-grid text-white">
                      {formatDistance(parsedRange.distanceMeters)} @{" "}
                      {Math.round(parsedRange.bearingDeg)
                        .toString()
                        .padStart(3, "0")}
                      ° ({parsedRange.bearingMils} mil)
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      focusParsedCoordinate(parsedCoord);
                      setShowConverter(false);
                    }}
                    className="min-h-[44px] rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] text-xs font-semibold text-white"
                  >
                    {t.map.flyToPoint}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowConverter(false);
                      openWaypointModalAt(
                        parsedCoord.lat,
                        parsedCoord.lon,
                        parsedCoord.mgrs
                      );
                    }}
                    className="min-h-[44px] rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 text-xs font-semibold text-white"
                  >
                    {t.map.saveWaypoint}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowConverter(false);
                      shareCoordToComms({
                        lat: parsedCoord.lat,
                        lon: parsedCoord.lon,
                        mgrs: parsedCoord.mgrs,
                        label: parsedCoord.mgrs,
                      });
                    }}
                    className="min-h-[44px] rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 text-xs font-semibold text-white"
                  >
                    {t.map.sendToComms}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Map Layers & MBTiles Drawer */}
      {showLayers && (
        <div className="absolute inset-0 z-30 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/22 p-5 shadow-2xl max-h-[85dvh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#2D8CFF]" />
                {t.map.layersTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowLayers(false)}
                className="w-9 h-9 rounded-xl bg-[#132642] flex items-center justify-center text-[#B8C7DC] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Basemap Selector (Options A–F including Satellite Map / Khariidadda Dayax-gacmeedka) */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#7F95B2] mb-2">
                {t.map.basemaps}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      id: "tactical",
                      tag: "A",
                      title: t.map.styleTactical,
                      sub: t.map.styleTacticalSub,
                      isSat: false,
                    },
                    {
                      id: "satellite",
                      tag: "B",
                      title: t.map.styleSatellite,
                      sub: t.map.styleSatelliteSub,
                      isSat: true,
                    },
                    {
                      id: "hybrid",
                      tag: "B+",
                      title: t.map.styleHybrid,
                      sub: t.map.styleHybridSub,
                      isSat: true,
                    },
                    {
                      id: "standard",
                      tag: "C",
                      title: t.map.styleStandard,
                      sub: t.map.styleStandardSub,
                      isSat: false,
                    },
                    {
                      id: "topo",
                      tag: "D",
                      title: t.map.styleTopo,
                      sub: t.map.styleTopoSub,
                      isSat: false,
                    },
                    {
                      id: "offline_only",
                      tag: "OFF",
                      title: t.map.styleOfflineOnly,
                      sub: t.map.styleOfflineOnlySub,
                      isSat: false,
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectBasemap(item.id)}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      basemap === item.id
                        ? "bg-[#2D8CFF]/22 border-[#2D8CFF] text-white shadow-sm shadow-[#2D8CFF]/20"
                        : "bg-[#071120] border-[#94B8E8]/15 text-[#B8C7DC] hover:border-[#2D8CFF]/45"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <span
                        className={`text-[10px] font-mono-grid font-bold px-1.5 py-0.5 rounded ${
                          basemap === item.id
                            ? "bg-[#2D8CFF] text-white"
                            : "bg-[#132642] text-[#53A4FF]"
                        }`}
                      >
                        {item.tag}
                      </span>
                      {item.isSat && (
                        <Satellite className="w-3.5 h-3.5 text-[#53A4FF] shrink-0" />
                      )}
                    </div>
                    <div className="text-xs font-semibold text-white leading-tight">
                      {item.title}
                    </div>
                    <div className="text-[10px] text-[#7F95B2] mt-0.5 leading-snug">
                      {item.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Overlays */}
            <div className="space-y-2 pt-2 border-t border-[#94B8E8]/14">
              <label className="flex items-center justify-between min-h-[44px] px-3 rounded-xl bg-[#071120] border border-[#94B8E8]/12 cursor-pointer">
                <span className="text-xs font-medium text-white">
                  {t.map.gridOverlay}
                </span>
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(e) => setShowGrid(e.target.checked)}
                  className="w-4 h-4 accent-[#2D8CFF]"
                />
              </label>

              <label className="flex items-center justify-between min-h-[44px] px-3 rounded-xl bg-[#071120] border border-[#94B8E8]/12 cursor-pointer">
                <span className="text-xs font-medium text-white">
                  {t.map.waypointsOverlay} ({waypoints.length})
                </span>
                <input
                  type="checkbox"
                  checked={showWaypoints}
                  onChange={(e) => setShowWaypoints(e.target.checked)}
                  className="w-4 h-4 accent-[#2D8CFF]"
                />
              </label>

              <label className="flex items-center justify-between min-h-[44px] px-3 rounded-xl bg-[#071120] border border-[#94B8E8]/12 cursor-pointer">
                <span className="text-xs font-medium text-white">
                  {t.map.offlineRegionsOverlay} ({offlineRegions.length})
                </span>
                <input
                  type="checkbox"
                  checked={showOfflineTilesOverlay}
                  onChange={(e) => setShowOfflineTilesOverlay(e.target.checked)}
                  className="w-4 h-4 accent-[#2D8CFF]"
                />
              </label>
            </div>

            {/* Imported MBTiles Layer Selector */}
            <div className="pt-2 border-t border-[#94B8E8]/14">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#7F95B2] mb-2">
                {t.map.mbtilesOverlay}
              </div>
              {mbtilesArchives.length === 0 ? (
                <p className="text-xs text-[#7F95B2]">{t.map.noMbtilesYet}</p>
              ) : (
                <div className="space-y-2">
                  <select
                    value={activeMbtilesId ?? ""}
                    onChange={(e) =>
                      setActiveMbtilesId(e.target.value || null)
                    }
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#071120] border border-[#94B8E8]/20 text-xs text-white"
                  >
                    <option value="">{t.map.noneActive}</option>
                    {mbtilesArchives.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (z{m.minZoom}–{m.maxZoom}, {m.tileCount} tiles)
                      </option>
                    ))}
                  </select>

                  {activeMbtilesId && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-[#B8C7DC]">
                        <span>{t.map.opacity}</span>
                        <span className="font-mono-grid">
                          {Math.round(mbtilesOpacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.2}
                        max={1}
                        step={0.05}
                        value={mbtilesOpacity}
                        onChange={(e) =>
                          setMbtilesOpacity(Number(e.target.value))
                        }
                        className="w-full accent-[#2D8CFF]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const meta = mbtilesArchives.find(
                            (m) => m.id === activeMbtilesId
                          );
                          if (meta?.bounds && mapRef.current) {
                            mapRef.current.fitBounds(
                              [
                                [meta.bounds[0], meta.bounds[1]],
                                [meta.bounds[2], meta.bounds[3]],
                              ],
                              { padding: 40, duration: 700 }
                            );
                            setShowLayers(false);
                          }
                        }}
                        className="w-full min-h-[40px] rounded-xl bg-[#132642] hover:bg-[#2D8CFF] text-xs font-semibold text-white transition-colors"
                      >
                        {t.map.flyToBounds}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Cache Current Map View Offline */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#94B8E8]/14">
              <button
                type="button"
                onClick={() => {
                  setShowLayers(false);
                  const offlineSrc =
                    basemap === "satellite" || basemap === "hybrid"
                      ? "satellite"
                      : basemap === "topo"
                      ? "topo"
                      : "standard";
                  sendViewportToOffline(lastMapViewport.bounds, offlineSrc);
                }}
                className="min-h-[44px] px-3 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] text-xs font-semibold text-white flex items-center justify-center gap-1.5"
              >
                <HardDriveDownload className="w-4 h-4" />
                {t.map.cacheCurrentView}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLayers(false);
                  setActiveTab("offline");
                }}
                className="min-h-[44px] px-3 rounded-xl bg-[#132642] hover:bg-[#1B3458] text-xs font-semibold text-white"
              >
                {t.map.manageOffline}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Waypoint Inspector */}
      {selectedWaypoint && (
        <div className="absolute left-3 right-3 bottom-20 z-25 max-w-md rounded-2xl bg-[#0D1B30]/96 backdrop-blur-md border border-[#2D8CFF]/45 p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-mono-grid text-[#53A4FF]">
                <span>{selectedWaypoint.creatorCallsign}</span>
                {selectedWaypoint.groupCode && (
                  <span>· {selectedWaypoint.groupCode}</span>
                )}
              </div>
              <h4 className="text-sm font-semibold text-white mt-0.5">
                {selectedWaypoint.name}
              </h4>
              <div className="text-xs font-mono-grid text-[#B8C7DC] mt-1">
                {selectedWaypoint.mgrs}
              </div>
              <div className="text-[11px] font-mono-grid text-[#7F95B2]">
                {formatDMS(selectedWaypoint.lat, selectedWaypoint.lon)}
              </div>
              {selectedWaypoint.notes && (
                <p className="text-xs text-[#B8C7DC] mt-2 leading-relaxed">
                  {selectedWaypoint.notes}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedWaypoint(null)}
              className="w-8 h-8 rounded-lg bg-[#132642] flex items-center justify-center text-[#B8C7DC]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#94B8E8]/14">
            <button
              type="button"
              onClick={() => copyText(selectedWaypoint.mgrs)}
              className="flex-1 min-h-[40px] rounded-xl bg-[#132642] hover:bg-[#1B3458] text-xs font-medium text-white flex items-center justify-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              MGRS
            </button>
            <button
              type="button"
              onClick={() => {
                const wp = selectedWaypoint;
                setSelectedWaypoint(null);
                shareCoordToComms({
                  lat: wp.lat,
                  lon: wp.lon,
                  mgrs: wp.mgrs,
                  label: wp.name,
                });
              }}
              className="flex-1 min-h-[40px] rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] text-xs font-semibold text-white flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {t.map.sendToComms}
            </button>
            {user && selectedWaypoint.userId === user.id && (
              <button
                type="button"
                onClick={() => handleDeleteWaypoint(selectedWaypoint)}
                aria-label={t.app.delete}
                className="w-10 h-10 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-400/35 flex items-center justify-center text-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Save New Tactical Waypoint Modal */}
      {waypointDraft && (
        <div className="absolute inset-0 z-30 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleSaveWaypoint}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/22 p-5 shadow-2xl space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {t.map.newWaypointTitle}
              </h3>
              <button
                type="button"
                onClick={() => setWaypointDraft(null)}
                className="w-9 h-9 rounded-xl bg-[#132642] flex items-center justify-center text-[#B8C7DC]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-[#071120] border border-[#94B8E8]/14 px-3 py-2 text-xs font-mono-grid">
              <div className="text-[#53A4FF] font-semibold">
                {formatMGRS(waypointDraft.lat, waypointDraft.lon, 5)}
              </div>
              <div className="text-[#7F95B2]">
                {formatDMS(waypointDraft.lat, waypointDraft.lon)}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#B8C7DC] mb-1">
                {t.map.waypointName}
              </label>
              <input
                type="text"
                required
                value={waypointDraft.name}
                onChange={(e) =>
                  setWaypointDraft({ ...waypointDraft, name: e.target.value })
                }
                placeholder={t.map.waypointNamePlaceholder}
                className="w-full min-h-[46px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs text-[#B8C7DC] mb-1">
                  {t.map.waypointCategory}
                </label>
                <select
                  value={waypointDraft.category}
                  onChange={(e) =>
                    setWaypointDraft({
                      ...waypointDraft,
                      category: e.target.value as WaypointCategory,
                    })
                  }
                  className="w-full min-h-[46px] px-2.5 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-xs text-white"
                >
                  {(
                    [
                      "rally",
                      "observation",
                      "checkpoint",
                      "hazard",
                      "medevac",
                      "objective",
                    ] as WaypointCategory[]
                  ).map((cat) => (
                    <option key={cat} value={cat}>
                      {t.map[`cat_${cat}` as keyof typeof t.map] as string}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#B8C7DC] mb-1">
                  {t.map.waypointShareGroup}
                </label>
                <select
                  value={waypointDraft.groupId}
                  onChange={(e) =>
                    setWaypointDraft({
                      ...waypointDraft,
                      groupId: e.target.value,
                    })
                  }
                  className="w-full min-h-[46px] px-2.5 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-xs text-white"
                >
                  <option value="">{t.map.privateWaypoint}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} — {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#B8C7DC] mb-1">
                {t.map.waypointNotes}
              </label>
              <textarea
                rows={2}
                value={waypointDraft.notes}
                onChange={(e) =>
                  setWaypointDraft({ ...waypointDraft, notes: e.target.value })
                }
                className="w-full p-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-xs text-white focus:outline-none focus:border-[#2D8CFF]"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setWaypointDraft(null)}
                className="flex-1 min-h-[46px] rounded-xl bg-[#132642] text-xs font-semibold text-[#B8C7DC]"
              >
                {t.app.cancel}
              </button>
              <button
                type="submit"
                disabled={savingWp}
                className="flex-1 min-h-[46px] rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] disabled:opacity-60 text-xs font-semibold text-white"
              >
                {t.app.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
