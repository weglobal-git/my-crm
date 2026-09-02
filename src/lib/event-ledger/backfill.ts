import { hashActivityContent } from "./contracts";

export type BackfillActivity = {
  id: string;
  content: string;
  type: "COMMENT" | "SYSTEM_UPDATE";
  parentId: string | null;
  userId: string;
  version: number;
  deletedAt: Date | null;
  createdAt: Date;
  versionOneRevision: BackfillRevision | null;
};

export type BackfillRevision = {
  activityId: string;
  version: 1;
  changeType: "CREATED";
  content: string;
  contentHash: string;
  activityType: "COMMENT" | "SYSTEM_UPDATE";
  parentId: string | null;
  changedById: string | null;
  createdAt: Date;
};

export type BackfillPlanEntry = BackfillRevision;

export type ActivityBackfillReader = {
  readPage(args: {
    afterId: string | null;
    take: number;
    deletedAt: null;
    orderBy: { id: "asc" };
  }): Promise<BackfillActivity[]>;
};

export type BackfillPagePlan = {
  cursor: string | null;
  nextCursor: string | null;
  done: boolean;
  scannedCount: number;
  plannedCount: number;
  alreadyCompleteCount: number;
  entries: BackfillPlanEntry[];
};

export class BackfillSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackfillSafetyError";
  }
}

export async function planActivityRevisionBackfillPage(
  reader: ActivityBackfillReader,
  input: { cursor?: string; batchSize?: number },
): Promise<BackfillPagePlan> {
  const cursor = input.cursor?.trim() || null;
  const batchSize = input.batchSize ?? 100;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("batchSize must be an integer between 1 and 500");
  }

  const rows = await reader.readPage({
    afterId: cursor,
    take: batchSize + 1,
    deletedAt: null,
    orderBy: { id: "asc" },
  });
  if (rows.length > batchSize + 1) throw new BackfillSafetyError("Reader returned too many rows");
  validateReaderOrder(rows, cursor);

  const page = rows.slice(0, batchSize);
  const entries: BackfillPlanEntry[] = [];
  let alreadyCompleteCount = 0;
  for (const activity of page) {
    validateActivity(activity);
    if (activity.versionOneRevision) {
      assertStoredRevisionIntegrity(activity, activity.versionOneRevision);
      alreadyCompleteCount += 1;
    } else {
      if (activity.version !== 1) {
        throw new BackfillSafetyError(
          `Activity ${activity.id} is version ${activity.version}; original content is uncertain`,
        );
      }
      entries.push(revisionFromActivity(activity));
    }
  }

  const nextCursor = page.at(-1)?.id ?? null;
  return {
    cursor,
    nextCursor,
    done: rows.length <= batchSize,
    scannedCount: page.length,
    plannedCount: entries.length,
    alreadyCompleteCount,
    entries,
  };
}

export function verifyBackfillCounts(input: {
  activeActivityCount: number;
  versionOneRevisionCount: number;
  duplicateVersionOneCount: number;
  parityMismatchCount: number;
}): { complete: boolean; reasons: string[] } {
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  }
  const reasons: string[] = [];
  if (input.activeActivityCount !== input.versionOneRevisionCount) {
    reasons.push("active Activity and version-1 revision counts differ");
  }
  if (input.duplicateVersionOneCount !== 0) reasons.push("duplicate version-1 revisions exist");
  if (input.parityMismatchCount !== 0) reasons.push("revision content or provenance parity mismatches exist");
  return { complete: reasons.length === 0, reasons };
}

function revisionFromActivity(activity: BackfillActivity): BackfillPlanEntry {
  return {
    activityId: activity.id,
    version: 1,
    changeType: "CREATED",
    content: activity.content,
    contentHash: hashActivityContent(activity.content),
    activityType: activity.type,
    parentId: activity.parentId,
    changedById: activity.userId,
    createdAt: new Date(activity.createdAt),
  };
}

function validateActivity(activity: BackfillActivity): void {
  if (!activity.id.trim() || !activity.userId.trim()) {
    throw new BackfillSafetyError("Activity ID and author are required");
  }
  if (activity.deletedAt !== null) throw new BackfillSafetyError("Reader returned a deleted Activity");
  if (!Number.isSafeInteger(activity.version) || activity.version < 1) {
    throw new BackfillSafetyError(`Activity ${activity.id} has an invalid version`);
  }
  validateDate("Activity createdAt", activity.createdAt);
}

function assertStoredRevisionIntegrity(activity: BackfillActivity, actual: BackfillRevision): void {
  const same = activity.id === actual.activityId &&
    actual.version === 1 &&
    actual.changeType === "CREATED" &&
    hashActivityContent(actual.content) === actual.contentHash &&
    activity.type === actual.activityType &&
    activity.parentId === actual.parentId &&
    activity.userId === actual.changedById &&
    activity.createdAt.getTime() === actual.createdAt.getTime() &&
    (activity.version > 1 || (
      activity.content === actual.content &&
      hashActivityContent(activity.content) === actual.contentHash
    ));
  if (!same) throw new BackfillSafetyError(`Activity ${activity.id} revision parity mismatch`);
}

function validateReaderOrder(rows: BackfillActivity[], cursor: string | null): void {
  let previous = cursor;
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) throw new BackfillSafetyError(`Reader returned duplicate Activity ${row.id}`);
    if (previous !== null && row.id <= previous) {
      throw new BackfillSafetyError("Reader must return IDs strictly after cursor in ascending order");
    }
    seen.add(row.id);
    previous = row.id;
  }
}

function validateDate(name: string, value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new BackfillSafetyError(`${name} must be valid`);
  }
}
