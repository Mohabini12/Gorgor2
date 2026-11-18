import * as mgrsLib from "mgrs";
import type { CoordFormat, LocationSharingMode } from "@/types/gorgor";

export interface ParsedCoordinate {
  lat: number;
  lon: number;
  detectedFormat: "MGRS" | "DMS" | "DDM" | "DD";
  mgrs: string;
  mgrs1km: string;
  dms: string;
  dd: string;
  precisionMeters: number;
  bbox?: [number, number, number, number];
}

export type ParseCoordinateResult =
  | { ok: true; data: ParsedCoordinate }
  | { ok: false; errorCode: "empty" | "invalid_mgrs" | "invalid_dms" | "out_of_range" | "unrecognized" };

const MGRS_REGEX =
  /^([1-9]|[1-5][0-9]|60)([C-HJ-NP-X])([A-HJ-NP-Z][A-HJ-NP-V])(\d*)$/;

export function spaceMgrs(compact: string): string {
  const clean = compact.replace(/\s+/g, "").toUpperCase();
  const match = clean.match(MGRS_REGEX);
  if (!match) return clean;
  const [, zone, band, sq, digits] = match;
  if (!digits || digits.length === 0) {
    return `${zone}${band} ${sq}`;
  }
  const half = Math.floor(digits.length / 2);
  const easting = digits.slice(0, half);
  const northing = digits.slice(half);
  return `${zone}${band} ${sq} ${easting} ${northing}`;
}

export function formatMGRS(
  lat: number,
  lon: number,
  accuracy: 0 | 1 | 2 | 3 | 4 | 5 = 5
): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "—";
  // MGRS covers 80°S to 84°N
  if (lat < -80 || lat > 84) {
    return "POLAR (UPS)";
  }
  const normLon = ((((lon + 180) % 360) + 360) % 360) - 180;
  try {
    const raw = mgrsLib.forward([normLon, lat], accuracy);
    return spaceMgrs(raw);
  } catch {
    return "—";
  }
}

function toDmsPart(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  let min = Math.floor(minFloat);
  let sec = Number(((minFloat - min) * 60).toFixed(1));
  if (sec >= 60) {
    sec = 0;
    min += 1;
  }
  if (min >= 60) {
    min = 0;
    deg += 1;
  }
  const degPad = String(deg).padStart(isLat ? 2 : 3, "0");
  const minPad = String(min).padStart(2, "0");
  const secWhole = String(Math.floor(sec)).padStart(2, "0");
  const secFrac = (sec % 1).toFixed(1).slice(1); // ".x"
  return `${degPad}°${minPad}'${secWhole}${secFrac}"${hemi}`;
}

export function formatDMS(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "—";
  const normLon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return `${toDmsPart(lat, true)} ${toDmsPart(normLon, false)}`;
}

export function formatDD(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "—";
  const normLon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return `${lat.toFixed(5)}°, ${normLon.toFixed(5)}°`;
}

export function formatByPreference(
  lat: number,
  lon: number,
  format: CoordFormat
): string {
  if (format === "MGRS") return formatMGRS(lat, lon, 5);
  if (format === "DMS") return formatDMS(lat, lon);
  return formatDD(lat, lon);
}

function buildParsedResult(
  lat: number,
  lon: number,
  detectedFormat: "MGRS" | "DMS" | "DDM" | "DD",
  precisionMeters = 1,
  bbox?: [number, number, number, number]
): ParseCoordinateResult {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return { ok: false, errorCode: "out_of_range" };
  }
  return {
    ok: true,
    data: {
      lat,
      lon,
      detectedFormat,
      mgrs: formatMGRS(lat, lon, 5),
      mgrs1km: formatMGRS(lat, lon, 2),
      dms: formatDMS(lat, lon),
      dd: formatDD(lat, lon),
      precisionMeters,
      bbox,
    },
  };
}

function parseDmsComponent(token: string): {
  value: number;
  hemi: "N" | "S" | "E" | "W" | null;
  kind: "DMS" | "DDM" | "DD";
} | null {
  let s = token.trim().toUpperCase();
  if (!s) return null;

  let hemi: "N" | "S" | "E" | "W" | null = null;
  const prefixMatch = s.match(/^([NSEW])\s*(.+)$/);
  const suffixMatch = s.match(/^(.+?)\s*([NSEW])$/);
  if (prefixMatch) {
    hemi = prefixMatch[1] as "N" | "S" | "E" | "W";
    s = prefixMatch[2].trim();
  } else if (suffixMatch) {
    s = suffixMatch[1].trim();
    hemi = suffixMatch[2] as "N" | "S" | "E" | "W";
  }

  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }
  if (hemi === "S" || hemi === "W") {
    sign = -1;
  }

  // Normalize degree/minute/second markers into spaces
  const normalized = s
    .replace(/[°ºD]/g, " ")
    .replace(/[′'’M]/g, " ")
    .replace(/[″"”S]/g, " ")
    .replace(/:/g, " ")
    .trim();

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;

  if (parts.length === 1) {
    return { value: sign * nums[0], hemi, kind: "DD" };
  }
  if (parts.length === 2) {
    const [deg, min] = nums;
    if (!Number.isInteger(deg) || min >= 60) return null;
    return { value: sign * (deg + min / 60), hemi, kind: "DDM" };
  }
  const [deg, min, sec] = nums;
  if (!Number.isInteger(deg) || !Number.isInteger(min) || min >= 60 || sec >= 60) {
    return null;
  }
  return { value: sign * (deg + min / 60 + sec / 3600), hemi, kind: "DMS" };
}

export function parseCoordinateInput(raw: string): ParseCoordinateResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, errorCode: "empty" };

  // 1. Check MGRS first (e.g. "38N NM 38291 25104" or "38NNM3829125104")
  const compactMgrs = trimmed.replace(/[\s\-]+/g, "").toUpperCase();
  const mgrsMatch = compactMgrs.match(MGRS_REGEX);
  if (mgrsMatch && !/[°′'″",.]/.test(trimmed)) {
    const digits = mgrsMatch[4] ?? "";
    if (digits.length % 2 !== 0 || digits.length > 10) {
      return { ok: false, errorCode: "invalid_mgrs" };
    }
    const accuracyDigits = digits.length / 2;
    const precisionMap: Record<number, number> = {
      0: 100000,
      1: 10000,
      2: 1000,
      3: 100,
      4: 10,
      5: 1,
    };
    try {
      const bbox = mgrsLib.inverse(compactMgrs);
      const centerLon = (bbox[0] + bbox[2]) / 2;
      const centerLat = (bbox[1] + bbox[3]) / 2;
      return buildParsedResult(
        centerLat,
        centerLon,
        "MGRS",
        precisionMap[accuracyDigits] ?? 1,
        bbox
      );
    } catch {
      return { ok: false, errorCode: "invalid_mgrs" };
    }
  }

  // 2. Try splitting coordinate pair by comma, semicolon, slash, or hemisphere boundary
  let pair: [string, string] | null = null;

  const explicitSep = trimmed.split(/[,;/]+/).map((p) => p.trim()).filter(Boolean);
  if (explicitSep.length === 2) {
    pair = [explicitSep[0], explicitSep[1]];
  } else {
    // Match suffix hemisphere pair: "...N ...E"
    const suffixPair = trimmed.match(
      /^(.+?[NSEWnsew])\s+(.+?[NSEWnsew])$/
    );
    if (suffixPair) {
      pair = [suffixPair[1], suffixPair[2]];
    } else {
      // Match prefix hemisphere pair: "N ... E ..."
      const prefixPair = trimmed.match(
        /^([NSEWnsew]\s*.+?)\s+([NSEWnsew]\s*.+)$/
      );
      if (prefixPair) {
        pair = [prefixPair[1], prefixPair[2]];
      } else {
        // Space-separated tokens: either 2 DD numbers or 6 DMS numbers
        const spaceParts = trimmed.split(/\s+/).filter(Boolean);
        if (spaceParts.length === 2) {
          pair = [spaceParts[0], spaceParts[1]];
        } else if (spaceParts.length === 4) {
          pair = [
            `${spaceParts[0]} ${spaceParts[1]}`,
            `${spaceParts[2]} ${spaceParts[3]}`,
          ];
        } else if (spaceParts.length === 6) {
          pair = [
            `${spaceParts[0]} ${spaceParts[1]} ${spaceParts[2]}`,
            `${spaceParts[3]} ${spaceParts[4]} ${spaceParts[5]}`,
          ];
        }
      }
    }
  }

  if (!pair) {
    // Distinguish likely malformed MGRS vs DMS
    if (/^[0-9]{1,2}[A-Za-z]{3}/i.test(compactMgrs)) {
      return { ok: false, errorCode: "invalid_mgrs" };
    }
    if (/[°′'″"]/.test(trimmed)) {
      return { ok: false, errorCode: "invalid_dms" };
    }
    return { ok: false, errorCode: "unrecognized" };
  }

  const first = parseDmsComponent(pair[0]);
  const second = parseDmsComponent(pair[1]);
  if (!first || !second) {
    return {
      ok: false,
      errorCode: /[°′'″"NSEWnsew]/.test(trimmed)
        ? "invalid_dms"
        : "unrecognized",
    };
  }

  // Validate conflicting hemispheres (e.g. N and S together)
  const firstIsLat = first.hemi === "N" || first.hemi === "S";
  const firstIsLon = first.hemi === "E" || first.hemi === "W";
  const secondIsLat = second.hemi === "N" || second.hemi === "S";
  const secondIsLon = second.hemi === "E" || second.hemi === "W";

  if ((firstIsLat && secondIsLat) || (firstIsLon && secondIsLon)) {
    return { ok: false, errorCode: "invalid_dms" };
  }

  let lat = first.value;
  let lon = second.value;
  if (firstIsLon || secondIsLat) {
    lat = second.value;
    lon = first.value;
  }

  const detectedFormat =
    first.kind === "DMS" || second.kind === "DMS"
      ? "DMS"
      : first.kind === "DDM" || second.kind === "DDM"
      ? "DDM"
      : /[°]/.test(trimmed)
      ? "DD"
      : "DD";

  return buildParsedResult(
    lat,
    lon,
    detectedFormat,
    detectedFormat === "DMS" ? 3 : 1
  );
}

/**
 * Compute geodesic distance (meters), forward bearing (degrees 0-360),
 * and NATO angular mils (0-6400).
 */
export function computeDistanceAndBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { distanceMeters: number; bearingDeg: number; bearingMils: number } {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceMeters = R * c;

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const bearingDeg = (toDeg(Math.atan2(y, x)) + 360) % 360;
  const bearingMils = Math.round((bearingDeg / 360) * 6400) % 6400;

  return { distanceMeters, bearingDeg, bearingMils };
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(2)} km`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Enforce operator's privacy setting when sharing/persisting GPS location.
 */
export function applyLocationPrivacy(
  lat: number,
  lon: number,
  accuracy: number | null,
  mode: LocationSharingMode
): {
  lat: number | null;
  lon: number | null;
  mgrs: string | null;
  accuracy: number | null;
} | null {
  if (mode === "off") return null;
  if (mode === "coarse_mgrs") {
    const coarseMgrs = formatMGRS(lat, lon, 2); // 1 km grid square
    try {
      const compact = coarseMgrs.replace(/\s+/g, "");
      const bbox = mgrsLib.inverse(compact);
      return {
        lat: Number(((bbox[1] + bbox[3]) / 2).toFixed(3)),
        lon: Number(((bbox[0] + bbox[2]) / 2).toFixed(3)),
        mgrs: coarseMgrs,
        accuracy: 1000,
      };
    } catch {
      return {
        lat: Number(lat.toFixed(2)),
        lon: Number(lon.toFixed(2)),
        mgrs: coarseMgrs,
        accuracy: 1000,
      };
    }
  }
  return {
    lat,
    lon,
    mgrs: formatMGRS(lat, lon, 5),
    accuracy: accuracy ? Math.round(accuracy) : null,
  };
}

/**
 * Create a geodesic polygon circle in GeoJSON for rendering true GPS accuracy.
 */
export function createAccuracyCircleGeoJSON(
  lat: number,
  lon: number,
  radiusMeters: number,
  steps = 48
): GeoJSON.FeatureCollection {
  const safeRadius = Math.max(radiusMeters, 5);
  const coords: [number, number][] = [];
  const earthRadius = 6371008.8;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const angDist = safeRadius / earthRadius;

  for (let i = 0; i <= steps; i++) {
    const brng = (i * 2 * Math.PI) / steps;
    const pLat = Math.asin(
      Math.sin(latRad) * Math.cos(angDist) +
        Math.cos(latRad) * Math.sin(angDist) * Math.cos(brng)
    );
    const pLon =
      lonRad +
      Math.atan2(
        Math.sin(brng) * Math.sin(angDist) * Math.cos(latRad),
        Math.cos(angDist) - Math.sin(latRad) * Math.sin(pLat)
      );
    coords.push([(pLon * 180) / Math.PI, (pLat * 180) / Math.PI]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [coords],
        },
      },
    ],
  };
}

/**
 * Generate tactical coordinate graticule lines + MGRS intersection labels for MapLibre.
 */
export function generateGraticuleGeoJSON(
  bounds: { west: number; south: number; east: number; north: number },
  zoom: number
): GeoJSON.FeatureCollection {
  let step = 10;
  if (zoom >= 14) step = 0.01;
  else if (zoom >= 12) step = 0.02;
  else if (zoom >= 10) step = 0.1;
  else if (zoom >= 8) step = 0.25;
  else if (zoom >= 6) step = 0.5;
  else if (zoom >= 5) step = 1;
  else if (zoom >= 3) step = 2;
  else step = 5;

  const features: GeoJSON.Feature[] = [];
  const startLon = Math.floor(Math.max(-180, bounds.west) / step) * step;
  const endLon = Math.ceil(Math.min(180, bounds.east) / step) * step;
  const startLat = Math.floor(Math.max(-80, bounds.south) / step) * step;
  const endLat = Math.ceil(Math.min(84, bounds.north) / step) * step;

  let count = 0;
  for (let lon = startLon; lon <= endLon && count < 60; lon += step, count++) {
    const cleanLon = Number(lon.toFixed(4));
    features.push({
      type: "Feature",
      properties: { kind: "line" },
      geometry: {
        type: "LineString",
        coordinates: [
          [cleanLon, Math.max(-80, startLat)],
          [cleanLon, Math.min(84, endLat)],
        ],
      },
    });
  }

  count = 0;
  for (let lat = startLat; lat <= endLat && count < 60; lat += step, count++) {
    const cleanLat = Number(lat.toFixed(4));
    features.push({
      type: "Feature",
      properties: { kind: "line" },
      geometry: {
        type: "LineString",
        coordinates: [
          [Math.max(-180, startLon), cleanLat],
          [Math.min(180, endLon), cleanLat],
        ],
      },
    });
  }

  // Add sparse MGRS grid labels at intersections
  const labelStride = 2;
  let i = 0;
  let labelsAdded = 0;
  const mgrsAcc: 0 | 1 | 2 | 3 = zoom >= 12 ? 3 : zoom >= 9 ? 2 : zoom >= 6 ? 1 : 0;
  for (let lat = startLat + step; lat < endLat && labelsAdded < 25; lat += step * labelStride, i++) {
    for (let lon = startLon + step; lon < endLon && labelsAdded < 25; lon += step * labelStride) {
      if (i > 20) break;
      const label = formatMGRS(lat, lon, mgrsAcc);
      features.push({
        type: "Feature",
        properties: { kind: "label", label },
        geometry: {
          type: "Point",
          coordinates: [Number(lon.toFixed(4)), Number(lat.toFixed(4))],
        },
      });
      labelsAdded++;
    }
  }

  return { type: "FeatureCollection", features };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val < 10 && idx > 0 ? val.toFixed(1) : Math.round(val)} ${units[idx]}`;
}
