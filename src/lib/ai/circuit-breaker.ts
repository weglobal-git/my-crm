import prisma from "@/lib/prisma";
import { AgentKey, AIProviderStatus, Prisma } from "@prisma/client";

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN"
}

// 5 minutes in ms
const OPEN_DURATION_MS = 5 * 60 * 1000;
const MAX_FAILURES = 3;

export class CircuitBreaker {
  constructor(private providerKey: string) {}

  async getState(): Promise<CircuitState> {
    const config = await prisma.aIProviderConfig.findUnique({
      where: { providerKey: this.providerKey },
      select: { status: true, circuitOpenedAt: true }
    });

    if (!config) return CircuitState.OPEN;

    if (config.status === AIProviderStatus.DISABLED) return CircuitState.OPEN;
    if (config.status === AIProviderStatus.DEGRADED && config.circuitOpenedAt) {
      const elapsed = Date.now() - config.circuitOpenedAt.getTime();
      if (elapsed > OPEN_DURATION_MS) {
        return CircuitState.HALF_OPEN;
      }
      return CircuitState.OPEN;
    }

    return CircuitState.CLOSED;
  }

  async acquireProbeLock(): Promise<boolean> {
    const now = new Date();
    // Use an atomic update to grab the lock
    const updated = await prisma.aIProviderConfig.updateMany({
      where: {
        providerKey: this.providerKey,
        status: AIProviderStatus.DEGRADED,
        circuitOpenedAt: { lte: new Date(now.getTime() - OPEN_DURATION_MS) },
        OR: [
          { probeLockedUntil: null },
          { probeLockedUntil: { lt: now } }
        ]
      },
      data: {
        probeLockedUntil: new Date(now.getTime() + 60000) // Lock for 60s
      }
    });

    return updated.count > 0;
  }

  async recordSuccess(): Promise<void> {
    await prisma.aIProviderConfig.update({
      where: { providerKey: this.providerKey },
      data: {
        status: AIProviderStatus.ENABLED,
        consecutiveFailures: 0,
        circuitOpenedAt: null,
        probeLockedUntil: null
      }
    });
  }

  async recordFailure(isAuthError: boolean = false, agentKey: AgentKey = AgentKey.EVENT_SUMMARIZER): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai-circuit:${this.providerKey}`}))`;
      const config = await tx.aIProviderConfig.findUnique({ where: { providerKey: this.providerKey }, select: { consecutiveFailures: true, status: true } });
      if (!config) throw new Error("AI provider is not configured.");
      const failures = config.consecutiveFailures + 1;
      const shouldOpen = isAuthError || failures >= MAX_FAILURES;
      const status = isAuthError ? AIProviderStatus.DISABLED : shouldOpen ? AIProviderStatus.DEGRADED : config.status;
      await tx.aIProviderConfig.update({
        where: { providerKey: this.providerKey },
        data: { consecutiveFailures: failures, status, circuitOpenedAt: shouldOpen ? new Date() : undefined, probeLockedUntil: null },
      });
      if (shouldOpen && config.status !== status) await tx.aIAlert.create({
        data: { type: "HIGH_ERROR_RATE", severity: "CRITICAL", message: isAuthError ? `${this.providerKey} authentication failed; provider disabled.` : `${this.providerKey} circuit opened after ${MAX_FAILURES} failures.`, details: { agentKey, providerKey: this.providerKey } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
