import assert from "node:assert/strict";
import test from "node:test";

import { createCommandId } from "./contracts";
import type { EventLedgerFeatureFlags } from "./feature-flags";
import {
  DealVersionConflictError,
  changeDealDueDateCommand,
  changeDealStageCommand,
  finalizeDealCommand,
  updateDealFieldsCommand,
  type DealLedgerTransaction,
  type DealRecord,
} from "./deal-commands";
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
    occurredAt: new Date("2026-09-02T03:00:00.000Z"),
    timezone: "Asia/Bangkok",
  };
}

function deal(overrides: Partial<DealRecord> = {}): DealRecord {
  return {
    id: "deal-1",
    version: 1,
    deletedAt: null,
    pipelineStageId: "stage-1",
    status: "OPEN",
    topic: "Original topic",
    type: "SALES_DEAL",
    value: null,
    currency: "THB",
    dueDate: null,
    goodsReadyDate: null,
    goodsLoadingDate: null,
    reserveId: null,
    invoiceId: null,
    lossReason: null,
    closedAt: null,
    ...overrides,
  };
}

function fakeTransaction(options: {
  current?: DealRecord | null;
  replay?: StoredDomainEvent | null;
  updateCount?: number;
} = {}) {
  const current = options.current === undefined ? deal() : options.current;
  const calls = {
    updates: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
    events: [] as Array<{ data: Record<string, unknown> }>,
    outboxes: [] as unknown[],
  };
  const tx: DealLedgerTransaction = {
    opportunity: {
      async findUnique() { return current; },
      async updateMany(args) {
        calls.updates.push(args);
        return { count: options.updateCount ?? 1 };
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

test("stage change writes one versioned update, event, and outbox", async () => {
  const { tx, calls } = fakeTransaction();
  const result = await changeDealStageCommand(tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    newStageId: "stage-2",
  }, flags, versions);

  assert.equal(result.kind, "APPLIED");
  assert.deepEqual(calls.updates[0].where, { id: "deal-1", version: 1, deletedAt: null });
  assert.equal(calls.updates[0].data.pipelineStageId, "stage-2");
  assert.deepEqual(calls.updates[0].data.version, { increment: 1 });
  assert.equal(calls.events[0].data.eventType, "DEAL_STAGE_CHANGED");
  assert.equal(calls.outboxes.length, 1);
});

test("unchanged stage is a no-op", async () => {
  const { tx, calls } = fakeTransaction();
  const result = await changeDealStageCommand(tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    newStageId: "stage-1",
  }, flags, versions);

  assert.equal(result.kind, "NO_CHANGE");
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.events.length, 0);
  assert.equal(calls.outboxes.length, 0);
});

test("stage change rejects empty IDs and terminal Deals", async () => {
  const empty = fakeTransaction();
  await assert.rejects(changeDealStageCommand(empty.tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    newStageId: "  ",
  }, flags, versions), /newStageId/);
  assert.equal(empty.calls.updates.length, 0);

  const terminal = fakeTransaction({ current: deal({ status: "WON" }) });
  await assert.rejects(changeDealStageCommand(terminal.tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    newStageId: "stage-2",
  }, flags, versions), /Only open Deals/);
  assert.equal(terminal.calls.updates.length, 0);
});

test("due date emits one canonical event with reason and ISO diff", async () => {
  const { tx, calls } = fakeTransaction();
  const dueDate = new Date("2026-09-15T00:00:00.000Z");
  await changeDealDueDateCommand(tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    dueDate,
    reason: "Customer requested more time",
  }, flags, versions);

  assert.equal(calls.updates.length, 1);
  assert.equal(calls.events.length, 1);
  assert.equal(calls.outboxes.length, 1);
  const payload = calls.events[0].data.payload as Record<string, unknown>;
  assert.equal(payload.reason, "Customer requested more time");
  assert.deepEqual((payload.changedFields as Record<string, unknown>).dueDate, {
    before: null,
    after: dueDate.toISOString(),
  });
});

test("multi-field save suppresses unchanged fields and preserves one intent", async () => {
  const { tx, calls } = fakeTransaction();
  await updateDealFieldsCommand(tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    patch: { topic: "Revised topic", currency: "THB", value: 5000 },
  }, flags, versions);

  assert.deepEqual(calls.updates[0].data, {
    topic: "Revised topic",
    value: 5000,
    version: { increment: 1 },
  });
  assert.equal(calls.events[0].data.eventType, "DEAL_FIELDS_UPDATED");
  const fields = (calls.events[0].data.payload as { changedFields: Record<string, unknown> }).changedFields;
  assert.deepEqual(Object.keys(fields), ["topic", "value"]);
  assert.equal(calls.outboxes.length, 1);
});

test("Won applies required fields and outcome atomically", async () => {
  const { tx, calls } = fakeTransaction();
  const loadingDate = new Date("2026-09-20T00:00:00.000Z");
  await finalizeDealCommand(tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    outcome: "WON",
    wonFields: {
      value: 125000,
      currency: "THB",
      goodsLoadingDate: loadingDate,
      invoiceId: "INV-100",
    },
  }, flags, versions);

  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].data.status, "WON");
  assert.equal(calls.updates[0].data.pipelineStageId, null);
  assert.equal(calls.updates[0].data.invoiceId, "INV-100");
  assert.equal(calls.events[0].data.eventType, "DEAL_WON");
  assert.equal(calls.events.length, 1);
  assert.equal(calls.outboxes.length, 1);
});

test("Won Sales Deal fails before update when required data is incomplete", async () => {
  const { tx, calls } = fakeTransaction();
  await assert.rejects(finalizeDealCommand(tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    outcome: "WON",
    wonFields: { value: 5000 },
  }, flags, versions), /requires value, currency, loading date, and invoice/);

  assert.equal(calls.updates.length, 0);
  assert.equal(calls.events.length, 0);
});

test("Lost requires a reason and writes one outcome event", async () => {
  const invalid = fakeTransaction();
  await assert.rejects(finalizeDealCommand(invalid.tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    outcome: "LOST",
    lossReason: "  ",
  }, flags, versions), /Loss reason/);
  assert.equal(invalid.calls.updates.length, 0);

  const valid = fakeTransaction();
  await finalizeDealCommand(valid.tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    outcome: "LOST",
    lossReason: "Budget unavailable",
  }, flags, versions);
  assert.equal(valid.calls.updates[0].data.status, "LOST");
  assert.equal(valid.calls.events[0].data.eventType, "DEAL_LOST");
  assert.equal(valid.calls.events.length, 1);
  assert.equal(valid.calls.outboxes.length, 1);
});

test("new commands cannot finalize a terminal Deal again", async () => {
  const { tx, calls } = fakeTransaction({ current: deal({ status: "LOST" }) });
  await assert.rejects(finalizeDealCommand(tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    outcome: "LOST",
    lossReason: "Another reason",
  }, flags, versions), /Only open Deals/);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.events.length, 0);
});

test("Deal commands require an attributable actor", async () => {
  const { tx, calls } = fakeTransaction();
  await assert.rejects(updateDealFieldsCommand(tx, {
    ...context(),
    actorId: null,
  }, {
    dealId: "deal-1",
    expectedVersion: 1,
    patch: { topic: "No actor" },
  }, flags, versions), /require an actor/);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.events.length, 0);
});

test("compare-and-swap conflict prevents event and outbox", async () => {
  const { tx, calls } = fakeTransaction({ updateCount: 0 });
  await assert.rejects(changeDealStageCommand(tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    newStageId: "stage-2",
  }, flags, versions), DealVersionConflictError);
  assert.equal(calls.events.length, 0);
  assert.equal(calls.outboxes.length, 0);
});

test("stale or deleted Deal fails before mutation", async () => {
  const { tx, calls } = fakeTransaction({
    current: deal({ version: 2, deletedAt: new Date() }),
  });
  await assert.rejects(updateDealFieldsCommand(tx, context(), {
    dealId: "deal-1",
    expectedVersion: 1,
    patch: { topic: "Cannot update" },
  }, flags, versions), DealVersionConflictError);
  assert.equal(calls.updates.length, 0);
});

test("command replay returns canonical result without another Deal update", async () => {
  const commandId = createCommandId();
  const replay: StoredDomainEvent = {
    id: "event-existing",
    dealId: "deal-1",
    eventType: "DEAL_STAGE_CHANGED",
    processingClass: "AI_SUMMARY",
    commandId,
    resultRef: { dealId: "deal-1", version: 2 },
  };
  const { tx, calls } = fakeTransaction({ replay });
  const result = await changeDealStageCommand(tx, { ...context(), commandId }, {
    dealId: "deal-1",
    expectedVersion: 1,
    newStageId: "stage-2",
  }, flags, versions);

  assert.equal(result.kind, "REPLAY");
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.events.length, 0);
  assert.equal(calls.outboxes.length, 0);
});
