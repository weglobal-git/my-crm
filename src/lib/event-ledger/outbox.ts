export type OutboxStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD" | "CANCELLED";

export type ClaimedOutboxItem = {
  id: string;
  domainEventId: string;
  dealId: string;
  agentKey: "EVENT_SUMMARIZER";
  promptVersion: string;
  schemaVersion: string;
  status: "PROCESSING";
  attempts: number;
  maxAttempts: number;
  lockedBy: string;
  leaseUntil: Date;
  traceId: string;
};

export type OutboxClaimPersistence = {
  reapExhausted(args: { now: Date }): Promise<{ count: number }>;
  claimEligible(args: {
    now: Date;
    leaseUntil: Date;
    workerId: string;
    batchSize: number;
  }): Promise<ClaimedOutboxItem[]>;
};

type OutboxUpdateWhere = {
  id: string;
  status: "PROCESSING";
  lockedBy: string;
  attempts: number;
  leaseUntil: { gt: Date };
};

type OutboxUpdateData = {
  status?: "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD";
  lockedBy?: string | null;
  leaseUntil?: Date | null;
  availableAt?: Date;
  lastErrorCode?: string | null;
  completedAt?: Date | null;
};

export type OutboxUpdatePersistence = {
  agentOutbox: {
    updateMany(args: {
      where: OutboxUpdateWhere;
      data: OutboxUpdateData;
    }): Promise<{ count: number }>;
  };
};

export class OutboxLeaseLostError extends Error {
  constructor() {
    super("Outbox lease was lost or superseded");
    this.name = "OutboxLeaseLostError";
  }
}

export async function claimOutboxBatch(
  persistence: OutboxClaimPersistence,
  input: { now: Date; workerId: string; batchSize: number; leaseMs: number },
): Promise<{ items: ClaimedOutboxItem[]; reapedCount: number }> {
  validateDate("now", input.now);
  assertNonEmpty("workerId", input.workerId);
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 100) {
    throw new Error("batchSize must be an integer between 1 and 100");
  }
  if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 5_000 || input.leaseMs > 15 * 60_000) {
    throw new Error("leaseMs must be between 5 seconds and 15 minutes");
  }

  const leaseUntil = new Date(input.now.getTime() + input.leaseMs);
  const reaped = await persistence.reapExhausted({ now: input.now });
  if (!Number.isSafeInteger(reaped.count) || reaped.count < 0) {
    throw new Error("Claim adapter returned an invalid reap count");
  }
  const items = await persistence.claimEligible({
    now: input.now,
    leaseUntil,
    workerId: input.workerId,
    batchSize: input.batchSize,
  });
  if (items.length > input.batchSize) throw new Error("Claim adapter returned more rows than requested");
  for (const item of items) validateClaim(item, input.workerId, input.now, leaseUntil);

  return { items, reapedCount: reaped.count };
}

export async function completeOutboxItem(
  persistence: OutboxUpdatePersistence,
  claim: ClaimedOutboxItem,
  now: Date,
): Promise<void> {
  validateOwnedLease(claim, now);
  await updateOwnedItem(persistence, claim, now, {
    status: "COMPLETED",
    lockedBy: null,
    leaseUntil: null,
    lastErrorCode: null,
    completedAt: now,
  });
}

export async function failOutboxItem(
  persistence: OutboxUpdatePersistence,
  claim: ClaimedOutboxItem,
  input: { now: Date; errorCode: string; baseDelayMs?: number; maxDelayMs?: number },
): Promise<{ status: "FAILED" | "DEAD"; availableAt: Date | null }> {
  validateOwnedLease(claim, input.now);
  const errorCode = normalizeErrorCode(input.errorCode);
  const exhausted = claim.attempts >= claim.maxAttempts;
  if (exhausted) {
    await updateOwnedItem(persistence, claim, input.now, {
      status: "DEAD",
      lockedBy: null,
      leaseUntil: null,
      lastErrorCode: errorCode,
      completedAt: input.now,
    });
    return { status: "DEAD", availableAt: null };
  }

  const delayMs = retryDelayMs(claim.attempts, input.baseDelayMs, input.maxDelayMs);
  const availableAt = new Date(input.now.getTime() + delayMs);
  await updateOwnedItem(persistence, claim, input.now, {
    status: "FAILED",
    lockedBy: null,
    leaseUntil: null,
    availableAt,
    lastErrorCode: errorCode,
    completedAt: null,
  });
  return { status: "FAILED", availableAt };
}

export async function extendOutboxLease(
  persistence: OutboxUpdatePersistence,
  claim: ClaimedOutboxItem,
  input: { now: Date; extensionMs: number },
): Promise<Date> {
  validateOwnedLease(claim, input.now);
  if (!Number.isSafeInteger(input.extensionMs) || input.extensionMs < 5_000 ||
      input.extensionMs > 15 * 60_000) {
    throw new Error("extensionMs must be between 5 seconds and 15 minutes");
  }
  const requestedLease = new Date(input.now.getTime() + input.extensionMs);
  const leaseUntil = new Date(Math.max(claim.leaseUntil.getTime(), requestedLease.getTime()));
  await updateOwnedItem(persistence, claim, input.now, {
    status: "PROCESSING",
    leaseUntil,
  });
  return leaseUntil;
}

export function retryDelayMs(attempt: number, baseDelayMs = 5_000, maxDelayMs = 5 * 60_000): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error("attempt must be a positive integer");
  if (!Number.isSafeInteger(baseDelayMs) || baseDelayMs < 1) throw new Error("baseDelayMs must be positive");
  if (!Number.isSafeInteger(maxDelayMs) || maxDelayMs < baseDelayMs) {
    throw new Error("maxDelayMs must be at least baseDelayMs");
  }
  return Math.min(maxDelayMs, baseDelayMs * (2 ** Math.min(attempt - 1, 30)));
}

async function updateOwnedItem(
  persistence: OutboxUpdatePersistence,
  claim: ClaimedOutboxItem,
  now: Date,
  data: OutboxUpdateData,
): Promise<void> {
  const result = await persistence.agentOutbox.updateMany({
    where: {
      id: claim.id,
      status: "PROCESSING",
      lockedBy: claim.lockedBy,
      attempts: claim.attempts,
      leaseUntil: { gt: now },
    },
    data,
  });
  if (result.count !== 1) throw new OutboxLeaseLostError();
}

function validateClaim(
  item: ClaimedOutboxItem,
  workerId: string,
  now: Date,
  expectedLeaseUntil?: Date,
): void {
  if (item.status !== "PROCESSING" || item.lockedBy !== workerId) {
    throw new Error("Claim adapter returned an item not owned by this worker");
  }
  if (!Number.isSafeInteger(item.attempts) || item.attempts < 1 || item.attempts > item.maxAttempts) {
    throw new Error("Claim adapter returned invalid attempt fencing data");
  }
  validateDate("leaseUntil", item.leaseUntil);
  if (item.leaseUntil.getTime() <= now.getTime()) throw new Error("Claim adapter returned an expired lease");
  if (expectedLeaseUntil && item.leaseUntil.getTime() !== expectedLeaseUntil.getTime()) {
    throw new Error("Claim adapter returned an unexpected lease expiry");
  }
}

function validateOwnedLease(claim: ClaimedOutboxItem, now: Date): void {
  validateDate("now", now);
  validateClaim(claim, claim.lockedBy, new Date(now.getTime() - 1));
  if (claim.leaseUntil.getTime() <= now.getTime()) throw new OutboxLeaseLostError();
}

function normalizeErrorCode(errorCode: string): string {
  const normalized = errorCode.trim().toUpperCase();
  if (!/^[A-Z0-9_:-]{1,100}$/.test(normalized)) {
    throw new Error("errorCode must be a short non-sensitive machine code");
  }
  return normalized;
}

function validateDate(name: string, value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`${name} must be valid`);
}

function assertNonEmpty(name: string, value: string): void {
  if (!value.trim()) throw new Error(`${name} must not be empty`);
}
