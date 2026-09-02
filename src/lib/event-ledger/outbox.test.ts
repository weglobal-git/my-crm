import assert from "node:assert/strict";
import test from "node:test";

import {
  OutboxLeaseLostError,
  claimOutboxBatch,
  completeOutboxItem,
  extendOutboxLease,
  failOutboxItem,
  retryDelayMs,
  type ClaimedOutboxItem,
  type OutboxClaimPersistence,
  type OutboxUpdatePersistence,
} from "./outbox";

const now = new Date("2026-09-02T05:00:00.000Z");

function claim(overrides: Partial<ClaimedOutboxItem> = {}): ClaimedOutboxItem {
  return {
    id: "outbox-1",
    domainEventId: "event-1",
    dealId: "deal-1",
    agentKey: "EVENT_SUMMARIZER",
    promptVersion: "event-summary-v1",
    schemaVersion: "v1",
    status: "PROCESSING",
    attempts: 1,
    maxAttempts: 2,
    lockedBy: "worker-1",
    leaseUntil: new Date(now.getTime() + 60_000),
    traceId: "trace-1",
    ...overrides,
  };
}

function claimPersistence(items: ClaimedOutboxItem[] = [claim()]) {
  const calls = {
    reap: [] as unknown[],
    claim: [] as Array<Record<string, unknown>>,
  };
  const persistence: OutboxClaimPersistence = {
    async reapExhausted(args) {
      calls.reap.push(args);
      return { count: 2 };
    },
    async claimEligible(args) {
      calls.claim.push(args);
      return items;
    },
  };
  return { persistence, calls };
}

function updatePersistence(count = 1) {
  const calls: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const persistence: OutboxUpdatePersistence = {
    agentOutbox: {
      async updateMany(args) {
        calls.push(args);
        return { count };
      },
    },
  };
  return { persistence, calls };
}

test("claim reaps exhausted rows then returns fenced leases", async () => {
  const { persistence, calls } = claimPersistence();
  const result = await claimOutboxBatch(persistence, {
    now,
    workerId: "worker-1",
    batchSize: 10,
    leaseMs: 60_000,
  });

  assert.equal(result.reapedCount, 2);
  assert.equal(result.items.length, 1);
  assert.equal(calls.reap.length, 1);
  assert.deepEqual(calls.claim[0], {
    now,
    leaseUntil: new Date(now.getTime() + 60_000),
    workerId: "worker-1",
    batchSize: 10,
  });
});

test("claim rejects malformed adapter output", async () => {
  const wrongWorker = claimPersistence([claim({ lockedBy: "worker-2" })]);
  await assert.rejects(claimOutboxBatch(wrongWorker.persistence, {
    now,
    workerId: "worker-1",
    batchSize: 1,
    leaseMs: 60_000,
  }), /not owned/);

  const exhausted = claimPersistence([claim({ attempts: 3, maxAttempts: 2 })]);
  await assert.rejects(claimOutboxBatch(exhausted.persistence, {
    now,
    workerId: "worker-1",
    batchSize: 1,
    leaseMs: 60_000,
  }), /fencing/);

  const wrongExpiry = claimPersistence([claim({
    leaseUntil: new Date(now.getTime() + 120_000),
  })]);
  await assert.rejects(claimOutboxBatch(wrongExpiry.persistence, {
    now,
    workerId: "worker-1",
    batchSize: 1,
    leaseMs: 60_000,
  }), /unexpected lease expiry/);
});

test("completion uses worker, attempt, and live lease as CAS fence", async () => {
  const { persistence, calls } = updatePersistence();
  await completeOutboxItem(persistence, claim({ attempts: 2 }), now);

  assert.deepEqual(calls[0].where, {
    id: "outbox-1",
    status: "PROCESSING",
    lockedBy: "worker-1",
    attempts: 2,
    leaseUntil: { gt: now },
  });
  assert.equal(calls[0].data.status, "COMPLETED");
  assert.equal(calls[0].data.completedAt, now);
  assert.equal(calls[0].data.lockedBy, null);
});

test("stale completion cannot overwrite a reclaimed attempt", async () => {
  const { persistence } = updatePersistence(0);
  await assert.rejects(completeOutboxItem(persistence, claim(), now), OutboxLeaseLostError);
});

test("expired lease fails before persistence update", async () => {
  const { persistence, calls } = updatePersistence();
  await assert.rejects(completeOutboxItem(persistence, claim({ leaseUntil: now }), now), OutboxLeaseLostError);
  assert.equal(calls.length, 0);
});

test("retry schedules bounded exponential backoff and clears ownership", async () => {
  const { persistence, calls } = updatePersistence();
  const result = await failOutboxItem(persistence, claim(), {
    now,
    errorCode: "provider_timeout",
  });

  assert.equal(result.status, "FAILED");
  assert.equal(result.availableAt?.toISOString(), "2026-09-02T05:00:05.000Z");
  assert.equal(calls[0].data.status, "FAILED");
  assert.equal(calls[0].data.lastErrorCode, "PROVIDER_TIMEOUT");
  assert.equal(calls[0].data.lockedBy, null);
  assert.equal(calls[0].data.leaseUntil, null);
});

test("final failed attempt goes DEAD and never schedules another retry", async () => {
  const { persistence, calls } = updatePersistence();
  const result = await failOutboxItem(persistence, claim({ attempts: 2, maxAttempts: 2 }), {
    now,
    errorCode: "OUTPUT_SCHEMA_INVALID",
  });

  assert.deepEqual(result, { status: "DEAD", availableAt: null });
  assert.equal(calls[0].data.status, "DEAD");
  assert.equal(calls[0].data.completedAt, now);
  assert.equal(calls[0].data.availableAt, undefined);
});

test("raw error messages are rejected in favor of machine codes", async () => {
  const { persistence, calls } = updatePersistence();
  await assert.rejects(failOutboxItem(persistence, claim(), {
    now,
    errorCode: "HTTP 500: customer@example.com failed",
  }), /non-sensitive machine code/);
  assert.equal(calls.length, 0);
});

test("heartbeat extends only the currently fenced attempt", async () => {
  const { persistence, calls } = updatePersistence();
  const leaseUntil = await extendOutboxLease(persistence, claim(), {
    now,
    extensionMs: 120_000,
  });

  assert.equal(leaseUntil.toISOString(), "2026-09-02T05:02:00.000Z");
  assert.equal(calls[0].data.status, "PROCESSING");
  assert.equal(calls[0].data.leaseUntil, leaseUntil);
  assert.equal(calls[0].where.attempts, 1);
});

test("heartbeat never shortens an existing lease", async () => {
  const existingLease = new Date(now.getTime() + 120_000);
  const { persistence, calls } = updatePersistence();
  const leaseUntil = await extendOutboxLease(persistence, claim({ leaseUntil: existingLease }), {
    now,
    extensionMs: 5_000,
  });

  assert.equal(leaseUntil.toISOString(), existingLease.toISOString());
  assert.equal(calls[0].data.leaseUntil?.toString(), existingLease.toString());
});

test("retry delay is exponential and capped", () => {
  assert.equal(retryDelayMs(1), 5_000);
  assert.equal(retryDelayMs(2), 10_000);
  assert.equal(retryDelayMs(20), 300_000);
  assert.throws(() => retryDelayMs(0), /attempt/);
});

test("claim input limits fail before persistence access", async () => {
  const { persistence, calls } = claimPersistence();
  await assert.rejects(claimOutboxBatch(persistence, {
    now,
    workerId: "worker-1",
    batchSize: 101,
    leaseMs: 60_000,
  }), /batchSize/);
  await assert.rejects(claimOutboxBatch(persistence, {
    now,
    workerId: "worker-1",
    batchSize: 1,
    leaseMs: 1_000,
  }), /leaseMs/);
  assert.equal(calls.reap.length, 0);
  assert.equal(calls.claim.length, 0);
});
