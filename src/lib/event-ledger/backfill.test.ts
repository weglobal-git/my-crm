import assert from "node:assert/strict";
import test from "node:test";

import { hashActivityContent } from "./contracts";
import {
  BackfillSafetyError,
  planActivityRevisionBackfillPage,
  verifyBackfillCounts,
  type ActivityBackfillReader,
  type BackfillActivity,
  type BackfillRevision,
} from "./backfill";

const createdAt = new Date("2026-08-01T10:20:00.000Z");

function activity(id: string, overrides: Partial<BackfillActivity> = {}): BackfillActivity {
  return {
    id,
    content: "  exact raw content\n",
    type: "COMMENT",
    parentId: null,
    userId: "user-1",
    version: 1,
    deletedAt: null,
    createdAt,
    versionOneRevision: null,
    ...overrides,
  };
}

function matchingRevision(source: BackfillActivity): BackfillRevision {
  return {
    activityId: source.id,
    version: 1,
    changeType: "CREATED",
    content: source.content,
    contentHash: hashActivityContent(source.content),
    activityType: source.type,
    parentId: source.parentId,
    changedById: source.userId,
    createdAt: source.createdAt,
  };
}

function reader(rows: BackfillActivity[]) {
  const calls: unknown[] = [];
  const value: ActivityBackfillReader = {
    async readPage(args) {
      calls.push(args);
      return rows;
    },
  };
  return { reader: value, calls };
}

test("dry-run plans byte-exact version-1 revisions without side effects", async () => {
  const source = activity("activity-1");
  const input = reader([source]);
  const plan = await planActivityRevisionBackfillPage(input.reader, { batchSize: 100 });

  assert.equal(plan.done, true);
  assert.equal(plan.scannedCount, 1);
  assert.equal(plan.plannedCount, 1);
  assert.equal(plan.alreadyCompleteCount, 0);
  assert.equal(plan.nextCursor, "activity-1");
  assert.deepEqual(plan.entries[0], matchingRevision(source));
  assert.equal(plan.entries[0].content, "  exact raw content\n");
  assert.equal("domainEvent" in plan.entries[0], false);
  assert.equal("outbox" in plan.entries[0], false);
});

test("reader contract requests active rows and one lookahead row", async () => {
  const input = reader([]);
  await planActivityRevisionBackfillPage(input.reader, {
    cursor: "activity-100",
    batchSize: 25,
  });
  assert.deepEqual(input.calls[0], {
    afterId: "activity-100",
    take: 26,
    deletedAt: null,
    orderBy: { id: "asc" },
  });
});

test("lookahead produces a restartable cursor without planning the next page", async () => {
  const input = reader([
    activity("activity-1"),
    activity("activity-2"),
    activity("activity-3"),
  ]);
  const plan = await planActivityRevisionBackfillPage(input.reader, { batchSize: 2 });

  assert.equal(plan.done, false);
  assert.equal(plan.nextCursor, "activity-2");
  assert.deepEqual(plan.entries.map(entry => entry.activityId), ["activity-1", "activity-2"]);
});

test("matching existing revision is idempotently skipped", async () => {
  const source = activity("activity-1");
  source.versionOneRevision = matchingRevision(source);
  const plan = await planActivityRevisionBackfillPage(reader([source]).reader, {});

  assert.equal(plan.plannedCount, 0);
  assert.equal(plan.alreadyCompleteCount, 1);
  assert.deepEqual(plan.entries, []);
});

test("rerun skips a trustworthy version-1 revision after later edits", async () => {
  const original = activity("activity-1", { content: "Original" });
  const revision = matchingRevision(original);
  const edited = activity("activity-1", {
    content: "Edited later",
    version: 2,
    versionOneRevision: revision,
  });
  const plan = await planActivityRevisionBackfillPage(reader([edited]).reader, {});

  assert.equal(plan.plannedCount, 0);
  assert.equal(plan.alreadyCompleteCount, 1);
});

test("existing revision mismatch fails closed", async () => {
  const source = activity("activity-1");
  source.versionOneRevision = {
    ...matchingRevision(source),
    contentHash: hashActivityContent("different"),
  };
  await assert.rejects(planActivityRevisionBackfillPage(reader([source]).reader, {}), BackfillSafetyError);
});

test("versioned or deleted sources fail because original content is uncertain", async () => {
  await assert.rejects(planActivityRevisionBackfillPage(reader([
    activity("activity-1", { version: 2 }),
  ]).reader, {}), /original content is uncertain/);
  await assert.rejects(planActivityRevisionBackfillPage(reader([
    activity("activity-1", { deletedAt: new Date() }),
  ]).reader, {}), /deleted Activity/);
});

test("unordered, duplicate, or pre-cursor rows fail closed", async () => {
  await assert.rejects(planActivityRevisionBackfillPage(reader([
    activity("activity-2"),
    activity("activity-1"),
  ]).reader, {}), /ascending order/);
  await assert.rejects(planActivityRevisionBackfillPage(reader([
    activity("activity-1"),
    activity("activity-1"),
  ]).reader, {}), /duplicate Activity/);
  await assert.rejects(planActivityRevisionBackfillPage(reader([
    activity("activity-1"),
  ]).reader, { cursor: "activity-2" }), /strictly after cursor/);
});

test("batch limits fail before reading", async () => {
  const input = reader([]);
  await assert.rejects(planActivityRevisionBackfillPage(input.reader, { batchSize: 0 }), /batchSize/);
  await assert.rejects(planActivityRevisionBackfillPage(input.reader, { batchSize: 501 }), /batchSize/);
  assert.equal(input.calls.length, 0);
});

test("final verification requires count and parity equality", () => {
  assert.deepEqual(verifyBackfillCounts({
    activeActivityCount: 100,
    versionOneRevisionCount: 100,
    duplicateVersionOneCount: 0,
    parityMismatchCount: 0,
  }), { complete: true, reasons: [] });

  const incomplete = verifyBackfillCounts({
    activeActivityCount: 100,
    versionOneRevisionCount: 99,
    duplicateVersionOneCount: 1,
    parityMismatchCount: 2,
  });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.reasons.length, 3);
});
