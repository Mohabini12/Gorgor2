import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildEmblemSvg, type EmblemVariant } from "@/lib/emblem";
import { loadBranding } from "@/lib/branding";

// Emblem is rendered from PostgreSQL configuration on every request.
export const dynamic = "force-dynamic";

/**
 * Backend-generated GORGOR emblem.
 *
 * The SVG is rendered on the server from the emblem configuration stored in
 * PostgreSQL, so the app icon, brand downloads and the in-app logo all come
 * from one vector source.
 *
 *   GET /api/branding/icon.svg            full seal on a plate
 *   GET /api/branding/icon.svg?variant=mono   single-colour silhouette
 *   GET /api/branding/icon.svg?plate=0        seal without the plate
 *   GET /api/branding/icon.svg?download=1     saved as a file
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const variant: EmblemVariant =
      params.get("variant") === "mono" ? "mono" : "seal";
    const withPlate = params.get("plate") !== "0";
    const sizeParam = Number(params.get("size") ?? "");
    const size =
      Number.isFinite(sizeParam) && sizeParam >= 32 && sizeParam <= 1024
        ? Math.round(sizeParam)
        : undefined;

    const branding = await loadBranding();
    const svg = buildEmblemSvg(branding.emblem, {
      variant,
      plate: withPlate,
      idPrefix: variant,
      size,
    });

    const etag = `"${crypto.createHash("sha1").update(svg).digest("hex")}"`;
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch.includes(etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag },
      });
    }

    const fileName = `${branding.appName.toLowerCase()}-emblem-${variant}.svg`;
    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition":
          params.get("download") === "1"
            ? `attachment; filename="${fileName}"`
            : "inline",
      },
    });
  } catch (err) {
    console.error("GET /api/branding/icon.svg error:", err);
    return new NextResponse("Emblem unavailable", { status: 500 });
  }
}
