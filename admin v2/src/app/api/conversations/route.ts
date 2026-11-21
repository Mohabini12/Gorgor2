import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db, messages, users, attachments, blockedUsers } from "@/db";
import { getAuthenticatedUser, toPublicOperator } from "@/lib/auth";
import type { DirectThread } from "@/types/gorgor";

export async function GET() {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [dmRows, blockRows] = await Promise.all([
      db
        .select()
        .from(messages)
        .where(
          and(
            isNull(messages.groupId),
            isNull(messages.deletedAt),
            or(
              eq(messages.senderId, me.id),
              eq(messages.recipientId, me.id)
            )
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(400),
      db
        .select({ blockedId: blockedUsers.blockedId })
        .from(blockedUsers)
        .where(eq(blockedUsers.blockerId, me.id)),
    ]);

    const blockedSet = new Set(blockRows.map((b) => b.blockedId));
    const threadMap = new Map<
      string,
      {
        latest: typeof messages.$inferSelect;
        unread: number;
      }
    >();

    for (const m of dmRows) {
      const peerId = m.senderId === me.id ? m.recipientId : m.senderId;
      if (!peerId) continue;
      const existing = threadMap.get(peerId);
      const isUnread = m.recipientId === me.id && m.readAt === null;
      if (!existing) {
        threadMap.set(peerId, {
          latest: m,
          unread: isUnread ? 1 : 0,
        });
      } else if (isUnread) {
        existing.unread += 1;
      }
    }

    const peerIds = Array.from(threadMap.keys());
    if (peerIds.length === 0) {
      return NextResponse.json({ threads: [], totalUnread: 0 });
    }

    const latestMsgIds = Array.from(threadMap.values()).map((t) => t.latest.id);
    const [peerUsers, attRows] = await Promise.all([
      db.select().from(users).where(inArray(users.id, peerIds)),
      latestMsgIds.length > 0
        ? db
            .select({ messageId: attachments.messageId })
            .from(attachments)
            .where(inArray(attachments.messageId, latestMsgIds))
        : Promise.resolve([]),
    ]);

    const attSet = new Set(
      attRows.map((a) => a.messageId).filter(Boolean) as string[]
    );
    const userMap = new Map(peerUsers.map((u) => [u.id, u]));

    let totalUnread = 0;
    const threads: DirectThread[] = [];
    for (const [peerId, info] of threadMap.entries()) {
      const u = userMap.get(peerId);
      if (!u) continue;
      totalUnread += info.unread;
      threads.push({
        peer: toPublicOperator(u, blockedSet.has(peerId)),
        lastMessage: {
          id: info.latest.id,
          senderId: info.latest.senderId,
          content: info.latest.content,
          hasAttachment: attSet.has(info.latest.id),
          hasCoord: info.latest.coordLat !== null,
          readAt: info.latest.readAt ? info.latest.readAt.toISOString() : null,
          createdAt: info.latest.createdAt.toISOString(),
        },
        unreadCount: info.unread,
      });
    }

    return NextResponse.json({ threads, totalUnread });
  } catch (err) {
    console.error("GET /api/conversations error:", err);
    return NextResponse.json(
      { error: "Failed to load conversations." },
      { status: 500 }
    );
  }
}
