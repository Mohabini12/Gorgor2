import { NextResponse } from "next/server";
import { count, gt } from "drizzle-orm";
import { db, users, groups, messages, waypoints, sessions } from "@/db";
import { requireAdmin, FORBIDDEN } from "@/lib/admin";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json(FORBIDDEN, { status: 403 });
  const fiveMin = new Date(Date.now() - 5 * 60 * 1000);
  const [[u], [g], [m], [w], [s], [online]] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(groups),
    db.select({ n: count() }).from(messages),
    db.select({ n: count() }).from(waypoints),
    db.select({ n: count() }).from(sessions),
    db.select({ n: count() }).from(users).where(gt(users.lastSeenAt, fiveMin)),
  ]);
  return NextResponse.json({
    users: u.n,
    groups: g.n,
    messages: m.n,
    waypoints: w.n,
    sessions: s.n,
    onlineNow: online.n,
  });
}
