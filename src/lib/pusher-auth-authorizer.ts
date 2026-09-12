import "server-only";
import { pusherServer } from "@/lib/pusher-server";
import { getUserVisibleMenuKeys } from "@/lib/actions/permission";

export interface PusherAuthUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: string;
  visibleMenuKeys?: string[];
}

/**
 * Pure authorization check for channel access.
 * Returns true if the given user is authorized to subscribe to the specified channel.
 */
export function canUserAccessChannel(user: PusherAuthUser, channelName: string): boolean {
  if (!user?.id || !channelName) return false;

  // 1. Presence channels: only presence-global allowed
  if (channelName.startsWith("presence-")) {
    return channelName === "presence-global";
  }

  // 2. Private user notification channel
  if (channelName === `private-user-${user.id}`) {
    return true;
  }

  // 3. Private user pipeline channel
  if (channelName === `private-pipeline-${user.id}`) {
    return ["ADMIN", "MANAGEMENT", "GENERAL"].includes(user.role);
  }

  // 4. Private per-user Calendar channel
  if (channelName === `private-calendar-${user.id}`) {
    return ["ADMIN", "MANAGEMENT", "GENERAL"].includes(user.role) &&
      (user.role === "ADMIN" || Boolean(user.visibleMenuKeys?.includes("calendar")));
  }

  // 5. Private contacts channel
  if (channelName === "private-contacts") {
    if (user.role === "ADMIN") return true;
    if (user.visibleMenuKeys && user.visibleMenuKeys.some(key => key === "contact" || key.startsWith("contact."))) {
      return true;
    }
    return false;
  }

  // All other channels forbidden
  return false;
}

/**
 * Sanitizes user presence payload to strictly non-sensitive fields.
 * Prevents leaking email, phone, or internal department structures over public presence.
 */
export function sanitizePresenceUserInfo(user: PusherAuthUser) {
  return {
    name: user.name || "Unknown User",
    image: user.image || null,
    role: user.role,
  };
}

/**
 * Orchestrates Pusher channel authorization for Next.js route handler.
 */
export async function authorizePusherRequest(
  socketId: string,
  channelName: string,
  sessionUser: { id: string; name?: string | null; email?: string | null; image?: string | null; role?: string }
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!socketId || !channelName) {
    return { status: 400, body: { error: "Missing socket_id or channel_name" } };
  }

  const role = sessionUser.role || "USER";

  // Resolve menu permissions for feature channels that require an enabled menu.
  let visibleMenuKeys: string[] | undefined = undefined;
  if ((channelName === "private-contacts" || channelName === `private-calendar-${sessionUser.id}`) && role !== "ADMIN") {
    try {
      visibleMenuKeys = await getUserVisibleMenuKeys(sessionUser.id);
    } catch (err) {
      console.warn("[PUSHER-AUTH] Failed to resolve menu keys for user:", sessionUser.id, err);
      visibleMenuKeys = [];
    }
  }

  const user: PusherAuthUser = {
    id: sessionUser.id,
    name: sessionUser.name,
    email: sessionUser.email,
    image: sessionUser.image,
    role,
    visibleMenuKeys,
  };

  const isAllowed = canUserAccessChannel(user, channelName);
  if (!isAllowed) {
    console.warn(`[PUSHER-AUTH] 403 Forbidden channel "${channelName}" for user "${user.id}" (role=${role})`);
    return { status: 403, body: { error: "Forbidden channel" } };
  }

  // Authorize presence channel
  if (channelName.startsWith("presence-")) {
    const presenceData = {
      user_id: user.id,
      user_info: sanitizePresenceUserInfo(user),
    };
    const authResponse = pusherServer.authorizeChannel(socketId, channelName, presenceData);
    return { status: 200, body: authResponse as unknown as Record<string, unknown> };
  }

  // Authorize private channel
  const authResponse = pusherServer.authorizeChannel(socketId, channelName);
  return { status: 200, body: authResponse as unknown as Record<string, unknown> };
}
