import "server-only";
import { pusherServer } from "@/lib/pusher-server";

export interface SanitizedNotificationSender {
  id: string;
  name: string | null;
  image: string | null;
  role: string | null;
}

export interface SanitizedNotificationDTO {
  id: string;
  recipientId: string;
  senderId: string | null;
  type: string;
  title: string;
  message: string | null;
  referenceId: string | null;
  status: string;
  readAt: string | null;
  createdAt: string;
  sender?: SanitizedNotificationSender | null;
}

/**
 * Strips raw database fields (e.g. password, email, internal IDs, tokens)
 * from the notification payload before broadcasting via Pusher WebSocket.
 */
export function sanitizeNotificationPayload(notification: any): SanitizedNotificationDTO {
  if (!notification || typeof notification !== "object") {
    throw new Error("Invalid notification payload");
  }

  const sender = notification.sender
    ? {
        id: String(notification.sender.id || ""),
        name: notification.sender.name ? String(notification.sender.name) : null,
        image: notification.sender.image ? String(notification.sender.image) : null,
        role: notification.sender.role ? String(notification.sender.role) : null,
      }
    : null;

  return {
    id: String(notification.id || ""),
    recipientId: String(notification.recipientId || ""),
    senderId: notification.senderId ? String(notification.senderId) : null,
    type: String(notification.type || "SYSTEM_ALERT"),
    title: String(notification.title || ""),
    message: notification.message ? String(notification.message) : null,
    referenceId: notification.referenceId ? String(notification.referenceId) : null,
    status: String(notification.status || "PENDING"),
    readAt: notification.readAt ? new Date(notification.readAt).toISOString() : null,
    createdAt: notification.createdAt ? new Date(notification.createdAt).toISOString() : new Date().toISOString(),
    sender,
  };
}

/**
 * Internal server-only dispatcher for private user notifications.
 * Not exposed as a Next.js Server Action to prevent arbitrary client-side notification spoofing.
 */
export async function dispatchNotification(userId: string, notification: unknown): Promise<void> {
  if (!userId) return;
  try {
    const sanitized = sanitizeNotificationPayload(notification);
    await pusherServer.trigger(`private-user-${userId}`, "new-notification", sanitized);
  } catch (err) {
    console.error(`[NOTIFICATION-DISPATCHER] Error dispatching to user ${userId}:`, err);
  }
}
