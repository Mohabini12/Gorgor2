"use client";

import type {
  MbtilesArchiveMeta,
  OfflineRegionRecord,
  OfflineTileSource,
} from "@/types/gorgor";
import type { Database, SqlJsStatic } from "sql.js";

const DB_NAME = "gorgor_offline_v1";
const DB_VERSION = 1;
export const MAX_REGION_TILES = 400;

interface StoredTileRecord {
  key: string; // `${style}/${z}/${x}/${y}`
  style: OfflineTileSource;
  z: number;
  x: number;
  y: number;
  blob: Blob;
  byteSize: number;
  mimeType: string;
  regionIds: string[];
  savedAt: number;
}

interface StoredMbtilesRecord extends MbtilesArchiveMeta {
  data: Uint8Array;
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

let dbOpenPromise: Promise<IDBDatabase> | null = null;
let sqlJsPromise: Promise<SqlJsStatic> | null = null;
const openMbtilesDbs = new Map<string, Database>();

function openOfflineDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
  }
  if (dbOpenPromise) return dbOpenPromise;

  dbOpenPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("regions")) {
        db.createObjectStore("regions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("tiles")) {
        const tileStore = db.createObjectStore("tiles", { keyPath: "key" });
        tileStore.createIndex("by_region", "regionIds", { multiEntry: true });
        tileStore.createIndex("by_zxy", ["z", "x", "y"], { unique: false });
      }
      if (!db.objectStoreNames.contains("mbtiles")) {
        db.createObjectStore("mbtiles", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbOpenPromise = null;
      reject(req.error ?? new Error("Failed to open offline IndexedDB."));
    };
  });

  return dbOpenPromise;
}

async function getSqlJs(): Promise<SqlJsStatic> {
  if (sqlJsPromise) return sqlJsPromise;
  sqlJsPromise = import("sql.js")
    .then((mod) => {
      const initSqlJs = mod.default;
      return initSqlJs({
        locateFile: (file: string) => `/${file}`,
      });
    })
    .catch((err) => {
      sqlJsPromise = null;
      throw err;
    });
  return sqlJsPromise;
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbTxDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

export function lonToTileX(lon: number, z: number): number {
  const n = 1 << z;
  const clamped = Math.max(-179.9999, Math.min(179.9999, lon));
  return Math.max(0, Math.min(n - 1, Math.floor(((clamped + 180) / 360) * n)));
}

export function latToTileY(lat: number, z: number): number {
  const n = 1 << z;
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const rad = (clamped * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  );
  return Math.max(0, Math.min(n - 1, y));
}

function tileXToLon(x: number, z: number): number {
  return (x / (1 << z)) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (1 << z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function countRegionTiles(
  bounds: [number, number, number, number],
  minZoom: number,
  maxZoom: number
): number {
  const [west, south, east, north] = bounds;
  if (west >= east || south >= north || minZoom > maxZoom) return 0;
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lonToTileX(west, z);
    const xMax = lonToTileX(east, z);
    const yMin = latToTileY(north, z); // north has smaller Y in XYZ
    const yMax = latToTileY(south, z);
    total += (xMax - xMin + 1) * (yMax - yMin + 1);
    if (total > 100_000) return total;
  }
  return total;
}

export function enumerateRegionTiles(
  bounds: [number, number, number, number],
  minZoom: number,
  maxZoom: number
): TileCoord[] {
  const [west, south, east, north] = bounds;
  const list: TileCoord[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lonToTileX(west, z);
    const xMax = lonToTileX(east, z);
    const yMin = latToTileY(north, z);
    const yMax = latToTileY(south, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        list.push({ z, x, y });
      }
    }
  }
  return list;
}

export async function listOfflineRegions(): Promise<OfflineRegionRecord[]> {
  const db = await openOfflineDb();
  const tx = db.transaction("regions", "readonly");
  const all = await idbReq<OfflineRegionRecord[]>(
    tx.objectStore("regions").getAll()
  );
  return all.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

async function saveTileToDb(
  db: IDBDatabase,
  style: OfflineTileSource,
  coord: TileCoord,
  blob: Blob,
  regionId: string
): Promise<number> {
  const key = `${style}/${coord.z}/${coord.x}/${coord.y}`;
  const tx = db.transaction("tiles", "readwrite");
  const store = tx.objectStore("tiles");
  const existing = await idbReq<StoredTileRecord | undefined>(store.get(key));
  const regionIds = existing
    ? Array.from(new Set([...existing.regionIds, regionId]))
    : [regionId];
  const defaultMime = style === "satellite" ? "image/jpeg" : "image/png";
  const record: StoredTileRecord = {
    key,
    style,
    z: coord.z,
    x: coord.x,
    y: coord.y,
    blob,
    byteSize: blob.size,
    mimeType: blob.type || defaultMime,
    regionIds,
    savedAt: Date.now(),
  };
  store.put(record);
  await idbTxDone(tx);
  return blob.size;
}

export interface DownloadRegionOptions {
  name: string;
  sourceStyle: OfflineTileSource;
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  signal?: AbortSignal;
  onProgress?: (record: OfflineRegionRecord) => void;
}

/**
 * Genuinely downloads raster map tiles from /api/tiles and persists every tile Blob into IndexedDB.
 */
export async function downloadOfflineRegion(
  opts: DownloadRegionOptions
): Promise<OfflineRegionRecord> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Device is offline. Connect to a network to download map tiles.");
  }

  const totalCheck = countRegionTiles(opts.bounds, opts.minZoom, opts.maxZoom);
  if (totalCheck === 0) {
    throw new Error("Invalid bounding box or zoom range.");
  }
  if (totalCheck > MAX_REGION_TILES) {
    throw new Error(
      `Selected area requires ${totalCheck} tiles (limit ${MAX_REGION_TILES} per pack). Narrow area or lower max zoom.`
    );
  }

  const tiles = enumerateRegionTiles(opts.bounds, opts.minZoom, opts.maxZoom);
  const db = await openOfflineDb();
  const now = new Date().toISOString();
  const id = `reg_${crypto.randomUUID().slice(0, 12)}`;

  const record: OfflineRegionRecord = {
    id,
    name: opts.name.trim() || "Field Sector",
    sourceStyle: opts.sourceStyle,
    bounds: opts.bounds,
    minZoom: opts.minZoom,
    maxZoom: opts.maxZoom,
    totalTiles: tiles.length,
    downloadedTiles: 0,
    failedTiles: 0,
    byteSize: 0,
    status: "downloading",
    createdAt: now,
    updatedAt: now,
  };

  const initTx = db.transaction("regions", "readwrite");
  initTx.objectStore("regions").put(record);
  await idbTxDone(initTx);
  opts.onProgress?.({ ...record });

  // Download with polite concurrency of 4
  const concurrency = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < tiles.length) {
      if (opts.signal?.aborted) return;
      const idx = cursor++;
      const coord = tiles[idx];
      try {
        const res = await fetch(
          `/api/tiles/${opts.sourceStyle}/${coord.z}/${coord.x}/${coord.y}`,
          { signal: opts.signal, cache: "no-store" }
        );
        if (!res.ok) {
          record.failedTiles += 1;
        } else {
          const blob = await res.blob();
          if (blob.size > 0) {
            const bytes = await saveTileToDb(
              db,
              opts.sourceStyle,
              coord,
              blob,
              id
            );
            record.downloadedTiles += 1;
            record.byteSize += bytes;
          } else {
            record.failedTiles += 1;
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError" || opts.signal?.aborted) {
          return;
        }
        record.failedTiles += 1;
      }

      record.updatedAt = new Date().toISOString();
      opts.onProgress?.({ ...record });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tiles.length) }, () => worker())
  );

  if (opts.signal?.aborted) {
    record.status = "cancelled";
  } else if (record.downloadedTiles === 0) {
    record.status = "partial";
  } else if (record.failedTiles > 0) {
    record.status = "partial";
  } else {
    record.status = "complete";
  }
  record.updatedAt = new Date().toISOString();

  const finalTx = db.transaction("regions", "readwrite");
  finalTx.objectStore("regions").put(record);
  await idbTxDone(finalTx);
  opts.onProgress?.({ ...record });

  return record;
}

export async function deleteOfflineRegion(regionId: string): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(["regions", "tiles"], "readwrite");
  tx.objectStore("regions").delete(regionId);

  const tileStore = tx.objectStore("tiles");
  const index = tileStore.index("by_region");
  const matching = await idbReq<StoredTileRecord[]>(index.getAll(regionId));
  for (const tile of matching) {
    const remaining = tile.regionIds.filter((r) => r !== regionId);
    if (remaining.length === 0) {
      tileStore.delete(tile.key);
    } else {
      tile.regionIds = remaining;
      tileStore.put(tile);
    }
  }
  await idbTxDone(tx);
}

export async function getCachedTileBuffer(
  styleOrAny: string,
  z: number,
  x: number,
  y: number
): Promise<ArrayBuffer | null> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction("tiles", "readonly");
    const store = tx.objectStore("tiles");

    if (
      styleOrAny === "satellite" ||
      styleOrAny === "standard" ||
      styleOrAny === "topo"
    ) {
      const hit = await idbReq<StoredTileRecord | undefined>(
        store.get(`${styleOrAny}/${z}/${x}/${y}`)
      );
      return hit ? await hit.blob.arrayBuffer() : null;
    }

    const index = store.index("by_zxy");
    const matches = await idbReq<StoredTileRecord[]>(index.getAll([z, x, y]));
    if (matches.length > 0) {
      const preferred =
        matches.find((m) => m.style === "satellite") ?? matches[0];
      return await preferred.blob.arrayBuffer();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Exports a genuinely downloaded offline tile region into a spec-compliant MBTiles 1.3 SQLite file.
 */
export async function buildMbtilesFromRegion(regionId: string): Promise<{
  data: Uint8Array;
  fileName: string;
  region: OfflineRegionRecord;
  tileCount: number;
}> {
  const db = await openOfflineDb();
  const tx = db.transaction(["regions", "tiles"], "readonly");
  const region = await idbReq<OfflineRegionRecord | undefined>(
    tx.objectStore("regions").get(regionId)
  );
  if (!region) throw new Error("Offline region not found.");

  const tiles = await idbReq<StoredTileRecord[]>(
    tx.objectStore("tiles").index("by_region").getAll(regionId)
  );
  if (tiles.length === 0) {
    throw new Error("No cached tiles exist in this region to export.");
  }

  const SQL = await getSqlJs();
  const sqlDb = new SQL.Database();
  try {
    sqlDb.run("CREATE TABLE metadata (name text, value text);");
    sqlDb.run(
      "CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob);"
    );
    sqlDb.run(
      "CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);"
    );

    const centerLon = ((region.bounds[0] + region.bounds[2]) / 2).toFixed(5);
    const centerLat = ((region.bounds[1] + region.bounds[3]) / 2).toFixed(5);
    const metaRows: [string, string][] = [
      ["name", region.name],
      ["type", "baselayer"],
      ["version", "1.3"],
      [
        "description",
        `Exported by GORGOR Tactical Mapping (${region.sourceStyle.toUpperCase()} z${region.minZoom}-${region.maxZoom})`,
      ],
      [
        "format",
        region.sourceStyle === "satellite" ||
        tiles[0]?.mimeType?.includes("jpeg")
          ? "jpg"
          : "png",
      ],
      ["bounds", region.bounds.map((b) => b.toFixed(6)).join(",")],
      ["center", `${centerLon},${centerLat},${region.minZoom}`],
      ["minzoom", String(region.minZoom)],
      ["maxzoom", String(region.maxZoom)],
    ];

    const metaStmt = sqlDb.prepare(
      "INSERT INTO metadata (name, value) VALUES (?, ?);"
    );
    for (const [k, v] of metaRows) {
      metaStmt.run([k, v]);
    }
    metaStmt.free();

    const tileStmt = sqlDb.prepare(
      "INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?);"
    );
    for (const t of tiles) {
      const buf = new Uint8Array(await t.blob.arrayBuffer());
      // MBTiles uses TMS row indexing (flipped Y)
      const tmsRow = (1 << t.z) - 1 - t.y;
      tileStmt.run([t.z, t.x, tmsRow, buf]);
    }
    tileStmt.free();

    const data = sqlDb.export();
    const slug = region.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const fileName = `${slug || "gorgor-sector"}-z${region.minZoom}-${region.maxZoom}.mbtiles`;

    return { data, fileName, region, tileCount: tiles.length };
  } finally {
    sqlDb.close();
  }
}

/**
 * Validates and imports a genuine SQLite .mbtiles archive from a File or Uint8Array.
 */
export async function importMbtilesBytes(
  rawBytes: Uint8Array,
  fileName: string
): Promise<MbtilesArchiveMeta> {
  if (rawBytes.byteLength < 100) {
    throw new Error("File is too small to be a valid SQLite MBTiles archive.");
  }

  // Verify SQLite magic header "SQLite format 3\0"
  const magic = new TextDecoder("ascii").decode(rawBytes.slice(0, 15));
  if (magic !== "SQLite format 3") {
    throw new Error(
      "Invalid file header: MBTiles files must be valid SQLite 3 databases."
    );
  }

  const SQL = await getSqlJs();
  const sqlDb = new SQL.Database(rawBytes);

  try {
    // Check that tiles table or view exists
    const tableCheck = sqlDb.exec(
      "SELECT name FROM sqlite_master WHERE (type='table' OR type='view') AND name='tiles';"
    );
    if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
      sqlDb.close();
      throw new Error(
        "Invalid MBTiles schema: missing required 'tiles' table or view."
      );
    }

    // Count tiles and inspect zoom range
    const statsRes = sqlDb.exec(
      "SELECT COUNT(*), MIN(zoom_level), MAX(zoom_level) FROM tiles;"
    );
    const row = statsRes[0]?.values[0] ?? [0, 0, 0];
    const tileCount = Number(row[0] ?? 0);
    let minZoom = row[1] !== null ? Number(row[1]) : 0;
    let maxZoom = row[2] !== null ? Number(row[2]) : 14;

    // Extract metadata table if present
    const metaMap = new Map<string, string>();
    const metaExists = sqlDb.exec(
      "SELECT name FROM sqlite_master WHERE (type='table' OR type='view') AND name='metadata';"
    );
    if (metaExists.length > 0 && metaExists[0].values.length > 0) {
      const metaRows = sqlDb.exec("SELECT name, value FROM metadata;");
      for (const r of metaRows[0]?.values ?? []) {
        if (typeof r[0] === "string" && r[1] !== null) {
          metaMap.set(r[0].toLowerCase(), String(r[1]));
        }
      }
    }

    const name =
      metaMap.get("name")?.trim() ||
      fileName.replace(/\.(mbtiles|sqlite|db)$/i, "");
    const description = metaMap.get("description")?.trim() || "";
    const format = (metaMap.get("format")?.trim() || "png").toLowerCase();

    if (metaMap.has("minzoom")) {
      const parsed = Number(metaMap.get("minzoom"));
      if (Number.isFinite(parsed)) minZoom = parsed;
    }
    if (metaMap.has("maxzoom")) {
      const parsed = Number(metaMap.get("maxzoom"));
      if (Number.isFinite(parsed)) maxZoom = parsed;
    }

    let bounds: [number, number, number, number] | null = null;
    const rawBounds = metaMap.get("bounds");
    if (rawBounds) {
      const parts = rawBounds.split(",").map((p) => Number(p.trim()));
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        bounds = [parts[0], parts[1], parts[2], parts[3]];
      }
    }

    // Derive bounds from tile extents at maxZoom if metadata lacked bounds
    if (!bounds && tileCount > 0) {
      const ext = sqlDb.exec(
        `SELECT MIN(tile_column), MAX(tile_column), MIN(tile_row), MAX(tile_row) FROM tiles WHERE zoom_level = ${maxZoom};`
      );
      const eRow = ext[0]?.values[0];
      if (eRow && eRow.every((v) => v !== null)) {
        const minX = Number(eRow[0]);
        const maxX = Number(eRow[1]);
        const minTmsY = Number(eRow[2]);
        const maxTmsY = Number(eRow[3]);
        const minXyzY = (1 << maxZoom) - 1 - maxTmsY;
        const maxXyzY = (1 << maxZoom) - 1 - minTmsY;
        const west = tileXToLon(minX, maxZoom);
        const east = tileXToLon(maxX + 1, maxZoom);
        const north = tileYToLat(minXyzY, maxZoom);
        const south = tileYToLat(maxXyzY + 1, maxZoom);
        bounds = [
          Number(west.toFixed(6)),
          Number(south.toFixed(6)),
          Number(east.toFixed(6)),
          Number(north.toFixed(6)),
        ];
      }
    }

    let center: [number, number, number] | null = null;
    const rawCenter = metaMap.get("center");
    if (rawCenter) {
      const parts = rawCenter.split(",").map((p) => Number(p.trim()));
      if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) {
        center = [parts[0], parts[1], parts[2] ?? minZoom];
      }
    } else if (bounds) {
      center = [
        (bounds[0] + bounds[2]) / 2,
        (bounds[1] + bounds[3]) / 2,
        minZoom,
      ];
    }

    const id = `mbt_${crypto.randomUUID().slice(0, 12)}`;
    const meta: MbtilesArchiveMeta = {
      id,
      fileName,
      name,
      description,
      format,
      bounds,
      center,
      minZoom,
      maxZoom,
      tileCount,
      byteSize: rawBytes.byteLength,
      importedAt: new Date().toISOString(),
    };

    const stored: StoredMbtilesRecord = {
      ...meta,
      data: rawBytes,
    };

    const idb = await openOfflineDb();
    const tx = idb.transaction("mbtiles", "readwrite");
    tx.objectStore("mbtiles").put(stored);
    await idbTxDone(tx);

    openMbtilesDbs.set(id, sqlDb);
    return meta;
  } catch (err) {
    try {
      sqlDb.close();
    } catch {
      // ignore
    }
    throw err;
  }
}

export async function importMbtilesFile(
  file: File
): Promise<MbtilesArchiveMeta> {
  const buffer = await file.arrayBuffer();
  return importMbtilesBytes(new Uint8Array(buffer), file.name);
}

export async function listMbtilesArchives(): Promise<MbtilesArchiveMeta[]> {
  const db = await openOfflineDb();
  const tx = db.transaction("mbtiles", "readonly");
  const all = await idbReq<StoredMbtilesRecord[]>(
    tx.objectStore("mbtiles").getAll()
  );
  return all
    .map((rec) => ({
      id: rec.id,
      fileName: rec.fileName,
      name: rec.name,
      description: rec.description,
      format: rec.format,
      bounds: rec.bounds,
      center: rec.center,
      minZoom: rec.minZoom,
      maxZoom: rec.maxZoom,
      tileCount: rec.tileCount,
      byteSize: rec.byteSize,
      importedAt: rec.importedAt,
    }))
    .sort(
      (a, b) =>
        new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()
    );
}

export async function getMbtilesRawBytes(
  archiveId: string
): Promise<{ data: Uint8Array; fileName: string } | null> {
  const db = await openOfflineDb();
  const tx = db.transaction("mbtiles", "readonly");
  const rec = await idbReq<StoredMbtilesRecord | undefined>(
    tx.objectStore("mbtiles").get(archiveId)
  );
  if (!rec) return null;
  return { data: rec.data, fileName: rec.fileName };
}

export async function getMbtilesTileBuffer(
  archiveId: string,
  z: number,
  x: number,
  y: number
): Promise<ArrayBuffer | null> {
  try {
    let sqlDb = openMbtilesDbs.get(archiveId);
    if (!sqlDb) {
      const raw = await getMbtilesRawBytes(archiveId);
      if (!raw) return null;
      const SQL = await getSqlJs();
      sqlDb = new SQL.Database(raw.data);
      openMbtilesDbs.set(archiveId, sqlDb);
    }

    const tmsRow = (1 << z) - 1 - y;
    const stmt = sqlDb.prepare(
      "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ? LIMIT 1;"
    );
    try {
      stmt.bind([z, x, tmsRow]);
      if (stmt.step()) {
        const val = stmt.get()[0];
        if (val instanceof Uint8Array && val.byteLength > 0) {
          const copy = new Uint8Array(val.byteLength);
          copy.set(val);
          return copy.buffer;
        }
      }
      return null;
    } finally {
      stmt.free();
    }
  } catch {
    return null;
  }
}

export async function deleteMbtilesArchive(archiveId: string): Promise<void> {
  const existingDb = openMbtilesDbs.get(archiveId);
  if (existingDb) {
    try {
      existingDb.close();
    } catch {
      // ignore
    }
    openMbtilesDbs.delete(archiveId);
  }
  const db = await openOfflineDb();
  const tx = db.transaction("mbtiles", "readwrite");
  tx.objectStore("mbtiles").delete(archiveId);
  await idbTxDone(tx);
}

export interface StorageBreakdown {
  regionsBytes: number;
  mbtilesBytes: number;
  totalGorgorBytes: number;
  browserUsageBytes: number | null;
  browserQuotaBytes: number | null;
  regionCount: number;
  cachedTileCount: number;
  mbtilesCount: number;
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  let regionsBytes = 0;
  let mbtilesBytes = 0;
  let regionCount = 0;
  let cachedTileCount = 0;
  let mbtilesCount = 0;

  try {
    const db = await openOfflineDb();
    const tx = db.transaction(["regions", "tiles", "mbtiles"], "readonly");
    const [regs, tileCount, mbts] = await Promise.all([
      idbReq<OfflineRegionRecord[]>(tx.objectStore("regions").getAll()),
      idbReq<number>(tx.objectStore("tiles").count()),
      idbReq<StoredMbtilesRecord[]>(tx.objectStore("mbtiles").getAll()),
    ]);
    regionCount = regs.length;
    cachedTileCount = tileCount;
    regionsBytes = regs.reduce((sum, r) => sum + (r.byteSize || 0), 0);
    mbtilesCount = mbts.length;
    mbtilesBytes = mbts.reduce((sum, m) => sum + (m.byteSize || 0), 0);
  } catch {
    // IndexedDB unavailable
  }

  let browserUsageBytes: number | null = null;
  let browserQuotaBytes: number | null = null;
  if (
    typeof navigator !== "undefined" &&
    navigator.storage &&
    typeof navigator.storage.estimate === "function"
  ) {
    try {
      const est = await navigator.storage.estimate();
      browserUsageBytes = typeof est.usage === "number" ? est.usage : null;
      browserQuotaBytes = typeof est.quota === "number" ? est.quota : null;
    } catch {
      // ignore
    }
  }

  return {
    regionsBytes,
    mbtilesBytes,
    totalGorgorBytes: regionsBytes + mbtilesBytes,
    browserUsageBytes,
    browserQuotaBytes,
    regionCount,
    cachedTileCount,
    mbtilesCount,
  };
}
