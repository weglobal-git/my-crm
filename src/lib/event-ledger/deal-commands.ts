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

export type DealStatus = "OPEN" | "WON" | "LOST" | "COMPLETED" | "CANCELLED";
export type DealType = "SALES_DEAL" | "INTERNAL_TASK" | "PARTNERSHIP";

export type DealRecord = {
  id: string;
  version: number;
  deletedAt: Date | null;
  pipelineStageId: string | null;
  status: DealStatus;
  topic: string;
  type: DealType;
  value: number | null;
  currency: string | null;
  dueDate: Date | null;
  goodsReadyDate: Date | null;
  goodsLoadingDate: Date | null;
  reserveId: string | null;
  invoiceId: string | null;
  lossReason: string | null;
  closedAt: Date | null;
};

export type DealPatch = Partial<Pick<DealRecord,
  | "topic"
  | "type"
  | "value"
  | "currency"
  | "goodsReadyDate"
  | "goodsLoadingDate"
  | "reserveId"
  | "invoiceId"
>>;

type DealUpdateData = Partial<Pick<DealRecord,
  | "pipelineStageId"
  | "status"
  | "topic"
  | "type"
  | "value"
  | "currency"
  | "dueDate"
  | "goodsReadyDate"
  | "goodsLoadingDate"
  | "reserveId"
  | "invoiceId"
  | "lossReason"
  | "closedAt"
>> & { version: { increment: 1 } };

export type DealLedgerTransaction = EventLedgerTransaction & {
  opportunity: {
    findUnique(args: {
      where: { id: string };
      select: Record<keyof DealRecord, true>;
    }): Promise<DealRecord | null>;
    updateMany(args: {
      where: { id: string; version: number; deletedAt: null };
      data: DealUpdateData;
    }): Promise<{ count: number }>;
  };
};

export type DealCommandResult =
  | { kind: "APPLIED"; dealId: string; version: number; domainEvent: StoredDomainEvent }
  | { kind: "NO_CHANGE"; dealId: string; version: number }
  | { kind: "REPLAY"; dealId: string; domainEvent: StoredDomainEvent };

export class DealNotFoundError extends Error {
  constructor() {
    super("Deal not found");
    this.name = "DealNotFoundError";
  }
}

export class DealVersionConflictError extends Error {
  constructor() {
    super("Deal changed or was deleted by another request");
    this.name = "DealVersionConflictError";
  }
}

export async function changeDealStageCommand(
  tx: DealLedgerTransaction,
  context: DealMutationContext,
  input: { dealId: string; expectedVersion: number; newStageId: string | null },
  flags: EventLedgerFeatureFlags,
  versions: EventSummaryVersions,
): Promise<DealCommandResult> {
  if (input.newStageId !== null && !input.newStageId.trim()) {
    throw new Error("newStageId must not be empty");
  }
  return applyDealChange(tx, context, {
    dealId: input.dealId,
    expectedVersion: input.expectedVersion,
    eventType: "DEAL_STAGE_CHANGED",
    buildPatch: deal => {
      if (deal.status !== "OPEN") throw new Error("Only open Deals can change stage");
      return { pipelineStageId: input.newStageId };
    },
  }, flags, versions);
}

export async function changeDealDueDateCommand(
  tx: DealLedgerTransaction,
  context: DealMutationContext,
  input: { dealId: string; expectedVersion: number; dueDate: Date | null; reason: string },
  flags: EventLedgerFeatureFlags,
  versions: EventSummaryVersions,
): Promise<DealCommandResult> {
  if (!input.reason.trim()) throw new Error("Due date change reason must not be empty");
  if (input.dueDate && Number.isNaN(input.dueDate.getTime())) throw new Error("Invalid dueDate");
  return applyDealChange(tx, context, {
    dealId: input.dealId,
    expectedVersion: input.expectedVersion,
    eventType: "DEAL_DUE_DATE_CHANGED",
    buildPatch: () => ({ dueDate: input.dueDate }),
    extraPayload: { reason: input.reason.trim() },
  }, flags, versions);
}

export async function updateDealFieldsCommand(
  tx: DealLedgerTransaction,
  context: DealMutationContext,
  input: { dealId: string; expectedVersion: number; patch: DealPatch },
  flags: EventLedgerFeatureFlags,
  versions: EventSummaryVersions,
): Promise<DealCommandResult> {
  validateDealPatch(input.patch);
  return applyDealChange(tx, context, {
    dealId: input.dealId,
    expectedVersion: input.expectedVersion,
    eventType: "DEAL_FIELDS_UPDATED",
    buildPatch: () => input.patch,
  }, flags, versions);
}

export async function finalizeDealCommand(
  tx: DealLedgerTransaction,
  context: DealMutationContext,
  input: {
    dealId: string;
    expectedVersion: number;
    outcome: "WON" | "LOST";
    wonFields?: Pick<DealPatch, "value" | "currency" | "goodsLoadingDate" | "invoiceId">;
    lossReason?: string;
  },
  flags: EventLedgerFeatureFlags,
  versions: EventSummaryVersions,
): Promise<DealCommandResult> {
  if (input.wonFields) validateDealPatch(input.wonFields);
  return applyDealChange(tx, context, {
    dealId: input.dealId,
    expectedVersion: input.expectedVersion,
    eventType: input.outcome === "WON" ? "DEAL_WON" : "DEAL_LOST",
    buildPatch: deal => {
      if (deal.status !== "OPEN") throw new Error("Only open Deals can be finalized");
      if (input.outcome === "LOST") {
        const lossReason = input.lossReason?.trim();
        if (!lossReason) throw new Error("Loss reason is required");
        return {
          status: "LOST",
          pipelineStageId: null,
          closedAt: context.occurredAt,
          lossReason,
        };
      }

      const patch = {
        ...input.wonFields,
        status: "WON" as const,
        pipelineStageId: null,
        closedAt: context.occurredAt,
        lossReason: null,
      };
      const final = { ...deal, ...patch };
      if (final.type === "SALES_DEAL" && (
        final.value === null || !final.currency || !final.goodsLoadingDate || !final.invoiceId
      )) {
        throw new Error("Won Sales Deal requires value, currency, loading date, and invoice number");
      }
      return patch;
    },
  }, flags, versions);
}

async function applyDealChange(
  tx: DealLedgerTransaction,
  context: DealMutationContext,
  command: {
    dealId: string;
    expectedVersion: number;
    eventType: DealDomainEventType;
    buildPatch: (deal: DealRecord) => Omit<DealUpdateData, "version">;
    extraPayload?: Record<string, JsonValue>;
  },
  flags: EventLedgerFeatureFlags,
  versions: EventSummaryVersions,
): Promise<DealCommandResult> {
  if (!context.actorId) throw new Error("Deal commands require an actor");
  const replay = await findCommandReplay(tx, {
    commandId: context.commandId,
    dealId: command.dealId,
    eventType: command.eventType,
  });
  if (replay) return { kind: "REPLAY", dealId: command.dealId, domainEvent: replay };

  const deal = await loadDeal(tx, command.dealId);
  assertExpectedVersion(deal, command.expectedVersion);
  const requestedPatch = command.buildPatch(deal);
  const { patch, changedFields } = changedDealFields(deal, requestedPatch);
  if (Object.keys(patch).length === 0) {
    return { kind: "NO_CHANGE", dealId: deal.id, version: deal.version };
  }

  const updated = await tx.opportunity.updateMany({
    where: { id: deal.id, version: command.expectedVersion, deletedAt: null },
    data: { ...patch, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new DealVersionConflictError();

  const nextVersion = deal.version + 1;
  const { domainEvent } = await recordDomainEvent(tx, context, {
    dealId: deal.id,
    eventType: command.eventType,
    sourceType: "OPPORTUNITY",
    sourceEntityId: deal.id,
    sourceVersion: nextVersion,
    payload: { changedFields, ...command.extraPayload },
    resultRef: { dealId: deal.id, version: nextVersion },
  }, flags, versions);

  return { kind: "APPLIED", dealId: deal.id, version: nextVersion, domainEvent };
}

async function loadDeal(tx: DealLedgerTransaction, dealId: string): Promise<DealRecord> {
  const deal = await tx.opportunity.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      version: true,
      deletedAt: true,
      pipelineStageId: true,
      status: true,
      topic: true,
      type: true,
      value: true,
      currency: true,
      dueDate: true,
      goodsReadyDate: true,
      goodsLoadingDate: true,
      reserveId: true,
      invoiceId: true,
      lossReason: true,
      closedAt: true,
    },
  });
  if (!deal) throw new DealNotFoundError();
  return deal;
}

function assertExpectedVersion(deal: DealRecord, expectedVersion: number): void {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("expectedVersion must be a positive safe integer");
  }
  if (deal.deletedAt || deal.version !== expectedVersion) throw new DealVersionConflictError();
}

function changedDealFields(
  deal: DealRecord,
  requested: Omit<DealUpdateData, "version">,
): { patch: Omit<DealUpdateData, "version">; changedFields: Record<string, JsonValue> } {
  const patch: Omit<DealUpdateData, "version"> = {};
  const changedFields: Record<string, JsonValue> = {};
  for (const [field, after] of Object.entries(requested)) {
    if (after === undefined) continue;
    const before = deal[field as keyof DealRecord];
    if (sameValue(before, after)) continue;
    Object.assign(patch, { [field]: after });
    changedFields[field] = { before: toJson(before), after: toJson(after) };
  }
  return { patch, changedFields };
}

function validateDealPatch(patch: DealPatch): void {
  if (patch.topic !== undefined && (!patch.topic.trim() || patch.topic.length > 500)) {
    throw new Error("Invalid topic");
  }
  if (patch.type !== undefined && !["SALES_DEAL", "INTERNAL_TASK", "PARTNERSHIP"].includes(patch.type)) {
    throw new Error("Invalid Deal type");
  }
  if (patch.currency !== undefined && patch.currency !== null &&
      !["THB", "USD", "EUR"].includes(patch.currency)) {
    throw new Error("Invalid currency");
  }
  if (patch.value !== undefined && patch.value !== null &&
      (!Number.isFinite(patch.value) || patch.value < 0)) {
    throw new Error("Invalid value");
  }
  for (const date of [patch.goodsReadyDate, patch.goodsLoadingDate]) {
    if (date !== undefined && date !== null && Number.isNaN(date.getTime())) {
      throw new Error("Invalid date");
    }
  }
}

function sameValue(before: unknown, after: unknown): boolean {
  if (before instanceof Date && after instanceof Date) return before.getTime() === after.getTime();
  return before === after;
}

function toJson(value: unknown): JsonValue {
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("Deal change contains a non-JSON value");
}
