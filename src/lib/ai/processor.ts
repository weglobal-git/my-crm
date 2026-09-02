import prisma from "@/lib/prisma";
import { processAIFacts } from "./fact-lifecycle";
import { createHash, randomUUID } from "node:crypto";
import { AgentKey, AgentRunStatus, AgentOutboxStatus, type AgentOutbox } from "@prisma/client";
import { CircuitBreaker, CircuitState } from "./circuit-breaker";
import { BudgetService } from "./budget";
import { aiGateway } from "./gateway";
import { buildContextForDomainEvent } from "./context-builder";
import { eventSummarySchema, EVENT_SUMMARIZER_SYSTEM_INSTRUCTION, buildEventSummarizerPrompt, type EventSummaryOutput, eventSummaryZodSchema } from "./prompts/event-summarizer";
import { getSystemEncryption } from "@/lib/encryption";
import { notifyPrivatePipelineUpdate } from "@/lib/pipeline-security";

export class OutboxProcessor {
  private budgetService: BudgetService;

  constructor() {
    this.budgetService = new BudgetService(AgentKey.EVENT_SUMMARIZER);
  }

  async processNextPendingOutbox() {
    const policy = await prisma.aIModelPolicy.findFirst({
      where: { status: "ACTIVE", agentKey: AgentKey.EVENT_SUMMARIZER },
      orderBy: { version: "desc" },
    });
    if (!policy) throw new Error("No active AI model policy configured");

    const circuitBreaker = new CircuitBreaker(policy.providerKey);
    if (await circuitBreaker.getState() === CircuitState.OPEN) return null;

    const workerId = `event-summary:${randomUUID()}`;
    const outbox = await claimNextOutbox(workerId);

    if (!outbox) return null;

    console.log(`Claimed outbox ${outbox.id} for event ${outbox.domainEventId}`);

    // Create AgentRun record
    const agentRun = await prisma.agentRun.create({
      data: {
        agentKey: outbox.agentKey,
        outboxId: outbox.id,
        domainEventId: outbox.domainEventId,
        dealId: outbox.dealId,
        traceId: outbox.traceId,
        policyId: policy.id,
        providerKey: policy.providerKey,
        modelId: policy.modelId,
        promptVersion: policy.promptVersion,
        schemaVersion: policy.schemaVersion,
        status: AgentRunStatus.STARTED,
        attemptCount: outbox.attempts,
        startedAt: new Date()
      }
    });

    let budgetReservation;
    let stage = "BUDGET_ADMISSION";
    try {
      // 2. Budget Admission
      // Reserve pessimistic cost: $0.05 (50000 micros) instead of $2.50
      const estimatedMaxCostMicros = policy.perRunCostLimitMicros;
      budgetReservation = await this.budgetService.reserveBudget(agentRun.id, estimatedMaxCostMicros);

      // 3. Build Context
      stage = "CONTEXT_BUILD";
      const contextPayload = await buildContextForDomainEvent(outbox.domainEventId);
      const prompt = buildEventSummarizerPrompt(contextPayload);

      // 4. Resolve secrets
      stage = "PROVIDER_CONFIG";
      const config = await prisma.aIProviderConfig.findUnique({
        where: { providerKey: policy.providerKey }
      });
      if (!config?.enabled || config.status !== "ENABLED" || !config.secretRef) {
        throw new Error("Provider secret not configured.");
      }

      // 5. Call Gateway
      stage = "PROVIDER_CALL";
      const startTime = Date.now();
      
      let heartbeatTimer: NodeJS.Timeout | null = null;
      let aiResult: import("./gateway").AIResult<EventSummaryOutput>;
      try {
        heartbeatTimer = setInterval(async () => {
          try {
            await prisma.agentOutbox.updateMany({
              where: { id: outbox.id, lockedBy: workerId, attempts: outbox.attempts },
              data: { leaseUntil: new Date(Date.now() + 5 * 60_000) }
            });
          } catch (e) {
            console.error(`Heartbeat failed for outbox ${outbox.id}:`, e);
          }
        }, 120_000); // Every 2 minutes
        
        aiResult = await aiGateway.getAdapter(policy.providerKey).generateStructured<EventSummaryOutput>({
          providerKey: policy.providerKey,
          modelId: policy.modelId,
          secretKey: getSystemEncryption().decrypt(config.secretRef),
          systemInstruction: EVENT_SUMMARIZER_SYSTEM_INSTRUCTION,
          prompt,
          schema: eventSummarySchema,
          maxOutputTokens: policy.maxOutputTokens,
          temperature: policy.temperature ?? undefined,
          timeoutMs: policy.timeoutMs,
        });
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }
      const latencyMs = Date.now() - startTime;

      // Zod Validation
      try {
        aiResult.data = eventSummaryZodSchema.parse(aiResult.data);
      } catch (err) {
        throw new Error("OUTPUT_SCHEMA_INVALID");
      }

      // 6. Writeback and Usage Recording
      stage = "WRITEBACK";
      await prisma.$transaction(async (tx) => {
        const existingEvent = await tx.dealAIEvent.findUnique({
          where: { domainEventId_agentKey: { domainEventId: outbox.domainEventId, agentKey: AgentKey.EVENT_SUMMARIZER } },
        });
        if (existingEvent) throw new Error("AI_EVENT_ALREADY_EXISTS");
        const domainEvent = await tx.dealDomainEvent.findUniqueOrThrow({ where: { id: outbox.domainEventId } });
        const aiEvent = await tx.dealAIEvent.create({
          data: {
            dealId: outbox.dealId, domainEventId: outbox.domainEventId, agentKey: AgentKey.EVENT_SUMMARIZER,
            occurredAt: domainEvent.occurredAt, localEventDate: domainEvent.localEventDate, status: aiResult.data.needsContext ? "NEEDS_REVIEW" : "READY",
          },
        });
        const revision = await tx.dealAIEventRevision.create({
          data: {
            eventId: aiEvent.id, revision: 1, authorType: "AI", summary: aiResult.data.summary,
            structuredData: aiResult.data, eventType: aiResult.data.eventType, importance: aiResult.data.importance,
            confidence: aiResult.data.confidence, needsContext: aiResult.data.needsContext,
            providerKey: policy.providerKey, modelId: policy.modelId,
            promptVersion: policy.promptVersion, schemaVersion: policy.schemaVersion,
            sourceContentHash: createHash("sha256").update(prompt).digest("hex"),
          },
        });
        await tx.dealAIEvent.update({ where: { id: aiEvent.id }, data: { currentRevisionId: revision.id } });
        await tx.agentRun.update({ where: { id: agentRun.id }, data: { outputRevisionId: revision.id } });

        if (aiResult.data.facts && aiResult.data.facts.length > 0) {
          await processAIFacts({
            tx,
            dealId: outbox.dealId,
            aiEventId: aiEvent.id,
            sourceRevisionId: revision.id,
            sourceDomainEventId: domainEvent.id,
            sourceOccurredAt: domainEvent.occurredAt,
            sourceSummaryRevision: 1,
            localEventDate: domainEvent.localEventDate,
            observedAt: new Date(),
            facts: aiResult.data.facts,
          });
        }

        // Mark Outbox and Run as completed
        const completed = await tx.agentOutbox.updateMany({
          where: { id: outbox.id, status: AgentOutboxStatus.PROCESSING, lockedBy: workerId, attempts: outbox.attempts, leaseUntil: { gt: new Date() } },
          data: {
            status: AgentOutboxStatus.COMPLETED,
            completedAt: new Date(),
            leaseUntil: null,
            lockedBy: null,
          }
        });
        if (completed.count !== 1) throw new Error("OUTBOX_LEASE_LOST");

        await tx.agentRun.update({
          where: { id: agentRun.id },
          data: {
            status: AgentRunStatus.COMPLETED,
            providerLatencyMs: latencyMs,
            totalTokens: aiResult.usage.totalTokens,
            completedAt: new Date()
          }
        });
      });

      // Reconcile budget
      stage = "USAGE_RECONCILE";
      await this.budgetService.reconcileBudget({ reservationId: budgetReservation.id, actualCostMicros: BigInt(0), inputTokens: aiResult.usage.inputTokens, cachedInputTokens: 0, outputTokens: aiResult.usage.outputTokens, providerKey: policy.providerKey, modelId: policy.modelId, attempt: agentRun.attemptCount });
      await circuitBreaker.recordSuccess();

      await notifyPrivatePipelineUpdate(outbox.dealId, { action: "AI_EVENT_READY", dealId: outbox.dealId, domainEventId: outbox.domainEventId, eventNonce: randomUUID() });

      return true;

    } catch (error: unknown) {
      const errorCode = `${classifyError(error)}_${stage}`;
      console.error(`Error processing outbox ${outbox.id}:`, errorCode);
      
      const isFinalAttempt = outbox.attempts >= outbox.maxAttempts;
      
      await prisma.$transaction([
        prisma.agentOutbox.updateMany({
          where: { id: outbox.id, status: AgentOutboxStatus.PROCESSING, lockedBy: workerId, attempts: outbox.attempts },
          data: {
            status: isFinalAttempt ? AgentOutboxStatus.DEAD : AgentOutboxStatus.FAILED,
            lastErrorCode: errorCode,
            leaseUntil: null,
            lockedBy: null,
            // Backoff: wait longer before retry
            availableAt: isFinalAttempt ? undefined : new Date(Date.now() + 60 * 1000 * Math.pow(2, outbox.attempts))
          }
        }),
        prisma.agentRun.update({
          where: { id: agentRun.id },
          data: {
            status: isFinalAttempt ? AgentRunStatus.DEAD : AgentRunStatus.FAILED,
            normalizedErrorCode: errorCode,
            redactedErrorMsg: "AI processing failed; inspect the normalized error code.",
            completedAt: new Date()
          }
        })
      ]);

      if (budgetReservation) {
         await prisma.aIBudgetReservation.update({
           where: { id: budgetReservation.id },
           data: { status: "RELEASED" }
         });
      }
      await circuitBreaker.recordFailure();

      return false;
    }
  }
}

async function claimNextOutbox(workerId: string): Promise<AgentOutbox | null> {
  const leaseUntil = new Date(Date.now() + 5 * 60_000);
  const rows = await prisma.$queryRaw<AgentOutbox[]>`
    WITH candidate AS (
      SELECT id
      FROM "AgentOutbox"
      WHERE "agentKey" = 'EVENT_SUMMARIZER'::"AgentKey"
        AND status IN ('PENDING'::"AgentOutboxStatus", 'FAILED'::"AgentOutboxStatus")
        AND "availableAt" <= NOW()
        AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW())
        AND attempts < "maxAttempts"
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
}

function classifyError(error: unknown): string {
  if (!(error instanceof Error)) return "UNKNOWN_ERROR";
  if (error.name === "AbortError" || /timeout/i.test(error.message)) return "PROVIDER_TIMEOUT";
  if (/auth|401|403/i.test(error.message)) return "PROVIDER_AUTH";
  if (/budget/i.test(error.message)) return "BUDGET_REJECTED";
  if (/AI_EVENT_ALREADY_EXISTS/.test(error.message)) return "DUPLICATE_EVENT";
  if (/OUTPUT_SCHEMA_INVALID/.test(error.message)) return "OUTPUT_SCHEMA_INVALID";
  return "PROCESSOR_ERROR";
}
