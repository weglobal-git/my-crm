import { PrismaClient, DealAIFactStatus, DealAIFactMode, FactRelationType, Prisma } from '@prisma/client';
import crypto from 'crypto';
import { EventSummaryOutput } from './prompts/event-summarizer';

export function canonicalizeFactKey(factType: string, factMode: string, subject: string, normalizedValue: any): string {
  const payload = {
    factType: factType.trim().toUpperCase(),
    factMode: factMode,
    subject: subject.trim().toLowerCase(),
    normalizedValue: normalizedValue ?? null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function canonicalizeValueHash(normalizedValue: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(normalizedValue ?? null)).digest('hex');
}

interface ProcessFactsParams {
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
  dealId: string;
  aiEventId: string;
  sourceRevisionId: string;
  sourceDomainEventId: string;
  sourceOccurredAt: Date;
  sourceSummaryRevision: number;
  localEventDate: Date;
  observedAt: Date;
  facts: EventSummaryOutput['facts'];
  createdById?: string;
}

export async function processAIFacts({
  tx,
  dealId,
  aiEventId,
  sourceRevisionId,
  sourceDomainEventId,
  sourceOccurredAt,
  sourceSummaryRevision,
  localEventDate,
  observedAt,
  facts,
  createdById
}: ProcessFactsParams) {
  for (const fact of facts) {
    const factType = fact.factType.trim().toUpperCase();
    const factMode = fact.factMode as DealAIFactMode;
    const subject = fact.subject.trim().toLowerCase();
    
    // Convert undefined to null for JSON fields before Prisma
    const normalizedValue = fact.normalizedValue === undefined ? null : fact.normalizedValue;

    const sourceFactKey = canonicalizeFactKey(factType, factMode, subject, normalizedValue);
    const normalizedValueHash = canonicalizeValueHash(normalizedValue);
    
    // Idempotency check: if fact already created for this exact revision and key, skip
    const existingFact = await tx.dealAIFact.findUnique({
      where: {
        sourceRevisionId_sourceFactKey: {
          sourceRevisionId,
          sourceFactKey,
        },
      },
    });
    if (existingFact) continue;

    // Confidence gate
    const confidence = fact.confidence ?? null;
    let initialStatus: DealAIFactStatus = DealAIFactStatus.ACTIVE;
    if (confidence === null || confidence < 0.80) {
      initialStatus = DealAIFactStatus.NEEDS_REVIEW;
    }

    // 1. If it's a STATE fact and ACTIVE, check for existing active fact first to maintain unique constraint
    if (factMode === DealAIFactMode.STATE && initialStatus === DealAIFactStatus.ACTIVE) {
      const activeFact = await tx.dealAIFact.findFirst({
        where: {
          dealId,
          factType,
          subject,
          status: DealAIFactStatus.ACTIVE,
          factMode: DealAIFactMode.STATE,
        },
      });

      if (activeFact) {
        // Deterministic check: is the new fact chronologically newer?
        const isNewer =
          sourceOccurredAt > activeFact.sourceOccurredAt ||
          (sourceOccurredAt.getTime() === activeFact.sourceOccurredAt.getTime() && sourceDomainEventId > activeFact.sourceDomainEventId) ||
          (sourceOccurredAt.getTime() === activeFact.sourceOccurredAt.getTime() && sourceDomainEventId === activeFact.sourceDomainEventId && sourceSummaryRevision > activeFact.sourceSummaryRevision);

        if (isNewer) {
          // Compare-and-Swap (CAS): transition old active fact to SUPERSEDED first so partial unique index is not violated
          const updateResult = await tx.dealAIFact.updateMany({
            where: {
              id: activeFact.id,
              status: DealAIFactStatus.ACTIVE,
              updatedAt: activeFact.updatedAt,
            },
            data: {
              status: DealAIFactStatus.SUPERSEDED,
              supersessionReason: FactRelationType.UPDATED_BY,
            },
          });

          if (updateResult.count === 0) {
            throw new Error(`CAS failed for superseding Fact ${activeFact.id}`);
          }

          // Create the new ACTIVE fact
          const newFact = await tx.dealAIFact.create({
            data: {
              dealId,
              aiEventId,
              sourceRevisionId,
              sourceDomainEventId,
              sourceOccurredAt,
              sourceSummaryRevision,
              factType,
              factMode,
              subject,
              content: fact.content,
              normalizedValue: normalizedValue === null ? Prisma.DbNull : normalizedValue,
              normalizedValueHash,
              sourceFactKey,
              importance: fact.importance,
              confidence,
              status: DealAIFactStatus.ACTIVE,
              observedAt,
              localEventDate,
              createdById,
            },
          });

          // Link the superseded old fact to the new fact
          await tx.dealAIFact.update({
            where: { id: activeFact.id },
            data: {
              supersededById: newFact.id,
            },
          });
          continue;
        } else {
          // The incoming fact is OLDER than the active fact.
          // Create the new fact directly in SUPERSEDED state, pointing to the active fact.
          await tx.dealAIFact.create({
            data: {
              dealId,
              aiEventId,
              sourceRevisionId,
              sourceDomainEventId,
              sourceOccurredAt,
              sourceSummaryRevision,
              factType,
              factMode,
              subject,
              content: fact.content,
              normalizedValue: normalizedValue === null ? Prisma.DbNull : normalizedValue,
              normalizedValueHash,
              sourceFactKey,
              importance: fact.importance,
              confidence,
              status: DealAIFactStatus.SUPERSEDED,
              supersededById: activeFact.id,
              supersessionReason: FactRelationType.UPDATED_BY,
              observedAt,
              localEventDate,
              createdById,
            },
          });
          continue;
        }
      }
    }

    // Default: create fact with initialStatus (OCCURRENCE facts, low-confidence facts, or first STATE fact)
    await tx.dealAIFact.create({
      data: {
        dealId,
        aiEventId,
        sourceRevisionId,
        sourceDomainEventId,
        sourceOccurredAt,
        sourceSummaryRevision,
        factType,
        factMode,
        subject,
        content: fact.content,
        normalizedValue: normalizedValue === null ? Prisma.DbNull : normalizedValue,
        normalizedValueHash,
        sourceFactKey,
        importance: fact.importance,
        confidence,
        status: initialStatus,
        observedAt,
        localEventDate,
        createdById,
      },
    });
  }
}
