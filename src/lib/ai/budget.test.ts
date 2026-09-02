import assert from "node:assert/strict";
import test from "node:test";
import { AgentKey } from "@prisma/client";
import { BudgetService } from "./budget";
import prisma from "@/lib/prisma";

test("BudgetService - Concurrent reservations do not exceed limits", async () => {
  const service = new BudgetService(AgentKey.EVENT_SUMMARIZER);
  
  const policy = await prisma.aIModelPolicy.upsert({
    where: {
      agentKey_version: {
        agentKey: AgentKey.EVENT_SUMMARIZER,
        version: 9999
      }
    },
    update: {},
    create: {
      agentKey: AgentKey.EVENT_SUMMARIZER,
      providerKey: "GOOGLE_GEMINI",
      modelId: "gemini-2.5-flash",
      promptVersion: "1.0",
      schemaVersion: "1.0",
      version: 9999,
      maximumContext: 100000,
      maxInputTokens: 50000,
      maxOutputTokens: 2000,
      dailyTokenLimit: 1000000,
      monthlyTokenLimit: 10000000,
      dailyCostLimitMicros: BigInt(100_000),
      monthlyCostLimitMicros: BigInt(1_000_000),
      perRunCostLimitMicros: BigInt(10_000)
    }
  });

  // Create mock AgentRuns first because reserveBudget requires runId to exist
  const runs = await Promise.all(
    Array.from({ length: 15 }).map((_, i) => 
      prisma.agentRun.create({
        data: {
          agentKey: AgentKey.EVENT_SUMMARIZER,
          outboxId: `dummy-outbox-${Date.now()}-${i}`,
          domainEventId: `dummy-event-${Date.now()}-${i}`,
          dealId: `dummy-deal-${Date.now()}-${i}`,
          traceId: `trace-${Date.now()}-${i}`,
          status: "QUEUED",
          providerKey: "GOOGLE_GEMINI",
          modelId: "gemini-2.5-flash",
          promptVersion: "1.0",
          schemaVersion: "1.0",
          policyId: policy.id
        }
      })
    )
  );

  // Each request asks for 15,000 micros. 
  // Daily limit is 100,000 micros.
  // 15,000 * 6 = 90,000. 15,000 * 7 = 105,000 (exceeds 100,000).
  // Therefore, only 6 requests should succeed out of 15.
  const microsPerRun = BigInt(15_000);
  
  const results = await Promise.allSettled(
    runs.map(run => service.reserveBudget(run.id, microsPerRun))
  );

  const succeeded = results.filter(r => r.status === "fulfilled");
  const failed = results.filter(r => r.status === "rejected");

  // Clean up
  await prisma.aIBudgetReservation.deleteMany({
    where: { runId: { in: runs.map(r => r.id) } }
  });
  await prisma.agentRun.deleteMany({
    where: { id: { in: runs.map(r => r.id) } }
  });

  assert.ok(succeeded.length <= 6, `Should not exceed 6 successful reservations, got ${succeeded.length}`);
});
