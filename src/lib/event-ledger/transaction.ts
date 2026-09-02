import {
  buildEventSummaryDedupeKey,
  classifyDealDomainEvent,
  getLocalEventDate,
  isCommandId,
  type DealDomainEventClass,
  type DealDomainEventType,
} from "./contracts";
import type { EventLedgerFeatureFlags } from "./feature-flags";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DealDomainSourceType =
  | "OPPORTUNITY"
  | "ACTIVITY"
  | "NOTE"
  | "ATTACHMENT"
  | "NOTIFICATION";

export type DealMutationContext = {
  actorId: string | null;
  commandId: string;
  correlationId: string;
  traceId: string;
  occurredAt: Date;
  timezone: string;
};

export type DomainEventInput = {
  dealId: string;
  eventType: DealDomainEventType;
  sourceType: DealDomainSourceType;
  sourceEntityId: string;
  sourceVersion: number;
  activityRevisionId?: string;
  payload: JsonValue;
  resultRef?: JsonValue;
};

export type EventSummaryVersions = {
  promptVersion: string;
  schemaVersion: string;
  maxAttempts?: number;
};

export type StoredDomainEvent = {
  id: string;
  dealId: string;
  eventType: DealDomainEventType;
  processingClass: DealDomainEventClass;
  commandId: string;
  resultRef: JsonValue | null;
};

type DomainEventCreateData = {
  dealId: string;
  eventType: DealDomainEventType;
  processingClass: DealDomainEventClass;
  sourceType: DealDomainSourceType;
  sourceEntityId: string;
  sourceVersion: number;
  activityRevisionId?: string;
  actorId: string | null;
  commandId: string;
  correlationId: string;
  traceId: string;
  payloadVersion: 1;
  payload: JsonValue;
  resultRef?: JsonValue;
  occurredAt: Date;
  localEventDate: Date;
  timezone: string;
};

type OutboxCreateData = {
  domainEventId: string;
  dealId: string;
  agentKey: "EVENT_SUMMARIZER";
  promptVersion: string;
  schemaVersion: string;
  dedupeKey: string;
  maxAttempts: number;
  traceId: string;
};

export type EventLedgerTransaction = {
  dealDomainEvent: {
    findUnique(args: {
      where: { commandId: string };
      select: {
        id: true;
        dealId: true;
        eventType: true;
        processingClass: true;
        commandId: true;
        resultRef: true;
      };
    }): Promise<StoredDomainEvent | null>;
    create(args: { data: DomainEventCreateData }): Promise<StoredDomainEvent>;
  };
  agentOutbox: {
    upsert(args: {
      where: { dedupeKey: string };
      update: Record<string, never>;
      create: OutboxCreateData;
      select: { id: true };
    }): Promise<{ id: string }>;
  };
};

export class CommandReplayConflictError extends Error {
  constructor() {
    super("commandId already belongs to a different deal or event type");
    this.name = "CommandReplayConflictError";
  }
}

export async function findCommandReplay(
  tx: EventLedgerTransaction,
  expected: Pick<DomainEventInput, "dealId" | "eventType"> & { commandId: string },
): Promise<StoredDomainEvent | null> {
  assertNonEmpty("dealId", expected.dealId);
  assertCommandId(expected.commandId);

  const existing = await tx.dealDomainEvent.findUnique({
    where: { commandId: expected.commandId },
    select: {
      id: true,
      dealId: true,
      eventType: true,
      processingClass: true,
      commandId: true,
      resultRef: true,
    },
  });

  if (existing && (existing.dealId !== expected.dealId || existing.eventType !== expected.eventType)) {
    throw new CommandReplayConflictError();
  }

  return existing;
}

export async function recordDomainEvent(
  tx: EventLedgerTransaction,
  context: DealMutationContext,
  input: DomainEventInput,
  flags: EventLedgerFeatureFlags,
  versions?: EventSummaryVersions,
): Promise<{ domainEvent: StoredDomainEvent; outboxId: string | null }> {
  if (!flags.writeEnabled) {
    throw new Error("Event Ledger writes are disabled");
  }

  validateContext(context);
  validateInput(input);

  const processingClass = classifyDealDomainEvent(input.eventType);
  const shouldEnqueue = processingClass === "AI_SUMMARY" && flags.aiEnqueueEnabled;
  let enqueueVersions: EventSummaryVersions | null = null;
  if (shouldEnqueue) {
    if (!versions) throw new Error("Event Summary versions are required when enqueue is enabled");
    validateVersions(versions);
    enqueueVersions = versions;
  }
  const domainEvent = await tx.dealDomainEvent.create({
    data: {
      dealId: input.dealId,
      eventType: input.eventType,
      processingClass,
      sourceType: input.sourceType,
      sourceEntityId: input.sourceEntityId,
      sourceVersion: input.sourceVersion,
      activityRevisionId: input.activityRevisionId,
      actorId: context.actorId,
      commandId: context.commandId,
      correlationId: context.correlationId,
      traceId: context.traceId,
      payloadVersion: 1,
      payload: input.payload,
      resultRef: input.resultRef,
      occurredAt: context.occurredAt,
      localEventDate: toDateOnly(getLocalEventDate(context.occurredAt, context.timezone)),
      timezone: context.timezone,
    },
  });

  if (!shouldEnqueue) {
    return { domainEvent, outboxId: null };
  }
  if (!enqueueVersions) throw new Error("Event Summary versions were not resolved");

  const dedupeKey = buildEventSummaryDedupeKey({
    domainEventId: domainEvent.id,
    promptVersion: enqueueVersions.promptVersion,
    schemaVersion: enqueueVersions.schemaVersion,
  });
  const outbox = await tx.agentOutbox.upsert({
    where: { dedupeKey },
    update: {},
    create: {
      domainEventId: domainEvent.id,
      dealId: input.dealId,
      agentKey: "EVENT_SUMMARIZER",
      promptVersion: enqueueVersions.promptVersion,
      schemaVersion: enqueueVersions.schemaVersion,
      dedupeKey,
      maxAttempts: enqueueVersions.maxAttempts ?? 2,
      traceId: context.traceId,
    },
    select: { id: true },
  });

  return { domainEvent, outboxId: outbox.id };
}

function validateContext(context: DealMutationContext): void {
  assertCommandId(context.commandId);
  assertNonEmpty("correlationId", context.correlationId);
  assertNonEmpty("traceId", context.traceId);
  assertNonEmpty("timezone", context.timezone);
  getLocalEventDate(context.occurredAt, context.timezone);
}

function validateInput(input: DomainEventInput): void {
  assertNonEmpty("dealId", input.dealId);
  assertNonEmpty("sourceEntityId", input.sourceEntityId);
  if (!Number.isSafeInteger(input.sourceVersion) || input.sourceVersion < 1) {
    throw new Error("sourceVersion must be a positive safe integer");
  }
  assertJsonValue(input.payload, "payload");
  if (input.resultRef !== undefined) assertJsonValue(input.resultRef, "resultRef");
}

function validateVersions(versions: EventSummaryVersions): void {
  assertNonEmpty("promptVersion", versions.promptVersion);
  assertNonEmpty("schemaVersion", versions.schemaVersion);
  if (versions.maxAttempts !== undefined &&
      (!Number.isSafeInteger(versions.maxAttempts) || versions.maxAttempts < 1)) {
    throw new Error("maxAttempts must be a positive safe integer");
  }
}

function assertCommandId(commandId: string): void {
  if (!isCommandId(commandId)) throw new Error("commandId must be a UUID");
}

function assertNonEmpty(name: string, value: string): void {
  if (!value.trim()) throw new Error(`${name} must not be empty`);
}

function assertJsonValue(value: unknown, path: string, seen = new Set<object>()): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain finite numbers`);
    return;
  }
  if (typeof value !== "object") throw new Error(`${path} must be JSON-compatible`);
  if (seen.has(value)) throw new Error(`${path} must not contain cycles`);

  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`, seen));
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error(`${path} must contain only plain objects`);
    }
    for (const [key, item] of Object.entries(value)) {
      assertJsonValue(item, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function toDateOnly(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}
