import assert from "node:assert/strict";
import test from "node:test";
import { composeDealAgentContext, composeDealTimeline, composeImportantFacts } from "./timeline";

test("groups without merging events and retains provenance", () => {
  const result = composeDealTimeline([
    { id: "e1", revisionId: "r1", localEventDate: "2026-09-01", occurredAt: "2026-09-01T03:00:00Z", summary: "Customer requested samples.", eventType: "REQUEST", importance: 3 },
    { id: "e2", revisionId: "r2", localEventDate: "2026-09-01", occurredAt: "2026-09-01T04:00:00Z", summary: "Price remains a concern.", eventType: "BLOCKER", importance: 4 },
  ]);
  assert.match(result.text, /\[2026-09-01\]/);
  assert.match(result.text, /source:e1 revision:r1/);
  assert.match(result.text, /source:e2 revision:r2/);
  assert.equal(result.includedEventIds.length, 2);
});

test("respects the deterministic token budget", () => {
  const events = Array.from({ length: 20 }, (_, index) => ({ id: `e${index}`, revisionId: `r${index}`, localEventDate: "2026-09-01", occurredAt: `2026-09-01T00:00:${String(index).padStart(2, "0")}Z`, summary: "A".repeat(80), eventType: "NOTE", importance: 1 }));
  const result = composeDealTimeline(events, 64);
  assert.ok(result.estimatedTokens <= 64);
  assert.ok(result.omittedCount > 0);
});

test("important facts retain provenance and never merge source events", () => {
  const result = composeImportantFacts([
    { id: "e1", revisionId: "r1", localEventDate: "2026-09-01", occurredAt: "2026-09-01T03:00:00Z", summary: "Payment received.", eventType: "PAYMENT", importance: 5 },
    { id: "e2", revisionId: "r2", localEventDate: "2026-09-02", occurredAt: "2026-09-02T03:00:00Z", summary: "Routine follow-up.", eventType: "NOTE", importance: 2, blockers: ["Approval pending."] },
  ]);
  assert.match(result.text, /Payment received\. \[source:e1 revision:r1\]/);
  assert.match(result.text, /Blocker: Approval pending\. \[source:e2 revision:r2\]/);
  assert.deepEqual(result.includedEventIds, ["e1", "e2"]);
});

test("agent context applies independent timeline and fact budgets", () => {
  const events = Array.from({ length: 12 }, (_, index) => ({
    id: `e${index}`, revisionId: `r${index}`, localEventDate: "2026-09-01",
    occurredAt: `2026-09-01T00:00:${String(index).padStart(2, "0")}Z`,
    summary: "Important fact ".repeat(8), eventType: "NOTE", importance: 5,
  }));
  const olderFacts = events.map(event => ({
    ...event,
    id: `old-${event.id}`,
    revisionId: `old-${event.revisionId}`,
    localEventDate: "2025-01-01",
    occurredAt: "2025-01-01T00:00:00Z",
  }));
  const result = composeDealAgentContext(events, olderFacts, { timelineTokens: 64, factTokens: 64 });
  assert.ok(result.recentTimeline.estimatedTokens <= 64);
  assert.ok(result.importantFacts.estimatedTokens <= 64);
  assert.equal(result.estimatedTokens, Math.ceil(result.text.length / 4));
});

test("does not duplicate recent events in important facts", () => {
  const event = { id: "e1", revisionId: "r1", localEventDate: "2026-09-01", occurredAt: "2026-09-01T03:00:00Z", summary: "Payment received.", eventType: "PAYMENT", importance: 5 };
  const result = composeDealAgentContext([event], [event]);
  assert.equal(result.text.match(/Payment received\./g)?.length, 1);
  assert.deepEqual(result.importantFacts.includedEventIds, []);
});
