import assert from "node:assert/strict";
import test from "node:test";

import { createCommandId } from "./contracts";
import type { EventLedgerFeatureFlags } from "./feature-flags";
import {
  ActivityVersionConflictError,
  InvalidActivitySourceError,
  createActivityCommand,
  deleteActivityCommand,
  editActivityCommand,
  type ActivityLedgerTransaction,
  type ActivityRecord,
} from "./activity-commands";
import type { StoredDomainEvent } from "./transaction";

const flags: EventLedgerFeatureFlags = {
  writeEnabled: true,
  strictMode: true,
  aiEnqueueEnabled: true,
  softDeleteEnabled: true,
};
const versions = { promptVersion: "event-summary-v1", schemaVersion: "v1" };

function context() {
  return {
    actorId: "user-1",
    commandId: createCommandId(),
    correlationId: "correlation-1",
    traceId: "trace-1",
    occurredAt: new Date("2026-09-02T02:00:00.000Z"),
    timezone: "Asia/Bangkok",
  };
}

function activity(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    id: "activity-1",
    opportunityId: "deal-1",
    userId: "user-1",
    content: "Original",
    type: "COMMENT",
    parentId: null,
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

function fakeTransaction(options: {
  current?: ActivityRecord | null;
  replay?: StoredDomainEvent | null;
  updateCount?: number;
} = {}) {
  let current = options.current === undefined ? activity() : options.current;
  const calls = {
    activityCreates: [] as Array<{ data: Record<string, unknown> }>,
    updates: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
    revisions: [] as Array<{ data: Record<string, unknown> }>,
    events: [] as Array<{ data: Record<string, unknown> }>,
    outboxes: [] as unknown[],
  };
  const tx: ActivityLedgerTransaction = {
    activityLog: {
      async findUnique() { return current; },
      async create(args) {
        calls.activityCreates.push(args);
        current = activity({
          id: "activity-new",
          opportunityId: args.data.opportunityId,
          userId: args.data.userId,
          content: args.data.content,
          type: args.data.type,
          parentId: args.data.parentId,
        });
        return current;
      },
      async updateMany(args) {
        calls.updates.push(args);
        return { count: options.updateCount ?? 1 };
      },
    },
    activityRevision: {
      async create(args) {
        calls.revisions.push(args);
        return { id: `revision-${calls.revisions.length}` };
      },
    },
    dealDomainEvent: {
      async findUnique() { return options.replay ?? null; },
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

test("create comment writes source, immutable revision, event, and outbox", async () => {
  const { tx, calls } = fakeTransaction({ current: null });
  const result = await createActivityCommand(tx, context(), {
    dealId: "deal-1",
    content: "Customer requested a revised quote",
  }, flags, versions);

  assert.equal(result.kind, "APPLIED");
  assert.equal(calls.activityCreates.length, 1);
  assert.equal(calls.revisions.length, 1);
  assert.equal(calls.revisions[0].data.changeType, "CREATED");
  assert.equal(calls.revisions[0].data.version, 1);
  assert.match(String(calls.revisions[0].data.contentHash), /^[0-9a-f]{64}$/);
  assert.equal(calls.events[0].data.eventType, "ACTIVITY_CREATED");
  assert.equal(calls.outboxes.length, 1);
});

test("reply is independently versioned and classified", async () => {
  const { tx, calls } = fakeTransaction({ current: activity({ id: "activity-parent" }) });
  await createActivityCommand(tx, context(), {
    dealId: "deal-1",
    content: "Procurement will answer Friday",
    parentId: "activity-parent",
  }, flags, versions);

  assert.equal(calls.activityCreates[0].data.parentId, "activity-parent");
  assert.equal(calls.revisions[0].data.parentId, "activity-parent");
  assert.equal(calls.events[0].data.eventType, "REPLY_CREATED");
});

test("reply rejects a deleted or cross-deal parent", async () => {
  const deleted = fakeTransaction({
    current: activity({ id: "activity-parent", deletedAt: new Date() }),
  });
  await assert.rejects(createActivityCommand(deleted.tx, context(), {
    dealId: "deal-1",
    content: "Reply",
    parentId: "activity-parent",
  }, flags, versions), InvalidActivitySourceError);
  assert.equal(deleted.calls.activityCreates.length, 0);

  const crossDeal = fakeTransaction({
    current: activity({ id: "activity-parent", opportunityId: "deal-2" }),
  });
  await assert.rejects(createActivityCommand(crossDeal.tx, context(), {
    dealId: "deal-1",
    content: "Reply",
    parentId: "activity-parent",
  }, flags, versions), /not found/i);
  assert.equal(crossDeal.calls.activityCreates.length, 0);
});

test("system logs cannot enter the comment summary command path", async () => {
  const create = fakeTransaction({ current: null });
  await assert.rejects(createActivityCommand(create.tx, context(), {
    dealId: "deal-1",
    content: "Derived display log",
    activityType: "SYSTEM_UPDATE",
  }, flags, versions), InvalidActivitySourceError);
  assert.equal(create.calls.activityCreates.length, 0);

  const edit = fakeTransaction({ current: activity({ type: "SYSTEM_UPDATE" }) });
  await assert.rejects(editActivityCommand(edit.tx, context(), {
    activityId: "activity-1",
    dealId: "deal-1",
    expectedVersion: 1,
    content: "Changed projection",
  }, flags, versions), InvalidActivitySourceError);
  assert.equal(edit.calls.updates.length, 0);
  assert.equal(edit.calls.events.length, 0);
});

test("edit uses compare-and-swap and appends the new source version", async () => {
  const { tx, calls } = fakeTransaction();
  const result = await editActivityCommand(tx, context(), {
    activityId: "activity-1",
    dealId: "deal-1",
    expectedVersion: 1,
    content: "Revised",
  }, flags, versions);

  assert.equal(result.kind, "APPLIED");
  assert.deepEqual(calls.updates[0].where, { id: "activity-1", version: 1, deletedAt: null });
  assert.deepEqual(calls.updates[0].data.version, { increment: 1 });
  assert.equal(calls.revisions[0].data.version, 2);
  assert.equal(calls.revisions[0].data.content, "Revised");
  assert.equal(calls.events[0].data.eventType, "ACTIVITY_EDITED");
});

test("same-content edit is a no-op with no revision or event", async () => {
  const { tx, calls } = fakeTransaction();
  const result = await editActivityCommand(tx, context(), {
    activityId: "activity-1",
    dealId: "deal-1",
    expectedVersion: 1,
    content: "Original",
  }, flags, versions);

  assert.equal(result.kind, "NO_CHANGE");
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.revisions.length, 0);
  assert.equal(calls.events.length, 0);
});

test("concurrent edit conflict stops revision and event writes", async () => {
  const { tx, calls } = fakeTransaction({ updateCount: 0 });
  await assert.rejects(editActivityCommand(tx, context(), {
    activityId: "activity-1",
    dealId: "deal-1",
    expectedVersion: 1,
    content: "Competing edit",
  }, flags, versions), ActivityVersionConflictError);

  assert.equal(calls.revisions.length, 0);
  assert.equal(calls.events.length, 0);
  assert.equal(calls.outboxes.length, 0);
});

test("delete writes tombstone revision and audit event without outbox", async () => {
  const deletedAt = new Date("2026-09-02T02:00:00.000Z");
  const commandContext = { ...context(), occurredAt: deletedAt };
  const { tx, calls } = fakeTransaction();
  const result = await deleteActivityCommand(tx, commandContext, {
    activityId: "activity-1",
    dealId: "deal-1",
    expectedVersion: 1,
  }, flags);

  assert.equal(result.kind, "APPLIED");
  assert.equal(calls.updates[0].data.deletedAt, deletedAt);
  assert.equal(calls.updates[0].data.deletedById, "user-1");
  assert.equal(calls.revisions[0].data.changeType, "DELETED");
  assert.equal(calls.revisions[0].data.content, "Original");
  assert.equal(calls.revisions[0].data.version, 2);
  assert.equal(calls.events[0].data.eventType, "ACTIVITY_DELETED");
  assert.equal(calls.outboxes.length, 0);
});

test("deleted or stale source fails before mutation", async () => {
  const { tx, calls } = fakeTransaction({
    current: activity({ deletedAt: new Date(), version: 2 }),
  });
  await assert.rejects(editActivityCommand(tx, context(), {
    activityId: "activity-1",
    dealId: "deal-1",
    expectedVersion: 1,
    content: "Cannot edit",
  }, flags, versions), ActivityVersionConflictError);

  assert.equal(calls.updates.length, 0);
  assert.equal(calls.revisions.length, 0);
});

test("command replay returns prior canonical result without mutation", async () => {
  const commandId = createCommandId();
  const replay: StoredDomainEvent = {
    id: "event-existing",
    dealId: "deal-1",
    eventType: "ACTIVITY_EDITED",
    processingClass: "AI_SUMMARY",
    commandId,
    resultRef: { activityId: "activity-1", version: 2 },
  };
  const { tx, calls } = fakeTransaction({ replay });
  const result = await editActivityCommand(tx, { ...context(), commandId }, {
    activityId: "activity-1",
    dealId: "deal-1",
    expectedVersion: 1,
    content: "Revised",
  }, flags, versions);

  assert.equal(result.kind, "REPLAY");
  assert.equal(result.activityId, "activity-1");
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.revisions.length, 0);
  assert.equal(calls.events.length, 0);
});
