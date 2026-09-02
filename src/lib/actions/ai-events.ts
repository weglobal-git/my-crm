"use server";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { notifyPrivatePipelineUpdate, requireOpportunityAccess, type PipelineActor } from "@/lib/pipeline-security";
import { composeDealAgentContext, composeDealAgentContextWithFacts, composeDealTimeline, estimateTokens, type TimelineEvent } from "@/lib/ai/timeline";
import { DealAIFactStatus, FactRelationType } from "@prisma/client";

const SUMMARY_LIMIT = 50;

export async function getDealAISummaries(dealId: string, days = 60, actorOverride?: PipelineActor) {
  await requireOpportunityAccess(dealId, { actor: actorOverride });
  const boundedDays = Number.isSafeInteger(days) ? Math.min(Math.max(days, 1), 365) : 60;
  const since = new Date(Date.now() - boundedDays * 86_400_000);

  return prisma.dealAIEvent.findMany({
    where: {
      dealId,
      occurredAt: { gte: since },
      status: { in: ["READY", "NEEDS_REVIEW"] },
      currentRevisionId: { not: null },
    },
    select: {
      id: true,
      domainEventId: true,
      occurredAt: true,
      localEventDate: true,
      status: true,
      currentRevision: {
        select: {
          id: true,
          revision: true,
          authorType: true,
          summary: true,
          structuredData: true,
          eventType: true,
          importance: true,
          confidence: true,
          needsContext: true,
          providerKey: true,
          modelId: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: SUMMARY_LIMIT,
  });
}

export async function correctDealAISummary(input: {
  dealId: string;
  eventId: string;
  expectedRevisionId: string;
  summary: string;
  actorOverride?: PipelineActor;
}) {
  const { actor } = await requireOpportunityAccess(input.dealId, { actor: input.actorOverride });
  const summary = input.summary.trim();
  if (!summary || summary.length > 2_000) throw new Error("Summary must contain 1–2,000 characters.");

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.dealAIEvent.findFirst({
      where: { id: input.eventId, dealId: input.dealId },
      include: { currentRevision: true },
    });
    if (!event?.currentRevision || event.currentRevision.id !== input.expectedRevisionId) {
      throw new Error("This summary changed. Refresh before correcting it.");
    }

    const structured = asRecord(event.currentRevision.structuredData);
    const revision = await tx.dealAIEventRevision.create({
      data: {
        eventId: event.id,
        revision: event.currentRevision.revision + 1,
        authorType: "USER",
        summary,
        structuredData: { ...structured, summary },
        eventType: event.currentRevision.eventType,
        importance: event.currentRevision.importance,
        confidence: event.currentRevision.confidence,
        needsContext: event.currentRevision.needsContext,
        promptVersion: event.currentRevision.promptVersion,
        schemaVersion: event.currentRevision.schemaVersion,
        sourceContentHash: event.currentRevision.sourceContentHash,
        createdById: actor.id,
        supersedesRevisionId: event.currentRevision.id,
      },
    });

    const advanced = await tx.dealAIEvent.updateMany({
      where: { id: event.id, currentRevisionId: input.expectedRevisionId },
      data: { currentRevisionId: revision.id, status: "READY" },
    });
    if (advanced.count !== 1) throw new Error("This summary changed. Refresh before correcting it.");

    // Retract/supersede facts from the previous revision because the user edited the summary
    await tx.dealAIFact.updateMany({
      where: { sourceRevisionId: input.expectedRevisionId },
      data: {
        status: DealAIFactStatus.SUPERSEDED,
        retractedAt: new Date(),
        retractedById: actor.id,
        supersessionReason: FactRelationType.CORRECTED_BY,
      },
    });

    return revision;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await notifyPrivatePipelineUpdate(input.dealId, {
    action: "AI_EVENT_READY",
    dealId: input.dealId,
    aiEventId: input.eventId,
    revisionId: result.id,
  });
  return result;
}

export async function getDealAITimeline(dealId: string, days = 60, maxTokens = 2_000, actorOverride?: PipelineActor) {
  const events = await getDealAISummaries(dealId, days, actorOverride);
  return composeDealTimeline(events.flatMap(event => event.currentRevision ? [{
    id: event.id,
    revisionId: event.currentRevision.id,
    localEventDate: event.localEventDate,
    occurredAt: event.occurredAt,
    summary: event.currentRevision.summary,
    eventType: event.currentRevision.eventType,
    importance: event.currentRevision.importance,
  }] : []), maxTokens);
}

export async function getDealAIContextBenchmark(dealId: string, days = 60, actorOverride?: PipelineActor) {
  await requireOpportunityAccess(dealId, { actor: actorOverride });
  const boundedDays = Number.isSafeInteger(days) ? Math.min(Math.max(days, 1), 365) : 60;
  const since = new Date(Date.now() - boundedDays * 86_400_000);
  const [recent, activeFacts, raw] = await Promise.all([
    getDealAISummaries(dealId, boundedDays, actorOverride),
    prisma.dealAIFact.findMany({
      where: { dealId, status: DealAIFactStatus.ACTIVE },
      select: {
        id: true,
        factType: true,
        factMode: true,
        subject: true,
        content: true,
        importance: true,
        confidence: true,
        observedAt: true,
        localEventDate: true,
      },
      orderBy: [{ observedAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
    prisma.activityLog.findMany({
      where: { opportunityId: dealId, deletedAt: null, type: "COMMENT", createdAt: { gte: since } },
      select: { content: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 500,
    }),
  ]);
  const context = composeDealAgentContextWithFacts(toTimelineEvents(recent), activeFacts);
  const rawChars = raw.reduce((total, activity) => total + activity.content.length + 1, 0);
  const rawEstimatedTokens = estimateTokens(rawChars);
  const composedEstimatedTokens = context.estimatedTokens;
  return {
    days: boundedDays,
    rawActivityCount: raw.length,
    summaryEventCount: recent.length,
    activeFactCount: activeFacts.length,
    rawEstimatedTokens,
    composedEstimatedTokens,
    estimatedReductionPercent: rawEstimatedTokens === 0
      ? 0
      : Math.round((1 - composedEstimatedTokens / rawEstimatedTokens) * 10_000) / 100,
    context,
    estimator: "ceil(UTF-16 characters / 4); benchmark estimate, not provider billing tokens",
  };
}

function toTimelineEvents(events: Awaited<ReturnType<typeof getDealAISummaries>>): TimelineEvent[] {
  return events.flatMap(event => {
    if (!event.currentRevision) return [];
    const structured = asRecord(event.currentRevision.structuredData);
    const blockers = Array.isArray(structured.blockers)
      ? structured.blockers.filter((value): value is string => typeof value === "string")
      : [];
    return [{
      id: event.id,
      revisionId: event.currentRevision.id,
      localEventDate: event.localEventDate,
      occurredAt: event.occurredAt,
      summary: event.currentRevision.summary,
      eventType: event.currentRevision.eventType,
      importance: event.currentRevision.importance,
      blockers,
    }];
  });
}

function asRecord(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}
