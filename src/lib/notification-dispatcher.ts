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
export function sanitizeNotificationPayload(notification: unknown): SanitizedNotificationDTO {
  if (!notification || typeof notification !== "object") {
    throw new Error("Invalid notification payload");
  }

  const n = notification as Record<string, unknown>;
  const senderRaw = n.sender as Record<string, unknown> | null | undefined;
  const sender = senderRaw
    ? {
        id: String(senderRaw.id || ""),
        name: senderRaw.name ? String(senderRaw.name) : null,
        image: senderRaw.image ? String(senderRaw.image) : null,
        role: senderRaw.role ? String(senderRaw.role) : null,
      }
    : null;

  return {
    id: String(n.id || ""),
    recipientId: String(n.recipientId || ""),
    senderId: n.senderId ? String(n.senderId) : null,
    type: String(n.type || "SYSTEM_ALERT"),
    title: String(n.title || ""),
    message: n.message ? String(n.message) : null,
    referenceId: n.referenceId ? String(n.referenceId) : null,
    status: String(n.status || "PENDING"),
    readAt: n.readAt ? new Date(n.readAt as string | number | Date).toISOString() : null,
    createdAt: n.createdAt ? new Date(n.createdAt as string | number | Date).toISOString() : new Date().toISOString(),
    sender,
  };
}

/**
 * Internal server-only dispatcher for private user notifications.
 * Not exposed as a Next.js Server Action to prevent arbitrary client-side notification spoofing.
 */
export async function dispatchNotification(userId: string, notification: unknown): Promise<void> {
  await dispatchNotificationWithResult(userId, notification);
}

export async function dispatchNotificationWithResult(userId: string, notification: unknown): Promise<boolean> {
  if (!userId) return false;
  try {
    const sanitized = sanitizeNotificationPayload(notification);
    await pusherServer.trigger(`private-user-${userId}`, "new-notification", sanitized);
    return true;
  } catch (err) {
    console.error(`[NOTIFICATION-DISPATCHER] Error dispatching to user ${userId}:`, err);
    return false;
  }
}
