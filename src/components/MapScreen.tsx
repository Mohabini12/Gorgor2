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
    ],
  };
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

    for (const wp of waypoints) {
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
      dot.style.cssText = `width:8px;height:8px;border-radius:2px;transform:rotate(45deg);background:${color};flex-sh
