import assert from "node:assert/strict";
import test from "node:test";

import {
  DEAL_DOMAIN_EVENT_TYPES,
  buildEventSummaryDedupeKey,
  classifyDealDomainEvent,
  createCommandId,
  getLocalEventDate,
  hashActivityContent,
  isCommandId,
  shouldEnqueueEventSummary,
} from "./contracts";
import { getEventLedgerFeatureFlags } from "./feature-flags";

test("every event type has one deterministic processing class", () => {
  assert.equal(new Set(DEAL_DOMAIN_EVENT_TYPES).size, DEAL_DOMAIN_EVENT_TYPES.length);

  for (const eventType of DEAL_DOMAIN_EVENT_TYPES) {
    assert.match(classifyDealDomainEvent(eventType), /^(AI_SUMMARY|AUDIT_ONLY)$/);
  }
});

test("canonical activity and deal changes enqueue summaries", () => {
  assert.equal(shouldEnqueueEventSummary("ACTIVITY_CREATED"), true);
  assert.equal(shouldEnqueueEventSummary("REPLY_EDITED"), true);
  assert.equal(shouldEnqueueEventSummary("DEAL_DUE_DATE_CHANGED"), true);
  assert.equal(shouldEnqueueEventSummary("DEAL_WON"), true);
});

test("provenance, deletion, note, and attachment events remain audit-only", () => {
  assert.equal(shouldEnqueueEventSummary("SYSTEM_ACTIVITY_CREATED"), false);
  assert.equal(shouldEnqueueEventSummary("ACTIVITY_DELETED"), false);
  assert.equal(shouldEnqueueEventSummary("NOTE_CREATED"), false);
  assert.equal(shouldEnqueueEventSummary("ATTACHMENT_ADDED"), false);
  assert.equal(shouldEnqueueEventSummary("OWNERSHIP_TRANSFER_REQUESTED"), false);
});

test("dedupe key is stable and version-sensitive", () => {
  const first = buildEventSummaryDedupeKey({
    domainEventId: "event-1",
    promptVersion: "v1",
    schemaVersion: "v1",
  });
  const replay = buildEventSummaryDedupeKey({
    domainEventId: "event-1",
    promptVersion: "v1",
    schemaVersion: "v1",
  });
  const upgraded = buildEventSummaryDedupeKey({
    domainEventId: "event-1",
    promptVersion: "v2",
    schemaVersion: "v1",
  });

  assert.equal(first, replay);
  assert.notEqual(first, upgraded);
  assert.match(first, /^event-summary:[0-9a-f]{64}$/);
});

test("content hash preserves exact source bytes", () => {
  assert.equal(hashActivityContent("hello"), hashActivityContent("hello"));
  assert.notEqual(hashActivityContent("hello"), hashActivityContent("hello "));
  assert.notEqual(hashActivityContent("ราคา"), hashActivityContent("ราคา\n"));
});

test("command IDs are UUIDs", () => {
  const commandId = createCommandId();
  assert.equal(isCommandId(commandId), true);
  assert.equal(isCommandId("retry-1"), false);
});

test("local event date uses Asia/Bangkok across UTC boundary", () => {
  const occurredAt = new Date("2026-09-01T18:30:00.000Z");
  assert.equal(getLocalEventDate(occurredAt, "Asia/Bangkok"), "2026-09-02");
});

test("invalid event time and timezone fail closed", () => {
  assert.throws(() => getLocalEventDate(new Date("invalid"), "Asia/Bangkok"), /Invalid occurredAt/);
  assert.throws(() => getLocalEventDate(new Date(), "Invalid/Timezone"), RangeError);
});

test("all feature flags default to disabled", () => {
  assert.deepEqual(getEventLedgerFeatureFlags({}), {
    writeEnabled: false,
    strictMode: false,
    aiEnqueueEnabled: false,
    softDeleteEnabled: false,
  });
});

test("feature flags enable only explicit true values", () => {
  assert.deepEqual(getEventLedgerFeatureFlags({
    EVENT_LEDGER_WRITE_ENABLED: "true",
    EVENT_LEDGER_STRICT_MODE: "1",
    EVENT_AI_ENQUEUE_ENABLED: "TRUE",
    EVENT_SOFT_DELETE_ENABLED: "yes",
  }), {
    writeEnabled: true,
    strictMode: true,
    aiEnqueueEnabled: true,
    softDeleteEnabled: false,
  });
});
