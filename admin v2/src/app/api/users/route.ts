import { NextResponse } from "next/server";
import { eq, inArray, ne } from "drizzle-orm";
import { db, users, groupMembers, blockedUsers } from "@/db";
import { getAuthenticatedUser, toPublicOperator } from "@/lib/auth";

export async function GET() {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [allOthers, myGroups, myBlocks] = await Promise.all([
      db.select().from(users).where(ne(users.id, me.id)),
      db
        .select({ groupId: groupMembers.groupId })
        .from(groupMembers)
        .where(eq(groupMembers.userId, me.id)),
      db
        .select({ blockedId: blockedUsers.blockedId })
        .from(blockedUsers)
        .where(eq(blockedUsers.blockerId, me.id)),
    ]);

    const sharedPeerIds = new Set<string>();
    if (myGroups.length > 0) {
      const members = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(
          inArray(
            groupMembers.groupId,
            myGroups.map((g) => g.groupId)
          )
        );
      for (const m of members) sharedPeerIds.add(m.userId);
    }

    const blockedSet = new Set(myBlocks.map((b) => b.blockedId));

    // Respect each operator's profileVisibility setting
    const visible = allOthers
      .filter(
        (u) => u.profileVisibility === "everyone" || sharedPeerIds.has(u.id)
      )
      .map((u) => toPublicOperator(u, blockedSet.has(u.id)))
      .sort((a, b) => a.callsign.localeCompare(b.callsign));

    return NextResponse.json({ operators: visible });
  } catch (err) {
    console.error("GET /api/users error:", err);
    return NextResponse.json(
      { error: "Failed to list operators." },
      { status: 500 }
    );
  }
}
