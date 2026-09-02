import { createHash, randomUUID } from "node:crypto";

export const DEAL_DOMAIN_EVENT_TYPES = [
  "DEAL_CREATED",
  "DEAL_STAGE_CHANGED",
  "DEAL_STATUS_CHANGED",
  "DEAL_WON",
  "DEAL_LOST",
  "DEAL_TOPIC_CHANGED",
  "DEAL_TYPE_CHANGED",
  "DEAL_VALUE_CHANGED",
  "DEAL_FIELDS_UPDATED",
  "DEAL_LOGISTICS_DATES_CHANGED",
  "DEAL_REFERENCE_CHANGED",
  "DEAL_DUE_DATE_CHANGED",
  "DEAL_DELETED",
  "ACTIVITY_CREATED",
  "ACTIVITY_EDITED",
  "ACTIVITY_DELETED",
  "REPLY_CREATED",
  "REPLY_EDITED",
  "REPLY_DELETED",
  "SYSTEM_ACTIVITY_CREATED",
  "OWNERSHIP_TRANSFER_REQUESTED",
  "OWNERSHIP_TRANSFER_REJECTED",
  "DEAL_OWNER_CHANGED",
  "TEAM_INVITE_REQUESTED",
  "TEAM_INVITE_REJECTED",
  "DEAL_MEMBER_ADDED",
  "DEAL_MEMBER_REMOVED",
  "NOTE_CREATED",
  "NOTE_DELETED",
  "NOTE_PIN_CHANGED",
  "ATTACHMENT_ADDED",
  "ATTACHMENT_DELETED",
  "ATTACHMENT_ARCHIVED",
] as const;

export type DealDomainEventType = (typeof DEAL_DOMAIN_EVENT_TYPES)[number];
export type DealDomainEventClass = "AI_SUMMARY" | "AUDIT_ONLY";

const AI_SUMMARY_EVENT_TYPES = new Set<DealDomainEventType>([
  "DEAL_STAGE_CHANGED",
  "DEAL_STATUS_CHANGED",
  "DEAL_WON",
  "DEAL_LOST",
  "DEAL_TOPIC_CHANGED",
  "DEAL_TYPE_CHANGED",
  "DEAL_VALUE_CHANGED",
  "DEAL_FIELDS_UPDATED",
  "DEAL_LOGISTICS_DATES_CHANGED",
  "DEAL_DUE_DATE_CHANGED",
  "ACTIVITY_CREATED",
  "ACTIVITY_EDITED",
  "REPLY_CREATED",
  "REPLY_EDITED",
  "DEAL_OWNER_CHANGED",
]);

export function classifyDealDomainEvent(eventType: DealDomainEventType): DealDomainEventClass {
  return AI_SUMMARY_EVENT_TYPES.has(eventType) ? "AI_SUMMARY" : "AUDIT_ONLY";
}

export function shouldEnqueueEventSummary(eventType: DealDomainEventType): boolean {
  return classifyDealDomainEvent(eventType) === "AI_SUMMARY";
}

export function hashActivityContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildEventSummaryDedupeKey(input: {
  domainEventId: string;
  promptVersion: string;
  schemaVersion: string;
}): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([
      "EVENT_SUMMARIZER",
      input.domainEventId,
      input.promptVersion,
      input.schemaVersion,
    ]))
    .digest("hex");

  return `event-summary:${digest}`;
}

export function createCommandId(): string {
  return randomUUID();
}

export function isCommandId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function getLocalEventDate(occurredAt: Date, timezone: string): string {
  if (Number.isNaN(occurredAt.getTime())) throw new Error("Invalid occurredAt");

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(occurredAt);

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  if (!values.year || !values.month || !values.day) throw new Error("Unable to derive local event date");

  return `${values.year}-${values.month}-${values.day}`;
}
