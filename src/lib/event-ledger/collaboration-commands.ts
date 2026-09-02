import type { DealDomainEventType } from "./contracts";
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

export type CollaborationRequestType = "DEAL_TRANSFER_REQUEST" | "TEAM_INVITE_REQUEST";
export type CollaborationNotificationStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "READ";
type NotificationType = CollaborationRequestType | "SYSTEM_ALERT" | "DEAL_COMMENT";

type CollaborationDeal = {
  id: string;
  version: number;
  deletedAt: Date | null;
  ownerId: string;
  teamMembers: Array<{ id: string }>;
};

type CollaborationNotification = {
  id: string;
  recipientId: string;
  senderId: string | null;
  type: NotificationType;
  referenceId: string | null;
  status: CollaborationNotificationStatus;
};

type RequestEvent = {
  id: string;
  dealId: string;
  eventType: "OWNERSHIP_TRANSFER_REQUESTED" | "TEAM_INVITE_REQUESTED";
  payload: JsonValue;
};

export type CollaborationTransaction = EventLedgerTransaction & {
  dealDomainEvent: EventLedgerTransaction["dealDomainEvent"] & {
    findFirst(args: {
      where: {
        sourceType: "NOTIFICATION";
        sourceEntityId: string;
        eventType: RequestEvent["eventType"];
      };
      select: { id: true; dealId: true; eventType: true; payload: true };
      orderBy: { createdAt: "asc" };
    }): Promise<RequestEvent | null>;
  };
  notification: {
    findUnique(args: {
      where: { id: string };
      select: {
        id: true;
        recipientId: true;
        senderId: true;
        type: true;
        referenceId: true;
        status: true;
      };
    }): Promise<CollaborationNotification | null>;
    create(args: {
      data: {
        recipientId: string;
        senderId: string;
        type: CollaborationRequestType;
        title: string;
        message: string;
        referenceId: string;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
    updateMany(args: {
      where: {
        id: string;
        recipientId: string;
        status: "PENDING";
      };
      data: { status: "ACCEPTED" | "REJECTED" };
    }): Promise<{ count: number }>;
  };
  opportunity: {
    findUnique(args: {
      where: { id: string };
      select: {
        id: true;
        version: true;
        deletedAt: true;
        ownerId: true;
        teamMembers: { select: { id: true } };
      };
    }): Promise<CollaborationDeal | null>;
    updateMany(args: {
      where: { id: string; version: number; deletedAt: null };
      data: { ownerId?: string; version: { increment: 1 } };
    }): Promise<{ count: number }>;
    update(args: {
      where: { id: string };
      data: {
        teamMembers: {
          connect?: { id: string };
          disconnect?: { id: string };
        };
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
};

export type CollaborationCommandResult =
  | { kind: "REQUESTED"; notificationId: string; domainEvent: StoredDomainEvent }
  | { kind: "ACCEPTED" | "REJECTED"; notificationId: string; domainEvent: StoredDomainEvent }
  | { kind: "REPLAY"; notificationId: string | null; domainEvent: StoredDomainEvent };

export class CollaborationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollaborationConflictError";
  }
}

export async function requestOwnershipTransferCommand(
  tx: CollaborationTransaction,
  context: DealMutationContext,
  input: { dealId: string; expectedVersion: number; newOwnerId: string },
  flags: EventLedgerFeatureFlags,
): Promise<CollaborationCommandResult> {
  return createRequest(tx, context, {
    dealId: input.dealId,
    expectedVersion: input.expectedVersion,
    targetUserId: input.newOwnerId,
    notificationType: "DEAL_TRANSFER_REQUEST",
    eventType: "OWNERSHIP_TRANSFER_REQUESTED",
    title: "Deal Transfer Request",
    message: "You received a Deal ownership transfer request.",
  }, flags);
}

export async function requestTeamInviteCommand(
  tx: CollaborationTransaction,
  context: DealMutationContext,
  input: { dealId: string; expectedVersion: number; userId: string },
  flags: EventLedgerFeatureFlags,
): Promise<CollaborationCommandResult> {
  return createRequest(tx, context, {
    dealId: input.dealId,
    expectedVersion: input.expectedVersion,
    targetUserId: input.userId,
    notificationType: "TEAM_INVITE_REQUEST",
    eventType: "TEAM_INVITE_REQUESTED",
    title: "Deal Team Invitation",
    message: "You received an invitation to join a Deal team.",
  }, flags);
}

export async function respondToCollaborationRequestCommand(
  tx: CollaborationTransaction,
  context: DealMutationContext,
  input: { notificationId: string; accept: boolean },
  flags: EventLedgerFeatureFlags,
  versions?: EventSummaryVersions,
): Promise<CollaborationCommandResult> {
  const actorId = requireActor(context);
  const notification = await loadNotification(tx, input.notificationId);
  if (notification.recipientId !== actorId) throw new CollaborationConflictError("Request belongs to another user");
  if (notification.type !== "DEAL_TRANSFER_REQUEST" && notification.type !== "TEAM_INVITE_REQUEST") {
    throw new CollaborationConflictError("Notification is not a collaboration request");
  }
  if (!notification.referenceId) throw new CollaborationConflictError("Request has no Deal reference");

  const eventType = responseEventType(notification.type, input.accept);
  const replay = await findCommandReplay(tx, {
    commandId: context.commandId,
    dealId: notification.referenceId,
    eventType,
  });
  if (replay) return replayResult(replay);
  if (notification.status !== "PENDING") throw new CollaborationConflictError("Request was already handled");

  const requestEventType = notification.type === "DEAL_TRANSFER_REQUEST"
    ? "OWNERSHIP_TRANSFER_REQUESTED"
    : "TEAM_INVITE_REQUESTED";
  const requestEvent = await tx.dealDomainEvent.findFirst({
    where: {
      sourceType: "NOTIFICATION",
      sourceEntityId: notification.id,
      eventType: requestEventType,
    },
    select: { id: true, dealId: true, eventType: true, payload: true },
    orderBy: { createdAt: "asc" },
  });
  const request = parseRequestPayload(requestEvent?.payload);
  if (!requestEvent || requestEvent.dealId !== notification.referenceId || request.targetUserId !== actorId) {
    throw new CollaborationConflictError("Request provenance is missing or invalid");
  }

  let deal: CollaborationDeal | null = null;
  if (input.accept) {
    if (notification.type === "DEAL_TRANSFER_REQUEST" && !versions) {
      throw new Error("Event Summary versions are required when accepting ownership transfer");
    }
    deal = await loadDeal(tx, notification.referenceId);
    if (deal.version !== request.dealVersion) {
      throw new CollaborationConflictError("Deal changed after this request was created");
    }
    if (notification.type === "DEAL_TRANSFER_REQUEST" && deal.ownerId !== request.previousOwnerId) {
      throw new CollaborationConflictError("Deal owner changed after this request was created");
    }
  }

  const claimed = await tx.notification.updateMany({
    where: { id: notification.id, recipientId: actorId, status: "PENDING" },
    data: { status: input.accept ? "ACCEPTED" : "REJECTED" },
  });
  if (claimed.count !== 1) throw new CollaborationConflictError("Request was already handled");

  let nextDealVersion = request.dealVersion ?? 0;
  if (input.accept) {
    if (!deal) throw new CollaborationConflictError("Deal was not loaded for acceptance");
    await applyAcceptedRequest(tx, deal, notification.type, actorId);
    nextDealVersion = deal.version + 1;
  }

  const payload = responsePayload(deal, notification.type, actorId, input.accept, nextDealVersion);
  const { domainEvent } = await recordDomainEvent(tx, context, {
    dealId: notification.referenceId,
    eventType,
    sourceType: "NOTIFICATION",
    sourceEntityId: notification.id,
    sourceVersion: 2,
    payload,
    resultRef: {
      notificationId: notification.id,
      accepted: input.accept,
      dealId: notification.referenceId,
      dealVersion: nextDealVersion,
    },
  }, flags, versions);

  return {
    kind: input.accept ? "ACCEPTED" : "REJECTED",
    notificationId: notification.id,
    domainEvent,
  };
}

async function createRequest(
  tx: CollaborationTransaction,
  context: DealMutationContext,
  input: {
    dealId: string;
    expectedVersion: number;
    targetUserId: string;
    notificationType: CollaborationRequestType;
    eventType: "OWNERSHIP_TRANSFER_REQUESTED" | "TEAM_INVITE_REQUESTED";
    title: string;
    message: string;
  },
  flags: EventLedgerFeatureFlags,
): Promise<CollaborationCommandResult> {
  const actorId = requireActor(context);
  if (!input.targetUserId.trim()) throw new Error("targetUserId must not be empty");
  const replay = await findCommandReplay(tx, {
    commandId: context.commandId,
    dealId: input.dealId,
    eventType: input.eventType,
  });
  if (replay) return replayResult(replay);

  const deal = await loadDeal(tx, input.dealId);
  if (!Number.isSafeInteger(input.expectedVersion) || deal.version !== input.expectedVersion) {
    throw new CollaborationConflictError("Deal version is stale");
  }
  const teamIds = new Set(deal.teamMembers.map(member => member.id));
  if (input.notificationType === "DEAL_TRANSFER_REQUEST") {
    if (deal.ownerId === input.targetUserId) throw new CollaborationConflictError("User already owns this Deal");
  } else if (deal.ownerId === input.targetUserId || teamIds.has(input.targetUserId)) {
    throw new CollaborationConflictError("User is already on this Deal");
  }

  const notification = await tx.notification.create({
    data: {
      recipientId: input.targetUserId,
      senderId: actorId,
      type: input.notificationType,
      title: input.title,
      message: input.message,
      referenceId: deal.id,
    },
    select: { id: true },
  });
  const { domainEvent } = await recordDomainEvent(tx, context, {
    dealId: deal.id,
    eventType: input.eventType,
    sourceType: "NOTIFICATION",
    sourceEntityId: notification.id,
    sourceVersion: 1,
    payload: {
      notificationId: notification.id,
      targetUserId: input.targetUserId,
      previousOwnerId: deal.ownerId,
      dealVersion: deal.version,
    },
    resultRef: { notificationId: notification.id, dealId: deal.id },
  }, flags);

  return { kind: "REQUESTED", notificationId: notification.id, domainEvent };
}

async function applyAcceptedRequest(
  tx: CollaborationTransaction,
  deal: CollaborationDeal,
  type: CollaborationRequestType,
  actorId: string,
): Promise<void> {
  const changed = await tx.opportunity.updateMany({
    where: { id: deal.id, version: deal.version, deletedAt: null },
    data: {
      ...(type === "DEAL_TRANSFER_REQUEST" ? { ownerId: actorId } : {}),
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new CollaborationConflictError("Deal changed while accepting request");

  const teamIds = new Set(deal.teamMembers.map(member => member.id));
  if (type === "DEAL_TRANSFER_REQUEST") {
    const update: { connect?: { id: string }; disconnect?: { id: string } } = {};
    if (!teamIds.has(deal.ownerId)) update.connect = { id: deal.ownerId };
    if (teamIds.has(actorId)) update.disconnect = { id: actorId };
    if (Object.keys(update).length > 0) {
      await tx.opportunity.update({
        where: { id: deal.id },
        data: { teamMembers: update },
        select: { id: true },
      });
    }
  } else {
    if (teamIds.has(actorId) || deal.ownerId === actorId) {
      throw new CollaborationConflictError("User is already on this Deal");
    }
    await tx.opportunity.update({
      where: { id: deal.id },
      data: { teamMembers: { connect: { id: actorId } } },
      select: { id: true },
    });
  }
}

async function loadDeal(tx: CollaborationTransaction, dealId: string): Promise<CollaborationDeal> {
  const deal = await tx.opportunity.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      version: true,
      deletedAt: true,
      ownerId: true,
      teamMembers: { select: { id: true } },
    },
  });
  if (!deal || deal.deletedAt) throw new CollaborationConflictError("Deal not found");
  return deal;
}

async function loadNotification(
  tx: CollaborationTransaction,
  notificationId: string,
): Promise<CollaborationNotification> {
  const notification = await tx.notification.findUnique({
    where: { id: notificationId },
    select: {
      id: true,
      recipientId: true,
      senderId: true,
      type: true,
      referenceId: true,
      status: true,
    },
  });
  if (!notification) throw new CollaborationConflictError("Request not found");
  return notification;
}

function responseEventType(type: CollaborationRequestType, accept: boolean): DealDomainEventType {
  if (type === "DEAL_TRANSFER_REQUEST") {
    return accept ? "DEAL_OWNER_CHANGED" : "OWNERSHIP_TRANSFER_REJECTED";
  }
  return accept ? "DEAL_MEMBER_ADDED" : "TEAM_INVITE_REJECTED";
}

function responsePayload(
  deal: CollaborationDeal | null,
  type: CollaborationRequestType,
  actorId: string,
  accepted: boolean,
  dealVersion: number,
): JsonValue {
  if (!accepted) return { accepted: false, targetUserId: actorId, dealVersion };
  if (!deal) throw new CollaborationConflictError("Deal was not loaded for acceptance");
  if (type === "DEAL_TRANSFER_REQUEST") {
    return {
      accepted: true,
      targetUserId: actorId,
      dealVersion,
      changedFields: { ownerId: { before: deal.ownerId, after: actorId } },
    };
  }
  return { accepted: true, memberId: actorId, dealVersion };
}

function parseRequestPayload(payload: JsonValue | undefined): {
  targetUserId: string | null;
  previousOwnerId: string | null;
  dealVersion: number | null;
} {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return { targetUserId: null, previousOwnerId: null, dealVersion: null };
  }
  return {
    targetUserId: typeof payload.targetUserId === "string" ? payload.targetUserId : null,
    previousOwnerId: typeof payload.previousOwnerId === "string" ? payload.previousOwnerId : null,
    dealVersion: typeof payload.dealVersion === "number" && Number.isSafeInteger(payload.dealVersion)
      ? payload.dealVersion
      : null,
  };
}

function requireActor(context: DealMutationContext): string {
  if (!context.actorId) throw new Error("Collaboration commands require an actor");
  return context.actorId;
}

function replayResult(domainEvent: StoredDomainEvent): CollaborationCommandResult {
  const ref = domainEvent.resultRef;
  const notificationId = ref && !Array.isArray(ref) && typeof ref === "object" &&
    typeof ref.notificationId === "string" ? ref.notificationId : null;
  return { kind: "REPLAY", notificationId, domainEvent };
}
