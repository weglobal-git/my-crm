"use client";

import PusherClient from "pusher-js";

let clientInstance: PusherClient | null = null;

export function getPusherClient(): PusherClient | null {
  if (typeof window === "undefined") return null;
  return clientInstance;
}

export function getOrCreatePusherClient(): PusherClient {
  if (typeof window === "undefined") {
    throw new Error("PusherClient should only be initialized in browser environments.");
  }
  if (!clientInstance) {
    clientInstance = new PusherClient(
      process.env.NEXT_PUBLIC_PUSHER_APP_KEY!,
      {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        authEndpoint: "/api/pusher/auth",
      }
    );
  }
  return clientInstance;
}

export function connectPusher(): void {
  if (typeof window === "undefined") return;
  const client = getOrCreatePusherClient();
  if (
    client.connection.state === "disconnected" ||
    client.connection.state === "unavailable" ||
    client.connection.state === "initialized"
  ) {
    client.connect();
  }
}

export function disconnectPusher(): void {
  if (clientInstance) {
    try {
      if (
        clientInstance.connection.state === "connected" ||
        clientInstance.connection.state === "connecting"
      ) {
        clientInstance.disconnect();
      }
    } catch {}
  }
}

export function destroyPusherClient(): void {
  if (clientInstance) {
    try {
      disconnectPusher();
      clientInstance.unbind_all();
    } catch {}
    clientInstance = null;
  }
}

/**
 * Backward-compatible proxy export.
 * Delegates property and method access to the singleton browser instance.
 */
export const pusherClient: PusherClient = new Proxy({} as PusherClient, {
  get(_target, prop, receiver) {
    const instance = getOrCreatePusherClient();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
