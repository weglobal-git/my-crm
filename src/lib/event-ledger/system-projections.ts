import { hashActivityContent } from "./contracts";
import type { ActivityLedgerTransaction, ActivityRecord } from "./activity-commands";
import type { DealMutationContext, StoredDomainEvent } from "./transaction";

export async function createSystemProjection(
  tx: ActivityLedgerTransaction,
  context: DealMutationContext,
  domainEvent: StoredDomainEvent,
  input: { content: string },
): Promise<{ activity: ActivityRecord; revisionId: string }> {
  if (!context.actorId) throw new Error("System projections require an actor");
  if (context.commandId !== domainEvent.commandId) {
    throw new Error("System projection commandId must match its canonical event");
  }
  if (!input.content.trim()) throw new Error("System projection content must not be empty");

  const activity = await tx.activityLog.create({
    data: {
      opportunityId: domainEvent.dealId,
      userId: context.actorId,
      content: input.content,
      type: "SYSTEM_UPDATE",
      parentId: null,
      version: 1,
      sourceDomainEventId: domainEvent.id,
    },
  });
  const revision = await tx.activityRevision.create({
    data: {
      activityId: activity.id,
      version: 1,
      changeType: "CREATED",
      content: activity.content,
      contentHash: hashActivityContent(activity.content),
      activityType: "SYSTEM_UPDATE",
      parentId: null,
      changedById: context.actorId,
    },
    select: { id: true },
  });

  return { activity, revisionId: revision.id };
}
