import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { eq, and, gt, inArray } from "drizzle-orm";
import { db, users, sessions, groupMembers, blockedUsers } from "@/db";
import type {
  CurrentUser,
  PublicOperator,
  Language,
  CoordFormat,
  LocationSharingMode,
  DmPermission,
  ProfileVisibility,
} from "@/types/gorgor";
import { formatMGRS } from "@/lib/coordinates";

export const SESSION_COOKIE = "gorgor_session";
export const SIGNED_OUT_COOKIE = "gorgor_signed_out";
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, "hex");
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateId(prefix = ""): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export async function createSessionForUser(
  userId: string,
  userAgent = ""
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: generateId("sess"),
    userId,
    tokenHash,
    userAgent: userAgent.slice(0, 255),
    expiresAt,
  });

  return { token, expiresAt };
}

export async function setSessionCookies(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.HTTPS === "true",
    path: "/",
    expires: expiresAt,
  });
  store.delete(SIGNED_OUT_COOKIE);
}

export async function clearSessionCookies() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.set(SIGNED_OUT_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export type DbUser = typeof users.$inferSelect;

export function toCurrentUser(u: DbUser): CurrentUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    callsign: u.callsign,
    rankRole: u.rankRole,
    bio: u.bio,
    avatarColor: u.avatarColor,
    preferredLanguage: (u.preferredLanguage === "so" ? "so" : "en") as Language,
    preferredCoordFormat: (["MGRS", "DMS", "DD"].includes(
      u.preferredCoordFormat
    )
      ? u.preferredCoordFormat
      : "MGRS") as CoordFormat,
    locationSharing: (["off", "coarse_mgrs", "exact"].includes(
      u.locationSharing
    )
      ? u.locationSharing
      : "coarse_mgrs") as LocationSharingMode,
    showOnlineStatus: u.showOnlineStatus,
    readReceipts: u.readReceipts,
    allowDirectMessages: (["everyone", "groups_only", "nobody"].includes(
      u.allowDirectMessages
    )
      ? u.allowDirectMessages
      : "everyone") as DmPermission,
    profileVisibility: (u.profileVisibility === "groups_only"
      ? "groups_only"
      : "everyone") as ProfileVisibility,
    allowGroupInvites: u.allowGroupInvites,
    lastLat: u.lastLat,
    lastLon: u.lastLon,
    lastMgrs: u.lastMgrs,
    lastAccuracy: u.lastAccuracy,
    lastLocationAt: u.lastLocationAt ? u.lastLocationAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

/**
 * Sanitize another operator's profile strictly enforcing their privacy settings.
 */
export function toPublicOperator(
  u: DbUser,
  isBlocked = false
): PublicOperator {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const isOnline = u.showOnlineStatus
    ? u.lastSeenAt.getTime() >= fiveMinutesAgo
    : null;
  const lastSeenAt = u.showOnlineStatus ? u.lastSeenAt.toISOString() : null;

  let sharedLocation: PublicOperator["sharedLocation"] = null;
  if (
    u.locationSharing !== "off" &&
    u.lastLocationAt &&
    (u.lastMgrs || (u.lastLat !== null && u.lastLon !== null))
  ) {
    if (u.locationSharing === "coarse_mgrs") {
      const coarse =
        u.lastLat !== null && u.lastLon !== null
          ? formatMGRS(u.lastLat, u.lastLon, 2)
          : u.lastMgrs ?? "";
      sharedLocation = {
        mode: "coarse_mgrs",
        mgrs: coarse,
        lat: null,
        lon: null,
        accuracy: 1000,
        updatedAt: u.lastLocationAt.toISOString(),
      };
    } else if (u.locationSharing === "exact") {
      sharedLocation = {
        mode: "exact",
        mgrs:
          u.lastMgrs ??
          (u.lastLat !== null && u.lastLon !== null
            ? formatMGRS(u.lastLat, u.lastLon, 5)
            : ""),
        lat: u.lastLat,
        lon: u.lastLon,
        accuracy: u.lastAccuracy,
        updatedAt: u.lastLocationAt.toISOString(),
      };
    }
  }

  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    callsign: u.callsign,
    rankRole: u.rankRole,
    bio: u.bio,
    avatarColor: u.avatarColor,
    isOnline,
    lastSeenAt,
    allowDirectMessages: (["everyone", "groups_only", "nobody"].includes(
      u.allowDirectMessages
    )
      ? u.allowDirectMessages
      : "everyone") as DmPermission,
    allowGroupInvites: u.allowGroupInvites,
    sharedLocation,
    isBlocked,
  };
}

export async function getRawToken(): Promise<string | null> {
  const h = await headers();
  const auth = h.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function getAuthenticatedUser(): Promise<DbUser | null> {
  const rawToken = await getRawToken();
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();

  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  if (rows.length === 0) return null;

  const user = rows[0].user;
  // Touch lastSeenAt if older than 45s
  if (Date.now() - user.lastSeenAt.getTime() > 45_000) {
    await db
      .update(users)
      .set({ lastSeenAt: now })
      .where(eq(users.id, user.id));
    user.lastSeenAt = now;
  }

  return user;
}

export async function doUsersShareGroup(
  userA: string,
  userB: string
): Promise<boolean> {
  const groupsA = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userA));
  if (groupsA.length === 0) return false;
  const ids = groupsA.map((g) => g.groupId);
  const shared = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(eq(groupMembers.userId, userB), inArray(groupMembers.groupId, ids))
    )
    .limit(1);
  return shared.length > 0;
}

export async function isEitherBlocked(
  userA: string,
  userB: string
): Promise<boolean> {
  const rows = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .where(
      inArray(blockedUsers.blockerId, [userA, userB])
    );
  return rows.some(
    (r) => r.id !== undefined
  )
    ? (
        await db
          .select()
          .from(blockedUsers)
          .where(inArray(blockedUsers.blockerId, [userA, userB]))
      ).some(
        (b) =>
          (b.blockerId === userA && b.blockedId === userB) ||
          (b.blockerId === userB && b.blockedId === userA)
      )
    : false;
}
