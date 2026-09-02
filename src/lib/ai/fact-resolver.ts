import prisma from "@/lib/prisma";
import { PrismaClient, DealAIFactStatus, FactRelationType, Prisma } from "@prisma/client";
import { processAIFacts } from "./fact-lifecycle";
import { composeDealTimeline, type TimelineEvent } from "./timeline";
import {
  type FactResolutionOutput,
  factResolutionZodSchema,
  buildFactResolverPrompt,
} from "./prompts/fact-resolver";

export type FactResolutionAction = {
  targetFactId: string;
  conflictingFactId?: string;
  action: "MAINTAIN_ACTIVE" | "SUPERSEDE" | "FLAG_REVIEW" | "RETRACT";
  reason: "CONTRADICTED_BY" | "UPDATED_BY" | "OBSOLETE" | "INVALID";
  explanation: string;
  confidence: number;
};

interface ApplyResolutionsParams {
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
  dealId: string;
  resolutions: FactResolutionAction[];
  resolvedById?: string;
}

export async function applyFactResolutions({
  tx,
  dealId,
  resolutions,
  resolvedById,
}: ApplyResolutionsParams): Promise<{ updatedCount: number; resolutions: FactResolutionAction[] }> {
  let updatedCount = 0;

  for (const resolution of resolutions) {
    const targetFact = await tx.dealAIFact.findUnique({
      where: { id: resolution.targetFactId },
    });

    if (!targetFact || targetFact.dealId !== dealId) {
      continue;
    }

    if (resolution.action === "SUPERSEDE") {
      let supersessionReason: FactRelationType = FactRelationType.CONTRADICTED_BY;
      if (resolution.reason === "UPDATED_BY") supersessionReason = FactRelationType.UPDATED_BY;

      const updated = await tx.dealAIFact.updateMany({
        where: {
          id: targetFact.id,
          status: DealAIFactStatus.ACTIVE,
          updatedAt: targetFact.updatedAt, // Optimistic locking
        },
        data: {
          status: DealAIFactStatus.SUPERSEDED,
          supersededById: resolution.conflictingFactId || null,
          supersessionReason,
        },
      });

      if (updated.count === 1) updatedCount++;
    } else if (resolution.action === "FLAG_REVIEW") {
      const updated = await tx.dealAIFact.updateMany({
        where: {
          id: targetFact.id,
          status: DealAIFactStatus.ACTIVE,
          updatedAt: targetFact.updatedAt,
        },
        data: {
          status: DealAIFactStatus.NEEDS_REVIEW,
        },
      });

      if (updated.count === 1) updatedCount++;
    } else if (resolution.action === "RETRACT") {
      const updated = await tx.dealAIFact.updateMany({
        where: {
          id: targetFact.id,
          status: { in: [DealAIFactStatus.ACTIVE, DealAIFactStatus.NEEDS_REVIEW] },
          updatedAt: targetFact.updatedAt,
        },
        data: {
          status: DealAIFactStatus.RETRACTED,
          retractedAt: new Date(),
          retractedById: resolvedById || null,
        },
      });

      if (updated.count === 1) updatedCount++;
    }
  }

  return { updatedCount, resolutions };
}

export async function rebuildDealFacts(dealId: string): Promise<{
  rebuiltFactsCount: number;
  activeFactsCount: number;
  supersededFactsCount: number;
}> {
  return prisma.$transaction(async (tx) => {
    // 1. Delete all existing facts for this deal
    await tx.dealAIFact.deleteMany({
      where: { dealId },
    });

    // 2. Query all AI events with their revisions in chronological order
    const aiEvents = await tx.dealAIEvent.findMany({
      where: { dealId },
      include: {
        domainEvent: true,
        revisions: {
          orderBy: { revision: "asc" },
        },
      },
      orderBy: [
        { occurredAt: "asc" },
        { domainEventId: "asc" },
        { id: "asc" },
      ],
    });

    let rebuiltFactsCount = 0;

    // 3. Sequentially replay and process facts
    for (const event of aiEvents) {
      for (const rev of event.revisions) {
        const structured = rev.structuredData as Prisma.JsonObject;
        if (!structured || !Array.isArray(structured.facts) || structured.facts.length === 0) {
          continue;
        }

        const validFacts = structured.facts as Array<{
          factType: string;
          factMode: "STATE" | "OCCURRENCE";
          subject: string;
          content: string;
          normalizedValue?: any;
          importance: number;
          confidence: number;
        }>;

        await processAIFacts({
          tx,
          dealId,
          aiEventId: event.id,
          sourceRevisionId: rev.id,
          sourceDomainEventId: event.domainEventId,
          sourceOccurredAt: event.occurredAt,
          sourceSummaryRevision: rev.revision,
          localEventDate: event.localEventDate,
          observedAt: rev.createdAt,
          facts: validFacts,
          createdById: rev.createdById || undefined,
        });

        rebuiltFactsCount += validFacts.length;
      }
    }

    const [activeFactsCount, supersededFactsCount] = await Promise.all([
      tx.dealAIFact.count({ where: { dealId, status: DealAIFactStatus.ACTIVE } }),
      tx.dealAIFact.count({ where: { dealId, status: DealAIFactStatus.SUPERSEDED } }),
    ]);

    return {
      rebuiltFactsCount,
      activeFactsCount,
      supersededFactsCount,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function prepareContradictionResolverContext(dealId: string) {
  const [deal, activeFacts, events] = await Promise.all([
    prisma.opportunity.findUniqueOrThrow({
      where: { id: dealId },
      select: { id: true, topic: true, status: true },
    }),
    prisma.dealAIFact.findMany({
      where: {
        dealId,
        status: { in: [DealAIFactStatus.ACTIVE, DealAIFactStatus.NEEDS_REVIEW] },
      },
      orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    }),
    prisma.dealAIEvent.findMany({
      where: {
        dealId,
        status: { in: ["READY", "NEEDS_REVIEW"] },
        currentRevisionId: { not: null },
      },
      include: {
        currentRevision: true,
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 20,
    }),
  ]);

  const timelineEvents: TimelineEvent[] = events.flatMap((e) =>
    e.currentRevision
      ? [
          {
            id: e.id,
            revisionId: e.currentRevision.id,
            localEventDate: e.localEventDate,
            occurredAt: e.occurredAt,
            summary: e.currentRevision.summary,
            eventType: e.currentRevision.eventType,
            importance: e.currentRevision.importance,
          },
        ]
      : []
  );

  const timelineResult = composeDealTimeline(timelineEvents, 1200);

  const prompt = buildFactResolverPrompt({
    dealTitle: deal.topic,
    dealStatus: deal.status,
    facts: activeFacts.map((f) => ({
      id: f.id,
      factType: f.factType,
      factMode: f.factMode,
      subject: f.subject,
      content: f.content,
      status: f.status,
      observedAt: f.observedAt.toISOString(),
    })),
    timelineText: timelineResult.text,
  });

  return { deal, activeFacts, prompt, timelineResult };
}
