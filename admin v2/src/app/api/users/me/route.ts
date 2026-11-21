import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, users } from "@/db";
import {
  getAuthenticatedUser,
  hashPassword,
  toCurrentUser,
  verifyPassword,
} from "@/lib/auth";

const updateSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  callsign: z.string().trim().min(2).max(24).optional(),
  rankRole: z.string().trim().min(2).max(60).optional(),
  bio: z.string().trim().max(240).optional(),
  preferredLanguage: z.enum(["en", "so"]).optional(),
  preferredCoordFormat: z.enum(["MGRS", "DMS", "DD"]).optional(),
  locationSharing: z.enum(["off", "coarse_mgrs", "exact"]).optional(),
  showOnlineStatus: z.boolean().optional(),
  readReceipts: z.boolean().optional(),
  allowDirectMessages: z.enum(["everyone", "groups_only", "nobody"]).optional(),
  profileVisibility: z.enum(["everyone", "groups_only"]).optional(),
  allowGroupInvites: z.boolean().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).max(128).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid update payload." },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const patch: Partial<typeof users.$inferInsert> = {};

    if (data.displayName !== undefined) patch.displayName = data.displayName;
    if (data.callsign !== undefined)
      patch.callsign = data.callsign.toUpperCase();
    if (data.rankRole !== undefined) patch.rankRole = data.rankRole;
    if (data.bio !== undefined) patch.bio = data.bio;
    if (data.preferredLanguage !== undefined)
      patch.preferredLanguage = data.preferredLanguage;
    if (data.preferredCoordFormat !== undefined)
      patch.preferredCoordFormat = data.preferredCoordFormat;
    if (data.locationSharing !== undefined) {
      patch.locationSharing = data.locationSharing;
      // If user turns off location sharing, scrub stored live coordinates immediately
      if (data.locationSharing === "off") {
        patch.lastLat = null;
        patch.lastLon = null;
        patch.lastMgrs = null;
        patch.lastAccuracy = null;
        patch.lastLocationAt = null;
      }
    }
    if (data.showOnlineStatus !== undefined)
      patch.showOnlineStatus = data.showOnlineStatus;
    if (data.readReceipts !== undefined) patch.readReceipts = data.readReceipts;
    if (data.allowDirectMessages !== undefined)
      patch.allowDirectMessages = data.allowDirectMessages;
    if (data.profileVisibility !== undefined)
      patch.profileVisibility = data.profileVisibility;
    if (data.allowGroupInvites !== undefined)
      patch.allowGroupInvites = data.allowGroupInvites;

    if (data.newPassword) {
      if (
        !data.currentPassword ||
        !verifyPassword(data.currentPassword, me.passwordHash)
      ) {
        return NextResponse.json(
          { error: "Current password is incorrect." },
          { status: 400 }
        );
      }
      patch.passwordHash = hashPassword(data.newPassword);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ user: toCurrentUser(me) });
    }

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, me.id))
      .returning();

    return NextResponse.json({ user: toCurrentUser(updated) });
  } catch (err) {
    console.error("PATCH /api/users/me error:", err);
    return NextResponse.json(
      { error: "Failed to update account settings." },
      { status: 500 }
    );
  }
}
