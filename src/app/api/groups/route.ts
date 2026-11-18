import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray, isNull, and } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  groups,
  groupMembers,
  users,
  messages,
  attachments,
} from "@/db";
import {
  generateId,
  getAuthenticatedUser,
  toPublicOperator,
} from "@/lib/auth";
import type { GroupRole, TacticalGroup } from "@/types/gorgor";

export async function buildUserGroups(userId: string): Promise<TacticalGroup[]> {
  const myMemberships = await db
    .select()
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));

  if (myMemberships.length === 0) return [];
  const groupIds = myMemberships.map((m) => m.groupId);
  const myRoleMap = new Map(
    myMemberships.map((m) => [m.groupId, m.role as GroupRole])
  );

  const [groupRows, allMemberRows, recentMessages] = await Promise.all([
    db.select().from(groups).where(inArray(groups.id, groupIds)),
    db
      .select({ member: groupMembers, user: users })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(inArray(groupMembers.groupId, groupIds)),
    db
      .select({ msg: messages, sender: users })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(
        and(inArray(messages.groupId, groupIds), isNull(messages.deletedAt))
      )
      .orderBy(desc(messages.createdAt))
      .limit(100),
  ]);

  const latestMsgByGroup = new Map<
    string,
    { msg: typeof messages.$inferSelect; senderCallsign: string }
  >();
  for (const row of recentMessages) {
    if (row.msg.groupId && !latestMsgByGroup.has(row.msg.groupId)) {
      latestMsgByGroup.set(row.msg.groupId, {
        msg: row.msg,
        senderCallsign: row.sender.callsign,
      });
    }
  }

  const latestMsgIds = Array.from(latestMsgByGroup.values()).map(
    (v) => v.msg.id
  );
  const attMsgIds = new Set<string>();
  if (latestMsgIds.length > 0) {
    const attRows = await db
      .select({ messageId: attachments.messageId })
      .from(attachments)
      .where(inArray(attachments.messageId, latestMsgIds));
    for (const a of attRows) {
      if (a.messageId) attMsgIds.add(a.messageId);
    }
  }

  const roleOrder: Record<string, number> = {
    leader: 0,
    navigator: 1,
    comms: 2,
    medic: 3,
    recon: 4,
    operator: 5,
  };

  return groupRows
    .map((g) => {
      const gMembers = allMemberRows
        .filter((r) => r.member.groupId === g.id)
        .sort(
          (a, b) =>
            (roleOrder[a.member.role] ?? 9) - (roleOrder[b.member.role] ?? 9)
        )
        .map((r) => ({
          id: r.member.id,
          userId: r.member.userId,
          role: r.member.role as GroupRole,
          joinedAt: r.member.joinedAt.toISOString(),
          operator: toPublicOperator(r.user, false),
        }));

      const last = latestMsgByGroup.get(g.id);
      return {
        id: g.id,
        name: g.name,
        code: g.code,
        description: g.description,
        sector: g.sector,
        minMembers: g.minMembers,
        maxMembers: g.maxMembers,
        memberCount: gMembers.length,
        createdById: g.createdById,
        myRole: myRoleMap.get(g.id) ?? "operator",
        createdAt: g.createdAt.toISOString(),
        members: gMembers,
        lastMessage: last
          ? {
              id: last.msg.id,
              content: last.msg.content,
              senderCallsign: last.senderCallsign,
              hasAttachment: attMsgIds.has(last.msg.id),
              hasCoord: last.msg.coordLat !== null,
              createdAt: last.msg.createdAt.toISOString(),
            }
          : null,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function GET() {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const list = await buildUserGroups(me.id);
    return NextResponse.json({ groups: list });
  } catch (err) {
    console.error("GET /api/groups error:", err);
    return NextResponse.json(
      { error: "Failed to load squads." },
      { status: 500 }
    );
  }
}

const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(60),
  code: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, "Code must be alphanumeric/hyphen"),
  sector: z.string().trim().max(80).optional(),
  description: z.string().trim().max(240).optional(),
  memberIds: z.array(z.string().min(1)).min(4).max(5),
});

export async function POST(req: NextRequest) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "A GORGOR tactical squad requires 5–6 members total (select 4 or 5 operators plus yourself) and a valid name/code.",
        },
        { status: 400 }
      );
    }

    const uniquePeerIds = Array.from(
      new Set(parsed.data.memberIds.filter((id) => id !== me.id))
    );
    if (uniquePeerIds.length < 4 || uniquePeerIds.length > 5) {
      return NextResponse.json(
        {
          error:
            "Select 4 or 5 distinct operators so the squad has 5–6 members total.",
        },
        { status: 400 }
      );
    }

    const codeUpper = parsed.data.code.toUpperCase();
    const existingCode = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.code, codeUpper))
      .limit(1);
    if (existingCode.length > 0) {
      return NextResponse.json(
        { error: `Squad code ${codeUpper} is already in use.` },
        { status: 409 }
      );
    }

    const peerUsers = await db
      .select()
      .from(users)
      .where(inArray(users.id, uniquePeerIds));
    if (peerUsers.length !== uniquePeerIds.length) {
      return NextResponse.json(
        { error: "One or more selected operators were not found." },
        { status: 400 }
      );
    }

    const declined = peerUsers.find((u) => !u.allowGroupInvites);
    if (declined) {
      return NextResponse.json(
        {
          error: `${declined.callsign} has disabled squad invitations in Privacy Settings.`,
        },
        { status: 403 }
      );
    }

    const groupId = generateId("grp");
    await db.insert(groups).values({
      id: groupId,
      name: parsed.data.name,
      code: codeUpper,
      sector: parsed.data.sector?.trim() || "38N NH — Field Sector",
      description: parsed.data.description?.trim() || "",
      minMembers: 5,
      maxMembers: 6,
      createdById: me.id,
    });

    const defaultRoles: GroupRole[] = [
      "navigator",
      "comms",
      "medic",
      "recon",
      "operator",
    ];
    const memberInserts: (typeof groupMembers.$inferInsert)[] = [
      {
        id: generateId("gm"),
        groupId,
        userId: me.id,
        role: "leader",
      },
      ...uniquePeerIds.map((uid, idx) => ({
        id: generateId("gm"),
        groupId,
        userId: uid,
        role: defaultRoles[idx] ?? "operator",
      })),
    ];

    await db.insert(groupMembers).values(memberInserts);

    const updatedGroups = await buildUserGroups(me.id);
    const created = updatedGroups.find((g) => g.id === groupId);
    return NextResponse.json(
      { group: created, groups: updatedGroups },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/groups error:", err);
    return NextResponse.json(
      { error: "Failed to create tactical squad." },
      { status: 500 }
    );
  }
}
