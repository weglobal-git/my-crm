"use server";

import { OpportunityStatus, OpportunityType, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

import { pusherServer } from "@/lib/pusher-server";
import { dispatchNotification } from "@/lib/notification-dispatcher";
import {
  getPipelineRecipientUserIds,
  notifyPrivatePipelineUpdate,
  requireOpportunityAccess,
  requireOpportunityDateEdit,
  requirePipelineActor,
  requireCapability,
  invalidateOpportunityReadAccess,
  invalidatePipelineRecipientCache,
} from "@/lib/pipeline-security";
import {
  getPipelineOpportunitiesForActor,
  pipelineOpportunitySelect,
  maintainFulfilledDueDates,
} from '@/lib/pipeline-opportunities';
import { leanOpportunityPinSelect, leanOpportunityHotNoteSelect } from '@/lib/pipeline-card-dto';
import { after } from "next/server";
import { dispatchDashboardInvalidation } from '@/lib/dashboard/dashboard-realtime-server';
import { recordPipelineActionMetric } from '@/lib/pipeline-action-telemetry';
import { resolveAccessContext } from '@/lib/access/access-context';
import {
  addActivityLogForActor,
  addSystemLogForActor,
  deleteActivityLogForActor,
  syncOpportunityDueDateWithTimeline,
} from '@/lib/pipeline-activity-service';
import {
  classifyUpdateQuality,
  DUPLICATE_LOOKBACK_LIMIT,
  encodeTierPrefix,
  MIN_CHARS_FOR_27H,
  parseTierPrefix,
  resolveEditedCommentGrade,
  type UpdateIntent,
} from '@/lib/pipeline-update-quality';
import {
  gradeActivityCommentWithAi,
  gradeDueDateReasonWithAi,
} from '@/lib/actions/ai-accelerator';
import {
  createBangkokDate,
  formatBangkokDueDateDisplay,
  MAX_DUE_DATE_HORIZON_DAYS,
  MAX_LONG_LEAD_DUE_DATE_HORIZON_DAYS,
  MIN_LONG_LEAD_DUE_DATE_REASON_LENGTH,
  toBangkokDateParts,
} from '@/lib/business-days';
import { getCachedPipelineStages } from '@/lib/pipeline-stage-titles';
import { withSerializableRetry } from '@/lib/serializable-transaction';

function runBackgroundJob(task: () => Promise<void> | void) {
  try {
    after(task);
  } catch {
    void Promise.resolve().then(task).catch((err) => {
      console.error('[BACKGROUND-JOB-ERROR]', err);
    });
  }
}

export async function getPipelineOpportunities(tab: string, searchQuery?: string) {
  const actor = await requirePipelineActor();
  return getPipelineOpportunitiesForActor(actor, tab, searchQuery);
}

export async function createOpportunity(data: {
  topic: string;
  type?: OpportunityType;
  companyId?: string;
  pipelineStageId: string;
  teamMemberIds?: string[];
}) {
  const actor = await requirePipelineActor();
  requireCapability(actor, 'deal:create');
  const topic = data.topic.trim();
  if (!topic || topic.length > 500) throw new Error('Invalid topic');
  if (!['SALES_DEAL', 'INTERNAL_TASK', 'PARTNERSHIP'].includes(data.type || 'SALES_DEAL')) {
    throw new Error('Invalid opportunity type');
  }
  if ((data.type || 'SALES_DEAL') === 'SALES_DEAL' && !data.companyId) {
    throw new Error('Customer is required for Sales Deals');
  }

  const validMemberIds = (data.teamMemberIds || []).filter(id => id && id !== actor.id);

  const fullDeal = await prisma.opportunity.create({
    data: {
      topic,
      type: data.type || "SALES_DEAL",
      companyId: data.companyId || null,
      ownerId: actor.id,
      pipelineStageId: data.pipelineStageId,
      status: "OPEN",
      ...(validMemberIds.length > 0 ? {
        teamMembers: {
          connect: validMemberIds.map(id => ({ id }))
        }
      } : {})
    },
    select: pipelineOpportunitySelect
  });

  const typeLabel = data.type === 'INTERNAL_TASK' ? 'Internal Task' : (data.type === 'PARTNERSHIP' ? 'Partnership' : 'Sales Deal');
  
  // Background activity log creation (non-blocking)
  void prisma.activityLog.create({
    data: {
      opportunityId: fullDeal.id,
      userId: actor.id,
      type: "SYSTEM_UPDATE",
      content: `Created this opportunity as a ${typeLabel}.`
    }
  }).catch(err => console.warn("[createOpportunity] Failed to create activityLog:", err));

  // Batch notifications for invited team members (non-blocking)
  if (validMemberIds.length > 0) {
    void (async () => {
      try {
        const notifications = await prisma.$transaction(
          validMemberIds.map(recipientId =>
            prisma.notification.create({
              data: {
                type: "SYSTEM_ALERT",
                senderId: actor.id,
                recipientId,
                referenceId: fullDeal.id,
                title: "Added to Team",
                message: `Added you to the team for deal: ${fullDeal.topic}`,
              },
              include: { sender: true }
            })
          )
        );
        notifications.forEach(n => {
          void dispatchNotification(n.recipientId, n);
        });
      } catch (err) {
        console.warn("[createOpportunity] Failed to send notifications:", err);
      }
    })();
  }

  // Non-blocking Pusher trigger
  void notifyPrivatePipelineUpdate(fullDeal.id, { action: 'OPPORTUNITY_CREATED', deal: fullDeal }).catch(err => {
    console.warn("[createOpportunity] Pusher trigger error:", err);
  });

  if (fullDeal.type === 'SALES_DEAL') {
    void dispatchDashboardInvalidation({
      resources: ['summary', 'tracking', 'annual', 'map-summary', 'filter-options', 'leaderboard'],
      affectedYears: fullDeal.goodsLoadingDate ? [new Date(fullDeal.goodsLoadingDate).getFullYear()] : undefined,
      companyIds: fullDeal.company?.id ? [fullDeal.company.id] : undefined,
    });
  } else {
    void dispatchDashboardInvalidation({
      resources: ['leaderboard'],
    });
  }

  return JSON.stringify(fullDeal);
}

export async function moveOpportunity(
  opportunityId: string, 
  newStageId: string | null, // null if moving out of the board to an end status
  newStatus: OpportunityStatus = "OPEN",
  lossReason?: string | null
) {
  // Parallelize access check, lean opportunity snapshot, cached stages, and optional todo count
  const [{ actor }, opportunity, cachedStages, incompleteTodosCount] = await Promise.all([
    requireOpportunityAccess(opportunityId, { capability: 'deal:move_stage' }),
    prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: {
        id: true,
        topic: true,
        type: true,
        status: true,
        value: true,
        currency: true,
        companyId: true,
        ownerId: true,
        goodsLoadingDate: true,
        invoiceId: true,
        lossReason: true,
        teamMembers: { select: { id: true } },
      },
    }),
    newStageId ? getCachedPipelineStages() : Promise.resolve([]),
    newStatus === "WON"
      ? prisma.note.count({ where: { opportunityId, isCompleted: false } })
      : Promise.resolve(0),
  ]);

  if (!opportunity) {
    throw new Error("Opportunity not found");
  }

  // 1. Moving to a specific stage in the board
  if (newStageId) {
    const stage =
      cachedStages.find((s) => s.id === newStageId) ??
      (await prisma.pipelineStage.findUnique({ where: { id: newStageId } }));

    if (stage) {
      // Business Rule: Cannot move to Following or Quoted without specifying a value
      if ((stage.name === "Following" || stage.name === "Quoted") && !opportunity.value) {
        throw new Error("Cannot move to Following or Quoted without specifying a value (ยอดเงินของ Project).");
      }
    }
  }

  const effectiveLossReason = lossReason?.trim() || (newStatus === "LOST" ? opportunity.lossReason : null);

  // 2. Moving to End (e.g. WON, LOST)
  if (newStatus === "WON") {
    if (incompleteTodosCount > 0) {
      throw new Error(
        `Cannot mark as Won with ${incompleteTodosCount} incomplete to-do task(s). Complete or delete all tasks first.`
      );
    }

    if (opportunity.type === "SALES_DEAL") {
      if (
        opportunity.value === null || 
        !opportunity.currency || 
        !opportunity.goodsLoadingDate || 
        !opportunity.invoiceId
      ) {
        throw new Error("Cannot mark as Won without specifying Value, Currency, Goods Loading Date, and Invoice Number.");
      }
    }
  } else if (newStatus === "LOST") {
    if (!effectiveLossReason) {
      throw new Error("Cannot mark as Lost without specifying a Loss Reason.");
    }
  }

  const isClosing = newStatus === "WON" || newStatus === "LOST";

  // Perform the update and select pipelineOpportunitySelect directly in 1 DB trip
  const fullDeal = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      pipelineStageId: newStageId,
      status: newStatus,
      closedAt: isClosing ? new Date() : null,
      ...(effectiveLossReason ? { lossReason: effectiveLossReason } : {}),
    },
    select: pipelineOpportunitySelect,
  });

  invalidateOpportunityReadAccess(opportunityId);

  const revision = fullDeal?.updatedAt ? new Date(fullDeal.updatedAt).getTime() : Date.now();
  runBackgroundJob(async () => {
    // Record system audit log & closing notifications asynchronously without blocking UI drag/close
    if (newStatus !== opportunity.status) {
      const systemMessage = newStatus === "WON"
        ? (opportunity.type === "SALES_DEAL" 
            ? `Deal marked as Won.`
            : `Task completed successfully (Won).`)
        : (newStatus === "LOST"
            ? `Deal marked as Lost. Reason: ${effectiveLossReason || 'Not specified'}.`
            : `Deal reopened and moved back to active pipeline.`);

      await prisma.activityLog.create({
        data: {
          opportunityId,
          userId: actor.id,
          type: "SYSTEM_UPDATE",
          content: systemMessage,
        }
      }).catch((err) => console.warn('[moveOpportunity] Failed to create system log:', err));

      if (isClosing) {
        const recipients = [
          opportunity.ownerId,
          ...(opportunity.teamMembers?.map(m => m.id) || []),
        ].filter(uid => uid && uid !== actor.id);

        const uniqueRecipients = [...new Set(recipients)];
        if (uniqueRecipients.length > 0) {
          try {
            const notifTitle = newStatus === 'WON' ? 'Deal Won' : 'Deal Lost';
            const notifMsg = newStatus === 'WON'
              ? `Deal "${opportunity.topic}" has been marked as Won.`
              : `Deal "${opportunity.topic}" has been marked as Lost.`;

            const notifications = await Promise.all(
              uniqueRecipients.map(recipientId =>
                prisma.notification.create({
                  data: {
                    type: 'SYSTEM_ALERT',
                    senderId: actor.id,
                    recipientId,
                    referenceId: opportunityId,
                    title: notifTitle,
                    message: notifMsg,
                  },
                  include: { sender: true }
                })
              )
            );
            notifications.forEach(n => {
              void dispatchNotification(n.recipientId, n);
            });
          } catch (err) {
            console.warn('[moveOpportunity] Failed to send notifications:', err);
          }
        }
      }
    }

    await notifyPrivatePipelineUpdate(opportunityId, {
      action: 'OPPORTUNITY_UPDATED',
      deal: fullDeal,
      dealId: opportunityId,
      revision,
    });
    if (opportunity.type === 'SALES_DEAL' || fullDeal?.type === 'SALES_DEAL') {
      const years = [
        opportunity.goodsLoadingDate ? new Date(opportunity.goodsLoadingDate).getFullYear() : undefined,
        fullDeal?.goodsLoadingDate ? new Date(fullDeal.goodsLoadingDate).getFullYear() : undefined,
      ].filter((y): y is number => typeof y === 'number');
      void dispatchDashboardInvalidation({
        resources: ['summary', 'tracking', 'annual', 'map-summary', 'leaderboard'],
        affectedYears: years.length > 0 ? [...new Set(years)] : undefined,
        companyIds: [opportunity.companyId, fullDeal?.company?.id].filter((id): id is string => Boolean(id)),
      });
    } else {
      void dispatchDashboardInvalidation({
        resources: ['leaderboard'],
      });
    }
  });

  return fullDeal;
}

type SafeOpportunityUpdate = {
  topic?: string;
  type?: OpportunityType;
  value?: number | null;
  currency?: string | null;
  goodsReadyDate?: Date | null;
  goodsLoadingDate?: Date | null;
  reserveId?: string | null;
  invoiceId?: string | null;
  lossReason?: string | null;
};

export async function updateOpportunity(id: string, data: SafeOpportunityUpdate, mutationId?: string, expectedRevision?: number) {
  let actor;
  if (data.goodsReadyDate !== undefined || data.goodsLoadingDate !== undefined) {
    const field = data.goodsReadyDate !== undefined ? 'goodsReadyDate' : 'goodsLoadingDate';
    const access = await requireOpportunityDateEdit(id, field);
    actor = access.actor;
    if (data.goodsReadyDate !== undefined && data.goodsLoadingDate !== undefined) {
      await requireOpportunityDateEdit(id, 'goodsLoadingDate', actor);
    }
  } else {
    const access = await requireOpportunityAccess(id, { capability: 'deal:edit_card' });
    actor = access.actor;
  }
  if (data.topic !== undefined && (data.topic.trim().length === 0 || data.topic.length > 500)) {
    throw new Error('Invalid topic');
  }
  if (data.currency !== undefined && data.currency !== null && !['THB', 'USD', 'EUR', 'CNY'].includes(data.currency)) {
    throw new Error('Invalid currency');
  }
  if (data.value !== undefined && data.value !== null && (!Number.isFinite(data.value) || data.value < 0)) {
    throw new Error('Invalid value');
  }

  const requiresSerializableAudit = data.topic !== undefined || data.type !== undefined;

  const executeTx = (tx: Prisma.TransactionClient) => (async () => {
    const current = requiresSerializableAudit
      ? await tx.opportunity.findUnique({
          where: { id },
          select: { topic: true, type: true }
        })
      : null;

    if (requiresSerializableAudit && !current) throw new Error('Opportunity not found');

    if (data.type === 'INTERNAL_TASK') {
      if (current?.type === 'SALES_DEAL' && actor?.role !== 'ADMIN') {
        throw new Error('Only System Admin can downgrade a Sales Deal to an Internal Task.');
      }
    }

    const auditLogs: string[] = [];
    if (data.topic !== undefined && current?.topic && data.topic.trim() !== current.topic) {
      auditLogs.push(`Changed topic from "${current.topic}" to "${data.topic.trim()}".`);
    }
    if (data.type !== undefined && current?.type && data.type !== current.type) {
      if (data.type === 'SALES_DEAL') {
        auditLogs.push('Converted opportunity type from Internal Task to Sales Deal.');
      } else if (data.type === 'INTERNAL_TASK') {
        auditLogs.push('Converted opportunity type from Sales Deal to Internal Task by System Admin.');
      }
    }

    let fullDeal;
    if (expectedRevision === undefined) {
      fullDeal = await tx.opportunity.update({
        where: { id },
        data,
        select: pipelineOpportunitySelect,
      });
    } else {
      const changed = await tx.opportunity.updateMany({
        where: { id, updatedAt: new Date(expectedRevision) },
        data,
      });
      if (changed.count !== 1) throw new Error('CONFLICT');
      fullDeal = await tx.opportunity.findUniqueOrThrow({
        where: { id },
        select: pipelineOpportunitySelect,
      });
    }

    const createdRecords = [];
    for (const logContent of auditLogs) {
      const created = await tx.activityLog.create({
        data: {
          content: logContent,
          opportunity: { connect: { id } },
          user: { connect: { id: actor.id } },
          type: 'SYSTEM_UPDATE',
        },
        include: {
          user: true,
          replies: { include: { user: true }, orderBy: { createdAt: 'asc' } },
        },
      });
      createdRecords.push(created);
    }

    return { fullDeal, createdLogs: createdRecords };
  })();

  const { fullDeal, createdLogs } = requiresSerializableAudit
    ? await withSerializableRetry(() =>
        prisma.$transaction(executeTx, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        })
      )
    : await prisma.$transaction(executeTx);

  invalidateOpportunityReadAccess(id);

  const revision = fullDeal?.updatedAt ? new Date(fullDeal.updatedAt).getTime() : Date.now();
  const affectsDashboardMetrics =
    data.value !== undefined ||
    data.currency !== undefined ||
    data.goodsLoadingDate !== undefined ||
    data.goodsReadyDate !== undefined ||
    data.type !== undefined;

  runBackgroundJob(async () => {
    if (createdLogs.length > 0) {
      for (const logRecord of createdLogs) {
        void notifyPrivatePipelineUpdate(id, {
          action: 'ACTIVITY_ADDED',
          dealId: id,
          activityLog: logRecord,
        }).catch(() => {});
      }
    }
    await notifyPrivatePipelineUpdate(id, {
      action: 'OPPORTUNITY_UPDATED',
      deal: fullDeal,
      dealId: id,
      revision,
      mutationId,
    });
    if (affectsDashboardMetrics) {
      if (fullDeal?.type === 'SALES_DEAL') {
        const goodsLoadingDate = fullDeal?.goodsLoadingDate;
        void dispatchDashboardInvalidation({
          resources: ['summary', 'tracking', 'annual', 'map-summary', 'leaderboard'],
          mutationId,
          affectedYears: goodsLoadingDate ? [new Date(goodsLoadingDate).getFullYear()] : undefined,
          companyIds: fullDeal?.company?.id ? [fullDeal.company.id] : undefined,
        });
      } else {
        void dispatchDashboardInvalidation({
          resources: ['leaderboard'],
          mutationId,
        });
      }
    }
  });

  return fullDeal;
}

export interface OpportunitySharedAttachment {
  id: string;
  fileName: string;
  fileType: string;
  size: number;
  cloudinaryUrl: string | null;
  googleDriveFileId: string | null;
  createdAt: Date | string;
  [key: string]: unknown;
}

export interface OpportunitySharedLink {
  url: string;
  logId: string;
  date: Date | string;
}

export interface OpportunitySharedMediaResult {
  attachments: OpportunitySharedAttachment[];
  links: OpportunitySharedLink[];
}

export async function getOpportunitySharedMedia(dealId: string): Promise<OpportunitySharedMediaResult> {
  const [, rawAttachments, rawLogs] = await Promise.all([
    requireOpportunityAccess(dealId, { capability: 'deal:view' }),
    prisma.attachment.findMany({
      where: { opportunityId: dealId },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        size: true,
        cloudinaryUrl: true,
        googleDriveFileId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.activityLog.findMany({
      where: {
        opportunityId: dealId,
        content: { contains: 'http' },
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const links: OpportunitySharedLink[] = [];

  rawLogs.forEach((log) => {
    if (!log.content) return;
    const cleanContent = log.content.replace(/\[ATTACHMENT:[^\]]+\]/g, '');
    const matches = cleanContent.match(urlRegex);
    if (matches) {
      matches.forEach((url) => {
        links.push({
          url: url.replace(/[),.]+$/, ''),
          logId: log.id,
          date: log.createdAt,
        });
      });
    }
  });

  return {
    attachments: rawAttachments,
    links: links.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  };
}

export async function updateDueDateWithLog(opportunityId: string, dueDate: Date | null, reason: string, mutationId?: string, expectedRevision?: number) {
  const sanitizedReason = reason
    .replace(/^\[(?:STALLING_ONLY|OUTREACH_ONLY|PROGRESS_VERIFIED)\]\s*/i, '')
    .trim();
  if (!sanitizedReason) throw new Error('Reason is required');
  const [{ actor }, existingDates] = await Promise.all([
    requireOpportunityDateEdit(opportunityId, 'dueDate'),
    dueDate
      ? prisma.opportunity.findUnique({
          where: { id: opportunityId },
          select: { goodsReadyDate: true, goodsLoadingDate: true },
        })
      : Promise.resolve(null),
  ]);

  const compactReasonLen = sanitizedReason
    .replace(/\[ATTACHMENT:[^\]]+\]/gi, '')
    .replace(/[\s\p{P}]+/gu, '').length;

  if (dueDate) {
    const nowParts = toBangkokDateParts(new Date());
    const todayMidnightMs = createBangkokDate(nowParts.year, nowParts.month, nowParts.date, 0, 0, 0).getTime();
    const standardHorizonMs = todayMidnightMs + (MAX_DUE_DATE_HORIZON_DAYS + 1) * 24 * 3600 * 1000 - 1;
    const longLeadHorizonMs = todayMidnightMs + (MAX_LONG_LEAD_DUE_DATE_HORIZON_DAYS + 1) * 24 * 3600 * 1000 - 1;

    const anchorCandidates = [
      existingDates?.goodsReadyDate ? new Date(existingDates.goodsReadyDate).getTime() : 0,
      existingDates?.goodsLoadingDate ? new Date(existingDates.goodsLoadingDate).getTime() : 0,
    ];
    const furthestShippingAnchorMs = Math.max(0, ...anchorCandidates);
    const shippingExtendedMaxMs =
      furthestShippingAnchorMs > 0 ? furthestShippingAnchorMs + 7 * 24 * 3600 * 1000 : 0;

    const targetMs = new Date(dueDate).getTime();
    const effectiveStandardMaxMs = Math.max(standardHorizonMs, shippingExtendedMaxMs);

    if (targetMs > effectiveStandardMaxMs) {
      const effectiveLongLeadMaxMs = Math.max(longLeadHorizonMs, shippingExtendedMaxMs);

      if (targetMs > effectiveLongLeadMaxMs) {
        throw new Error(
          `Due Date cannot be set more than ${MAX_LONG_LEAD_DUE_DATE_HORIZON_DAYS} days ahead unless Goods Ready / Loading Date is scheduled further out.`
        );
      }

      if (compactReasonLen < MIN_LONG_LEAD_DUE_DATE_REASON_LENGTH) {
        throw new Error(
          `Due Dates more than ${MAX_DUE_DATE_HORIZON_DAYS} days ahead require a clear long-lead reason (at least ${MIN_LONG_LEAD_DUE_DATE_REASON_LENGTH} characters, e.g. Trademark, Booth installment, Staggered shipment, or Client hold).`
        );
      }
    }
  }

  const { fullDeal, activityLog, systemLog } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let opp;
    if (expectedRevision === undefined) {
      opp = await tx.opportunity.update({
        where: { id: opportunityId },
        data: { dueDate },
        select: pipelineOpportunitySelect,
      });
    } else {
      const changed = await tx.opportunity.updateMany({
        where: { id: opportunityId, updatedAt: new Date(expectedRevision) },
        data: { dueDate },
      });
      if (changed.count !== 1) throw new Error('CONFLICT');
      opp = await tx.opportunity.findUniqueOrThrow({
        where: { id: opportunityId },
        select: pipelineOpportunitySelect,
      });
    }
    let formattedDate = 'Removed';
    if (dueDate) {
      formattedDate = formatBangkokDueDateDisplay(dueDate);
    }

    const logInclude = {
      user: true,
      replies: { include: { user: true }, orderBy: { createdAt: 'asc' as const } },
    };

    // 1. Log to Activity (with special format for pill badge)
    const createdActivityLog = await tx.activityLog.create({
      data: {
        content: `[DUE DATE: ${formattedDate}]\nReason: ${sanitizedReason}`,
        type: "COMMENT",
        opportunityId,
        userId: actor.id,
      },
      include: logInclude,
    });

    // 2. Log to System (text only)
    const createdSystemLog = await tx.activityLog.create({
      data: {
        content: `Due Date changed to ${formattedDate}. Reason: ${sanitizedReason}`,
        type: "SYSTEM_UPDATE",
        opportunityId,
        userId: actor.id,
      },
      include: logInclude,
    });

    return { fullDeal: opp, activityLog: createdActivityLog, systemLog: createdSystemLog };
  });

  invalidateOpportunityReadAccess(opportunityId);

  const revision = fullDeal?.updatedAt ? new Date(fullDeal.updatedAt).getTime() : Date.now();
  runBackgroundJob(async () => {
    await notifyPrivatePipelineUpdate(opportunityId, {
      action: 'OPPORTUNITY_UPDATED',
      deal: fullDeal,
      dealId: opportunityId,
      revision,
      mutationId,
    });
    await Promise.all(
      [activityLog, systemLog].map((log) =>
        notifyPrivatePipelineUpdate(opportunityId, {
          action: 'ACTIVITY_ADDED',
          dealId: opportunityId,
          activityLog: log,
        })
      )
    );
    void dispatchDashboardInvalidation({
      resources: ['leaderboard'],
      mutationId,
      revision,
    });
    if (dueDate && compactReasonLen >= MIN_CHARS_FOR_27H) {
      await gradeDueDateReasonWithAi({
        dealId: opportunityId,
        logId: activityLog.id,
        rawContent: activityLog.content,
      });
    }
  });

  return { opp: fullDeal, activityLog, revision, mutationId };
}

export async function getOpportunityActivityLogs(opportunityId: string, limit = 10, cursor?: string, type?: 'COMMENT' | 'SYSTEM_UPDATE') {
  const [, data] = await Promise.all([
    requireOpportunityAccess(opportunityId, { capability: 'deal:view' }),
    prisma.activityLog.findMany({
      where: { 
        opportunityId,
        parentId: null,
        ...(type ? { type } : {})
      },
      take: limit + 1, // Fetch one extra to check if there are more
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), // Skip the cursor itself
      include: {
        user: { select: { id: true, name: true, email: true, image: true, role: true } },
        replies: {
          include: { user: { select: { id: true, name: true, email: true, image: true, role: true } } },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
  ]);

  let nextCursor: string | undefined = undefined;
  if (data.length > limit) {
    const nextItem = data.pop(); // Remove the extra item
    nextCursor = nextItem?.id;
  }

  return { data, nextCursor };
}

export async function addActivityLog(
  opportunityId: string,
  content: string,
  parentId?: string,
  updateIntent: UpdateIntent | undefined = undefined
) {
  const { actor } = await requireOpportunityAccess(opportunityId, {
    capability: 'deal:comment',
  });
  return addActivityLogForActor(actor, { opportunityId, content, parentId, updateIntent });
}

export async function addSystemLog(
  opportunityId: string,
  content: string
) {
  const { actor } = await requireOpportunityAccess(opportunityId, {
    capability: 'deal:comment',
  });
  return addSystemLogForActor(actor, { opportunityId, content });
}

export async function editActivityLog(logId: string, content: string) {
  const log = await prisma.activityLog.findUnique({ where: { id: logId } });
  if (!log) throw new Error("Log not found.");

  const { actor, opportunity } = await requireOpportunityAccess(log.opportunityId, { capability: 'deal:comment' });
  const isAdmin = actor.role === "ADMIN";

  if (log.type === "SYSTEM_UPDATE" && !isAdmin) {
    throw new Error("Only admins can edit system logs.");
  }

  if (log.content.startsWith('[DUE DATE:') && !isAdmin) {
    throw new Error("Only admins can edit Due Date logs.");
  }

  requireCapability(actor, 'deal:edit_own_comment', {
    ...opportunity,
    commentAuthorId: log.userId,
  });

  // Server-authoritative re-evaluation on edit (closes client [TIER:...] spoofing / post-send edit loophole)
  const isRegularTopLevelComment =
    log.type === 'COMMENT' &&
    !log.parentId &&
    !log.content.startsWith('[DUE DATE:') &&
    !log.content.startsWith('[URGENT_') &&
    !content.startsWith('[DUE DATE:') &&
    !content.startsWith('[URGENT_');

  let authoritativeContent = content;
  let requiresAiRegrade = false;
  let tierCrossedZeroBoundary = false;

  if (isRegularTopLevelComment) {
    const cleanEdited = parseTierPrefix(content).cleanContent;
    const surroundingComments = await prisma.activityLog.findMany({
      where: {
        opportunityId: log.opportunityId,
        parentId: null,
        type: 'COMMENT',
        id: { not: logId },
        NOT: [
          { content: { startsWith: '[URGENT_' } },
          { content: { startsWith: '[DUE DATE:' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: DUPLICATE_LOOKBACK_LIMIT,
      select: { content: true, createdAt: true },
    });

    const editResolution = resolveEditedCommentGrade({
      originalContent: log.content,
      originalCreatedAt: log.createdAt,
      editedCleanText: cleanEdited,
      editedAt: new Date(),
      previousCommentsWithMeta: surroundingComments.map((c) => ({
        content: c.content,
        createdAt: c.createdAt,
      })),
    });
    requiresAiRegrade = editResolution.allowAiRegrade;
    tierCrossedZeroBoundary = editResolution.tierCrossedZeroBoundary;
    authoritativeContent = editResolution.authoritativeContent;
  } else if (log.parentId) {
    // Strip any spoofed tier tag on threaded replies
    authoritativeContent = parseTierPrefix(content).cleanContent;
  }

  const updatedLog = await prisma.activityLog.update({
    where: { id: logId },
    data: {
      content: authoritativeContent,
      isEdited: true
    },
    include: { user: true, replies: { include: { user: true }, orderBy: { createdAt: 'asc' } } }
  });

  const touchedDueDateLog =
    !log.parentId &&
    log.type === 'COMMENT' &&
    (log.content.startsWith('[DUE DATE:') || content.startsWith('[DUE DATE:'));
  const reconciledDeal =
    touchedDueDateLog || tierCrossedZeroBoundary
      ? await syncOpportunityDueDateWithTimeline(log.opportunityId, {
          hadDueDateLogMutation: touchedDueDateLog,
        })
      : null;

  runBackgroundJob(async () => {
    if (reconciledDeal) {
      await notifyPrivatePipelineUpdate(log.opportunityId, {
        action: 'OPPORTUNITY_UPDATED',
        deal: reconciledDeal,
        dealId: log.opportunityId,
      });
    }
    await notifyPrivatePipelineUpdate(log.opportunityId, {
      action: 'ACTIVITY_UPDATED',
      dealId: log.opportunityId,
      activityLog: updatedLog,
    });
    void dispatchDashboardInvalidation({
      resources: ['leaderboard'],
    });
    if (isRegularTopLevelComment && requiresAiRegrade) {
      await gradeActivityCommentWithAi({
        dealId: log.opportunityId,
        logId: updatedLog.id,
        rawContent: authoritativeContent,
        authorId: actor.id,
      });
    }
  });
  return updatedLog;
}

export async function deleteActivityLog(logId: string) {
  const log = await prisma.activityLog.findFirst({ where: { id: logId } });
  if (!log) throw new Error("Log not found.");

  const { actor, opportunity } = await requireOpportunityAccess(log.opportunityId, {
    capability: 'deal:comment',
  });
  return deleteActivityLogForActor(actor, { logId, existingLog: log, opportunity });
}

// Reaction actions removed

export async function addTeamMember(opportunityId: string, userId: string) {
  const { actor } = await requireOpportunityAccess(opportunityId, { capability: 'deal:manage_members' });
  
  const result = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      teamMembers: {
        connect: { id: userId }
      }
    }
  });

  invalidateOpportunityReadAccess(opportunityId);
  invalidatePipelineRecipientCache(opportunityId);

  // Create and send notification to the invited user
  if (actor.id !== userId) {
    const notification = await prisma.notification.create({
      data: {
        type: "SYSTEM_ALERT",
        senderId: actor.id,
        recipientId: userId,
        referenceId: opportunityId,
        title: "Added to Team",
        message: `Added you to the team for deal: ${result.topic}`,
      },
      include: { sender: true }
    });
    void dispatchNotification(userId, notification);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, image: true, email: true, role: true, departments: { select: { id: true, name: true } } } });
  runBackgroundJob(async () => {
    await notifyPrivatePipelineUpdate(opportunityId, { action: 'MEMBER_ADDED', dealId: opportunityId, user });
  });
  return result;
}

export async function addTeamMembers(opportunityId: string, userIds: string[], mutationId?: string) {
  if (!userIds || userIds.length === 0) return null;
  const { actor } = await requireOpportunityAccess(opportunityId, { capability: 'deal:manage_members' });
  
  const result = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      teamMembers: {
        connect: userIds.map(id => ({ id }))
      }
    },
    include: {
      teamMembers: {
        where: { id: { in: userIds } },
        select: { id: true, name: true, image: true, email: true, role: true, departments: { select: { id: true, name: true } } }
      }
    }
  });

  invalidateOpportunityReadAccess(opportunityId);
  invalidatePipelineRecipientCache(opportunityId);

  // Create notifications in batch for added users (except actor)
  const usersToNotify = userIds.filter(id => id !== actor.id);
  if (usersToNotify.length > 0) {
    try {
      const notifications = await prisma.$transaction(
        usersToNotify.map(recipientId =>
          prisma.notification.create({
            data: {
              type: "SYSTEM_ALERT",
              senderId: actor.id,
              recipientId,
              referenceId: opportunityId,
              title: "Added to Team",
              message: `Added you to the team for deal: ${result.topic}`,
            },
            include: { sender: true }
          })
        )
      );
      notifications.forEach(n => {
        void dispatchNotification(n.recipientId, n);
      });
    } catch (err) {
      console.warn("[addTeamMembers] Failed to send notifications:", err);
    }
  }

  // Create system log on server
  let createdLog: unknown = null;
  try {
    const names = result.teamMembers.map(u => u.name || 'user').join(', ');
    createdLog = await prisma.activityLog.create({
      data: {
        content: `Invited ${names} to the team`,
        opportunity: { connect: { id: opportunityId } },
        user: { connect: { id: actor.id } },
        type: "SYSTEM_UPDATE"
      }
    });
  } catch (err) {
    console.warn("[addTeamMembers] Failed to log system update:", err);
  }

  const revision = result.updatedAt.getTime();
  runBackgroundJob(async () => {
    if (createdLog) {
      void notifyPrivatePipelineUpdate(opportunityId, {
        action: 'ACTIVITY_ADDED',
        dealId: opportunityId,
        activityLog: createdLog,
      }).catch(() => {});
    }
    await notifyPrivatePipelineUpdate(opportunityId, {
      action: 'MEMBERS_ADDED',
      dealId: opportunityId,
      users: result.teamMembers,
      revision,
      mutationId,
    }).catch(() => {});
  });

  return {
    success: true,
    opportunityId,
    teamMembers: result.teamMembers,
    revision,
    mutationId,
  };
}

export async function removeTeamMember(opportunityId: string, userId: string, mutationId?: string) {
  const { actor, opportunity } = await requireOpportunityAccess(opportunityId, { capability: 'deal:view' });
  const isSelf = userId === actor.id;

  if (!isSelf) {
    requireCapability(actor, 'deal:manage_members', opportunity);
  }

  const previousRecipientIds = await getPipelineRecipientUserIds(opportunityId);

  // Fetch user to remove before disconnect for logging
  const userToRemove = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true }
  });

  const result = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      teamMembers: {
        disconnect: { id: userId }
      }
    }
  });

  invalidateOpportunityReadAccess(opportunityId);
  invalidatePipelineRecipientCache(opportunityId);

  // Create system log on server while actor still has access context
  let createdLog: unknown = null;
  try {
    const logContent = isSelf
      ? `${actor.name || 'A team member'} left the team`
      : `Removed ${userToRemove?.name || 'user'} from the team`;

    createdLog = await prisma.activityLog.create({
      data: {
        content: logContent,
        opportunity: { connect: { id: opportunityId } },
        user: { connect: { id: actor.id } },
        type: "SYSTEM_UPDATE"
      }
    });
  } catch (err) {
    console.warn("[removeTeamMember] Failed to log system update:", err);
  }

  const revision = result.updatedAt.getTime();
  runBackgroundJob(async () => {
    if (createdLog) {
      void notifyPrivatePipelineUpdate(opportunityId, {
        action: 'ACTIVITY_ADDED',
        dealId: opportunityId,
        activityLog: createdLog
      }).catch(() => {});
    }
    await notifyPrivatePipelineUpdate(
      opportunityId,
      { action: 'MEMBER_REMOVED', dealId: opportunityId, userId, revision, mutationId },
      previousRecipientIds,
    );
  });

  return {
    success: true,
    opportunityId,
    removedUserId: userId,
    isSelf,
    revision,
    mutationId,
  };
}

export async function deleteOpportunity(id: string) {
  await requireOpportunityAccess(id, { capability: 'deal:delete' });

  invalidateOpportunityReadAccess(id);
  const recipientIds = await getPipelineRecipientUserIds(id);
  invalidatePipelineRecipientCache(id);
  const result = await prisma.opportunity.delete({
    where: { id }
  });
  runBackgroundJob(async () => {
    if (recipientIds.length > 0) {
      await pusherServer.trigger(
        recipientIds.map(userId => `private-pipeline-${userId}`),
        'pipeline-updated',
        { action: 'OPPORTUNITY_DELETED', dealId: id },
      );
    }
    if (result.type === 'SALES_DEAL') {
      void dispatchDashboardInvalidation({
        resources: ['summary', 'tracking', 'annual', 'map-summary', 'filter-options', 'leaderboard'],
        affectedYears: result.goodsLoadingDate ? [new Date(result.goodsLoadingDate).getFullYear()] : undefined,
        companyIds: result.companyId ? [result.companyId] : undefined,
      });
    }
  });
  return result;
}


export async function togglePinOpportunity(id: string, isPinned: boolean) {
  const startedAt = performance.now();
  const context = await resolveAccessContext();
  const { actor } = await requireOpportunityAccess(id, { context, capability: 'deal:edit_card' });
  const dbStart = performance.now();
  const updated = await prisma.opportunity.update({
    where: { id },
    data: { isPinned },
    select: leanOpportunityPinSelect,
  });
  const dbDurationMs = performance.now() - dbStart;

  const revision = updated.updatedAt ? new Date(updated.updatedAt).getTime() : Date.now();
  runBackgroundJob(async () => {
    try {
      await notifyPrivatePipelineUpdate(id, {
        action: 'OPPORTUNITY_UPDATED',
        deal: updated,
        dealId: id,
        revision,
      });
    } catch (err: unknown) {
      console.error('[PUSHER-PIN-TRIGGER] Failed to dispatch pin update:', err);
    }
  });

  const totalDurationMs = performance.now() - startedAt;
  recordPipelineActionMetric({
    action: 'togglePinOpportunity',
    role: actor.role,
    status: 'SUCCESS',
    durationMs: totalDurationMs,
    dbDurationMs,
  });

  return updated;
}


export async function updateOpportunityHotNote(id: string, hotNote: string | null) {
  const startedAt = performance.now();
  const context = await resolveAccessContext();
  const { actor } = await requireOpportunityAccess(id, { context, capability: 'deal:edit_card' });
  const trimmed = hotNote?.trim() ? hotNote.trim() : null;
  const dbStart = performance.now();
  const updated = await prisma.opportunity.update({
    where: { id },
    data: { hotNote: trimmed },
    select: leanOpportunityHotNoteSelect,
  });
  const dbDurationMs = performance.now() - dbStart;

  const revision = updated.updatedAt ? new Date(updated.updatedAt).getTime() : Date.now();

  runBackgroundJob(async () => {
    try {
      const additionalRecipients = actor.departmentIds && actor.departmentIds.length > 0
        ? (await prisma.user.findMany({
            where: { departments: { some: { id: { in: actor.departmentIds } } } },
            select: { id: true },
          })).map(u => u.id)
        : [];

      await notifyPrivatePipelineUpdate(
        id,
        {
          action: 'OPPORTUNITY_UPDATED',
          deal: updated,
          dealId: id,
          revision,
        },
        additionalRecipients,
      );
    } catch (err: unknown) {
      console.error('[PUSHER-HOTNOTE-TRIGGER] Failed to dispatch hot note update:', err);
    }
  });

  const totalDurationMs = performance.now() - startedAt;
  recordPipelineActionMetric({
    action: 'updateOpportunityHotNote',
    role: actor.role,
    status: 'SUCCESS',
    durationMs: totalDurationMs,
    dbDurationMs,
  });

  return updated;
}

export async function runFulfilledDueDatesMaintenance(): Promise<{ count: number }> {
  const actor = await requirePipelineActor();
  if (actor.role !== 'ADMIN') throw new Error('Forbidden: Only administrators can run batch maintenance.');
  const count = await maintainFulfilledDueDates();
  return { count };
}
