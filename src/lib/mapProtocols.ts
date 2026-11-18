"use client";

import { addProtocol, type RequestParameters } from "maplibre-gl";
import { getCachedTileBuffer, getMbtilesTileBuffer } from "./offlineStorage";

// 1x1 transparent PNG so uncached border tiles render cleanly without broken errors
const TRANSPARENT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function getTransparentTile(): ArrayBuffer {
  const bin = atob(TRANSPARENT_PNG_BASE64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

let protocolsRegistered = false;

export function registerGorgorMapProtocols() {
  if (typeof window === "undefined" || protocolsRegistered) return;
  protocolsRegistered = true;

  // Protocol 1: gorgorcache://{style}/{z}/{x}/{y}
  addProtocol("gorgorcache", async (params: RequestParameters) => {
    const path = params.url.replace(/^gorgorcache:\/\//, "");
    const parts = path.split("/");
    if (parts.length >= 4) {
      const style = parts[0];
      const z = Number(parts[1]);
      const x = Number(parts[2]);
      const y = Number(parts[3]);
      if (Number.isFinite(z) && Number.isFinite(x) && Number.isFinite(y)) {
        const buf = await getCachedTileBuffer(style, z, x, y);
        if (buf) {
          return { data: buf };
        }
      }
    }
    return { data: getTransparentTile() };
  });

  // Protocol 2: mbtiles://{archiveId}/{z}/{x}/{y}
  addProtocol("mbtiles", async (params: RequestParameters) => {
    const path = params.url.replace(/^mbtiles:\/\//, "");
    const parts = path.split("/");
    if (parts.length >= 4) {
      const archiveId = parts[0];
      const z = Number(parts[1]);
      const x = Number(parts[2]);
      const y = Number(parts[3]);
      if (Number.isFinite(z) && Number.isFinite(x) && Number.isFinite(y)) {
        const buf = await getMbtilesTileBuffer(archiveId, z, x, y);
        if (buf) {
          return { data: buf };
        }
      }
    }
    return { data: getTransparentTile() };
  });
}
