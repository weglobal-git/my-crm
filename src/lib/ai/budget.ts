import { AIBudgetReservationStatus, AgentKey, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

const DAILY_LIMIT_MICROS = BigInt(100_000);
const MONTHLY_LIMIT_MICROS = BigInt(1_000_000);
const WARNING_THRESHOLD_MICROS = BigInt(800_000);
const MAX_RUNS_PER_DAY = 100;

export class BudgetService {
  constructor(private readonly agentKey: AgentKey) {}

  async reserveBudget(runId: string, estimatedMicros: bigint) {
    if (!runId.trim() || estimatedMicros < BigInt(0) || estimatedMicros > DAILY_LIMIT_MICROS) {
      throw new Error("Invalid budget reservation.");
    }
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai-budget:${this.agentKey}`}))`;
      const existing = await tx.aIBudgetReservation.findUnique({ where: { runId } });
      if (existing) return existing;

      const now = new Date();
      const dayStart = bangkokBoundary(now, "day");
      const monthStart = bangkokBoundary(now, "month");
      const scope = `agent:${this.agentKey}`;
      const [dailyUsage, monthlyUsage, dailyHeld, monthlyHeld, dailyRuns] = await Promise.all([
        usageSince(tx, this.agentKey, dayStart), usageSince(tx, this.agentKey, monthStart),
        heldSince(tx, scope, dayStart, now), heldSince(tx, scope, monthStart, now),
        tx.agentRun.count({ where: { agentKey: this.agentKey, createdAt: { gte: dayStart } } }),
      ]);

      const projectedDaily = dailyUsage + dailyHeld + estimatedMicros;
      const projectedMonthly = monthlyUsage + monthlyHeld + estimatedMicros;
      if (projectedDaily > DAILY_LIMIT_MICROS) throw new Error("Daily AI budget exceeded.");
      if (projectedMonthly > MONTHLY_LIMIT_MICROS) throw new Error("Monthly AI budget exceeded.");
      if (dailyRuns > MAX_RUNS_PER_DAY) throw new Error("Daily AI run limit exceeded.");

      if (projectedMonthly >= WARNING_THRESHOLD_MICROS) {
        const warning = await tx.aIAlert.count({
          where: { type: "BUDGET_WARNING", createdAt: { gte: monthStart }, details: { path: ["agentKey"], equals: this.agentKey } },
        });
        if (!warning) await tx.aIAlert.create({
          data: { type: "BUDGET_WARNING", severity: "WARNING", message: `${this.agentKey} reached at least 80% of its monthly budget.`, details: { agentKey: this.agentKey } },
        });
      }

      return tx.aIBudgetReservation.create({
        data: { scope, periodKey: bangkokDayKey(now), reservedTokens: 2_500, reservedCostMicros: estimatedMicros, runId, status: "HELD", expiryAt: new Date(now.getTime() + 15 * 60_000) },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reconcileBudget(input: { reservationId: string; actualCostMicros: bigint; inputTokens: number; cachedInputTokens: number; outputTokens: number; providerKey: string; modelId: string; attempt: number }) {
    return prisma.$transaction(async (tx) => {
      const reservation = await tx.aIBudgetReservation.findUnique({ where: { id: input.reservationId } });
      if (!reservation?.runId || reservation.status !== AIBudgetReservationStatus.HELD) throw new Error("Active reservation not found.");
      const usage = await tx.aIUsageRecord.create({
        data: { agentRunId: reservation.runId, attempt: input.attempt, providerKey: input.providerKey, modelId: input.modelId, inputTokens: input.inputTokens, cachedInputTokens: input.cachedInputTokens, outputTokens: input.outputTokens, totalTokens: input.inputTokens + input.outputTokens, costMicros: input.actualCostMicros },
      });
      const updated = await tx.aIBudgetReservation.updateMany({ where: { id: reservation.id, status: "HELD" }, data: { status: "RECONCILED" } });
      if (updated.count !== 1) throw new Error("Reservation was already reconciled.");
      return usage;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

type Tx = Prisma.TransactionClient;
async function usageSince(tx: Tx, agentKey: AgentKey, since: Date) {
  const result = await tx.aIUsageRecord.aggregate({ where: { run: { agentKey }, createdAt: { gte: since } }, _sum: { costMicros: true } });
  return result._sum.costMicros ?? BigInt(0);
}
async function heldSince(tx: Tx, scope: string, since: Date, now: Date) {
  const result = await tx.aIBudgetReservation.aggregate({ where: { scope, status: "HELD", createdAt: { gte: since }, expiryAt: { gt: now } }, _sum: { reservedCostMicros: true } });
  return result._sum.reservedCostMicros ?? BigInt(0);
}
function bangkokBoundary(now: Date, unit: "day" | "month") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${unit === "month" ? "01" : values.day}T00:00:00+07:00`);
}
function bangkokDayKey(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
