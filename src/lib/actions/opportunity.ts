"use server";

import { OpportunityStatus, OpportunityType, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

import { pusherServer } from "@/lib/pusher";
import { triggerNotification } from "@/lib/actions/notification";
import {
  getPipelineRecipientUserIds,
  notifyPrivatePipelineUpdate,
  requireOpportunityAccess,
  requirePipelineActor,
  type PipelineActor,
} from "@/lib/pipeline-security";
import { getPipelineOpportunitiesForActor, pipelineOpportunitySelect } from '@/lib/pipeline-opportunities';

export async function getPipelineOpportunities(tab: string, searchQuery?: string) {
  const actor = await requirePipelineActor();
  return getPipelineOpportunitiesForActor(actor, tab, searchQuery);
}

export async function createOpportunity(data: {
  topic: string;
  type?: OpportunityType;
  companyId?: string;
  pipelineStageId: string;
}) {
  const actor = await requirePipelineActor();
  const topic = data.topic.trim();
  if (!topic || topic.length > 500) throw new Error('Invalid topic');
  if (!['SALES_DEAL', 'INTERNAL_TASK', 'PARTNERSHIP'].includes(data.type || 'SALES_DEAL')) {
    throw new Error('Invalid opportunity type');
  }
  if ((data.type || 'SALES_DEAL') === 'SALES_DEAL' && !data.companyId) {
    throw new Error('Customer is required for Sales Deals');
  }
  const result = await prisma.opportunity.create({
    data: {
      topic,
      type: data.type || "SALES_DEAL",
      companyId: data.companyId || null,
      ownerId: actor.id,
      pipelineStageId: data.pipelineStageId,
      status: "OPEN"
    }
  });

  const typeLabel = data.type === 'INTERNAL_TASK' ? 'Internal Task' : (data.type === 'PARTNERSHIP' ? 'Partnership' : 'Sales Deal');
  
  await prisma.activityLog.create({
    data: {
      opportunityId: result.id,
      userId: actor.id,
      type: "SYSTEM_UPDATE",
      content: `Created this opportunity as a ${typeLabel}.`
    }
  });
  const fullDeal = await prisma.opportunity.findUnique({
    where: { id: result.id },
    select: pipelineOpportunitySelect
  });
  await notifyPrivatePipelineUpdate(result.id, { action: 'OPPORTUNITY_CREATED', deal: fullDeal });
  revalidatePath('/pipeline');
  return result;
}

export async function moveOpportunity(
  opportunityId: string, 
  newStageId: string | null, // null if moving out of the board to an end status
  newStatus: OpportunityStatus = "OPEN"
) {
  const { actor } = await requireOpportunityAccess(opportunityId, { ownerOrAdmin: true });
  // Fetch the opportunity to check current state
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId }
  });

  if (!opportunity) {
    throw new Error("Opportunity not found");
  }

  // 1. Moving to a specific stage in the board
  if (newStageId) {
    const stage = await prisma.pipelineStage.findUnique({
      where: { id: newStageId }
    });

    if (stage) {
      // Business Rule: Cannot move to Following or Quoted without specifying a value
      if ((stage.name === "Following" || stage.name === "Quoted") && !opportunity.value) {
        throw new Error("Cannot move to Following or Quoted without specifying a value (ยอดเงินของ Project).");
      }
    }
  }

  // 2. Moving to End (e.g. WON, LOST)
  if (newStatus === "WON") {
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
    if (!opportunity.lossReason) {
      throw new Error("Cannot mark as Lost without specifying a Loss Reason.");
    }
  }

  const isClosing = newStatus === "WON" || newStatus === "LOST";

  // If validation passes, perform the update
  const result = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      pipelineStageId: newStageId,
      status: newStatus,
      closedAt: isClosing ? new Date() : null,
    }
  });

  // Record a system audit log if status changed
  if (newStatus !== opportunity.status) {
    const systemMessage = newStatus === "WON"
      ? (opportunity.type === "SALES_DEAL" 
          ? `Deal marked as Won.`
          : `Task completed successfully (Won).`)
      : (newStatus === "LOST"
          ? `Deal marked as Lost. Reason: ${opportunity.lossReason || 'Not specified'}.`
          : `Deal reopened and moved back to active pipeline.`);

    await prisma.activityLog.create({
      data: {
        opportunityId,
        userId: actor.id,
        type: "SYSTEM_UPDATE",
        content: systemMessage,
      }
    });
  }

  const fullDeal = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: pipelineOpportunitySelect
  });
  await notifyPrivatePipelineUpdate(opportunityId, { action: 'OPPORTUNITY_UPDATED', deal: fullDeal });
  return result;
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

export async function updateOpportunity(id: string, data: SafeOpportunityUpdate) {
  await requireOpportunityAccess(id);
  if (data.topic !== undefined && (data.topic.trim().length === 0 || data.topic.length > 500)) {
    throw new Error('Invalid topic');
  }
  if (data.currency !== undefined && data.currency !== null && !['THB', 'USD', 'EUR'].includes(data.currency)) {
    throw new Error('Invalid currency');
  }
  if (data.value !== undefined && data.value !== null && (!Number.isFinite(data.value) || data.value < 0)) {
    throw new Error('Invalid value');
  }
  if (data.type === 'INTERNAL_TASK') {
    const current = await prisma.opportunity.findUnique({
      where: { id },
      select: { type: true }
    });
    if (current?.type === 'SALES_DEAL') {
      throw new Error('Cannot downgrade a Sales Deal to an Internal Task.');
    }
  }
  const result = await prisma.opportunity.update({
    where: { id },
    data
  });
  const fullDeal = await prisma.opportunity.findUnique({
    where: { id },
    select: pipelineOpportunitySelect
  });
  await notifyPrivatePipelineUpdate(id, { action: 'OPPORTUNITY_UPDATED', deal: fullDeal });
  return result;
}

export async function updateDueDateWithLog(opportunityId: string, dueDate: Date | null, reason: string) {
  const { actor } = await requireOpportunityAccess(opportunityId, { ownerOrAdmin: true });
  const { opp: result, activityLog, systemLog } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const opp = await tx.opportunity.update({
      where: { id: opportunityId },
      data: { dueDate }
    });
    let formattedDate = 'Removed';
    if (dueDate) {
      const isMidnight = dueDate.getHours() === 0 && dueDate.getMinutes() === 0;
      if (isMidnight) {
        formattedDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(dueDate);
      } else {
        formattedDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(dueDate);
      }
    }
    
    // 1. Log to Activity (with special format for pill badge)
    const activityLog = await tx.activityLog.create({
      data: {
        content: `[DUE DATE: ${formattedDate}]\nReason: ${reason}`,
        type: "COMMENT",
        opportunityId,
        userId: actor.id
      }
    });

    // 2. Log to System (text only)
    const systemLog = await tx.activityLog.create({
      data: {
        content: `Due Date changed to ${formattedDate}. Reason: ${reason}`,
        type: "SYSTEM_UPDATE",
        opportunityId,
        userId: actor.id
      }
    });
    
    return { opp, activityLog, systemLog };
  });

  const logsWithUsers = await prisma.activityLog.findMany({
    where: { id: { in: [activityLog.id, systemLog.id] } },
    include: { user: true, replies: { include: { user: true }, orderBy: { createdAt: 'asc' } } },
  });
  
  const fullDeal = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: pipelineOpportunitySelect
  });
  await notifyPrivatePipelineUpdate(opportunityId, { action: 'OPPORTUNITY_UPDATED', deal: fullDeal });
  await Promise.all(logsWithUsers.map((log: (typeof logsWithUsers)[number]) =>
    notifyPrivatePipelineUpdate(opportunityId, { action: 'ACTIVITY_ADDED', dealId: opportunityId, activityLog: log })
  ));
  revalidatePath('/pipeline');
  return result;
}

export async function getOpportunityActivityLogs(opportunityId: string, limit = 10, cursor?: string, type?: 'COMMENT' | 'SYSTEM_UPDATE') {
  await requireOpportunityAccess(opportunityId);
  const data = await prisma.activityLog.findMany({
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
  });

  let nextCursor: string | undefined = undefined;
  if (data.length > limit) {
    const nextItem = data.pop(); // Remove the extra item
    nextCursor = nextItem?.id;
  }

  return { data, nextCursor };
}

export async function addActivityLog(opportunityId: string, content: string, parentId?: string) {
  const { actor } = await requireOpportunityAccess(opportunityId);
  
  const [parent, deal] = await Promise.all([
    parentId ? prisma.activityLog.findFirst({
      where: { id: parentId, opportunityId },
      select: { id: true },
    }) : Promise.resolve(null),
    prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { teamMembers: true }
    })
  ]);
  
  if (parentId && !parent) throw new Error("Reply target not found.");

  const [newLogRaw] = await Promise.all([
    prisma.activityLog.create({
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
    }),
    (async () => {
      if (deal) {
        const mentionedUsernames = Array.from(content.matchAll(/@([^\s<]+)/g)).map((m: RegExpMatchArray) => m[1].toLowerCase());
        const mentionedUserIds = new Set<string>();
        if (mentionedUsernames.length > 0) {
          const allUsers = await prisma.user.findMany({ select: { id: true, name: true }});
          allUsers.forEach((u: { id: string; name: string | null }) => {
            if (u.name && mentionedUsernames.includes(u.name.replace(/\s+/g, '').toLowerCase())) {
              mentionedUserIds.add(u.id);
            }
          });
        }
        
        mentionedUserIds.delete(actor.id);
        const teamUserIds = new Set<string>(deal.teamMembers.map((m: { id: string }) => m.id));
        teamUserIds.add(deal.ownerId);
        teamUserIds.delete(actor.id);
        const standardNotifyIds = new Set<string>(Array.from(teamUserIds).filter((id: string) => !mentionedUserIds.has(id)));
        
        const notificationInputs = [
          ...Array.from(mentionedUserIds).map(recipientId => ({
            type: "DEAL_COMMENT" as const, senderId: actor.id, recipientId,
            referenceId: deal.id, title: "You were mentioned",
            message: `Mentioned you in a comment on: ${deal.topic}`,
          })),
          ...Array.from(standardNotifyIds).map(recipientId => ({
            type: "DEAL_COMMENT" as const, senderId: actor.id, recipientId,
            referenceId: deal.id, title: "New Comment",
            message: `Commented on deal: ${deal.topic}`,
          })),
        ];
        if (notificationInputs.length > 0) {
          const notifications = await prisma.$transaction(
            notificationInputs.map(data => prisma.notification.create({ data, include: { sender: true } }))
          );
          await Promise.all(notifications.map((notification: { recipientId: string }) =>
            triggerNotification(notification.recipientId, notification)
          ));
        }
      }
    })()
  ]);

  if (!newLogRaw) throw new Error("Activity was created but could not be loaded.");
  const newLog = { ...newLogRaw, replies: [] };

  await notifyPrivatePipelineUpdate(opportunityId, { action: 'ACTIVITY_ADDED', dealId: opportunityId, activityLog: newLog });
  return newLog;
}

export async function addSystemLog(opportunityId: string, content: string) {
  const { actor } = await requireOpportunityAccess(opportunityId);
  const result = await prisma.activityLog.create({
    data: {
      content,
      opportunity: { connect: { id: opportunityId } },
      user: { connect: { id: actor.id } },
      type: "SYSTEM_UPDATE"
    },
    include: { user: true, replies: { include: { user: true }, orderBy: { createdAt: 'asc' } } },
  });
  
  await notifyPrivatePipelineUpdate(opportunityId, { action: 'ACTIVITY_ADDED', dealId: opportunityId, activityLog: result });
  return result;
}

export async function editActivityLog(logId: string, content: string) {
  const log = await prisma.activityLog.findUnique({ where: { id: logId } });
  if (!log) throw new Error("Log not found.");

  const { actor } = await requireOpportunityAccess(log.opportunityId);
  const isAdmin = actor.role === "ADMIN";

  if (log.type === "SYSTEM_UPDATE" && !isAdmin) {
    throw new Error("Only admins can edit system logs.");
  }

  if (log.content.startsWith('[DUE DATE:') && !isAdmin) {
    throw new Error("Only admins can edit Due Date logs.");
  }

  if (log.userId !== actor.id && !isAdmin) {
    throw new Error("Unauthorized to edit this log.");
  }

  const updatedLog = await prisma.activityLog.update({
    where: { id: logId },
    data: {
      content,
      isEdited: true
    },
    include: { user: true, replies: { include: { user: true }, orderBy: { createdAt: 'asc' } } }
  });
  await notifyPrivatePipelineUpdate(log.opportunityId, { action: 'ACTIVITY_UPDATED', dealId: log.opportunityId, activityLog: updatedLog });
  return updatedLog;
}

export async function deleteActivityLog(logId: string, actorOverride?: PipelineActor) {
  const log = await prisma.activityLog.findFirst({ where: { id: logId } });
  if (!log) throw new Error("Log not found.");

  const { actor } = await requireOpportunityAccess(log.opportunityId, { actor: actorOverride });
  const isAdmin = actor.role === "ADMIN";

  if (log.type === "SYSTEM_UPDATE" && !isAdmin) {
    throw new Error("Only admins can delete system logs.");
  }

  if (log.content.startsWith('[DUE DATE:') && !isAdmin) {
    throw new Error("Only admins can delete Due Date logs.");
  }

  if (log.userId !== actor.id && !isAdmin) {
    throw new Error("Unauthorized to delete this log.");
  }

  // Find any attachments in this log
  const attachmentUrls: string[] = [];
  const regex = /\[ATTACHMENT:([^\]|]+)\|[^\]]+\]/g;
  let match;
  while ((match = regex.exec(log.content)) !== null) {
    attachmentUrls.push(match[1]);
  }

  const attachmentCleanup: Array<{ id: string; fileType: string; cloudinaryPublicId: string | null }> = [];
  if (attachmentUrls.length > 0) {
    const attachments = await prisma.attachment.findMany({
      where: { cloudinaryUrl: { in: attachmentUrls } }
    });
    attachmentCleanup.push(...attachments);
  }

  if (attachmentCleanup.length > 0) {
    await prisma.attachment.deleteMany({ where: { id: { in: attachmentCleanup.map(item => item.id) } } });
  }

  await prisma.activityLog.delete({
    where: { id: logId }
  });

  await Promise.all(attachmentCleanup.map(async att => {
    if (!att.cloudinaryPublicId) return;
    const resourceType = att.fileType.startsWith('image/') ? 'image' : 'raw';
    try {
      await cloudinary.uploader.destroy(att.cloudinaryPublicId, { resource_type: resourceType });
    } catch (error) {
      console.error("Failed to delete from Cloudinary after Activity deletion:", error);
    }
  }));

  const nextLatestLog = await prisma.activityLog.findFirst({
    where: { 
      opportunityId: log.opportunityId,
      parentId: null,
      type: 'COMMENT',
      NOT: { content: { startsWith: '[DUE DATE:' } }
    },
    orderBy: { createdAt: 'desc' },
    include: { user: true, replies: { include: { user: true }, orderBy: { createdAt: 'asc' } } }
  });

  await notifyPrivatePipelineUpdate(log.opportunityId, { action: 'ACTIVITY_DELETED', dealId: log.opportunityId, logId, nextLatestLog });
  return { success: true };
}

// Reaction actions removed

export async function addTeamMember(opportunityId: string, userId: string) {
  const { actor } = await requireOpportunityAccess(opportunityId, { ownerOrAdmin: true });
  
  const result = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      teamMembers: {
        connect: { id: userId }
      }
    }
  });

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
    triggerNotification(userId, notification);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, image: true, email: true, role: true } });
  await notifyPrivatePipelineUpdate(opportunityId, { action: 'MEMBER_ADDED', dealId: opportunityId, user });
  revalidatePath('/pipeline');
  return result;
}

export async function removeTeamMember(opportunityId: string, userId: string) {
  await requireOpportunityAccess(opportunityId, { ownerOrAdmin: true });
  const previousRecipientIds = await getPipelineRecipientUserIds(opportunityId);
  const result = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      teamMembers: {
        disconnect: { id: userId }
      }
    }
  });
  await notifyPrivatePipelineUpdate(
    opportunityId,
    { action: 'MEMBER_REMOVED', dealId: opportunityId, userId },
    previousRecipientIds,
  );
  revalidatePath('/pipeline');
  return result;
}

export async function deleteOpportunity(id: string) {
  await requireOpportunityAccess(id, { adminOnly: true });
  const recipientIds = await getPipelineRecipientUserIds(id);
  const result = await prisma.opportunity.delete({
    where: { id }
  });
  if (recipientIds.length > 0) {
    await pusherServer.trigger(
      recipientIds.map(userId => `private-pipeline-${userId}`),
      'pipeline-updated',
      { action: 'OPPORTUNITY_DELETED', dealId: id },
    );
  }
  revalidatePath('/pipeline');
  return result;
}
