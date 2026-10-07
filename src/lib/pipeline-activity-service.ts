import prisma from "@/lib/prisma";
import type { PipelineActor } from "@/lib/pipeline-security";
import { notifyPrivatePipelineUpdate } from "@/lib/pipeline-security";
import {
  dispatchDashboardInvalidation,
  type DispatchDashboardInvalidationInput,
} from "@/lib/dashboard/dashboard-realtime-server";
import { dispatchNotification } from "@/lib/notification-dispatcher";
import { isDueDateFulfilled, pipelineOpportunitySelect } from "@/lib/pipeline-opportunities";
import { requireCapability } from "@/lib/access/pipeline-capabilities";
import { v2 as cloudinary } from "cloudinary";

export interface ActivityServiceDeps {
  notifyPrivatePipelineUpdate?: (dealId: string, event: any) => Promise<any>;
  dispatchDashboardInvalidation?: (input: DispatchDashboardInvalidationInput) => Promise<void>;
  dispatchNotification?: (userId: string, notification: any) => Promise<any>;
}

export interface AddActivityLogInput {
  opportunityId: string;
  content: string;
  parentId?: string;
}

export interface AddSystemLogInput {
  opportunityId: string;
  content: string;
}

export interface DeleteActivityLogInput {
  logId: string;
  existingLog: {
    id: string;
    opportunityId: string;
    userId: string;
    type: string;
    content: string;
  };
  opportunity: any;
}

/**
 * Core activity log service for adding comments and replies.
 * Executes atomic transaction with due date fulfillment and dispatches notifications/realtime.
 * Isolated from "use server" boundary so actors must be verified before invocation.
 */
export async function addActivityLogForActor(
  actor: PipelineActor,
  input: AddActivityLogInput,
  deps?: ActivityServiceDeps
) {
  const { opportunityId, content, parentId } = input;

  const [parent, deal] = await Promise.all([
    parentId
      ? prisma.activityLog.findFirst({
          where: { id: parentId, opportunityId },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { teamMembers: true },
    }),
  ]);

  if (parentId && !parent) throw new Error("Reply target not found.");

  // Pre-calculate notification inputs if deal exists
  const notificationInputs: Array<{
    type: "DEAL_COMMENT";
    senderId: string;
    recipientId: string;
    referenceId: string;
    title: string;
    message: string;
  }> = [];

  if (deal) {
    const mentionedUsernames = Array.from(content.matchAll(/@([^\s<]+)/g)).map(
      (m: RegExpMatchArray) => m[1].toLowerCase()
    );
    const mentionedUserIds = new Set<string>();
    if (mentionedUsernames.length > 0) {
      const allUsers = await prisma.user.findMany({ select: { id: true, name: true } });
      allUsers.forEach((u: { id: string; name: string | null }) => {
        if (u.name && mentionedUsernames.includes(u.name.replace(/\s+/g, "").toLowerCase())) {
          mentionedUserIds.add(u.id);
        }
      });
    }

    mentionedUserIds.delete(actor.id);
    const teamUserIds = new Set<string>(deal.teamMembers.map((m: { id: string }) => m.id));
    teamUserIds.add(deal.ownerId);
    teamUserIds.delete(actor.id);
    const standardNotifyIds = new Set<string>(
      Array.from(teamUserIds).filter((id: string) => !mentionedUserIds.has(id))
    );

    notificationInputs.push(
      ...Array.from(mentionedUserIds).map((recipientId) => ({
        type: "DEAL_COMMENT" as const,
        senderId: actor.id,
        recipientId,
        referenceId: deal.id,
        title: "You were mentioned",
        message: `Mentioned you in a comment on: ${deal.topic}`,
      })),
      ...Array.from(standardNotifyIds).map((recipientId) => ({
        type: "DEAL_COMMENT" as const,
        senderId: actor.id,
        recipientId,
        referenceId: deal.id,
        title: "New Comment",
        message: `Commented on deal: ${deal.topic}`,
      }))
    );
  }

  // Atomic transaction: create comment + conditionally clear fulfilled due date in Asia/Bangkok time
  const { newLogRaw, dueDateCleared, createdNotifications } = await prisma.$transaction(
    async (tx) => {
      const createdLog = await tx.activityLog.create({
        data: {
          content,
          opportunity: { connect: { id: opportunityId } },
          user: { connect: { id: actor.id } },
          type: "COMMENT",
          ...(parentId && { parent: { connect: { id: parentId } } }),
        },
        include: {
          user: true,
        },
      });

      let cleared = false;
      // Re-read current opportunity state inside the transaction to avoid stale snapshot race
      const currentOpp = await tx.opportunity.findUnique({
        where: { id: opportunityId },
        select: { dueDate: true },
      });

      if (currentOpp?.dueDate && isDueDateFulfilled(currentOpp.dueDate, createdLog.createdAt)) {
        // Optimistic concurrency check: only clear if dueDate hasn't been concurrently rescheduled!
        const updateResult = await tx.opportunity.updateMany({
          where: {
            id: opportunityId,
            dueDate: currentOpp.dueDate,
          },
          data: { dueDate: null },
        });
        cleared = updateResult.count > 0;
      }

      let notifications: Array<{ id: string; recipientId: string }> = [];
      if (notificationInputs.length > 0) {
        notifications = await Promise.all(
          notificationInputs.map((data) =>
            tx.notification.create({ data, include: { sender: true } })
          )
        );
      }

      return {
        newLogRaw: createdLog,
        dueDateCleared: cleared,
        createdNotifications: notifications,
      };
    }
  );

  if (!newLogRaw) throw new Error("Activity was created but could not be loaded.");
  const newLog = { ...newLogRaw, replies: [] };

  const notifyPusher = deps?.notifyPrivatePipelineUpdate ?? notifyPrivatePipelineUpdate;
  const dispatchNotif = deps?.dispatchNotification ?? dispatchNotification;
  const dispatchDash = deps?.dispatchDashboardInvalidation ?? dispatchDashboardInvalidation;

  // Dispatch notifications after successful transaction commit
  if (createdNotifications.length > 0) {
    await Promise.all(
      createdNotifications.map((notification) =>
        dispatchNotif(notification.recipientId, notification)
      )
    ).catch((err) => console.error("[addActivityLog] Notification dispatch failed:", err));
  }

  // If deal had an active Due Date that was fulfilled by this activity update, notify board
  if (dueDateCleared) {
    const fullDeal = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: pipelineOpportunitySelect,
    });
    if (fullDeal) {
      await notifyPusher(opportunityId, {
        action: "OPPORTUNITY_UPDATED",
        deal: fullDeal,
      });
    }
  }

  await notifyPusher(opportunityId, {
    action: "ACTIVITY_ADDED",
    dealId: opportunityId,
    activityLog: newLog,
  });
  void dispatchDash({
    resources: ["leaderboard"],
  }).catch(() => {});

  return newLog;
}

/**
 * Core service for adding system update audit logs.
 * Restricted strictly to ADMIN role.
 */
export async function addSystemLogForActor(
  actor: PipelineActor,
  input: AddSystemLogInput,
  deps?: ActivityServiceDeps
) {
  const { opportunityId, content } = input;
  if (actor.role !== "ADMIN") {
    throw new Error("Forbidden: Only System Admin can create custom system logs.");
  }
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Invalid log content");
  }

  const result = await prisma.activityLog.create({
    data: {
      content: content.trim(),
      opportunity: { connect: { id: opportunityId } },
      user: { connect: { id: actor.id } },
      type: "SYSTEM_UPDATE",
    },
    include: {
      user: true,
      replies: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
  });

  const notifyPusher = deps?.notifyPrivatePipelineUpdate ?? notifyPrivatePipelineUpdate;
  await notifyPusher(opportunityId, {
    action: "ACTIVITY_ADDED",
    dealId: opportunityId,
    activityLog: result,
  });
  return result;
}

/**
 * Core service for deleting an activity log.
 * Enforces ownership, system update admin restrictions, and Due Date log preservation.
 */
export async function deleteActivityLogForActor(
  actor: PipelineActor,
  input: DeleteActivityLogInput,
  deps?: ActivityServiceDeps
) {
  const { logId, existingLog: log, opportunity } = input;
  const isAdmin = actor.role === "ADMIN";

  if (log.type === "SYSTEM_UPDATE" && !isAdmin) {
    throw new Error("Only admins can delete system logs.");
  }

  if (log.content.startsWith("[DUE DATE:") && !isAdmin) {
    throw new Error("Only admins can delete Due Date logs.");
  }

  requireCapability(actor, "deal:edit_own_comment", {
    ...opportunity,
    commentAuthorId: log.userId,
  });

  // Find any attachments in this log
  const attachmentUrls: string[] = [];
  const regex = /\[ATTACHMENT:([^\]|]+)\|[^\]]+\]/g;
  let match;
  while ((match = regex.exec(log.content)) !== null) {
    attachmentUrls.push(match[1]);
  }

  const attachmentCleanup: Array<{
    id: string;
    fileType: string;
    cloudinaryPublicId: string | null;
  }> = [];
  if (attachmentUrls.length > 0) {
    const attachments = await prisma.attachment.findMany({
      where: { cloudinaryUrl: { in: attachmentUrls } },
    });
    attachmentCleanup.push(...attachments);
  }

  if (attachmentCleanup.length > 0) {
    await prisma.attachment.deleteMany({
      where: { id: { in: attachmentCleanup.map((item) => item.id) } },
    });
  }

  await prisma.activityLog.delete({
    where: { id: logId },
  });

  await Promise.all(
    attachmentCleanup.map(async (att) => {
      if (!att.cloudinaryPublicId) return;
      const resourceType = att.fileType.startsWith("image/") ? "image" : "raw";
      try {
        await cloudinary.uploader.destroy(att.cloudinaryPublicId, {
          resource_type: resourceType,
        });
      } catch (error) {
        console.error("Failed to delete from Cloudinary after Activity deletion:", error);
      }
    })
  );

  const nextLatestLog = await prisma.activityLog.findFirst({
    where: {
      opportunityId: log.opportunityId,
      parentId: null,
      type: "COMMENT",
      NOT: { content: { startsWith: "[DUE DATE:" } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: true,
      replies: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
  });

  const notifyPusher = deps?.notifyPrivatePipelineUpdate ?? notifyPrivatePipelineUpdate;
  await notifyPusher(log.opportunityId, {
    action: "ACTIVITY_DELETED",
    dealId: log.opportunityId,
    logId,
    nextLatestLog,
  });

  return { success: true };
}
