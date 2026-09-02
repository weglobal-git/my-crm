import assert from "node:assert/strict";
import test from "node:test";

import { createCommandId } from "./contracts";
import type { EventLedgerFeatureFlags } from "./feature-flags";
import {
  CollaborationConflictError,
  requestOwnershipTransferCommand,
  requestTeamInviteCommand,
  respondToCollaborationRequestCommand,
  type CollaborationTransaction,
} from "./collaboration-commands";
import type { StoredDomainEvent } from "./transaction";

const flags: EventLedgerFeatureFlags = {
  writeEnabled: true,
  strictMode: true,
  aiEnqueueEnabled: true,
  softDeleteEnabled: true,
};
const versions = { promptVersion: "event-summary-v1", schemaVersion: "v1" };

function context(actorId = "user-owner") {
  return {
    actorId,
    commandId: createCommandId(),
    correlationId: "correlation-1",
    traceId: "trace-1",
    occurredAt: new Date("2026-09-02T04:00:00.000Z"),
    timezone: "Asia/Bangkok",
  };
}

function fakeTransaction(options: {
  notificationType?: "DEAL_TRANSFER_REQUEST" | "TEAM_INVITE_REQUEST";
  notificationStatus?: "PENDING" | "ACCEPTED" | "REJECTED";
  recipientId?: string;
  replay?: StoredDomainEvent | null;
  requestPayload?: Record<string, string | number> | null;
  dealVersion?: number;
  ownerId?: string;
  teamIds?: string[];
  claimCount?: number;
  dealUpdateCount?: number;
} = {}) {
  const notificationType = options.notificationType ?? "DEAL_TRANSFER_REQUEST";
  const dealVersion = options.dealVersion ?? 1;
  const ownerId = options.ownerId ?? "user-owner";
  const recipientId = options.recipientId ?? "user-target";
  const calls = {
    notifications: [] as Array<{ data: Record<string, unknown> }>,
    claims: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
    dealUpdates: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
    teamUpdates: [] as Array<{ data: Record<string, unknown> }>,
    events: [] as Array<{ data: Record<string, unknown> }>,
    outboxes: [] as unknown[],
  };
  const requestPayload = options.requestPayload === null ? null : (options.requestPayload ?? {
    notificationId: "notification-1",
    targetUserId: recipientId,
    previousOwnerId: ownerId,
    dealVersion,
  });
  const tx: CollaborationTransaction = {
    notification: {
      async findUnique() {
        return {
          id: "notification-1",
          recipientId,
          senderId: ownerId,
          type: notificationType,
          referenceId: "deal-1",
          status: options.notificationStatus ?? "PENDING",
        };
      },
      async create(args) {
        calls.notifications.push(args);
        return { id: "notification-1" };
      },
      async updateMany(args) {
        calls.claims.push(args);
        return { count: options.claimCount ?? 1 };
      },
    },
    opportunity: {
      async findUnique() {
        return {
          id: "deal-1",
          version: dealVersion,
          deletedAt: null,
          ownerId,
          teamMembers: (options.teamIds ?? []).map(id => ({ id })),
        };
      },
      async updateMany(args) {
        calls.dealUpdates.push(args);
        return { count: options.dealUpdateCount ?? 1 };
      },
      async update(args) {
        calls.teamUpdates.push(args);
        return { id: "deal-1" };
      },
    },
    dealDomainEvent: {
      async findUnique() { return options.replay ?? null; },
      async findFirst() {
        return requestPayload ? {
          id: "request-event-1",
          dealId: "deal-1",
          eventType: notificationType === "DEAL_TRANSFER_REQUEST"
            ? "OWNERSHIP_TRANSFER_REQUESTED"
            : "TEAM_INVITE_REQUESTED",
          payload: requestPayload,
        } : null;
      },
      async create(args) {
        calls.events.push(args);
        return {
          id: `event-${calls.events.length}`,
          dealId: args.data.dealId,
          eventType: args.data.eventType,
          processingClass: args.data.processingClass,
          commandId: args.data.commandId,
          resultRef: args.data.resultRef ?? null,
        };
      },
    },
    agentOutbox: {
      async upsert(args) {
        calls.outboxes.push(args);
        return { id: `outbox-${calls.outboxes.length}` };
      },
    },
  };
  return { tx, calls };
}

test("transfer request creates notification and audit event without changing owner", async () => {
  const { tx, calls } = fakeTransaction();
  const result = await requestOwnershipTransferCommand(tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    newOwnerId: "user-target",
  }, flags);

  assert.equal(result.kind, "REQUESTED");
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.dealUpdates.length, 0);
  assert.equal(calls.teamUpdates.length, 0);
  assert.equal(calls.events[0].data.eventType, "OWNERSHIP_TRANSFER_REQUESTED");
  assert.equal(calls.outboxes.length, 0);
});

test("team invite request rejects existing members", async () => {
  const { tx, calls } = fakeTransaction({ teamIds: ["user-target"] });
  await assert.rejects(requestTeamInviteCommand(tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    userId: "user-target",
  }, flags), CollaborationConflictError);
  assert.equal(calls.notifications.length, 0);
  assert.equal(calls.events.length, 0);
});

test("accepted transfer claims request, changes owner once, and enqueues summary", async () => {
  const { tx, calls } = fakeTransaction();
  const result = await respondToCollaborationRequestCommand(tx, context("user-target"), {
    notificationId: "notification-1",
    accept: true,
  }, flags, versions);

  assert.equal(result.kind, "ACCEPTED");
  assert.equal(calls.claims.length, 1);
  assert.equal(calls.dealUpdates[0].data.ownerId, "user-target");
  assert.deepEqual(calls.dealUpdates[0].data.version, { increment: 1 });
  assert.deepEqual(calls.teamUpdates[0].data, {
    teamMembers: { connect: { id: "user-owner" } },
  });
  assert.equal(calls.events[0].data.eventType, "DEAL_OWNER_CHANGED");
  assert.equal(calls.outboxes.length, 1);
});

test("rejected transfer records truth without changing owner or enqueueing", async () => {
  const { tx, calls } = fakeTransaction();
  const result = await respondToCollaborationRequestCommand(tx, context("user-target"), {
    notificationId: "notification-1",
    accept: false,
  }, flags);

  assert.equal(result.kind, "REJECTED");
  assert.equal(calls.claims[0].data.status, "REJECTED");
  assert.equal(calls.dealUpdates.length, 0);
  assert.equal(calls.teamUpdates.length, 0);
  assert.equal(calls.events[0].data.eventType, "OWNERSHIP_TRANSFER_REJECTED");
  assert.equal(calls.outboxes.length, 0);
});

test("accepted team invite connects member but remains audit-only", async () => {
  const { tx, calls } = fakeTransaction({ notificationType: "TEAM_INVITE_REQUEST" });
  const result = await respondToCollaborationRequestCommand(tx, context("user-target"), {
    notificationId: "notification-1",
    accept: true,
  }, flags);

  assert.equal(result.kind, "ACCEPTED");
  assert.deepEqual(calls.teamUpdates[0].data, {
    teamMembers: { connect: { id: "user-target" } },
  });
  assert.equal(calls.events[0].data.eventType, "DEAL_MEMBER_ADDED");
  assert.equal(calls.outboxes.length, 0);
});

test("only recipient can respond", async () => {
  const { tx, calls } = fakeTransaction();
  await assert.rejects(respondToCollaborationRequestCommand(tx, context("another-user"), {
    notificationId: "notification-1",
    accept: true,
  }, flags, versions), /another user/);
  assert.equal(calls.claims.length, 0);
  assert.equal(calls.dealUpdates.length, 0);
});

test("compare-and-swap claim prevents duplicate responses", async () => {
  const { tx, calls } = fakeTransaction({ claimCount: 0 });
  await assert.rejects(respondToCollaborationRequestCommand(tx, context("user-target"), {
    notificationId: "notification-1",
    accept: true,
  }, flags, versions), /already handled/);
  assert.equal(calls.dealUpdates.length, 0);
  assert.equal(calls.events.length, 0);
  assert.equal(calls.outboxes.length, 0);
});

test("stale request cannot mutate a newer Deal version", async () => {
  const { tx, calls } = fakeTransaction({
    dealVersion: 2,
    requestPayload: {
      targetUserId: "user-target",
      previousOwnerId: "user-owner",
      dealVersion: 1,
    },
  });
  await assert.rejects(respondToCollaborationRequestCommand(tx, context("user-target"), {
    notificationId: "notification-1",
    accept: true,
  }, flags, versions), /changed after/);
  assert.equal(calls.claims.length, 0);
  assert.equal(calls.dealUpdates.length, 0);
});

test("stale request can still be rejected without mutating the Deal", async () => {
  const { tx, calls } = fakeTransaction({
    dealVersion: 2,
    requestPayload: {
      targetUserId: "user-target",
      previousOwnerId: "user-owner",
      dealVersion: 1,
    },
  });
  const result = await respondToCollaborationRequestCommand(tx, context("user-target"), {
    notificationId: "notification-1",
    accept: false,
  }, flags);

  assert.equal(result.kind, "REJECTED");
  assert.equal(calls.claims.length, 1);
  assert.equal(calls.dealUpdates.length, 0);
  assert.equal(calls.events[0].data.eventType, "OWNERSHIP_TRANSFER_REJECTED");
});

test("missing request provenance fails closed", async () => {
  const { tx, calls } = fakeTransaction({ requestPayload: null });
  await assert.rejects(respondToCollaborationRequestCommand(tx, context("user-target"), {
    notificationId: "notification-1",
    accept: true,
  }, flags, versions), /provenance/);
  assert.equal(calls.claims.length, 0);
});

test("request command replay does not create another notification", async () => {
  const commandId = createCommandId();
  const replay: StoredDomainEvent = {
    id: "event-existing",
    dealId: "deal-1",
    eventType: "OWNERSHIP_TRANSFER_REQUESTED",
    processingClass: "AUDIT_ONLY",
    commandId,
    resultRef: { notificationId: "notification-existing" },
  };
  const { tx, calls } = fakeTransaction({ replay });
  const result = await requestOwnershipTransferCommand(tx, { ...context(), commandId }, {
    dealId: "deal-1",
    expectedVersion: 1,
    newOwnerId: "user-target",
  }, flags);

  assert.equal(result.kind, "REPLAY");
  assert.equal(result.notificationId, "notification-existing");
  assert.equal(calls.notifications.length, 0);
  assert.equal(calls.events.length, 0);
});
