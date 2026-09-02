import test from "node:test";
import assert from "node:assert/strict";
import prisma from "@/lib/prisma";
import { processAIFacts } from "./fact-lifecycle";
import {
  applyFactResolutions,
  rebuildDealFacts,
  prepareContradictionResolverContext,
} from "./fact-resolver";
import { factResolutionZodSchema } from "./prompts/fact-resolver";
import { DealAIFactStatus, DealAIFactMode, FactRelationType } from "@prisma/client";

test("Phase 6.3 Fact Resolver & Rebuilder Integration Tests", async (t) => {
  const nonce = Date.now();
  const dealId = `test_resolver_deal_${nonce}`;
  const userId = `test_resolver_user_${nonce}`;
  const domainEventId1 = `test_resolver_de1_${nonce}`;
  const domainEventId2 = `test_resolver_de2_${nonce}`;
  const aiEventId1 = `test_resolver_aie1_${nonce}`;
  const aiEventId2 = `test_resolver_aie2_${nonce}`;
  const revisionId1 = `test_resolver_rev1_${nonce}`;
  const revisionId2 = `test_resolver_rev2_${nonce}`;

  t.after(async () => {
    try {
      await prisma.dealAIFact.deleteMany({ where: { dealId } });
      await prisma.dealAIEventRevision.deleteMany({ where: { event: { dealId } } });
      await prisma.dealAIEvent.deleteMany({ where: { dealId } });
      await prisma.dealDomainEvent.deleteMany({ where: { dealId } });
      await prisma.opportunity.deleteMany({ where: { id: dealId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    } catch (e) {
      console.error("Resolver test teardown error:", e);
    }
  });

  await t.test("Setup test fixtures", async () => {
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.com`, name: "Resolver User", role: "ADMIN" },
    });

    await prisma.opportunity.create({
      data: {
        id: dealId,
        topic: "Solar Panel Installation 100kW",
        status: "OPEN",
        ownerId: userId,
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
          sourceEntityId: "n1",
          sourceVersion: 1,
          correlationId: "c1",
          traceId: "t1",
          commandId: `cmd1_${nonce}`,
          payloadVersion: 1,
          payload: {},
          timezone: "Asia/Bangkok",
          localEventDate: new Date(),
          occurredAt: new Date(Date.now() - 20000),
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
          occurredAt: new Date(Date.now() - 10000),
        },
      ],
    });

    const fact1Payload = {
      factType: "PRICE",
      factMode: "OCCURRENCE" as const,
      subject: "pricing.quoted_amount",
      content: "Initial quote sent for 500,000 THB",
      normalizedValue: 500000,
      importance: 5,
      confidence: 0.95,
    };

    const fact2Payload = {
      factType: "PRICE",
      factMode: "OCCURRENCE" as const,
      subject: "pricing.agreed_discount",
      content: "Customer negotiated and agreed final total price is 450,000 THB",
      normalizedValue: 450000,
      importance: 5,
      confidence: 0.98,
    };

    await prisma.dealAIEvent.createMany({
      data: [
        {
          id: aiEventId1,
          dealId,
          domainEventId: domainEventId1,
          agentKey: "EVENT_SUMMARIZER",
          occurredAt: new Date(Date.now() - 20000),
          localEventDate: new Date(),
          status: "READY",
        },
        {
          id: aiEventId2,
          dealId,
          domainEventId: domainEventId2,
          agentKey: "EVENT_SUMMARIZER",
          occurredAt: new Date(Date.now() - 10000),
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
          summary: "Initial quote sent for 500k",
          structuredData: { facts: [fact1Payload] },
          eventType: "NOTE",
          importance: 5,
          confidence: 0.95,
          promptVersion: "v1",
          schemaVersion: "v1",
          sourceContentHash: "hash1",
        },
        {
          id: revisionId2,
          eventId: aiEventId2,
          revision: 1,
          authorType: "AI",
          summary: "Customer agreed on 450k final price",
          structuredData: { facts: [fact2Payload] },
          eventType: "NOTE",
          importance: 5,
          confidence: 0.98,
          promptVersion: "v1",
          schemaVersion: "v1",
          sourceContentHash: "hash2",
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

    // Create initial facts
    await prisma.$transaction(async (tx) => {
      await processAIFacts({
        tx,
        dealId,
        aiEventId: aiEventId1,
        sourceRevisionId: revisionId1,
        sourceDomainEventId: domainEventId1,
        sourceOccurredAt: new Date(Date.now() - 20000),
        sourceSummaryRevision: 1,
        localEventDate: new Date(),
        observedAt: new Date(Date.now() - 20000),
        facts: [fact1Payload],
      });
      await processAIFacts({
        tx,
        dealId,
        aiEventId: aiEventId2,
        sourceRevisionId: revisionId2,
        sourceDomainEventId: domainEventId2,
        sourceOccurredAt: new Date(Date.now() - 10000),
        sourceSummaryRevision: 1,
        localEventDate: new Date(),
        observedAt: new Date(Date.now() - 10000),
        facts: [fact2Payload],
      });
    });
  });

  await t.test("Prompt and context preparation for Contradiction Resolver", async () => {
    const context = await prepareContradictionResolverContext(dealId);
    assert.ok(context);
    assert.equal(context.deal.topic, "Solar Panel Installation 100kW");
    assert.equal(context.activeFacts.length, 2);
    assert.ok(context.prompt.includes("500,000 THB"));
    assert.ok(context.prompt.includes("450,000 THB"));
  });

  await t.test("Zod schema parses valid resolver output", async () => {
    const facts = await prisma.dealAIFact.findMany({ where: { dealId } });
    const fact1 = facts.find((f) => f.sourceRevisionId === revisionId1)!;
    const fact2 = facts.find((f) => f.sourceRevisionId === revisionId2)!;

    const sampleOutput = {
      resolutions: [
        {
          targetFactId: fact1.id,
          conflictingFactId: fact2.id,
          action: "SUPERSEDE" as const,
          reason: "CONTRADICTED_BY" as const,
          explanation: "The subsequent negotiation superseded the initial quote with 450k agreed amount.",
          confidence: 0.96,
        },
      ],
      dealSummaryInsight: "Deal agreed at 450,000 THB after initial 500,000 THB quote.",
    };

    const parsed = factResolutionZodSchema.parse(sampleOutput);
    assert.equal(parsed.resolutions.length, 1);
    assert.equal(parsed.resolutions[0].action, "SUPERSEDE");
  });

  await t.test("applyFactResolutions executes CAS supersession with CONTRADICTED_BY", async () => {
    const facts = await prisma.dealAIFact.findMany({ where: { dealId } });
    const fact1 = facts.find((f) => f.sourceRevisionId === revisionId1)!;
    const fact2 = facts.find((f) => f.sourceRevisionId === revisionId2)!;

    await prisma.$transaction(async (tx) => {
      const result = await applyFactResolutions({
        tx,
        dealId,
        resolvedById: userId,
        resolutions: [
          {
            targetFactId: fact1.id,
            conflictingFactId: fact2.id,
            action: "SUPERSEDE",
            reason: "CONTRADICTED_BY",
            explanation: "Overridden by negotiated final agreement",
            confidence: 0.95,
          },
        ],
      });
      assert.equal(result.updatedCount, 1);
    });

    const updatedFact1 = await prisma.dealAIFact.findUniqueOrThrow({ where: { id: fact1.id } });
    assert.equal(updatedFact1.status, DealAIFactStatus.SUPERSEDED);
    assert.equal(updatedFact1.supersessionReason, FactRelationType.CONTRADICTED_BY);
    assert.equal(updatedFact1.supersededById, fact2.id);

    const updatedFact2 = await prisma.dealAIFact.findUniqueOrThrow({ where: { id: fact2.id } });
    assert.equal(updatedFact2.status, DealAIFactStatus.ACTIVE);
  });

  await t.test("applyFactResolutions supports FLAG_REVIEW and RETRACT actions", async () => {
    const facts = await prisma.dealAIFact.findMany({ where: { dealId } });
    const fact2 = facts.find((f) => f.sourceRevisionId === revisionId2)!;

    // Test FLAG_REVIEW
    await prisma.$transaction(async (tx) => {
      const result = await applyFactResolutions({
        tx,
        dealId,
        resolutions: [
          {
            targetFactId: fact2.id,
            action: "FLAG_REVIEW",
            reason: "INVALID",
            explanation: "Needs human verification",
            confidence: 0.6,
          },
        ],
      });
      assert.equal(result.updatedCount, 1);
    });

    const flaggedFact2 = await prisma.dealAIFact.findUniqueOrThrow({ where: { id: fact2.id } });
    assert.equal(flaggedFact2.status, DealAIFactStatus.NEEDS_REVIEW);

    // Test RETRACT
    await prisma.$transaction(async (tx) => {
      const result = await applyFactResolutions({
        tx,
        dealId,
        resolvedById: userId,
        resolutions: [
          {
            targetFactId: fact2.id,
            action: "RETRACT",
            reason: "INVALID",
            explanation: "Retracted due to false report",
            confidence: 0.99,
          },
        ],
      });
      assert.equal(result.updatedCount, 1);
    });

    const retractedFact2 = await prisma.dealAIFact.findUniqueOrThrow({ where: { id: fact2.id } });
    assert.equal(retractedFact2.status, DealAIFactStatus.RETRACTED);
    assert.ok(retractedFact2.retractedAt);
    assert.equal(retractedFact2.retractedById, userId);
  });

  await t.test("rebuildDealFacts reconstructs deal facts deterministically", async () => {
    const rebuildResult = await rebuildDealFacts(dealId);
    assert.equal(rebuildResult.rebuiltFactsCount, 2);

    const activeFacts = await prisma.dealAIFact.findMany({
      where: { dealId, status: DealAIFactStatus.ACTIVE },
    });
    // Both OCCURRENCE facts exist and are active in pure replay before resolver
    assert.equal(activeFacts.length, 2);
  });
});
