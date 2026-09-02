import { hashActivityContent } from "./contracts";
import type { EventLedgerFeatureFlags } from "./feature-flags";
import {
  findCommandReplay,
  recordDomainEvent,
  type DealMutationContext,
  type EventLedgerTransaction,
  type EventSummaryVersions,
  type JsonValue,
  type StoredDomainEvent,
} from "./transaction";

export type ActivityType = "COMMENT" | "SYSTEM_UPDATE";
export type ActivityChangeType = "CREATED" | "EDITED" | "DELETED";

export type ActivityRecord = {
  id: string;
  opportunityId: string;
  userId: string;
  content: string;
  type: ActivityType;
  parentId: string | null;
  version: number;
  deletedAt: Date | null;
};

type ActivityRevisionData = {
  activityId: string;
  version: number;
  changeType: ActivityChangeType;
  content: string;
  contentHash: string;
  activityType: ActivityType;
  parentId: string | null;
  changedById: string | null;
};

export type ActivityLedgerTransaction = EventLedgerTransaction & {
  activityLog: {
    findUnique(args: {
      where: { id: string };
      select: {
        id: true;
        opportunityId: true;
        userId: true;
        content: true;
        type: true;
        parentId: true;
        version: true;
        deletedAt: true;
      };
    }): Promise<ActivityRecord | null>;
    create(args: {
      data: {
        opportunityId: string;
        userId: string;
        content: string;
        type: ActivityType;
        parentId: string | null;
        version: 1;
        sourceDomainEventId?: string;
      };
    }): Promise<ActivityRecord>;
    updateMany(args: {
      where: { id: string; version: number; deletedAt: null };
      data: {
        content?: string;
        isEdited?: true;
        deletedAt?: Date;
        deletedById?: string;
        version: { increment: 1 };
      };
    }): Promise<{ count: number }>;
  };
  activityRevision: {
    create(args: { data: ActivityRevisionData; select: { id: true } }): Promise<{ id: string }>;
  };
};

export type ActivityCommandResult =
  | { kind: "APPLIED"; activityId: string; version: number; domainEvent: StoredDomainEvent }
  | { kind: "NO_CHANGE"; activityId: string; version: number }
  | { kind: "REPLAY"; activityId: string | null; domainEvent: StoredDomainEvent };

export class ActivityNotFoundError extends Error {
  constructor() {
    super("Activity not found");
    this.name = "ActivityNotFoundError";
  }
}

export class ActivityVersionConflictError extends Error {
  constructor() {
    super("Activity changed or was deleted by another request");
    this.name = "ActivityVersionConflictError";
  }
}

export class InvalidActivitySourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidActivitySourceError";
  }
}

export async function createActivityCommand(
  tx: ActivityLedgerTransaction,
  context: DealMutationContext,
  input: {
    dealId: string;
    content: string;
    parentId?: string;
    activityType?: ActivityType;
  },
  flags: EventLedgerFeatureFlags,
  versions?: EventSummaryVersions,
): Promise<ActivityCommandResult> {
  const eventType = input.parentId ? "REPLY_CREATED" : "ACTIVITY_CREATED";
  const replay = await findCommandReplay(tx, {
    commandId: context.commandId,
    dealId: input.dealId,
    eventType,
  });
  if (replay) return replayResult(replay);
  if (!context.actorId) throw new Error("Activity commands require an actor");
  if (input.activityType === "SYSTEM_UPDATE") {
    throw new InvalidActivitySourceError("System activities must use a projection command");
  }
  if (input.parentId) await loadLiveReplyParent(tx, input.parentId, input.dealId);

  const activity = await tx.activityLog.create({
    data: {
      opportunityId: input.dealId,
      userId: context.actorId,
      content: input.content,
      type: input.activityType ?? "COMMENT",
      parentId: input.parentId ?? null,
      version: 1,
    },
  });
  const revision = await createRevision(tx, activity, "CREATED", context.actorId);
  const { domainEvent } = await recordDomainEvent(tx, context, {
    dealId: input.dealId,
    eventType,
    sourceType: "ACTIVITY",
    sourceEntityId: activity.id,
    sourceVersion: 1,
    activityRevisionId: revision.id,
    payload: activityPayload(activity, revision.contentHash),
    resultRef: { activityId: activity.id, version: 1 },
  }, flags, versions);

  return { kind: "APPLIED", activityId: activity.id, version: 1, domainEvent };
}

export async function editActivityCommand(
  tx: ActivityLedgerTransaction,
  context: DealMutationContext,
  input: { activityId: string; dealId: string; expectedVersion: number; content: string },
  flags: EventLedgerFeatureFlags,
  versions?: EventSummaryVersions,
): Promise<ActivityCommandResult> {
  const activity = await loadActivity(tx, input.activityId, input.dealId);
  assertCommentSource(activity);
  const eventType = activity.parentId ? "REPLY_EDITED" : "ACTIVITY_EDITED";
  const replay = await findCommandReplay(tx, {
    commandId: context.commandId,
    dealId: input.dealId,
    eventType,
  });
  if (replay) return replayResult(replay);
  assertExpectedVersion(activity, input.expectedVersion);
  if (activity.content === input.content) {
    return { kind: "NO_CHANGE", activityId: activity.id, version: activity.version };
  }

  await updateExactlyOne(tx, {
    id: activity.id,
    expectedVersion: input.expectedVersion,
    data: { content: input.content, isEdited: true },
  });
  const updated = { ...activity, content: input.content, version: activity.version + 1 };
  const revision = await createRevision(tx, updated, "EDITED", context.actorId);
  const { domainEvent } = await recordDomainEvent(tx, context, {
    dealId: input.dealId,
    eventType,
    sourceType: "ACTIVITY",
    sourceEntityId: activity.id,
    sourceVersion: updated.version,
    activityRevisionId: revision.id,
    payload: activityPayload(updated, revision.contentHash),
    resultRef: { activityId: activity.id, version: updated.version },
  }, flags, versions);

  return { kind: "APPLIED", activityId: activity.id, version: updated.version, domainEvent };
}

export async function deleteActivityCommand(
  tx: ActivityLedgerTransaction,
  context: DealMutationContext,
  input: { activityId: string; dealId: string; expectedVersion: number },
  flags: EventLedgerFeatureFlags,
): Promise<ActivityCommandResult> {
  const activity = await loadActivity(tx, input.activityId, input.dealId);
  assertCommentSource(activity);
  const eventType = activity.parentId ? "REPLY_DELETED" : "ACTIVITY_DELETED";
  const replay = await findCommandReplay(tx, {
    commandId: context.commandId,
    dealId: input.dealId,
    eventType,
  });
  if (replay) return replayResult(replay);
  assertExpectedVersion(activity, input.expectedVersion);
  if (!context.actorId) throw new Error("Activity commands require an actor");

  await updateExactlyOne(tx, {
    id: activity.id,
    expectedVersion: input.expectedVersion,
    data: { deletedAt: context.occurredAt, deletedById: context.actorId },
  });
  const deleted = {
    ...activity,
    version: activity.version + 1,
    deletedAt: context.occurredAt,
  };
  const revision = await createRevision(tx, deleted, "DELETED", context.actorId);
  const { domainEvent } = await recordDomainEvent(tx, context, {
    dealId: input.dealId,
    eventType,
    sourceType: "ACTIVITY",
    sourceEntityId: activity.id,
    sourceVersion: deleted.version,
    activityRevisionId: revision.id,
    payload: activityPayload(deleted, revision.contentHash),
    resultRef: { activityId: activity.id, version: deleted.version, deleted: true },
  }, flags);

  return { kind: "APPLIED", activityId: activity.id, version: deleted.version, domainEvent };
}

async function loadActivity(
  tx: ActivityLedgerTransaction,
  activityId: string,
  dealId: string,
): Promise<ActivityRecord> {
  const activity = await tx.activityLog.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      opportunityId: true,
      userId: true,
      content: true,
      type: true,
      parentId: true,
      version: true,
      deletedAt: true,
    },
  });
  if (!activity || activity.opportunityId !== dealId) throw new ActivityNotFoundError();
  return activity;
}

function assertExpectedVersion(activity: ActivityRecord, expectedVersion: number): void {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("expectedVersion must be a positive safe integer");
  }
  if (activity.deletedAt || activity.version !== expectedVersion) {
    throw new ActivityVersionConflictError();
  }
}

async function loadLiveReplyParent(
  tx: ActivityLedgerTransaction,
  parentId: string,
  dealId: string,
): Promise<void> {
  const parent = await loadActivity(tx, parentId, dealId);
  assertCommentSource(parent);
  if (parent.deletedAt) throw new InvalidActivitySourceError("Reply parent is deleted");
}

function assertCommentSource(activity: ActivityRecord): void {
  if (activity.type !== "COMMENT") {
    throw new InvalidActivitySourceError("System activities must use a projection command");
  }
}

async function updateExactlyOne(
  tx: ActivityLedgerTransaction,
  input: {
    id: string;
    expectedVersion: number;
    data: Omit<Parameters<ActivityLedgerTransaction["activityLog"]["updateMany"]>[0]["data"], "version">;
  },
): Promise<void> {
  const result = await tx.activityLog.updateMany({
    where: { id: input.id, version: input.expectedVersion, deletedAt: null },
    data: { ...input.data, version: { increment: 1 } },
  });
  if (result.count !== 1) throw new ActivityVersionConflictError();
}

async function createRevision(
  tx: ActivityLedgerTransaction,
  activity: ActivityRecord,
  changeType: ActivityChangeType,
  changedById: string | null,
): Promise<{ id: string; contentHash: string }> {
  const contentHash = hashActivityContent(activity.content);
  const revision = await tx.activityRevision.create({
    data: {
      activityId: activity.id,
      version: activity.version,
      changeType,
      content: activity.content,
      contentHash,
      activityType: activity.type,
      parentId: activity.parentId,
      changedById,
    },
    select: { id: true },
  });
  return { ...revision, contentHash };
}

function activityPayload(activity: ActivityRecord, contentHash: string): JsonValue {
  return {
    activityId: activity.id,
    parentId: activity.parentId,
    activityType: activity.type,
    contentHash,
  };
}

function replayResult(domainEvent: StoredDomainEvent): ActivityCommandResult {
  const resultRef = domainEvent.resultRef;
  const activityId = resultRef && !Array.isArray(resultRef) && typeof resultRef === "object" &&
    typeof resultRef.activityId === "string" ? resultRef.activityId : null;
  return { kind: "REPLAY", activityId, domainEvent };
}
