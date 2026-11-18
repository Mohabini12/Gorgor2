import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  messages,
  users,
  attachments,
  groupMembers,
} from "@/db";
import {
  doUsersShareGroup,
  generateId,
  getAuthenticatedUser,
  isEitherBlocked,
} from "@/lib/auth";
import { formatMGRS } from "@/lib/coordinates";
import type { ChatMessage, MessageAttachment } from "@/types/gorgor";

async function hydrateMessages(
  rows: { msg: typeof messages.$inferSelect; sender: typeof users.$inferSelect }[],
  recipientPrivacyMap?: Map<string, boolean>
): Promise<ChatMessage[]> {
  if (rows.length === 0) return [];
  const msgIds = rows.map((r) => r.msg.id);
  const attRows = await db
    .select()
    .from(attachments)
    .where(inArray(attachments.messageId, msgIds));

  const attByMsg = new Map<string, MessageAttachment[]>();
  for (const a of attRows) {
    if (!a.messageId) continue;
    const list = attByMsg.get(a.messageId) ?? [];
    list.push({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      category: a.category as "image" | "document",
      url: `/api/uploads/${a.id}`,
      createdAt: a.createdAt.toISOString(),
    });
    attByMsg.set(a.messageId, list);
  }

  return rows.map(({ msg, sender }) => {
    const allowReceipt = msg.recipientId
      ? (recipientPrivacyMap?.get(msg.recipientId) ?? true)
      : false;
    return {
      id: msg.id,
      senderId: msg.senderId,
      sender: {
        id: sender.id,
        displayName: sender.displayName,
        callsign: sender.callsign,
        avatarColor: sender.avatarColor,
      },
      recipientId: msg.recipientId,
      groupId: msg.groupId,
      content: msg.content,
      coordLat: msg.coordLat,
      coordLon: msg.coordLon,
      coordMgrs: msg.coordMgrs,
      coordLabel: msg.coordLabel,
      readAt: allowReceipt && msg.readAt ? msg.readAt.toISOString() : null,
      createdAt: msg.createdAt.toISOString(),
      attachments: attByMsg.get(msg.id) ?? [],
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const groupId = req.nextUrl.searchParams.get("groupId");
    const peerId = req.nextUrl.searchParams.get("userId");

    if (groupId) {
      const [membership] = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, me.id)
          )
        )
        .limit(1);

      if (!membership) {
        return NextResponse.json(
          { error: "Not a member of this squad." },
          { status: 403 }
        );
      }

      const rows = await db
        .select({ msg: messages, sender: users })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(and(eq(messages.groupId, groupId), isNull(messages.deletedAt)))
        .orderBy(asc(messages.createdAt))
        .limit(200);

      const list = await hydrateMessages(rows);
      return NextResponse.json({ messages: list });
    }

    if (peerId) {
      const [peer] = await db
        .select()
        .from(users)
        .where(eq(users.id, peerId))
        .limit(1);
      if (!peer) {
        return NextResponse.json(
          { error: "Operator not found." },
          { status: 404 }
        );
      }

      // Mark incoming unread DMs as read
      const now = new Date();
      await db
        .update(messages)
        .set({ readAt: now })
        .where(
          and(
            isNull(messages.groupId),
            eq(messages.senderId, peerId),
            eq(messages.recipientId, me.id),
            isNull(messages.readAt)
          )
        );

      const rows = await db
        .select({ msg: messages, sender: users })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(
          and(
            isNull(messages.groupId),
            isNull(messages.deletedAt),
            or(
              and(
                eq(messages.senderId, me.id),
                eq(messages.recipientId, peerId)
              ),
              and(
                eq(messages.senderId, peerId),
                eq(messages.recipientId, me.id)
              )
            )
          )
        )
        .orderBy(asc(messages.createdAt))
        .limit(200);

      // Respect both operators' readReceipts settings when exposing readAt to sender
      const receiptMap = new Map<string, boolean>([
        [me.id, me.readReceipts],
        [peer.id, peer.readReceipts],
      ]);
      const list = await hydrateMessages(rows, receiptMap);
      return NextResponse.json({ messages: list });
    }

    return NextResponse.json(
      { error: "Specify either groupId or userId." },
      { status: 400 }
    );
  } catch (err) {
    console.error("GET /api/messages error:", err);
    return NextResponse.json(
      { error: "Failed to load messages." },
      { status: 500 }
    );
  }
}

const sendSchema = z.object({
  groupId: z.string().min(1).optional(),
  recipientId: z.string().min(1).optional(),
  content: z.string().trim().max(4000).optional().default(""),
  coord: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      mgrs: z.string().max(40).optional(),
      label: z.string().max(80).optional(),
    })
    .optional(),
  attachmentIds: z.array(z.string().min(1)).max(5).optional().default([]),
});

export async function POST(req: NextRequest) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid message payload." },
        { status: 400 }
      );
    }

    const { groupId, recipientId, content, coord, attachmentIds } = parsed.data;
    if ((!groupId && !recipientId) || (groupId && recipientId)) {
      return NextResponse.json(
        { error: "Provide exactly one of groupId or recipientId." },
        { status: 400 }
      );
    }

    if (!content && !coord && attachmentIds.length === 0) {
      return NextResponse.json(
        { error: "Message must contain text, a coordinate pin, or an attachment." },
        { status: 400 }
      );
    }

    if (groupId) {
      const [membership] = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, me.id)
          )
        )
        .limit(1);
      if (!membership) {
        return NextResponse.json(
          { error: "You are not a member of this squad." },
          { status: 403 }
        );
      }
    }

    if (recipientId) {
      if (recipientId === me.id) {
        return NextResponse.json(
          { error: "Cannot send a direct message to yourself." },
          { status: 400 }
        );
      }
      const [peer] = await db
        .select()
        .from(users)
        .where(eq(users.id, recipientId))
        .limit(1);
      if (!peer) {
        return NextResponse.json(
          { error: "Recipient not found." },
          { status: 404 }
        );
      }

      if (await isEitherBlocked(me.id, peer.id)) {
        return NextResponse.json(
          { error: "Messaging is blocked between these accounts." },
          { status: 403 }
        );
      }

      // Enforce recipient's direct message privacy rule
      if (peer.allowDirectMessages === "nobody") {
        return NextResponse.json(
          {
            error: `${peer.callsign} has disabled private direct messages in Privacy Settings.`,
          },
          { status: 403 }
        );
      }
      if (peer.allowDirectMessages === "groups_only") {
        const shared = await doUsersShareGroup(me.id, peer.id);
        if (!shared) {
          return NextResponse.json(
            {
              error: `${peer.callsign} only accepts direct messages from shared squad members.`,
            },
            { status: 403 }
          );
        }
      }
    }

    const msgId = generateId("msg");
    const [inserted] = await db
      .insert(messages)
      .values({
        id: msgId,
        senderId: me.id,
        groupId: groupId ?? null,
        recipientId: recipientId ?? null,
        content,
        coordLat: coord ? coord.lat : null,
        coordLon: coord ? coord.lon : null,
        coordMgrs: coord
          ? coord.mgrs || formatMGRS(coord.lat, coord.lon, 5)
          : null,
        coordLabel: coord?.label || null,
      })
      .returning();

    if (attachmentIds.length > 0) {
      await db
        .update(attachments)
        .set({ messageId: msgId })
        .where(
          and(
            inArray(attachments.id, attachmentIds),
            eq(attachments.uploaderId, me.id),
            isNull(attachments.messageId)
          )
        );
    }

    const [hydrated] = await hydrateMessages([{ msg: inserted, sender: me }]);
    return NextResponse.json({ message: hydrated }, { status: 201 });
  } catch (err) {
    console.error("POST /api/messages error:", err);
    return NextResponse.json(
      { error: "Failed to transmit message." },
      { status: 500 }
    );
  }
}
