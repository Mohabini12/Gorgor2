import { NextRequest, NextResponse } from "next/server";

const UPSTREAM_URLS: Record<
  string,
  (z: number, x: number, y: number) => string
> = {
  standard: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  topo: (z, x, y) => {
    const subs = ["a", "b", "c"];
    const sub = subs[(x + y) % subs.length];
    return `https://${sub}.tile.opentopomap.org/${z}/${x}/${y}.png`;
  },
  // Esri World Imagery & Reference layers use Z/Y/X slippy ordering
  satellite: (z, x, y) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  sat_labels: (z, x, y) =>
    `https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`,
  sat_roads: (z, x, y) =>
    `https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/${z}/${y}/${x}`,
};

export async function GET(
  _req: NextRequest,
  context: {
    params: Promise<{ style: string; z: string; x: string; y: string }>;
  }
) {
  const { style, z: zStr, x: xStr, y: yRaw } = await context.params;
  const builder = UPSTREAM_URLS[style];
  if (!builder) {
    return new NextResponse("Unknown tile style", { status: 400 });
  }

  const z = Number(zStr);
  const x = Number(xStr);
  const y = Number(yRaw.replace(/\.(png|jpe?g)$/i, ""));
  const maxIdx = (1 << z) - 1;

  if (
    !Number.isInteger(z) ||
    z < 0 ||
    z > 19 ||
    !Number.isInteger(x) ||
    x < 0 ||
    x > maxIdx ||
    !Number.isInteger(y) ||
    y < 0 ||
    y > maxIdx
  ) {
    return new NextResponse("Invalid tile coordinates", { status: 400 });
  }

  const upstream = builder(z, x, y);
  try {
    const res = await fetch(upstream, {
      headers: {
        "User-Agent": "GORGOR-TacticalMap/1.0 (Field Navigation App)",
        Accept: "image/jpeg,image/png,image/*;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      // Fallback topo to OSM if OpenTopoMap lacks deep zoom tile
      if (style === "topo") {
        const fallback = await fetch(UPSTREAM_URLS.standard(z, x, y), {
          headers: {
            "User-Agent": "GORGOR-TacticalMap/1.0 (Field Navigation App)",
          },
          next: { revalidate: 86400 },
        });
        if (fallback.ok) {
          const data = await fallback.arrayBuffer();
          return new NextResponse(data, {
            status: 200,
            headers: {
              "Content-Type":
                fallback.headers.get("content-type") || "image/png",
              "Cache-Control":
                "public, max-age=86400, stale-while-revalidate=604800",
            },
          });
        }
      }
      return new NextResponse("Tile unavailable", { status: res.status });
    }

    const data = await res.arrayBuffer();
    const defaultMime = style === "satellite" ? "image/jpeg" : "image/png";
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") || defaultMime,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse("Tile fetch error", { status: 502 });
  }
}
