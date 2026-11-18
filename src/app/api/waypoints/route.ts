import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db, waypoints, groupMembers, groups, users } from "@/db";
import { generateId, getAuthenticatedUser } from "@/lib/auth";
import { formatMGRS } from "@/lib/coordinates";
import type { TacticalWaypoint, WaypointCategory } from "@/types/gorgor";

export async function GET() {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const myGroups = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, me.id));
    const gIds = myGroups.map((g) => g.groupId);

    const condition =
      gIds.length > 0
        ? or(eq(waypoints.userId, me.id), inArray(waypoints.groupId, gIds))
        : eq(waypoints.userId, me.id);

    const rows = await db
      .select({
        wp: waypoints,
        creatorCallsign: users.callsign,
        groupCode: groups.code,
      })
      .from(waypoints)
      .innerJoin(users, eq(waypoints.userId, users.id))
      .leftJoin(groups, eq(waypoints.groupId, groups.id))
      .where(condition)
      .orderBy(desc(waypoints.createdAt));

    const result: TacticalWaypoint[] = rows.map((r) => ({
      id: r.wp.id,
      userId: r.wp.userId,
      creatorCallsign: r.creatorCallsign,
      groupId: r.wp.groupId,
      groupCode: r.groupCode,
      name: r.wp.name,
      category: r.wp.category as WaypointCategory,
      notes: r.wp.notes,
      lat: r.wp.lat,
      lon: r.wp.lon,
      mgrs: r.wp.mgrs,
      elevation: r.wp.elevation,
      createdAt: r.wp.createdAt.toISOString(),
    }));

    return NextResponse.json({ waypoints: result });
  } catch (err) {
    console.error("GET /api/waypoints error:", err);
    return NextResponse.json(
      { error: "Failed to load waypoints." },
      { status: 500 }
    );
  }
}

const createWpSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum([
    "rally",
    "observation",
    "checkpoint",
    "hazard",
    "medevac",
    "objective",
  ]),
  notes: z.string().trim().max(300).optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  elevation: z.number().nullable().optional(),
  groupId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createWpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid waypoint fields." },
        { status: 400 }
      );
    }

    let groupCode: string | null = null;
    let validGroupId: string | null = null;
    if (parsed.data.groupId) {
      const [g] = await db
        .select()
        .from(groups)
        .where(eq(groups.id, parsed.data.groupId))
        .limit(1);
      if (g) {
        validGroupId = g.id;
        groupCode = g.code;
      }
    }

    const mgrs = formatMGRS(parsed.data.lat, parsed.data.lon, 5);
    const [created] = await db
      .insert(waypoints)
      .values({
        id: generateId("wp"),
        userId: me.id,
        groupId: validGroupId,
        name: parsed.data.name,
        category: parsed.data.category,
        notes: parsed.data.notes ?? "",
        lat: parsed.data.lat,
        lon: parsed.data.lon,
        mgrs,
        elevation: parsed.data.elevation ?? null,
      })
      .returning();

    const waypoint: TacticalWaypoint = {
      id: created.id,
      userId: created.userId,
      creatorCallsign: me.callsign,
      groupId: created.groupId,
      groupCode,
      name: created.name,
      category: created.category as WaypointCategory,
      notes: created.notes,
      lat: created.lat,
      lon: created.lon,
      mgrs: created.mgrs,
      elevation: created.elevation,
      createdAt: created.createdAt.toISOString(),
    };

    return NextResponse.json({ waypoint }, { status: 201 });
  } catch (err) {
    console.error("POST /api/waypoints error:", err);
    return NextResponse.json(
      { error: "Failed to save waypoint." },
      { status: 500 }
    );
  }
}
