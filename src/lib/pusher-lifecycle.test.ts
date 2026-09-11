import test from "node:test";
import assert from "node:assert/strict";
import { getPusherClient } from "./pusher";
import {
  initPusherConnectionHygiene,
  shouldConnectPusher,
  teardownPusherConnectionHygiene,
} from "./pusher-connection-manager";

test.describe("Pusher connection lifecycle", () => {
  test("reconnects an initialized client when an initially hidden tab becomes visible", () => {
    assert.equal(shouldConnectPusher("initialized"), true);
    assert.equal(shouldConnectPusher("disconnected"), true);
    assert.equal(shouldConnectPusher("unavailable"), true);
    assert.equal(shouldConnectPusher("connected"), false);
    assert.equal(shouldConnectPusher("connecting"), false);
  });

  test("an initially hidden tab does not create a Pusher client", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const originalBroadcastChannel = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
    const listeners = new Map<string, EventListener>();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener: (name: string, handler: EventListener) => listeners.set(name, handler),
        removeEventListener: (name: string) => listeners.delete(name),
        dispatchEvent: () => true,
        location: { pathname: "/" },
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        visibilityState: "hidden",
        addEventListener: (name: string, handler: EventListener) => listeners.set(name, handler),
        removeEventListener: (name: string) => listeners.delete(name),
      },
    });
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: undefined,
    });

    try {
      initPusherConnectionHygiene("test-user");
      assert.equal(getPusherClient(), null);
    } finally {
      teardownPusherConnectionHygiene();
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else Reflect.deleteProperty(globalThis, "document");
      if (originalBroadcastChannel) Object.defineProperty(globalThis, "BroadcastChannel", originalBroadcastChannel);
      else Reflect.deleteProperty(globalThis, "BroadcastChannel");
    }
  });
});
