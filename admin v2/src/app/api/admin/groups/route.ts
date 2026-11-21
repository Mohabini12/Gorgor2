import { NextResponse } from "next/server";
import { desc, eq, count } from "drizzle-orm";
import { db, groups, groupMembers, users } from "@/db";
import { requireAdmin, FORBIDDEN } from "@/lib/admin";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json(FORBIDDEN, { status: 403 });
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      code: groups.code,
      sector: groups.sector,
      createdAt: groups.createdAt,
      createdBy: users.displayName,
    })
    .from(groups)
    .leftJoin(users, eq(users.id, groups.createdById))
    .orderBy(desc(groups.createdAt));
  const counts = await db
    .select({ groupId: groupMembers.groupId, n: count() })
    .from(groupMembers)
    .groupBy(groupMembers.groupId);
  const map = new Map(counts.map((c) => [c.groupId, c.n]));
  return NextResponse.json({
    groups: rows.map((g) => ({ ...g, members: map.get(g.id) ?? 0 })),
  });
}
