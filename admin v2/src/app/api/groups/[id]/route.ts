import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, groups, groupMembers, users } from "@/db";
import { generateId, getAuthenticatedUser } from "@/lib/auth";
import { buildUserGroups } from "../route";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_member"),
    userId: z.string().min(1),
    role: z
      .enum(["navigator", "comms", "medic", "recon", "operator"])
      .optional(),
  }),
  z.object({
    action: z.literal("remove_member"),
    userId: z.string().min(1),
  }),
  z.object({
    action: z.literal("leave"),
  }),
  z.object({
    action: z.literal("update_role"),
    userId: z.string().min(1),
    role: z.enum([
      "leader",
      "navigator",
      "comms",
      "medic",
      "recon",
      "operator",
    ]),
  }),
]);

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: groupId } = await context.params;

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);
    if (!group) {
      return NextResponse.json({ error: "Squad not found." }, { status: 404 });
    }

    const members = await db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));

    const myMembership = members.find((m) => m.userId === me.id);
    if (!myMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const act = parsed.data;

    if (act.action === "add_member") {
      if (members.length >= group.maxMembers) {
        return NextResponse.json(
          {
            error: `Squad is at maximum capacity (${group.maxMembers}/${group.maxMembers} operators).`,
          },
          { status: 400 }
        );
      }
      if (members.some((m) => m.userId === act.userId)) {
        return NextResponse.json(
          { error: "Operator is already in this squad." },
          { status: 409 }
        );
      }
      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, act.userId))
        .limit(1);
      if (!target) {
        return NextResponse.json(
          { error: "Operator not found." },
          { status: 404 }
        );
      }
      if (!target.allowGroupInvites) {
        return NextResponse.json(
          {
            error: `${target.callsign} has disabled squad invitations in Privacy Settings.`,
          },
          { status: 403 }
        );
      }
      await db.insert(groupMembers).values({
        id: generateId("gm"),
        groupId,
        userId: target.id,
        role: act.role ?? "operator",
      });
    } else if (act.action === "remove_member") {
      if (myMembership.role !== "leader" && group.createdById !== me.id) {
        return NextResponse.json(
          { error: "Only the Squad Leader can remove members." },
          { status: 403 }
        );
      }
      if (act.userId === me.id) {
        return NextResponse.json(
          { error: "Use Leave Squad to exit yourself." },
          { status: 400 }
        );
      }
      await db
        .delete(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, act.userId)
          )
        );
    } else if (act.action === "leave") {
      await db
        .delete(groupMembers)
        .where(
          and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, me.id))
        );
      const remaining = members.filter((m) => m.userId !== me.id);
      if (remaining.length === 0) {
        await db.delete(groups).where(eq(groups.id, groupId));
      } else if (
        myMembership.role === "leader" &&
        !remaining.some((r) => r.role === "leader")
      ) {
        await db
          .update(groupMembers)
          .set({ role: "leader" })
          .where(eq(groupMembers.id, remaining[0].id));
      }
    } else if (act.action === "update_role") {
      if (myMembership.role !== "leader" && group.createdById !== me.id) {
        return NextResponse.json(
          { error: "Only the Squad Leader can reassign roles." },
          { status: 403 }
        );
      }
      await db
        .update(groupMembers)
        .set({ role: act.role })
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, act.userId)
          )
        );
    }

    const updated = await buildUserGroups(me.id);
    return NextResponse.json({ groups: updated });
  } catch (err) {
    console.error("PATCH /api/groups/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update squad." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const me = await getAuthenticatedUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: groupId } = await context.params;

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);
    if (!group) {
      return NextResponse.json({ error: "Squad not found." }, { status: 404 });
    }

    const [myMember] = await db
      .select()
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, me.id))
      )
      .limit(1);

    if (
      group.createdById !== me.id &&
      (!myMember || myMember.role !== "leader")
    ) {
      return NextResponse.json(
        { error: "Only the Squad Leader can disband a squad." },
        { status: 403 }
      );
    }

    await db.delete(groups).where(eq(groups.id, groupId));
    const updated = await buildUserGroups(me.id);
    return NextResponse.json({ groups: updated });
  } catch (err) {
    console.error("DELETE /api/groups/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to disband squad." },
      { status: 500 }
    );
  }
}
