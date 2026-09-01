"use server";

import prisma from "@/lib/prisma";
import { OpportunityStatus, Prisma, OpportunityType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
import { pusherServer } from "@/lib/pusher";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getPipelineOpportunities(tab: string, searchQuery?: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  const { id: userId, role, department } = session.user as { id: string; role: string; department?: unknown };

  const whereClause: Prisma.OpportunityWhereInput = {
    status: tab === 'completed' 
      ? { in: ["WON", "LOST", "COMPLETED", "CANCELLED"] } 
      : "OPEN"
  };

  if (role === "GENERAL") {
    whereClause.OR = [
      { ownerId: userId },
      { teamMembers: { some: { id: userId } } }
    ];
  } else if (role === "MANAGER") {
    if (department) {
      whereClause.OR = [
        { owner: { departments: { some: { name: department } } } },
        { teamMembers: { some: { departments: { some: { name: department } } } } }
      ];
    } else {
      whereClause.OR = [
        { ownerId: userId },
        { teamMembers: { some: { id: userId } } }
      ];
    }
  }

  if (searchQuery) {
    whereClause.AND = [
      {
        OR: [
          { topic: { contains: searchQuery, mode: 'insensitive' } },
          { company: { name: { contains: searchQuery, mode: 'insensitive' } } }
        ]
      }
    ];
  }

  return await prisma.opportunity.findMany({
    where: whereClause,
    select: {
      id: true,
      topic: true,
      type: true,
      status: true,
      value: true,
      currency: true,
      dueDate: true,
      goodsReadyDate: true,
      goodsLoadingDate: true,
      pipelineStageId: true,
      ownerId: true,
      closedAt: true,
      oemProgress: true,
      lossReason: true,
      reserveId: true,
      invoiceId: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, email: true, image: true } },
      teamMembers: { select: { id: true, name: true, image: true } },
      tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
      activityLogs: {
        where: { 
          parentId: null,
          type: 'COMMENT',
          NOT: { content: { startsWith: '[DUE DATE:' } }
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          content: true,
          type: true,
          createdAt: true,
          user: { select: { name: true, image: true } }
        }
      }
    },
    orderBy: tab === 'completed' ? { closedAt: 'desc' } : { updatedAt: 'desc' },
    take: tab === 'completed' ? 20 : undefined,
  });
}

async function notifyPipelineUpdate() {
  try {
    await pusherServer.trigger('pipeline', 'pipeline-updated', {});
  } catch (e) {
    console.error("Pusher trigger error:", e);
  }
}

export async function createOpportunity(data: {
  topic: string;
  type?: OpportunityType;
  companyId?: string;
  ownerId: string;
  pipelineStageId: string;
}) {
  const result = await prisma.opportunity.create({
    data: {
      topic: data.topic,
      type: data.type || "SALES_DEAL",
      companyId: data.companyId || null,
      ownerId: data.ownerId,
      pipelineStageId: data.pipelineStageId,
      status: "OPEN"
    }
  });

  const typeLabel = data.type === 'INTERNAL_TASK' ? 'Internal Task' : (data.type === 'PARTNERSHIP' ? 'Partnership' : 'Sales Deal');
  
  await prisma.activityLog.create({
    data: {
      opportunityId: result.id,
      userId: data.ownerId,
      type: "SYSTEM_UPDATE",
      content: `Created this opportunity as a ${typeLabel}.`
    }
  });
  await notifyPipelineUpdate();
  revalidatePath('/pipeline');
  return result;
}

export async function moveOpportunity(
  opportunityId: string, 
  newStageId: string | null, // null if moving out of the board to an end status
  newStatus: OpportunityStatus = "OPEN"
) {
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

  // 2. Moving to End (e.g. COMPLETED, WON, LOST, CANCELLED)
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

  // If validation passes, perform the update
  const result = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      pipelineStageId: newStageId,
      status: newStatus
    }
  });
  await notifyPipelineUpdate();
  return result;
}

export async function updateOpportunity(id: string, data: Prisma.OpportunityUpdateInput) {
  const result = await prisma.opportunity.update({
    where: { id },
    data
  });
  await notifyPipelineUpdate();
  return result;
}

export async function updateDueDateWithLog(opportunityId: string, dueDate: Date | null, reason: string, userId: string) {
  const result = await prisma.$transaction(async (tx) => {
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
    await tx.activityLog.create({
      data: {
        content: `[DUE DATE: ${formattedDate}]\nReason: ${reason}`,
        type: "COMMENT",
        opportunityId,
        userId
      }
    });

    // 2. Log to System (text only)
    await tx.activityLog.create({
      data: {
        content: `Due Date changed to ${formattedDate}. Reason: ${reason}`,
        type: "SYSTEM_UPDATE",
        opportunityId,
        userId
      }
    });
    
    return opp;
  });
  
  await notifyPipelineUpdate();
  revalidatePath('/pipeline');
  return result;
}

export async function getOpportunityActivityLogs(opportunityId: string, limit = 10, cursor?: string) {
  const data = await prisma.activityLog.findMany({
    where: { 
      opportunityId,
      parentId: null // Only fetch parent comments for pagination
    },
    take: limit + 1, // Fetch one extra to check if there are more
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), // Skip the cursor itself
    include: {
      user: true,
      replies: {
        include: { user: true },
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

export async function addActivityLog(opportunityId: string, content: string, userId: string, parentId?: string) {
  const result = await prisma.activityLog.create({
    data: {
      content,
      opportunity: { connect: { id: opportunityId } },
      user: { connect: { id: userId } },
      type: "COMMENT",
      ...(parentId && { parent: { connect: { id: parentId } } })
    }
  });
  
  // Notification logic
  const deal = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { teamMembers: true }
  });
  
  if (deal) {
    // 1. Parse mentioned usernames (lowercase, removing @)
    const mentionedUsernames = Array.from(content.matchAll(/@([^\s<]+)/g)).map(m => m[1].toLowerCase());
    
    // 2. Find matching users in the DB
    const allUsers = await prisma.user.findMany({ select: { id: true, name: true }});
    const mentionedUserIds = new Set<string>();
    
    allUsers.forEach(u => {
      if (u.name && mentionedUsernames.includes(u.name.replace(/\s+/g, '').toLowerCase())) {
        mentionedUserIds.add(u.id);
      }
    });
    
    mentionedUserIds.delete(userId); // don't notify self

    // 3. Determine team members who should receive standard notifications
    const teamUserIds = new Set(deal.teamMembers.map(m => m.id));
    teamUserIds.add(deal.ownerId);
    teamUserIds.delete(userId); // don't notify self
    
    // Filter out people who are already getting mentioned so they don't get double notified
    const standardNotifyIds = new Set(Array.from(teamUserIds).filter(id => !mentionedUserIds.has(id)));
    
    // 4. Send Mention Notifications
    if (mentionedUserIds.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(mentionedUserIds).map(recipientId => ({
          type: "DEAL_COMMENT",
          senderId: userId,
          recipientId,
          referenceId: deal.id,
          title: "You were mentioned",
          message: `Mentioned you in a comment on: ${deal.topic}`
        }))
      });
    }

    // 5. Send Standard Team Notifications
    if (standardNotifyIds.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(standardNotifyIds).map(recipientId => ({
          type: "DEAL_COMMENT",
          senderId: userId,
          recipientId,
          referenceId: deal.id,
          title: "New Comment",
          message: `Commented on deal: ${deal.topic}`
        }))
      });
    }
  }

  revalidatePath('/pipeline');
  return result;
}

export async function addSystemLog(opportunityId: string, content: string, userId: string) {
  const result = await prisma.activityLog.create({
    data: {
      content,
      opportunity: { connect: { id: opportunityId } },
      user: { connect: { id: userId } },
      type: "SYSTEM_UPDATE"
    }
  });
  revalidatePath('/pipeline');
  return result;
}

export async function editActivityLog(logId: string, content: string, userId: string) {
  const log = await prisma.activityLog.findUnique({ where: { id: logId } });
  if (!log) throw new Error("Log not found.");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const isAdmin = user?.role === "ADMIN";

  if (log.type === "SYSTEM_UPDATE" && !isAdmin) {
    throw new Error("Only admins can edit system logs.");
  }

  if (log.content.startsWith('[DUE DATE:') && !isAdmin) {
    throw new Error("Only admins can edit Due Date logs.");
  }

  if (log.userId !== userId && !isAdmin) {
    throw new Error("Unauthorized to edit this log.");
  }

  const result = await prisma.activityLog.update({
    where: { id: logId },
    data: {
      content,
      isEdited: true
    }
  });
  revalidatePath('/pipeline');
  return result;
}

export async function deleteActivityLog(logId: string, userId: string) {
  const log = await prisma.activityLog.findUnique({ where: { id: logId } });
  if (!log) throw new Error("Log not found.");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const isAdmin = user?.role === "ADMIN";

  if (log.type === "SYSTEM_UPDATE" && !isAdmin) {
    throw new Error("Only admins can delete system logs.");
  }

  if (log.content.startsWith('[DUE DATE:') && !isAdmin) {
    throw new Error("Only admins can delete Due Date logs.");
  }

  if (log.userId !== userId && !isAdmin) {
    throw new Error("Unauthorized to delete this log.");
  }

  // Find any attachments in this log
  const attachmentUrls: string[] = [];
  const regex = /\[ATTACHMENT:([^|]+)\|[^\]]+\]/g;
  let match;
  while ((match = regex.exec(log.content)) !== null) {
    attachmentUrls.push(match[1]);
  }

  if (attachmentUrls.length > 0) {
    const attachments = await prisma.attachment.findMany({
      where: { cloudinaryUrl: { in: attachmentUrls } }
    });

    for (const att of attachments) {
      if (att.cloudinaryPublicId) {
        const resourceType = att.fileType.startsWith('image/') ? 'image' : 'raw';
        try {
          await cloudinary.uploader.destroy(att.cloudinaryPublicId, { resource_type: resourceType });
        } catch (e) {
          console.error("Failed to delete from Cloudinary:", e);
        }
      }
      await prisma.attachment.delete({ where: { id: att.id } });
    }
  }

  await prisma.activityLog.delete({
    where: { id: logId }
  });
  revalidatePath('/pipeline');
  return { success: true };
}

// Reaction actions removed

export async function addTeamMember(opportunityId: string, userId: string) {
  const result = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      teamMembers: {
        connect: { id: userId }
      }
    }
  });
  revalidatePath('/pipeline');
  return result;
}

export async function removeTeamMember(opportunityId: string, userId: string) {
  const result = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      teamMembers: {
        disconnect: { id: userId }
      }
    }
  });
  revalidatePath('/pipeline');
  return result;
}

export async function deleteOpportunity(id: string) {
  const result = await prisma.opportunity.delete({
    where: { id }
  });
  await notifyPipelineUpdate();
  revalidatePath('/pipeline');
  return result;
}
