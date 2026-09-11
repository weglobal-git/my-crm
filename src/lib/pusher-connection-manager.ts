"use client";

import {
  PUSHER_CONNECTION_ACTIVE_EVENT,
  connectPusher,
  disconnectPusher,
  destroyPusherClient,
  getOrCreatePusherClient,
} from "@/lib/pusher";
import { releaseAllChannels } from "@/lib/pusher-subscription-manager";
import { mutate } from "swr";
import { isPendingAcceleratorsKey } from "@/lib/deal-accelerators-sync";

export const DORMANCY_TIMEOUT_MS = 45_000; // 45 seconds after tab is hidden
export const NOTIFICATIONS_CHANGED_EVENT = "my-crm:notifications-changed";
export const CONTACT_RECOVERY_EVENT = "my-crm:contact-recovery";

let dormancyTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;

// Event listener references for clean removal
let handleTeardownRef: (() => void) | null = null;
let handleVisibilityChangeRef: (() => void) | null = null;
let handlePageshowRef: ((e: PageTransitionEvent) => void) | null = null;
let handleOnlineRef: (() => void) | null = null;
let handleConnectedRef: (() => void) | null = null;

// BroadcastChannel for cross-tab event mirroring (scoped by environment and user)
let crossTabChannel: BroadcastChannel | null = null;

export function shouldConnectPusher(state: string): boolean {
  return state === "initialized" || state === "disconnected" || state === "unavailable";
}

function scheduleDormancyDisconnect() {
  if (dormancyTimer) clearTimeout(dormancyTimer);
  dormancyTimer = setTimeout(() => {
    dormancyTimer = null;
    if (document.visibilityState === "hidden") {
      console.log("[PUSHER-HYGIENE] Tab dormant for >45s. Disconnecting WebSocket to conserve quota.");
      disconnectPusher();
    }
  }, DORMANCY_TIMEOUT_MS);
}

function activatePusherConnection() {
  const client = getOrCreatePusherClient();
  if (!handleConnectedRef) {
    handleConnectedRef = () => {
      window.dispatchEvent(new Event(PUSHER_CONNECTION_ACTIVE_EVENT));
    };
    client.connection.bind("connected", handleConnectedRef);
  }

  if (client.connection.state === "connected") {
    handleConnectedRef();
    return;
  }

  if (shouldConnectPusher(client.connection.state)) {
    connectPusher();
  }
}

export interface CrossTabEventMessage {
  id: string;
  type: "PUSHER_EVENT_BROADCAST";
  channelName: string;
  eventName: string;
  data: unknown;
  timestamp: number;
}

// In-memory deduplication set for cross-tab messages
const seenBroadcastIds = new Set<string>();
function markBroadcastSeen(id: string): boolean {
  if (!id) return false;
  if (seenBroadcastIds.has(id)) return true;
  seenBroadcastIds.add(id);
  if (seenBroadcastIds.size > 200) {
    const first = seenBroadcastIds.values().next().value;
    if (first) seenBroadcastIds.delete(first);
  }
  return false;
}

/**
 * Triggers targeted cache recovery for currently active routes and resources.
 * Replaces global SWR invalidation to prevent Neon DB connection/query storms.
 */
export function triggerTargetedRecovery() {
  console.log("[PUSHER-HYGIENE] Executing targeted recovery for active resources...");
  // 1. Re-sync notifications
  void mutate("my-notifications");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }

  // 2. Active Pipeline board & accelerators
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/pipeline")) {
    void mutate((key) => Array.isArray(key) && key[0] === "pipeline-deals");
    void mutate(isPendingAcceleratorsKey);
  }

  // 3. Active Contacts view (notify state owner via event & revalidate overview SWR)
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/contact")) {
    window.dispatchEvent(new Event(CONTACT_RECOVERY_EVENT));
    void mutate((key) => Array.isArray(key) && key[0] === "account-overview");
  }
}

/**
 * Initializes Pusher Connection Hygiene for authenticated active sessions:
 * 1. Connects WebSocket client (delays if tab is initially hidden).
 * 2. Teardown on tab close / page refresh (beforeunload, pagehide) to kill zombie connections.
 * 3. Tab Dormancy (disconnects WebSocket when tab is hidden > 45s, reconnects + targeted recovery when visible).
 * 4. Pageshow (bfcache) and Online network recovery.
 * 5. Cross-tab message bridge via user-scoped BroadcastChannel with deduplication.
 */
export function initPusherConnectionHygiene(userId?: string) {
  if (typeof window === "undefined" || isInitialized) return;
  isInitialized = true;

  console.log(`[PUSHER-HYGIENE] Initializing connection lifecycle manager for user: ${userId || "authenticated"}...`);

  // Initial-hidden check: If tab is loaded in background, avoid connecting immediately
  if (document.visibilityState === "hidden") {
    console.log("[PUSHER-HYGIENE] Tab loaded in background (hidden). Delaying WebSocket connection until tab is focused.");
    scheduleDormancyDisconnect();
  } else {
    activatePusherConnection();
  }

  // 1. Teardown on tab close / page refresh
  handleTeardownRef = () => {
    try {
      console.log("[PUSHER-HYGIENE] Disconnecting on tab teardown (beforeunload/pagehide)");
      disconnectPusher();
    } catch {}
  };

  window.addEventListener("beforeunload", handleTeardownRef);
  window.addEventListener("pagehide", handleTeardownRef);

  // 2. Tab Visibility & Dormancy Management
  handleVisibilityChangeRef = () => {
    if (document.visibilityState === "hidden") {
      // Tab is in background: start dormancy countdown
      scheduleDormancyDisconnect();
    } else if (document.visibilityState === "visible") {
      // Tab is active again: cancel countdown and reconnect if needed
      if (dormancyTimer) {
        clearTimeout(dormancyTimer);
        dormancyTimer = null;
      }

      try {
        console.log("[PUSHER-HYGIENE] Tab visible. Ensuring Pusher is connected and running targeted recovery...");
        activatePusherConnection();
        triggerTargetedRecovery();
      } catch {}
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChangeRef);

  // 3. Pageshow event (handles Back/Forward cache restoration)
  handlePageshowRef = (e: PageTransitionEvent) => {
    if (e.persisted || document.visibilityState === "visible") {
      console.log("[PUSHER-HYGIENE] Page restored from bfcache/pageshow. Connecting and recovering...");
      activatePusherConnection();
      triggerTargetedRecovery();
    }
  };
  window.addEventListener("pageshow", handlePageshowRef);

  // 4. Online event (handles reconnect after offline/sleep)
  handleOnlineRef = () => {
    console.log("[PUSHER-HYGIENE] Network back online. Re-checking connection and recovering...");
    if (document.visibilityState === "visible") {
      activatePusherConnection();
      triggerTargetedRecovery();
    }
  };
  window.addEventListener("online", handleOnlineRef);

  // 5. Setup Cross-Tab BroadcastChannel (scoped by environment and user)
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const env = process.env.NODE_ENV || "development";
      const channelScope = `my-crm-realtime-${env}-${userId || "shared"}`;
      crossTabChannel = new BroadcastChannel(channelScope);
      crossTabChannel.onmessage = (event: MessageEvent<CrossTabEventMessage>) => {
        if (event.data?.type === "PUSHER_EVENT_BROADCAST") {
          if (markBroadcastSeen(event.data.id)) return; // Deduplicate

          const payload = event.data.data as { dealId?: string; action?: string; deal?: { id?: string } };
          if (payload?.action?.startsWith("OPPORTUNITY_") || payload?.dealId || payload?.deal?.id) {
            void mutate((key) => Array.isArray(key) && key[0] === "pipeline-deals");
          }
          if (payload?.dealId) {
            void mutate(["deal-accelerators", payload.dealId]);
          }
          if (payload?.action === "DEAL_ACCELERATORS_UPDATED") {
            void mutate(isPendingAcceleratorsKey);
          }
          if (event.data.eventName === "new-notification" || event.data.eventName === "notification-resolved") {
            void mutate("my-notifications");
            window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
          }
        }
      };
    } catch (e) {
      console.warn("[PUSHER-HYGIENE] BroadcastChannel not supported:", e);
    }
  }
}

/**
 * Tears down all Pusher connections, listeners, channels, and timers.
 * MUST be called on logout, session expiration, or account switch.
 */
export function teardownPusherConnectionHygiene() {
  if (typeof window === "undefined" || !isInitialized) return;
  console.log("[PUSHER-HYGIENE] Tearing down connection lifecycle manager...");

  // Cancel dormancy timer
  if (dormancyTimer) {
    clearTimeout(dormancyTimer);
    dormancyTimer = null;
  }

  // Remove window listeners
  if (handleTeardownRef) {
    window.removeEventListener("beforeunload", handleTeardownRef);
    window.removeEventListener("pagehide", handleTeardownRef);
    handleTeardownRef = null;
  }
  if (handleVisibilityChangeRef) {
    document.removeEventListener("visibilitychange", handleVisibilityChangeRef);
    handleVisibilityChangeRef = null;
  }
  if (handlePageshowRef) {
    window.removeEventListener("pageshow", handlePageshowRef);
    handlePageshowRef = null;
  }
  if (handleOnlineRef) {
    window.removeEventListener("online", handleOnlineRef);
    handleOnlineRef = null;
  }
  if (handleConnectedRef) {
    const client = getOrCreatePusherClient();
    client.connection.unbind("connected", handleConnectedRef);
    handleConnectedRef = null;
  }

  // Close cross-tab broadcast channel
  if (crossTabChannel) {
    try {
      crossTabChannel.close();
    } catch {}
    crossTabChannel = null;
  }

  // Release all active channel subscriptions
  releaseAllChannels();

  // Fully destroy Pusher client
  destroyPusherClient();

  isInitialized = false;
  console.log("[PUSHER-HYGIENE] Teardown complete. All sockets and subscriptions closed.");
}

/**
 * Broadcasts an event locally across all tabs in this browser instance (scoped and deduplicated)
 */
export function broadcastEventAcrossTabs(channelName: string, eventName: string, data: unknown) {
  try {
    if (crossTabChannel) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      markBroadcastSeen(id);
      crossTabChannel.postMessage({
        id,
        type: "PUSHER_EVENT_BROADCAST",
        channelName,
        eventName,
        data,
        timestamp: Date.now(),
      });
    }
  } catch {}
}
