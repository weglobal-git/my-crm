"use client";

import { pusherClient } from "@/lib/pusher";
import { mutate } from "swr";

const DORMANCY_TIMEOUT_MS = 45_000; // 45 seconds after tab is hidden
let dormancyTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;

// BroadcastChannel for cross-tab event mirroring (zero internet bandwidth, 0ms latency)
let crossTabChannel: BroadcastChannel | null = null;

export interface CrossTabEventMessage {
  type: "PUSHER_EVENT_BROADCAST";
  channelName: string;
  eventName: string;
  data: unknown;
  timestamp: number;
}

/**
 * Initializes Pusher Connection Hygiene:
 * 1. Immediate disconnect on page close/refresh (beforeunload, pagehide) to kill zombie connections.
 * 2. Tab Dormancy (disconnects WebSocket when tab is hidden > 45s, reconnects + SWR revalidates when visible).
 * 3. Cross-tab message bridge via BroadcastChannel.
 */
export function initPusherConnectionHygiene() {
  if (typeof window === "undefined" || isInitialized) return;
  isInitialized = true;

  console.log("[PUSHER-HYGIENE] Initializing connection lifecycle manager...");

  // 1. Teardown on tab close / page refresh
  const handleTeardown = () => {
    try {
      if (pusherClient.connection.state === "connected" || pusherClient.connection.state === "connecting") {
        console.log("[PUSHER-HYGIENE] Disconnecting on tab teardown (beforeunload/pagehide)");
        pusherClient.disconnect();
      }
    } catch {}
  };

  window.addEventListener("beforeunload", handleTeardown);
  window.addEventListener("pagehide", handleTeardown);

  // 2. Tab Visibility & Dormancy Management
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      // Tab is in background: start dormancy countdown
      if (dormancyTimer) clearTimeout(dormancyTimer);
      dormancyTimer = setTimeout(() => {
        if (document.visibilityState === "hidden") {
          console.log("[PUSHER-HYGIENE] Tab dormant for >45s. Disconnecting WebSocket to conserve quota.");
          try {
            pusherClient.disconnect();
          } catch {}
        }
      }, DORMANCY_TIMEOUT_MS);
    } else if (document.visibilityState === "visible") {
      // Tab is active again: cancel countdown and reconnect if needed
      if (dormancyTimer) {
        clearTimeout(dormancyTimer);
        dormancyTimer = null;
      }

      if (pusherClient.connection.state === "disconnected" || pusherClient.connection.state === "unavailable") {
        console.log("[PUSHER-HYGIENE] Tab visible. Reconnecting Pusher WebSocket and syncing state...");
        try {
          pusherClient.connect();
          // Trigger SWR revalidation to pull any updates missed during dormancy
          void mutate(() => true, undefined, { revalidate: true });
        } catch {}
      }
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  // 3. Setup Cross-Tab BroadcastChannel
  if (typeof BroadcastChannel !== "undefined") {
    try {
      crossTabChannel = new BroadcastChannel("my-crm-realtime-sync");
      crossTabChannel.onmessage = (event: MessageEvent<CrossTabEventMessage>) => {
        if (event.data?.type === "PUSHER_EVENT_BROADCAST") {
          // If we are dormant, or if event arrived from another tab, trigger SWR revalidation for the relevant key
          const payload = event.data.data as { dealId?: string; action?: string; deal?: { id?: string } };
          if (payload?.action?.startsWith('OPPORTUNITY_') || payload?.dealId || payload?.deal?.id) {
            void mutate(key => Array.isArray(key) && key[0] === 'pipeline-deals');
          }
          if (payload?.dealId) {
            void mutate(['deal-accelerators', payload.dealId]);
          }
          if (payload?.action === 'DEAL_ACCELERATORS_UPDATED') {
            void mutate(key => Array.isArray(key) && key[0] === 'pending-accelerators');
          }
          if (event.data.eventName === 'new-notification') {
            void mutate('my-notifications');
          }
        }
      };
    } catch (e) {
      console.warn("[PUSHER-HYGIENE] BroadcastChannel not supported:", e);
    }
  }
}

/**
 * Broadcasts an event locally across all tabs in this browser instance
 */
export function broadcastEventAcrossTabs(channelName: string, eventName: string, data: unknown) {
  try {
    if (crossTabChannel) {
      crossTabChannel.postMessage({
        type: "PUSHER_EVENT_BROADCAST",
        channelName,
        eventName,
        data,
        timestamp: Date.now(),
      });
    }
  } catch {}
}
