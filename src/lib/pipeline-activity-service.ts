import { after } from "next/server";
import prisma from "@/lib/prisma";
import type { PipelineActor } from "@/lib/pipeline-security";
import { notifyPrivatePipelineUpdate } from "@/lib/pipeline-security";
import {
  dispatchDashboardInvalidation,
  type DispatchDashboardInvalidationInput,
} from "@/lib/dashboard/dashboard-realtime-server";
import { dispatchNotification } from "@/lib/notification-dispatcher";
import { isDueDateFulfilled, pipelineOpportunitySelect } from "@/lib/pipeline-opportunities";
import {
  calculateElapsedWorkingMs,
  isSameBangkokCalendarDay,
  RED_CARD_WORKING_MS_THRESHOLD,
  resolveTimelineDueDate,
  WORK_HOURS_PER_DAY,
} from "@/lib/business-days";
import {
  classifyUpdateQuality,
  DUPLICATE_LOOKBACK_LIMIT,
  encodeTierPrefix,
  getCommentGrantMs,
  type UpdateIntent,
  type UpdateTier,
} from "@/lib/pipeline-update-quality";
import { getCompanyHolidaysAction, getUserLeavesAction } from "@/lib/actions/holiday";
import { gradeActivityCommentWithAi } from "@/lib/actions/ai-accelerator";
import { requireCapability } from "@/lib/access/pipeline-capabilities";
import type { OpportunityAccessCheckSubject } from "@/lib/access/pipeline-policy";
import { v2 as cloudinary } from "cloudinary";

function runBackgroundJob(task: () => Promise<void> | void) {
  try {
    after(task);
  } catch {
    void Promise.resolve().then(task).catch((err) => {
      console.error("[ACTIVITY-BG-JOB-ERROR]", err);
    });
  }
}

const MENTION_USER_CACHE_TTL_MS = 30_000;
let mentionUsersCache: {
  expiresAt: number;
  users: Array<{ id: string; name: string | null }>;
} | null = null;

async function getUsersForMentionLookup(): Promise<Array<{ id: string; name: string | null }>> {
  const now = Date.now();
  if (mentionUsersCache && mentionUsersCache.expiresAt > now) {
    return mentionUsersCache.users;
  }
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  if (users.length > 0) {
    mentionUsersCache = {
      expiresAt: now + MENTION_USER_CACHE_TTL_MS,
      users,
    };
  }
  return users;
}

export interface ActivityServiceDeps {
  notifyPrivatePipelineUpdate?: (dealId: string, event: Record<string, unknown>) => Promise<unknown>;
  dispatchDashboardInvalidation?: (input: DispatchDashboardInvalidationInput) => Promise<void>;
  dispatchNotification?: (userId: string, notification: unknown) => Promise<unknown>;
}

export interface AddActivityLogInput {
  opportunityId: string;
  content: string;
  parentId?: string;
  updateIntent?: UpdateIntent;
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
    parentId?: string | null;
  };
  opportunity: OpportunityAccessCheckSubject;
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
  const { opportunityId, content, parentId, updateIntent } = input;
  const isSpecialSystemComment =
    content.startsWith("[URGENT_") || content.startsWith("[DUE DATE:");

  const [parent, deal, recentTopComments] = await Promise.all([
    parentId
      ? prisma.activityLog.findFirst({
          where: { id: parentId, opportunityId },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: {
        id: true,
        topic: true,
        ownerId: true,
        createdAt: true,
        dueDate: true,
        teamMembers: { select: { id: true } },
      },
    }),
    !parentId && !isSpecialSystemComment
      ? prisma.activityLog.findMany({
          where: {
            opportunityId,
            parentId: null,
            type: "COMMENT",
            NOT: [
              { content: { startsWith: "[URGENT_" } },
              { content: { startsWith: "[DUE DATE:" } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: { content: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  if (parentId && !parent) throw new Error("Reply target not found.");

  // Server-authoritative Update Quality classification + Non-Punitive Ceiling
  let storedContent = content;
  let evaluatedTier: UpdateTier = parentId ? "0H" : "27H";
  let requiresAiGrading = false;
  let priorCeilingHours: number | undefined;

  if (!parentId && !isSpecialSystemComment) {
    const quality = classifyUpdateQuality(content, {
      intent: updateIntent,
      isReply: false,
      previousCommentsWithMeta: recentTopComments
        .slice(0, DUPLICATE_LOOKBACK_LIMIT)
        .map((c) => ({
          content: c.content,
          createdAt: c.createdAt,
        })),
    });
    evaluatedTier = quality.tier;
    requiresAiGrading = quality.requiresAiGrading;

    if (quality.tier !== "0H") {
      const prevTimerLog = recentTopComments.find((c) => !c.content.startsWith("[TIER:0H]"));
      const baseDateRaw = prevTimerLog?.createdAt ?? deal?.createdAt ?? null;
      if (baseDateRaw) {
        const baseDate = new Date(baseDateRaw);
        const prevGrantMs = prevTimerLog
          ? getCommentGrantMs(prevTimerLog.content)
          : RED_CARD_WORKING_MS_THRESHOLD;

        let companyHolidays = new Set<string>();
        let ownerPersonalLeaves: Set<string> | undefined;
        if (!deps) {
          const [holidaysList, leavesList] = await Promise.all([
            getCompanyHolidaysAction(),
            getUserLeavesAction(),
          ]);
          companyHolidays = new Set(holidaysList);
          if (deal?.ownerId) {
            const ownerSet = new Set<string>();
            for (const l of leavesList) {
              if (l.userId === deal.ownerId) ownerSet.add(l.dateStr);
            }
            if (ownerSet.size > 0) ownerPersonalLeaves = ownerSet;
          }
        }

        const elapsedMs = calculateElapsedWorkingMs(baseDate, new Date(), companyHolidays, {
          ceilingMs: prevGrantMs,
          stopAtMs: prevGrantMs,
          personalLeaves: ownerPersonalLeaves,
        });
        const remainingHours = Math.max(0, (prevGrantMs - elapsedMs) / (3600 * 1000));
        priorCeilingHours = Math.max(WORK_HOURS_PER_DAY, remainingHours);
      }
    }

    storedContent = encodeTierPrefix(
      content,
      quality.grade,
      quality.grade === "BRIEF_9H" ? priorCeilingHours : undefined
    );
  }

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
      const allUsers = await getUsersForMentionLookup();
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

  // Lean atomic transaction: create comment + conditionally clear fulfilled due date in Asia/Bangkok time
  // Notifications are persisted post-commit in background to cut interactive transaction latency by ~50-75%.
  const { newLogRaw, dueDateCleared } = await prisma.$transaction(
    async (tx) => {
      const createdLog = await tx.activityLog.create({
        data: {
          content: storedContent,
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
      const isTopLevelProgressComment =
        !parentId &&
        !isSpecialSystemComment &&
        evaluatedTier !== "0H";

      if (isTopLevelProgressComment) {
        // Re-read current opportunity state inside the transaction to avoid stale snapshot race
        const currentOpp = await tx.opportunity.findUnique({
          where: { id: opportunityId },
          select: { dueDate: true },
        });

        if (
          currentOpp?.dueDate &&
          isDueDateFulfilled(currentOpp.dueDate, createdLog.createdAt)
        ) {
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
      }

      return {
        newLogRaw: createdLog,
        dueDateCleared: cleared,
      };
    }
  );

  if (!newLogRaw) throw new Error("Activity was created but could not be loaded.");
  const newLog = { ...newLogRaw, replies: [] };

  const notifyPusher = deps?.notifyPrivatePipelineUpdate ?? notifyPrivatePipelineUpdate;
  const dispatchNotif = deps?.dispatchNotification ?? dispatchNotification;
  const dispatchDash = deps?.dispatchDashboardInvalidation ?? dispatchDashboardInvalidation;

  const publishPostCommitEvents = async () => {
    // Persist & dispatch notifications asynchronously outside the interactive user-blocking transaction
    if (notificationInputs.length > 0 && !deps) {
      try {
        const createdNotifications = await Promise.all(
          notificationInputs.map((data) =>
            prisma.notification.create({ data, include: { sender: true } })
          )
        );
        await Promise.all(
          createdNotifications.map((notification) =>
            dispatchNotif(notification.recipientId, notification)
          )
        );
      } catch (err) {
        console.error("[addActivityLog] Notification dispatch failed:", err);
      }
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

    // Async v2.2 Zero-Button AI Auto-Grader for all non-0H top-level updates (0ms user latency)
    if (!deps && !parentId && !isSpecialSystemComment && requiresAiGrading) {
      await gradeActivityCommentWithAi({
        dealId: opportunityId,
        logId: newLog.id,
        rawContent: storedContent,
        authorId: actor.id,
        priorCeilingHours,
      });
    }
  };

  if (deps) {
    await publishPostCommitEvents();
  } else {
    runBackgroundJob(publishPostCommitEvents);
  }

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
  if (deps) {
    await notifyPusher(opportunityId, {
      action: "ACTIVITY_ADDED",
      dealId: opportunityId,
      activityLog: result,
    });
  } else {
    runBackgroundJob(async () => {
      await notifyPusher(opportunityId, {
        action: "ACTIVITY_ADDED",
        dealId: opportunityId,
        activityLog: result,
      });
    });
  }
  return result;
}

/**
 * Reconciles `Opportunity.dueDate` with the top-level COMMENT timeline after an Admin edits or deletes a log.
 * Returns the updated Pipeline card DTO if `Opportunity.dueDate` changed, otherwise `null`.
 */
export async function syncOpportunityDueDateWithTimeline(
  opportunityId: string,
  options?: { hadDueDateLogMutation?: boolean }
) {
  const currentOpp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, dueDate: true, createdAt: true },
  });
  if (!currentOpp) return null;

  const topLevelComments = await prisma.activityLog.findMany({
    where: {
      opportunityId,
      parentId: null,
      type: "COMMENT",
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      content: true,
      type: true,
      createdAt: true,
      parentId: true,
    },
  });

  const resolvedDueDate = resolveTimelineDueDate({
    logs: topLevelComments,
    fallbackDueDate: options?.hadDueDateLogMutation ? null : currentOpp.dueDate,
    dealCreatedAt: currentOpp.createdAt,
    evalDate: new Date(),
  });

  const bothNull = !currentOpp.dueDate && !resolvedDueDate;
  const bothSameDay =
    Boolean(currentOpp.dueDate) &&
    Boolean(resolvedDueDate) &&
    isSameBangkokCalendarDay(currentOpp.dueDate, resolvedDueDate);

  if (bothNull || bothSameDay) {
    return null;
  }

  return await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { dueDate: resolvedDueDate },
    select: pipelineOpportunitySelect,
  });
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
    cloudinaryUrl: string | null;
    cloudinaryPublicId: string | null;
    googleDriveFileId: string | null;
  }> = [];
  if (attachmentUrls.length > 0) {
    const driveIds = attachmentUrls
      .map((u) => {
        const m = u.match(/\/api\/attachments\/drive\/([^/?|#]+)/);
        return m ? m[1] : null;
      })
      .filter((id): id is string => Boolean(id));

    const attachments = await prisma.attachment.findMany({
      where: {
        OR: [
          { cloudinaryUrl: { in: attachmentUrls } },
          ...(driveIds.length > 0 ? [{ googleDriveFileId: { in: driveIds } }] : []),
        ],
      },
      select: {
        id: true,
        fileType: true,
        cloudinaryUrl: true,
        cloudinaryPublicId: true,
        googleDriveFileId: true,
      },
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

  const reconciledDeal =
    log.type === "COMMENT" && !log.parentId
      ? await syncOpportunityDueDateWithTimeline(log.opportunityId, {
          hadDueDateLogMutation: log.content.startsWith("[DUE DATE:"),
        })
      : null;

  const notifyPusher = deps?.notifyPrivatePipelineUpdate ?? notifyPrivatePipelineUpdate;
  const dispatchDash = deps?.dispatchDashboardInvalidation ?? dispatchDashboardInvalidation;

  const postDeleteTask = async () => {
    await Promise.all(
      attachmentCleanup.map(async (att) => {
        if (att.cloudinaryPublicId) {
          const isExplicitRaw = Boolean(att.cloudinaryUrl?.includes("/raw/upload/"));
          const primaryType = isExplicitRaw ? "raw" : "image";
          try {
            const res = await cloudinary.uploader.destroy(att.cloudinaryPublicId, {
              resource_type: primaryType,
            });
            if (res?.result === "not found" && primaryType === "image") {
              await cloudinary.uploader.destroy(att.cloudinaryPublicId, {
                resource_type: "raw",
              });
            }
          } catch (error) {
            console.error("Failed to delete from Cloudinary after Activity deletion:", error);
          }
        }
        if (att.googleDriveFileId) {
          try {
            const config = await prisma.systemConfig.findUnique({ where: { id: "global" } });
            if (config?.googleRefreshToken) {
              const { getDriveService } = await import("@/lib/google");
              const drive = getDriveService(config.googleRefreshToken);
              await drive.files.delete({ fileId: att.googleDriveFileId });
            }
          } catch (error) {
            console.error("Failed to delete from Google Drive after Activity deletion:", error);
          }
        }
      })
    );

    const nextLatestLog = await prisma.activityLog.findFirst({
      where: {
        opportunityId: log.opportunityId,
        parentId: null,
        type: "COMMENT",
        AND: [
          {
            OR: [
              { NOT: { content: { startsWith: "[DUE DATE:" } } },
              { content: { startsWith: "[DUE DATE: Removed]" } },
            ],
          },
          { NOT: { content: { startsWith: "[URGENT_" } } },
          { NOT: { content: { startsWith: "[TIER:0H]" } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: true,
        replies: { include: { user: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (reconciledDeal) {
      await notifyPusher(log.opportunityId, {
        action: "OPPORTUNITY_UPDATED",
        deal: reconciledDeal,
        dealId: log.opportunityId,
      });
    }

    await notifyPusher(log.opportunityId, {
      action: "ACTIVITY_DELETED",
      dealId: log.opportunityId,
      logId,
      nextLatestLog,
    });

    void dispatchDash({
      resources: ["leaderboard"],
    }).catch(() => {});
  };

  if (deps) {
    await postDeleteTask();
  } else {
    runBackgroundJob(postDeleteTask);
  }

  return { success: true };
}
