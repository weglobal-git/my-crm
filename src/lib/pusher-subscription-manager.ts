"use client";

import type { Channel } from "pusher-js";
import { getPusherClient, pusherClient, PUSHER_CONNECTION_ACTIVE_EVENT } from "@/lib/pusher";

interface ChannelEntry {
  channel: Channel;
  refCount: number;
}

const registry = new Map<string, ChannelEntry>();

let testClient: {
  subscribe: (channelName: string) => Channel;
  unsubscribe: (channelName: string) => void;
} | null = null;

/**
 * Injects a mock Pusher client for automated unit testing in Node environments.
 */
export function setTestPusherClient(client: typeof testClient): void {
  testClient = client;
}

/**
 * Acquires a subscription to a Pusher channel using reference counting.
 * If the channel is not yet subscribed, it calls `subscribe(channelName)`.
 * If it already exists, it increments the reference count and returns the existing channel.
 */
export function acquireChannel(channelName: string): Channel {
  let entry = registry.get(channelName);
  if (!entry) {
    console.log(`[PUSHER-SUB-MGR] Subscribing to new channel: "${channelName}" (refCount: 1)`);
    const client = testClient || pusherClient;
    const channel = client.subscribe(channelName);
    entry = { channel, refCount: 1 };
    registry.set(channelName, entry);
  } else {
    entry.refCount += 1;
    console.log(`[PUSHER-SUB-MGR] Reusing channel: "${channelName}" (refCount: ${entry.refCount})`);
  }
  return entry.channel;
}

/**
 * Waits for the lifecycle owner to establish the socket before acquiring a channel.
 * Calling this from an initially hidden tab never constructs a Pusher client.
 */
export function acquireChannelWhenConnected(
  channelName: string,
  setup: (channel: Channel) => void | (() => void),
): () => void {
  let acquired = false;
  let cleanupChannel: void | (() => void);

  const acquireIfConnected = () => {
    if (acquired) return;
    const client = testClient ? null : getPusherClient();
    if (!testClient && (!client || client.connection.state !== "connected")) return;

    acquired = true;
    const channel = acquireChannel(channelName);
    cleanupChannel = setup(channel);
  };

  if (typeof window !== "undefined") {
    window.addEventListener(PUSHER_CONNECTION_ACTIVE_EVENT, acquireIfConnected);
  }
  acquireIfConnected();

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener(PUSHER_CONNECTION_ACTIVE_EVENT, acquireIfConnected);
    }
    if (!acquired) return;
    cleanupChannel?.();
    releaseChannel(channelName);
  };
}

/**
 * Releases a subscription to a Pusher channel.
 * Decrements reference count. If count reaches 0 or below,
 * unbinds any residual listeners, unsubscribes from Pusher, and removes it from the registry.
 */
export function releaseChannel(channelName: string): void {
  const entry = registry.get(channelName);
  if (!entry) return;

  entry.refCount -= 1;
  console.log(`[PUSHER-SUB-MGR] Releasing channel: "${channelName}" (refCount remaining: ${entry.refCount})`);

  if (entry.refCount <= 0) {
    console.log(`[PUSHER-SUB-MGR] Channel "${channelName}" has 0 subscribers. Unsubscribing from Pusher.`);
    try {
      const client = testClient || pusherClient;
      client.unsubscribe(channelName);
    } catch (err) {
      console.warn(`[PUSHER-SUB-MGR] Error unsubscribing from "${channelName}":`, err);
    }
    registry.delete(channelName);
  }
}

/**
 * Returns active channel if currently subscribed, without altering reference count.
 */
export function getActiveChannel(channelName: string): Channel | null {
  return registry.get(channelName)?.channel ?? null;
}

/**
 * Returns the current reference count for a channel (useful for diagnostics/testing).
 */
export function getChannelRefCount(channelName: string): number {
  return registry.get(channelName)?.refCount ?? 0;
}

/**
 * Cleanly releases and unsubscribes all active channels (called on logout/teardown).
 */
export function releaseAllChannels(): void {
  if (registry.size === 0) return;
  const client = testClient || getPusherClient();
  for (const [channelName] of registry.entries()) {
    try {
      client?.unsubscribe(channelName);
    } catch {}
  }
  registry.clear();
  console.log(`[PUSHER-SUB-MGR] All channels released and registry cleared.`);
}
