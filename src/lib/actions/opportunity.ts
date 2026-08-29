"use server";

import prisma from "@/lib/prisma";
import { OpportunityStatus, BoardType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

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
  if (newStatus !== "OPEN") {
    // Business Rule: Cannot end the opportunity without specifying the goods loading date
    if (!opportunity.goodsLoadingDate) {
      throw new Error("Cannot end the project without specifying the goods loading date (วันโหลดสินค้า).");
    }
  }

  // If validation passes, perform the update
  return await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      pipelineStageId: newStageId,
      status: newStatus
    }
  });
}

export async function updateOpportunity(id: string, data: Prisma.OpportunityUpdateInput) {
  return await prisma.opportunity.update({
    where: { id },
    data
  });
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
  if (!log || log.userId !== userId) throw new Error("Unauthorized to edit this log.");

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
  if (!log || log.userId !== userId) throw new Error("Unauthorized to delete this log.");

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
