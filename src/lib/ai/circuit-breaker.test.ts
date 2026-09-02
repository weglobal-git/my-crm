import assert from "node:assert/strict";
import test from "node:test";
import { CircuitBreaker, CircuitState } from "./circuit-breaker";
import prisma from "@/lib/prisma";
import { AIProviderStatus } from "@prisma/client";

test("CircuitBreaker - Concurrent acquireProbeLock requests", async () => {
  const providerKey = "TEST_PROVIDER_" + Date.now();
  const cb = new CircuitBreaker(providerKey);

  // Setup the provider in the database
  await prisma.aIProviderConfig.create({
    data: {
      providerKey,
      status: AIProviderStatus.DEGRADED,
      consecutiveFailures: 3,
      // Open 6 minutes ago, so it's eligible for HALF_OPEN
      circuitOpenedAt: new Date(Date.now() - 6 * 60 * 1000)
    }
  });

  // State should be HALF_OPEN
  const state = await cb.getState();
  assert.equal(state, CircuitState.HALF_OPEN);

  // Simulate 10 concurrent requests trying to acquire the probe lock
  const requests = Array.from({ length: 10 }).map(() => cb.acquireProbeLock());
  const results = await Promise.allSettled(requests);

  const succeeded = results.filter(r => r.status === "fulfilled" && r.value === true);
  const failedOrFalse = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && r.value === false));

  // Only EXACTLY ONE request should acquire the lock
  assert.equal(succeeded.length, 1, `Exactly one probe lock should be acquired, got ${succeeded.length}`);
  assert.equal(failedOrFalse.length, 9, `9 requests should fail to acquire lock, got ${failedOrFalse.length}`);

  // Clean up
  await prisma.aIProviderConfig.delete({
    where: { providerKey }
  });
});
