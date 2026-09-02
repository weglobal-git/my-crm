import test from "node:test";
import assert from "node:assert/strict";
import prisma from "@/lib/prisma";
import { processAIFacts } from "./fact-lifecycle";
import { correctDealAISummary, getDealAIContextBenchmark } from "@/lib/actions/ai-events";
import { deleteActivityLog } from "@/lib/actions/opportunity";
import { DealAIFactStatus, DealAIFactMode, FactRelationType, DealAIEventStatus } from "@prisma/client";

test("DealAIFact Lifecycle Integration Tests", async (t) => {
  const nonce = Date.now();
  const dealId = `test_deal_${nonce}`;
  const userId = `test_user_${nonce}`;
  const domainEventId1 = `test_de1_${nonce}`;
  const domainEventId2 = `test_de2_${nonce}`;
  const domainEventId3 = `test_de3_${nonce}`;
  const domainEventId4 = `test_de4_${nonce}`;
  const aiEventId1 = `test_aie1_${nonce}`;
  const aiEventId2 = `test_aie2_${nonce}`;
  const aiEventId3 = `test_aie3_${nonce}`;
  const aiEventId4 = `test_aie4_${nonce}`;
  const revisionId1 = `test_rev1_${nonce}`;
  const revisionId2 = `test_rev2_${nonce}`;
  const revisionId3 = `test_rev3_${nonce}`;
  const revisionId4 = `test_rev4_${nonce}`;
  const activityLogId = `test_act_${nonce}`;

  t.after(async () => {
    // Teardown: ensure complete cleanup even if assertions fail
    try {
      await prisma.dealAIFact.deleteMany({ where: { dealId } });
      await prisma.dealAIEventRevision.deleteMany({ where: { event: { dealId } } });
      await prisma.dealAIEvent.deleteMany({ where: { dealId } });
      await prisma.dealDomainEvent.deleteMany({ where: { dealId } });
      await prisma.activityLog.deleteMany({ where: { opportunityId: dealId } });
      await prisma.opportunity.deleteMany({ where: { id: dealId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    } catch (e) {
      console.error("Teardown error:", e);
    }
  });

  // Setup test data
  await t.test("Setup database records", async () => {
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.com`, name: "Test User", role: "ADMIN" },
    });

    await prisma.opportunity.create({
      data: {
        id: dealId,
        topic: "Test Lifecycle Deal",
        status: "OPEN",
        ownerId: userId,
      },
    });

    await prisma.activityLog.create({
      data: {
        id: activityLogId,
        opportunityId: dealId,
        userId,
        content: "Initial payment of 500,000 received",
        type: "COMMENT",
      },
    });

    await prisma.dealDomainEvent.createMany({
      data: [
        {
          id: domainEventId1,
          dealId,
          eventType: "ACTIVITY_CREATED",
          processingClass: "AI_SUMMARY",
          sourceType: "ACTIVITY",
          sourceEntityId: activityLogId,
          sourceVersion: 1,
          correlationId: "c1",
          traceId: "t1",
          commandId: `cmd1_${nonce}`,
          payloadVersion: 1,
          payload: {},
          timezone: "Asia/Bangkok",
          localEventDate: new Date(),
          occurredAt: new Date(Date.now() - 30000),
        },
        {
          id: domainEventId2,
          dealId,
          eventType: "ACTIVITY_CREATED",
          processingClass: "AI_SUMMARY",
          sourceType: "ACTIVITY",
          sourceEntityId: "n2",
          sourceVersion: 1,
          correlationId: "c2",
          traceId: "t2",
          commandId: `cmd2_${nonce}`,
          payloadVersion: 1,
          payload: {},
          timezone: "Asia/Bangkok",
          localEventDate: new Date(),
          occurredAt: new Date(Date.now() - 20000),
        },
        {
          id: domainEventId3,
          dealId,
          eventType: "ACTIVITY_CREATED",
          processingClass: "AI_SUMMARY",
          sourceType: "ACTIVITY",
          sourceEntityId: "n3",
          sourceVersion: 1,
          correlationId: "c3",
          traceId: "t3",
          commandId: `cmd3_${nonce}`,
          payloadVersion: 1,
          payload: {},
          timezone: "Asia/Bangkok",
          localEventDate: new Date(),
          occurredAt: new Date(Date.now() - 10000),
        },
        {
          id: domainEventId4,
          dealId,
          eventType: "ACTIVITY_CREATED",
          processingClass: "AI_SUMMARY",
          sourceType: "ACTIVITY",
          sourceEntityId: "n4",
          sourceVersion: 1,
          correlationId: "c4",
          traceId: "t4",
          commandId: `cmd4_${nonce}`,
          payloadVersion: 1,
          payload: {},
          timezone: "Asia/Bangkok",
          localEventDate: new Date(),
          occurredAt: new Date(),
        },
      ],
    });

    // Each domain event gets its own DealAIEvent and initial revision
    await prisma.dealAIEvent.createMany({
      data: [
        {
          id: aiEventId1,
          dealId,
          domainEventId: domainEventId1,
          agentKey: "EVENT_SUMMARIZER",
          occurredAt: new Date(Date.now() - 30000),
          localEventDate: new Date(),
          status: "READY",
        },
        {
          id: aiEventId2,
          dealId,
          domainEventId: domainEventId2,
          agentKey: "EVENT_SUMMARIZER",
          occurredAt: new Date(Date.now() - 20000),
          localEventDate: new Date(),
          status: "READY",
        },
        {
          id: aiEventId3,
          dealId,
          domainEventId: domainEventId3,
          agentKey: "EVENT_SUMMARIZER",
          occurredAt: new Date(Date.now() - 10000),
          localEventDate: new Date(),
          status: "READY",
        },
        {
          id: aiEventId4,
          dealId,
          domainEventId: domainEventId4,
          agentKey: "EVENT_SUMMARIZER",
          occurredAt: new Date(),
          localEventDate: new Date(),
          status: "READY",
        },
      ],
    });

    await prisma.dealAIEventRevision.createMany({
      data: [
        {
          id: revisionId1,
          eventId: aiEventId1,
          revision: 1,
          authorType: "AI",
          summary: "Initial AI Summary",
          structuredData: {},
          eventType: "NOTE",
          importance: 4,
          confidence: 0.9,
          needsContext: false,
          promptVersion: "v1",
          schemaVersion: "v1",
          sourceContentHash: "hash1",
        },
        {
          id: revisionId2,
          eventId: aiEventId2,
          revision: 1,
          authorType: "AI",
          summary: "Second AI Summary",
          structuredData: {},
          eventType: "NOTE",
          importance: 5,
          confidence: 0.95,
          needsContext: false,
          promptVersion: "v1",
          schemaVersion: "v1",
          sourceContentHash: "hash2",
        },
        {
          id: revisionId3,
          eventId: aiEventId3,
          revision: 1,
          authorType: "AI",
          summary: "Third AI Summary",
          structuredData: {},
          eventType: "NOTE",
          importance: 5,
          confidence: 0.95,
          needsContext: false,
          promptVersion: "v1",
          schemaVersion: "v1",
          sourceContentHash: "hash3",
        },
        {
          id: revisionId4,
          eventId: aiEventId4,
          revision: 1,
          authorType: "AI",
          summary: "Fourth AI Summary",
          structuredData: {},
          eventType: "NOTE",
          importance: 4,
          confidence: 0.45,
          needsContext: false,
          promptVersion: "v1",
          schemaVersion: "v1",
          sourceContentHash: "hash4",
        },
      ],
    });

    await prisma.dealAIEvent.update({
      where: { id: aiEventId1 },
      data: { currentRevisionId: revisionId1 },
    });
    await prisma.dealAIEvent.update({
      where: { id: aiEventId2 },
      data: { currentRevisionId: revisionId2 },
    });
    await prisma.dealAIEvent.update({
      where: { id: aiEventId3 },
      data: { currentRevisionId: revisionId3 },
    });
    await prisma.dealAIEvent.update({
      where: { id: aiEventId4 },
      data: { currentRevisionId: revisionId4 },
    });
  });

  await t.test("processAIFacts creates an ACTIVE fact", async () => {
    await prisma.$transaction(async (tx) => {
      await processAIFacts({
        tx,
        dealId,
        aiEventId: aiEventId1,
        sourceRevisionId: revisionId1,
        sourceDomainEventId: domainEventId1,
        sourceOccurredAt: new Date(Date.now() - 30000),
        sourceSummaryRevision: 1,
        localEventDate: new Date(),
        observedAt: new Date(),
        facts: [
          {
            factType: "PAYMENT",
            factMode: "STATE",
            subject: "payment.remaining_balance",
            content: "Remaining balance is 500,000",
            normalizedValue: 500000,
            importance: 5,
            confidence: 0.95,
          },
        ],
      });
    });

    const activeFacts = await prisma.dealAIFact.findMany({
      where: { dealId, factType: "PAYMENT", status: DealAIFactStatus.ACTIVE },
    });
    assert.equal(activeFacts.length, 1);
    assert.equal(activeFacts[0].normalizedValue, 500000);
  });

  await t.test("True Concurrency Test: parallel workers inserting competing STATE facts", async () => {
    const runWorkerA = async () => {
      return prisma.$transaction(async (tx) => {
        await processAIFacts({
          tx,
          dealId,
          aiEventId: aiEventId2,
          sourceRevisionId: revisionId2,
          sourceDomainEventId: domainEventId2,
          sourceOccurredAt: new Date(Date.now() - 20000),
          sourceSummaryRevision: 1,
          localEventDate: new Date(),
          observedAt: new Date(),
          facts: [
            {
              factType: "PAYMENT",
              factMode: "STATE",
              subject: "payment.remaining_balance",
              content: "Remaining balance is 300,000",
              normalizedValue: 300000,
              importance: 5,
              confidence: 0.95,
            },
          ],
        });
      }, { isolationLevel: "Serializable" });
    };

    const runWorkerB = async () => {
      return prisma.$transaction(async (tx) => {
        await processAIFacts({
          tx,
          dealId,
          aiEventId: aiEventId3,
          sourceRevisionId: revisionId3,
          sourceDomainEventId: domainEventId3,
          sourceOccurredAt: new Date(Date.now() - 10000), // Newer than Worker A
          sourceSummaryRevision: 1,
          localEventDate: new Date(),
          observedAt: new Date(),
          facts: [
            {
              factType: "PAYMENT",
              factMode: "STATE",
              subject: "payment.remaining_balance",
              content: "Remaining balance is 100,000",
              normalizedValue: 100000,
              importance: 5,
              confidence: 0.95,
            },
          ],
        });
      }, { isolationLevel: "Serializable" });
    };

    // Execute concurrently
    const results = await Promise.allSettled([runWorkerA(), runWorkerB()]);
    const anyFulfilled = results.some((r) => r.status === "fulfilled");
    assert.ok(anyFulfilled, "At least one concurrent worker succeeded");

    // Invariant check: Database MUST NOT have more than one ACTIVE state fact for (dealId, factType, subject)
    const activeFacts = await prisma.dealAIFact.findMany({
      where: {
        dealId,
        factType: "PAYMENT",
        subject: "payment.remaining_balance",
        factMode: DealAIFactMode.STATE,
        status: DealAIFactStatus.ACTIVE,
      },
    });

    assert.equal(
      activeFacts.length,
      1,
      "Partial unique index / CAS guaranteed exactly ONE active STATE fact under concurrency"
    );
  });

  await t.test("Deterministic out-of-order supersession: older fact created directly as SUPERSEDED", async () => {
    // Older event arrives (occurred 50s ago)
    await prisma.$transaction(async (tx) => {
      await processAIFacts({
        tx,
        dealId,
        aiEventId: aiEventId1,
        sourceRevisionId: revisionId1,
        sourceDomainEventId: domainEventId1,
        sourceOccurredAt: new Date(Date.now() - 50000), // Older than active fact
        sourceSummaryRevision: 1,
        localEventDate: new Date(),
        observedAt: new Date(),
        facts: [
          {
            factType: "PAYMENT",
            factMode: "STATE",
            subject: "payment.remaining_balance",
            content: "Old balance was 900,000",
            normalizedValue: 900000,
            importance: 5,
            confidence: 0.95,
          },
        ],
      });
    });

    const oldFact = await prisma.dealAIFact.findFirst({
      where: { dealId, normalizedValue: { equals: 900000 } },
    });
    assert.ok(oldFact);
    assert.equal(oldFact.status, DealAIFactStatus.SUPERSEDED);
    assert.equal(oldFact.supersessionReason, FactRelationType.UPDATED_BY);
  });

  await t.test("Low-confidence fact does not supersede and defaults to NEEDS_REVIEW", async () => {
    await prisma.$transaction(async (tx) => {
      await processAIFacts({
        tx,
        dealId,
        aiEventId: aiEventId4,
        sourceRevisionId: revisionId4,
        sourceDomainEventId: domainEventId4,
        sourceOccurredAt: new Date(),
        sourceSummaryRevision: 1,
        localEventDate: new Date(),
        observedAt: new Date(),
        facts: [
          {
            factType: "PAYMENT",
            factMode: "STATE",
            subject: "payment.remaining_balance",
            content: "Maybe remaining balance is 0?",
            normalizedValue: 0,
            importance: 5,
            confidence: 0.45, // Low confidence
          },
        ],
      });
    });

    const needsReview = await prisma.dealAIFact.findFirst({
      where: { dealId, normalizedValue: { equals: 0 } },
    });
    assert.ok(needsReview);
    assert.equal(needsReview.status, DealAIFactStatus.NEEDS_REVIEW);
  });

  await t.test("Idempotent worker retry: processing same revision facts twice is safe and produces no duplicates", async () => {
    await prisma.$transaction(async (tx) => {
      await processAIFacts({
        tx,
        dealId,
        aiEventId: aiEventId1,
        sourceRevisionId: revisionId1,
        sourceDomainEventId: domainEventId1,
        sourceOccurredAt: new Date(Date.now() - 30000),
        sourceSummaryRevision: 1,
        localEventDate: new Date(),
        observedAt: new Date(),
        facts: [
          {
            factType: "PAYMENT",
            factMode: "STATE",
            subject: "payment.remaining_balance",
            content: "Remaining balance is 500,000",
            normalizedValue: 500000,
            importance: 5,
            confidence: 0.95,
          },
        ],
      });
    });

    const totalFactsForRevision1 = await prisma.dealAIFact.count({
      where: { sourceRevisionId: revisionId1 },
    });
    assert.equal(totalFactsForRevision1, 2, "Exactly 2 facts for revision 1 (original + old out-of-order test), no duplicate created on retry");
  });

  await t.test("User correction hook retracts old facts with CORRECTED_BY", async () => {
    const updated = await correctDealAISummary({
      dealId,
      eventId: aiEventId1,
      expectedRevisionId: revisionId1,
      summary: "User manually corrected: Client transferred remaining balance today.",
      actorOverride: { id: userId, role: "ADMIN", departments: [] },
    });

    assert.ok(updated);
    assert.equal(updated.authorType, "USER");
    assert.equal(updated.revision, 2);

    // Verify facts generated from revisionId1 are now SUPERSEDED with CORRECTED_BY
    const retractedFacts = await prisma.dealAIFact.findMany({
      where: { sourceRevisionId: revisionId1 },
    });

    for (const f of retractedFacts) {
      assert.equal(f.status, DealAIFactStatus.SUPERSEDED);
      assert.equal(f.supersessionReason, FactRelationType.CORRECTED_BY);
      assert.ok(f.retractedAt);
      assert.equal(f.retractedById, userId);
    }
  });

  await t.test("Context benchmark includes active DealAIFact metrics", async () => {
    const benchmark = await getDealAIContextBenchmark(dealId, 60, { id: userId, role: "ADMIN", departments: [] });
    assert.ok(benchmark);
    assert.equal(typeof benchmark.activeFactCount, "number");
    assert.equal(typeof benchmark.composedEstimatedTokens, "number");
    assert.equal(typeof benchmark.rawEstimatedTokens, "number");
    assert.ok(benchmark.context.importantFacts.text.includes("ACTIVE FACTS"));
  });

  await t.test("Source deletion hook retracts downstream facts and AI events", async () => {
    const result = await deleteActivityLog(activityLogId, { id: userId, role: "ADMIN", departments: [] });
    assert.equal(result.success, true);

    // Verify related domainEvent's AI facts and AI events are RETRACTED
    const facts = await prisma.dealAIFact.findMany({
      where: { sourceDomainEventId: domainEventId1 },
    });
    for (const f of facts) {
      assert.equal(f.status, DealAIFactStatus.RETRACTED);
      assert.equal(f.supersessionReason, FactRelationType.SOURCE_DELETED);
    }

    const aiEvents = await prisma.dealAIEvent.findMany({
      where: { domainEventId: domainEventId1 },
    });
    for (const e of aiEvents) {
      assert.equal(e.status, DealAIEventStatus.RETRACTED);
    }
  });
});
