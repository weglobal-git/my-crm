"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";

import { 
  notifyPrivatePipelineUpdate, 
  requireOpportunityAccess,
  invalidatePipelineRecipientCache 
} from "@/lib/pipeline-security";
import { dispatchNotification } from "@/lib/notification-dispatcher";

export interface NotificationItem {
  id: string;
  recipientId: string;
  senderId: string | null;
  type: string;
  title: string;
  message: string | null;
  referenceId: string | null;
  status: string;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sender: {
    id: string;
    name: string | null;
    image: string | null;
    role: string | null;
  } | null;
}

export type GetMyNotificationsResult = 
  | { success: true; data: NotificationItem[] }
  | { success: false; data: NotificationItem[]; error: string };

export async function getMyNotifications(limit = 30): Promise<GetMyNotificationsResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: true, data: [] };
    }

    const notifications = await prisma.notification.findMany({
      where: { 
        recipientId: session.user.id,
        status: 'PENDING'
      },
      take: limit,
      select: {
        id: true,
        recipientId: true,
        senderId: true,
        type: true,
        title: true,
        message: true,
        referenceId: true,
        status: true,
        readAt: true,
        createdAt: true,
        updatedAt: true,
        sender: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    return { success: true, data: notifications };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Database error loading notifications";
    console.error("[getMyNotifications] Error:", msg);
    return { success: false, data: [], error: msg };
  }
}

// Mark notification as read (updates readAt timestamp without breaking workflow status)
export async function markNotificationAsRead(notificationId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      recipientId: session.user.id,
    },
    data: {
      readAt: new Date(),
    },
  });

  return { success: true };
}

// Mark all notifications as read
export async function markAllNotificationsAsRead() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.notification.updateMany({
    where: {
      recipientId: session.user.id,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  return { success: true };
}

// Request to transfer ownership
export async function requestDealTransfer(dealId: string, newOwnerId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  await requireOpportunityAccess(dealId, { ownerOrAdmin: true });

  const deal = await prisma.opportunity.findUnique({
    where: { id: dealId }
  });
  
  if (!deal) throw new Error("Deal not found");
  if (deal.ownerId === newOwnerId) throw new Error("Already the owner");

  // Idempotency check: avoid duplicate pending request
  const existingPending = await prisma.notification.findFirst({
    where: {
      recipientId: newOwnerId,
      referenceId: dealId,
      type: 'DEAL_TRANSFER_REQUEST',
      status: 'PENDING',
    },
    include: {
      sender: {
        select: { id: true, name: true, image: true, role: true }
      }
    }
  });

  if (existingPending) {
    return { success: true, notification: existingPending, alreadyExists: true };
  }

  const notification = await prisma.notification.create({
    data: {
      recipientId: newOwnerId,
      senderId: session.user.id,
      type: 'DEAL_TRANSFER_REQUEST',
      title: 'Deal Transfer Request',
      message: `requests to transfer deal "${deal.topic}" to you.`,
      referenceId: dealId
    },
    include: {
      sender: {
        select: { id: true, name: true, image: true, role: true }
      }
    }
  });

  await dispatchNotification(newOwnerId, notification);
  return { success: true, notification };
}

// Request to invite to team
export async function requestTeamInvite(dealId: string, userId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  await requireOpportunityAccess(dealId);

  const deal = await prisma.opportunity.findUnique({
    where: { id: dealId },
    include: { teamMembers: true }
  });
  
  if (!deal) throw new Error("Deal not found");
  if (deal.ownerId === userId) throw new Error("User is already the owner");
  if (deal.teamMembers.some((tm: { id: string }) => tm.id === userId)) throw new Error("User is already a team member");

  // Idempotency check: avoid duplicate pending request
  const existingPending = await prisma.notification.findFirst({
    where: {
      recipientId: userId,
      referenceId: dealId,
      type: 'TEAM_INVITE_REQUEST',
      status: 'PENDING',
    },
    include: {
      sender: {
        select: { id: true, name: true, image: true, role: true }
      }
    }
  });

  if (existingPending) {
    return { success: true, notification: existingPending, alreadyExists: true };
  }

  const notification = await prisma.notification.create({
    data: {
      recipientId: userId,
      senderId: session.user.id,
      type: 'TEAM_INVITE_REQUEST',
      title: 'Team Invite Request',
      message: `requests you to join the team for deal "${deal.topic}".`,
      referenceId: dealId
    },
    include: {
      sender: {
        select: { id: true, name: true, image: true, role: true }
      }
    }
  });

  await dispatchNotification(userId, notification);
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
  if (notification.status !== 'PENDING') throw new Error("Notification already handled");

  const sender = notification.senderId
    ? await prisma.user.findUnique({ where: { id: notification.senderId }, select: { name: true } })
    : null;
  const previousDeal = await prisma.opportunity.findUnique({
    where: { id: notification.referenceId },
    select: { ownerId: true, teamMembers: { select: { id: true } } },
  });
  if (!previousDeal) throw new Error("Deal not found");

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const claimed = await tx.notification.updateMany({
      where: { id: notificationId, recipientId: session.user.id, status: 'PENDING' },
      data: { status: accept ? 'ACCEPTED' : 'REJECTED' },
    });
    if (claimed.count !== 1) throw new Error("Notification already handled");
    if (!accept) return;

    if (notification.type === 'DEAL_TRANSFER_REQUEST') {
      const teamMembersUpdate: Prisma.OpportunityUpdateInput['teamMembers'] = {};
      if (!previousDeal.teamMembers.some((tm: { id: string }) => tm.id === previousDeal.ownerId)) {
        teamMembersUpdate.connect = [{ id: previousDeal.ownerId }];
      }
      if (previousDeal.teamMembers.some((tm: { id: string }) => tm.id === session.user.id)) {
        teamMembersUpdate.disconnect = [{ id: session.user.id }];
      }

      await tx.opportunity.update({
        where: { id: notification.referenceId! },
        data: { 
          ownerId: session.user.id,
          ...(Object.keys(teamMembersUpdate).length > 0 && { teamMembers: teamMembersUpdate })
        },
      });
      await tx.activityLog.create({
        data: {
          content: `Ownership transferred from ${sender?.name || 'Unknown'} to ${session.user.name || 'Unknown'}`,
          type: 'SYSTEM_UPDATE', opportunityId: notification.referenceId!, userId: session.user.id,
        },
      });
    } else {
      await tx.opportunity.update({
        where: { id: notification.referenceId! },
        data: { teamMembers: { connect: { id: session.user.id } } },
      });
      await tx.activityLog.create({
        data: {
          content: `${session.user.name || 'Unknown'} joined the team`,
          type: 'SYSTEM_UPDATE', opportunityId: notification.referenceId!, userId: session.user.id,
        },
      });
    }
  });

  if (accept && notification.referenceId) {
    invalidatePipelineRecipientCache(notification.referenceId);
    await notifyPrivatePipelineUpdate(
      notification.referenceId,
      { action: 'RECONCILE_OPPORTUNITY', dealId: notification.referenceId },
      [previousDeal.ownerId, session.user.id],
    );
  }

  return { success: true };
}
