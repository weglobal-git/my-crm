"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { revalidatePath } from "next/cache";

// Get user's notifications
export async function getMyNotifications() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const notifications = await prisma.notification.findMany({
    where: { 
      recipientId: session.user.id,
      status: 'PENDING'
    },
    include: {
      sender: true
    },
    orderBy: { createdAt: 'desc' }
  });
  
  return notifications;
}

// Request to transfer ownership
export async function requestDealTransfer(dealId: string, newOwnerId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const deal = await prisma.opportunity.findUnique({
    where: { id: dealId }
  });
  
  if (!deal) throw new Error("Deal not found");
  if (deal.ownerId === newOwnerId) throw new Error("Already the owner");

  // Create notification
  const notification = await prisma.notification.create({
    data: {
      recipientId: newOwnerId,
      senderId: session.user.id,
      type: 'DEAL_TRANSFER_REQUEST',
      title: 'Deal Transfer Request',
      message: `requests to transfer deal "${deal.topic}" to you.`,
      referenceId: dealId
    }
  });

  revalidatePath('/pipeline');
  return { success: true, notification };
}

// Request to invite to team
export async function requestTeamInvite(dealId: string, userId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const deal = await prisma.opportunity.findUnique({
    where: { id: dealId },
    include: { teamMembers: true }
  });
  
  if (!deal) throw new Error("Deal not found");
  if (deal.ownerId === userId) throw new Error("User is already the owner");
  if (deal.teamMembers.some(tm => tm.id === userId)) throw new Error("User is already a team member");

  const notification = await prisma.notification.create({
    data: {
      recipientId: userId,
      senderId: session.user.id,
      type: 'TEAM_INVITE_REQUEST',
      title: 'Team Invite Request',
      message: `requests you to join the team for deal "${deal.topic}".`,
      referenceId: dealId
    }
  });

  revalidatePath('/pipeline');
  return { success: true, notification };
}

// Respond to notification (transfer or invite)
export async function respondToNotification(notificationId: string, accept: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId }
  });
  
  if (!notification) throw new Error("Notification not found");
  if (notification.recipientId !== session.user.id) throw new Error("Unauthorized");
  if (!['DEAL_TRANSFER_REQUEST', 'TEAM_INVITE_REQUEST'].includes(notification.type) || !notification.referenceId) {
    throw new Error("Invalid notification type");
  }

  // Update notification status
  await prisma.notification.update({
    where: { id: notificationId },
    data: { status: accept ? 'ACCEPTED' : 'REJECTED' }
  });

  // If accepted, change the deal owner or add to team
  if (accept) {
    if (notification.type === 'DEAL_TRANSFER_REQUEST') {
      await prisma.opportunity.update({
        where: { id: notification.referenceId },
        data: { ownerId: session.user.id }
      });
      
      const sender = await prisma.user.findUnique({ where: { id: notification.senderId || '' } });
      await prisma.activityLog.create({
        data: {
          content: `Ownership transferred from ${sender?.name || 'Unknown'} to ${session.user.name || 'Unknown'}`,
          type: 'SYSTEM_UPDATE',
          opportunityId: notification.referenceId,
          userId: session.user.id
        }
      });
    } else if (notification.type === 'TEAM_INVITE_REQUEST') {
      await prisma.opportunity.update({
        where: { id: notification.referenceId },
        data: {
          teamMembers: { connect: { id: session.user.id } }
        }
      });
      
      await prisma.activityLog.create({
        data: {
          content: `${session.user.name || 'Unknown'} joined the team`,
          type: 'SYSTEM_UPDATE',
          opportunityId: notification.referenceId,
          userId: session.user.id
        }
      });
    }
  }

  revalidatePath('/pipeline');
  return { success: true };
}
