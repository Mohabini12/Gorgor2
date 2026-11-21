import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, users } from "@/db";
import { getAuthenticatedUser, toCurrentUser } from "@/lib/auth";
import { applyLocationPrivacy } from "@/lib/coordinates";
import type { LocationSharingMode } from "@/types/gorgor";

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mode = me.locationSharing as LocationSharingMode;
    if (mode === "off") {
      return NextResponse.json(
        {
          error:
            "Location sharing is disabled in your Privacy Settings. Switch to Coarse or Exact to sync.",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = locationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid GPS coordinates." },
        { status: 400 }
      );
    }

    const masked = applyLocationPrivacy(
      parsed.data.lat,
      parsed.data.lon,
      parsed.data.accuracy ?? null,
      mode
    );
    if (!masked) {
      return NextResponse.json(
        { error: "Location sharing disabled." },
        { status: 403 }
      );
    }

    const [updated] = await db
      .update(users)
      .set({
        lastLat: masked.lat,
        lastLon: masked.lon,
        lastMgrs: masked.mgrs,
        lastAccuracy: masked.accuracy,
        lastLocationAt: new Date(),
      })
      .where(eq(users.id, me.id))
      .returning();

    return NextResponse.json({ user: toCurrentUser(updated) });
  } catch (err) {
    console.error("POST /api/users/location error:", err);
    return NextResponse.json(
      { error: "Failed to sync GPS position." },
      { status: 500 }
    );
  }
}
