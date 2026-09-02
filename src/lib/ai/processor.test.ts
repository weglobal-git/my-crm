import assert from "node:assert/strict";
import test from "node:test";
import { AgentKey, AgentOutboxStatus, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

test("OutboxProcessor - claimNextOutbox concurrent fetching with SKIP LOCKED", async () => {
  // We need a dummy user first
  const dummyUser = await prisma.user.create({
    data: {
      id: `dummy-user-${Date.now()}`,
      email: `dummy-${Date.now()}@example.com`,
      name: "Dummy User"
    }
  });

  // We need to create some pending outbox items and their parent domain events
  const items = await Promise.all(
    Array.from({ length: 5 }).map(async (_, i) => {
      const eventId = `dummy-event-${Date.now()}-${i}`;
      const dealId = `dummy-deal-${Date.now()}-${i}`;
      
      await prisma.opportunity.create({
        data: {
          id: dealId,
          topic: `Dummy Deal ${i}`,
          ownerId: dummyUser.id
        }
      });
      
      await prisma.dealDomainEvent.create({
        data: {
          id: eventId,
          dealId: dealId,
          eventType: "DEAL_CREATED",
          occurredAt: new Date(),
          localEventDate: new Date(),
          timezone: "UTC",
          actorId: dummyUser.id,
          sourceVersion: 1,
          commandId: `dummy-command-${Date.now()}-${i}`,
          correlationId: `dummy-correlation-${Date.now()}-${i}`,
          traceId: `trace-${Date.now()}-${i}`,
          processingClass: "AI_SUMMARY",
          sourceType: "OPPORTUNITY",
          sourceEntityId: `dummy-source-${Date.now()}-${i}`,
          payload: {}
        }
      });

      return prisma.agentOutbox.create({
        data: {
          agentKey: AgentKey.EVENT_SUMMARIZER,
          domainEventId: eventId,
          dealId: dealId,
          traceId: `trace-${Date.now()}-${i}`,
          promptVersion: "1.0",
          schemaVersion: "1.0",
          status: AgentOutboxStatus.PENDING,
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          dedupeKey: `dummy-dedupe-${Date.now()}-${i}`
        }
      });
    })
  );

  // Define the raw query used in claimNextOutbox for testing
  const claimNextOutbox = async (workerId: string) => {
    const leaseUntil = new Date(Date.now() + 5 * 60_000);
    const rows = await prisma.$queryRaw<any[]>`
      WITH candidate AS (
        SELECT id
        FROM "AgentOutbox"
        WHERE "agentKey" = 'EVENT_SUMMARIZER'::"AgentKey"
          AND status IN ('PENDING'::"AgentOutboxStatus", 'FAILED'::"AgentOutboxStatus")
          AND "availableAt" <= NOW()
          AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW())
          AND attempts < "maxAttempts"
          AND id IN (${Prisma.join(items.map(i => i.id))})
        ORDER BY priority DESC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "AgentOutbox" AS outbox
      SET status = 'PROCESSING'::"AgentOutboxStatus",
          "lockedBy" = ${workerId},
          "leaseUntil" = ${leaseUntil},
          attempts = outbox.attempts + 1,
          "updatedAt" = NOW()
      FROM candidate
      WHERE outbox.id = candidate.id
      RETURNING outbox.*
    `;
    return rows[0] ?? null;
  };

  // Attempt to claim items concurrently with 10 workers
  const workers = Array.from({ length: 10 }).map((_, i) => `worker-${i}`);
  const claims = await Promise.all(workers.map(w => claimNextOutbox(w)));

  const successfulClaims = claims.filter(c => c !== null);
  
  // Since there are 5 items, exactly 5 workers should get an item
  assert.equal(successfulClaims.length, 5, `Expected 5 successful claims, got ${successfulClaims.length}`);

  // Each item should be claimed exactly once
  const claimedIds = new Set(successfulClaims.map(c => c.id));
  assert.equal(claimedIds.size, 5, "Each item must be claimed by exactly one worker");

  // Clean up
  await prisma.agentOutbox.deleteMany({
    where: { id: { in: items.map(i => i.id) } }
  });
});
