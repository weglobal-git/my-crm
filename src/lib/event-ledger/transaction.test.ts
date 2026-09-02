import assert from "node:assert/strict";
import test from "node:test";

import { createCommandId } from "./contracts";
import type { EventLedgerFeatureFlags } from "./feature-flags";
import {
  CommandReplayConflictError,
  findCommandReplay,
  recordDomainEvent,
  type EventLedgerTransaction,
  type StoredDomainEvent,
} from "./transaction";

const enabledFlags: EventLedgerFeatureFlags = {
  writeEnabled: true,
  strictMode: false,
  aiEnqueueEnabled: true,
  softDeleteEnabled: false,
};

function event(overrides: Partial<StoredDomainEvent> = {}): StoredDomainEvent {
  return {
    id: "event-1",
    dealId: "deal-1",
    eventType: "ACTIVITY_CREATED",
    processingClass: "AI_SUMMARY",
    commandId: createCommandId(),
    resultRef: { activityId: "activity-1" },
    ...overrides,
  };
}

function fakeTransaction(replay: StoredDomainEvent | null = null) {
  const calls = {
    creates: [] as unknown[],
    outboxes: [] as unknown[],
  };
  const tx: EventLedgerTransaction = {
    dealDomainEvent: {
      async findUnique() {
        return replay;
      },
      async create(args) {
        calls.creates.push(args);
        return event({
          dealId: args.data.dealId,
          eventType: args.data.eventType,
          processingClass: args.data.processingClass,
          commandId: args.data.commandId,
          resultRef: args.data.resultRef ?? null,
        });
      },
    },
    agentOutbox: {
      async upsert(args) {
        calls.outboxes.push(args);
        return { id: "outbox-1" };
      },
    },
  };
  return { tx, calls };
}

function validRecordInput(eventType: "ACTIVITY_CREATED" | "ACTIVITY_DELETED" = "ACTIVITY_CREATED") {
  return {
    context: {
      actorId: "user-1",
      commandId: createCommandId(),
      correlationId: "correlation-1",
      traceId: "trace-1",
      occurredAt: new Date("2026-09-01T18:30:00.000Z"),
      timezone: "Asia/Bangkok",
    },
    input: {
      dealId: "deal-1",
      eventType,
      sourceType: "ACTIVITY" as const,
      sourceEntityId: "activity-1",
      sourceVersion: 1,
      payload: { contentHash: "abc", nested: [true, 1, null] },
      resultRef: { activityId: "activity-1" },
    },
    versions: { promptVersion: "event-summary-v1", schemaVersion: "v1" },
  };
}

test("matching command replay returns the canonical prior result", async () => {
  const commandId = createCommandId();
  const previous = event({ commandId });
  const { tx } = fakeTransaction(previous);

  assert.equal(await findCommandReplay(tx, {
    commandId,
    dealId: "deal-1",
    eventType: "ACTIVITY_CREATED",
  }), previous);
});

test("command replay fails closed when its semantic identity differs", async () => {
  const commandId = createCommandId();
  const { tx } = fakeTransaction(event({ commandId, dealId: "another-deal" }));

  await assert.rejects(findCommandReplay(tx, {
    commandId,
    dealId: "deal-1",
    eventType: "ACTIVITY_CREATED",
  }), CommandReplayConflictError);
});

test("AI summary event creates event and idempotent outbox intent", async () => {
  const { tx, calls } = fakeTransaction();
  const { context, input, versions } = validRecordInput();
  const result = await recordDomainEvent(tx, context, input, enabledFlags, versions);

  assert.equal(result.outboxId, "outbox-1");
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.outboxes.length, 1);

  const create = calls.creates[0] as { data: { localEventDate: Date; payloadVersion: number } };
  assert.equal(create.data.localEventDate.toISOString(), "2026-09-02T00:00:00.000Z");
  assert.equal(create.data.payloadVersion, 1);

  const outbox = calls.outboxes[0] as {
    where: { dedupeKey: string };
    create: { dedupeKey: string; maxAttempts: number };
  };
  assert.equal(outbox.where.dedupeKey, outbox.create.dedupeKey);
  assert.match(outbox.create.dedupeKey, /^event-summary:[0-9a-f]{64}$/);
  assert.equal(outbox.create.maxAttempts, 2);
});

test("audit-only event never creates Event Summary work", async () => {
  const { tx, calls } = fakeTransaction();
  const { context, input, versions } = validRecordInput("ACTIVITY_DELETED");
  const result = await recordDomainEvent(tx, context, input, enabledFlags, versions);

  assert.equal(result.outboxId, null);
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.outboxes.length, 0);
});

test("AI enqueue flag can disable outbox without disabling the ledger", async () => {
  const { tx, calls } = fakeTransaction();
  const { context, input } = validRecordInput();
  const result = await recordDomainEvent(tx, context, input, {
    ...enabledFlags,
    aiEnqueueEnabled: false,
  });

  assert.equal(result.outboxId, null);
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.outboxes.length, 0);
});

test("audit-only event does not depend on AI version policy", async () => {
  const { tx, calls } = fakeTransaction();
  const { context, input } = validRecordInput("ACTIVITY_DELETED");
  const result = await recordDomainEvent(tx, context, input, enabledFlags);

  assert.equal(result.outboxId, null);
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.outboxes.length, 0);
});

test("summary enqueue fails closed without version policy", async () => {
  const { tx, calls } = fakeTransaction();
  const { context, input } = validRecordInput();

  await assert.rejects(recordDomainEvent(tx, context, input, enabledFlags), /versions are required/);
  assert.equal(calls.creates.length, 0);
  assert.equal(calls.outboxes.length, 0);
});

test("disabled ledger cannot be accidentally written", async () => {
  const { tx, calls } = fakeTransaction();
  const { context, input, versions } = validRecordInput();

  await assert.rejects(recordDomainEvent(tx, context, input, {
    ...enabledFlags,
    writeEnabled: false,
  }, versions), /writes are disabled/);
  assert.equal(calls.creates.length, 0);
  assert.equal(calls.outboxes.length, 0);
});

test("invalid payload and version fail before database writes", async () => {
  const { tx, calls } = fakeTransaction();
  const { context, input, versions } = validRecordInput();
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;

  await assert.rejects(recordDomainEvent(tx, context, {
    ...input,
    payload: cyclic as never,
  }, enabledFlags, versions), /cycles/);
  await assert.rejects(recordDomainEvent(tx, context, {
    ...input,
    sourceVersion: 0,
  }, enabledFlags, versions), /sourceVersion/);
  assert.equal(calls.creates.length, 0);
  assert.equal(calls.outboxes.length, 0);
});

test("invalid context and retry policy fail before database writes", async () => {
  const { tx, calls } = fakeTransaction();
  const { context, input, versions } = validRecordInput();

  await assert.rejects(recordDomainEvent(tx, {
    ...context,
    timezone: "Invalid/Timezone",
  }, input, enabledFlags, versions), RangeError);
  await assert.rejects(recordDomainEvent(tx, context, input, enabledFlags, {
    ...versions,
    maxAttempts: 0,
  }), /maxAttempts/);
  assert.equal(calls.creates.length, 0);
  assert.equal(calls.outboxes.length, 0);
});
