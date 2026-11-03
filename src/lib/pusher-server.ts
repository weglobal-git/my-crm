import "server-only";

import PusherServer from "pusher";

export const pusherServer = new PusherServer({
  appId: process.env.PUSHER_APP_ID || "",
  key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY || "",
  secret: process.env.PUSHER_SECRET || "",
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap1",
  useTLS: true,
});

export function isPusherServerConfigured(): boolean {
  return Boolean(
    process.env.PUSHER_APP_ID &&
      process.env.NEXT_PUBLIC_PUSHER_APP_KEY &&
      process.env.PUSHER_SECRET &&
      process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  );
}

/**
 * Safely triggers a Pusher event without ever crashing the calling Server Action
 * (guards both synchronous HMAC signing errors and async HTTP errors).
 */
export function safePusherTrigger(
  channel: string | string[],
  event: string,
  data: unknown
): void {
  if (!isPusherServerConfigured()) return;
  try {
    void pusherServer.trigger(channel, event, data).catch((err) => {
      console.error("[PUSHER-SAFE-TRIGGER] Async trigger error:", err);
    });
  } catch (err) {
    console.error("[PUSHER-SAFE-TRIGGER] Sync trigger error:", err);
  }
}
