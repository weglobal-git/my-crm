import assert from "node:assert/strict";
import test from "node:test";

import { createCommandId } from "./contracts";
import type { ActivityLedgerTransaction, ActivityRecord } from "./activity-commands";
import { createSystemProjection } from "./system-projections";
import type { StoredDomainEvent } from "./transaction";

function domainEvent(): StoredDomainEvent {
  return {
    id: "event-1",
    dealId: "deal-1",
    eventType: "DEAL_DUE_DATE_CHANGED",
    processingClass: "AI_SUMMARY",
    commandId: createCommandId(),
    resultRef: null,
  };
}

function context(actorId: string | null = "user-1") {
  return {
    actorId,
    commandId: createCommandId(),
    correlationId: "correlation-1",
    traceId: "trace-1",
    occurredAt: new Date("2026-09-02T02:00:00.000Z"),
    timezone: "Asia/Bangkok",
  };
}

function fakeTransaction() {
  const calls = {
    activities: [] as Array<{ data: Record<string, unknown> }>,
    revisions: [] as Array<{ data: Record<string, unknown> }>,
    events: 0,
    outboxes: 0,
  };
  const tx = {
    activityLog: {
      async findUnique() { return null; },
      async create(args: { data: Record<string, unknown> }) {
        calls.activities.push(args);
        return {
          id: "projection-1",
          opportunityId: args.data.opportunityId,
          userId: args.data.userId,
          content: args.data.content,
          type: args.data.type,
          parentId: args.data.parentId,
          version: 1,
          deletedAt: null,
        } as ActivityRecord;
      },
      async updateMany() { return { count: 0 }; },
    },
    activityRevision: {
      async create(args: { data: Record<string, unknown> }) {
        calls.revisions.push(args);
        return { id: "revision-1" };
      },
    },
    dealDomainEvent: {
      async findUnique() { return null; },
      async create(): Promise<never> {
        calls.events += 1;
        throw new Error("projection must not create a domain event");
      },
    },
    agentOutbox: {
      async upsert(): Promise<never> {
        calls.outboxes += 1;
        throw new Error("projection must not enqueue AI work");
      },
    },
  } as unknown as ActivityLedgerTransaction;
  return { tx, calls };
}

test("system projection links one display row and revision to its canonical event", async () => {
  const { tx, calls } = fakeTransaction();
  const event = domainEvent();
  const result = await createSystemProjection(tx, {
    ...context(),
    commandId: event.commandId,
  }, event, {
    content: "Due date changed to 15 Sep 2026",
  });

  assert.equal(result.activity.id, "projection-1");
  assert.equal(result.revisionId, "revision-1");
  assert.equal(calls.activities[0].data.type, "SYSTEM_UPDATE");
  assert.equal(calls.activities[0].data.sourceDomainEventId, "event-1");
  assert.equal(calls.revisions[0].data.activityType, "SYSTEM_UPDATE");
  assert.equal(calls.revisions[0].data.changeType, "CREATED");
  assert.match(String(calls.revisions[0].data.contentHash), /^[0-9a-f]{64}$/);
  assert.equal(calls.events, 0);
  assert.equal(calls.outboxes, 0);
});

test("projection validates actor and content before writes", async () => {
  const missingActor = fakeTransaction();
  const actorEvent = domainEvent();
  await assert.rejects(createSystemProjection(missingActor.tx, {
    ...context(null),
    commandId: actorEvent.commandId,
  }, actorEvent, {
    content: "Valid content",
  }), /require an actor/);
  assert.equal(missingActor.calls.activities.length, 0);

  const empty = fakeTransaction();
  const emptyEvent = domainEvent();
  await assert.rejects(createSystemProjection(empty.tx, {
    ...context(),
    commandId: emptyEvent.commandId,
  }, emptyEvent, {
    content: "   ",
  }), /must not be empty/);
  assert.equal(empty.calls.activities.length, 0);
});

test("projection cannot attach to a different command intent", async () => {
  const { tx, calls } = fakeTransaction();
  await assert.rejects(createSystemProjection(tx, context(), domainEvent(), {
    content: "Mislinked projection",
  }), /commandId must match/);
  assert.equal(calls.activities.length, 0);
  assert.equal(calls.revisions.length, 0);
});
