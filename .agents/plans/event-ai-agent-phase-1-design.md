# Event AI Agent — Phase 1 Migration & Transaction Design

> Status: Design approved for review; no migration applied  
> Phase: Immutable Event Ledger and Reliable Outbox  
> Depends on: `event-ai-agent-phase-0-spec.md`

## 1. Phase 1 outcome

After Phase 1:

- Activity create/edit/delete/reply preserves every source version.
- Deal mutations produce one canonical server-side `DealDomainEvent` per user intent.
- `AI_SUMMARY` events create one durable `AgentOutbox` row in the same database transaction.
- Pusher, notifications, Cloudinary, Google Drive, and future LLM calls cannot change whether a CRM mutation succeeded.
- Client retries use a stable command ID and cannot duplicate the mutation/domain event/outbox work.
- Production AI remains disabled. Phase 1 proves the event foundation only.

## 2. Migration strategy

Use multiple additive releases rather than one destructive migration.

### Migration A — Additive ledger foundation

Add:

- enums for revisions, domain events, processing class, agent key, and outbox state
- `ActivityLog.version`, `deletedAt`, `deletedById`, `sourceDomainEventId`
- `Opportunity.version`, `deletedAt`, `deletedById`
- `ActivityRevision`
- `DealDomainEvent`
- `AgentOutbox`
- indexes and nullable relations

Do not change existing foreign-key cascade behavior in Migration A. New ledger ownership relations temporarily use `CASCADE` while legacy hard-delete code exists. Ledger writes and backfill stay disabled until soft delete is enabled; a later migration changes these new relations to `RESTRICT`.

### Release B — Deploy compatible runtime paths with flags off

Introduce server-owned transaction/soft-delete helpers with all Event AI flags disabled. Existing behavior remains active while tests prove the new paths.

### Release C — Soft-delete cutover, then Backfill A

Enable soft delete for the initial cohort before creating durable revision/event rows. After soft delete is verified, run the existing Activity source revision backfill.

Run an idempotent application script in bounded batches:

1. Select ActivityLogs without revision version 1.
2. Create an `ActivityRevision` with `changeType=CREATED`, current content, author, type, parent ID, and content hash.
3. Do not create domain events or outbox rows for historical records.
4. Record batch cursor/count and allow safe restart.
5. Verify every non-deleted ActivityLog has exactly one version-1 revision before enabling dual-write.

Backfill must not call Pusher, notifications, or AI.

### Release D — Dual-write behind flags

Introduce server-owned transaction helpers and enable:

```text
EVENT_LEDGER_WRITE_ENABLED=true
EVENT_AI_ENQUEUE_ENABLED=false
```

All new mutations write canonical data and ledger data atomically. AI remains off. Compare current Activity/Deal projections against domain events in staging and canary production.

### Migration B — Restrictive ledger foreign keys

After soft delete and backfill are verified, change ledger ownership foreign keys from temporary `CASCADE` to `RESTRICT`. Physical purge becomes a separate audited retention process.

### Release E — Remove duplicate projections

- remove client-created System Logs for topic/type/team changes
- remove premature transferred-ownership System Log
- replace Won/Lost two-call client flow with one server command
- tag server-created display logs with `sourceDomainEventId`

### Release F — Outbox worker dry run

Claim and complete synthetic/dry-run outbox records without calling a provider. Verify leases, retry, dedupe, queue metrics, and dead-letter behavior. AI enqueue remains disabled until later phases.

## 3. Proposed Prisma additions

This is a design block, not a patch to `prisma/schema.prisma` yet.

```prisma
enum ActivityRevisionChangeType {
  CREATED
  EDITED
  DELETED
}

enum DealDomainEventClass {
  AI_SUMMARY
  AUDIT_ONLY
}

enum DealDomainEventType {
  DEAL_CREATED
  DEAL_STAGE_CHANGED
  DEAL_STATUS_CHANGED
  DEAL_WON
  DEAL_LOST
  DEAL_TOPIC_CHANGED
  DEAL_TYPE_CHANGED
  DEAL_VALUE_CHANGED
  DEAL_LOGISTICS_DATES_CHANGED
  DEAL_REFERENCE_CHANGED
  DEAL_DUE_DATE_CHANGED
  DEAL_DELETED
  ACTIVITY_CREATED
  ACTIVITY_EDITED
  ACTIVITY_DELETED
  REPLY_CREATED
  REPLY_EDITED
  REPLY_DELETED
  SYSTEM_ACTIVITY_CREATED
  OWNERSHIP_TRANSFER_REQUESTED
  OWNERSHIP_TRANSFER_REJECTED
  DEAL_OWNER_CHANGED
  TEAM_INVITE_REQUESTED
  TEAM_INVITE_REJECTED
  DEAL_MEMBER_ADDED
  DEAL_MEMBER_REMOVED
  NOTE_CREATED
  NOTE_DELETED
  NOTE_PIN_CHANGED
  ATTACHMENT_ADDED
  ATTACHMENT_DELETED
  ATTACHMENT_ARCHIVED
}

enum DealDomainSourceType {
  OPPORTUNITY
  ACTIVITY
  NOTE
  ATTACHMENT
  NOTIFICATION
}

enum AgentKey {
  EVENT_SUMMARIZER
}

enum AgentOutboxStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  DEAD
  CANCELLED
}

model ActivityRevision {
  id             String                     @id @default(cuid())
  activityId     String
  activity       ActivityLog                @relation(fields: [activityId], references: [id], onDelete: Restrict)
  version        Int
  changeType     ActivityRevisionChangeType
  content        String                     @db.Text
  contentHash    String
  activityType   ActivityLogType
  parentId       String?
  changedById    String?
  changedBy      User?                      @relation("ActivityRevisionChangedBy", fields: [changedById], references: [id], onDelete: SetNull)
  createdAt      DateTime                   @default(now())

  domainEvent DealDomainEvent?

  @@unique([activityId, version])
  @@index([activityId, createdAt])
  @@index([contentHash])
}

model DealDomainEvent {
  id                 String               @id @default(cuid())
  dealId             String
  deal               Opportunity          @relation(fields: [dealId], references: [id], onDelete: Restrict)
  eventType           DealDomainEventType
  processingClass     DealDomainEventClass
  sourceType          DealDomainSourceType
  sourceEntityId      String
  sourceVersion       Int
  activityRevisionId String?              @unique
  activityRevision   ActivityRevision?    @relation(fields: [activityRevisionId], references: [id], onDelete: Restrict)
  actorId             String?
  actor               User?               @relation("DealDomainEventActor", fields: [actorId], references: [id], onDelete: SetNull)
  commandId           String               @unique
  correlationId       String
  traceId             String
  payload             Json
  resultRef           Json?
  occurredAt          DateTime             @default(now())
  localEventDate      DateTime             @db.Date
  timezone            String
  createdAt           DateTime             @default(now())

  projections ActivityLog[] @relation("ActivityLogProjection")
  outbox      AgentOutbox[]

  @@index([dealId, occurredAt])
  @@index([dealId, localEventDate, occurredAt])
  @@index([sourceType, sourceEntityId, sourceVersion])
  @@index([correlationId])
  @@index([traceId])
}

model AgentOutbox {
  id             String            @id @default(cuid())
  domainEventId  String
  domainEvent    DealDomainEvent   @relation(fields: [domainEventId], references: [id], onDelete: Restrict)
  dealId         String
  agentKey       AgentKey
  promptVersion  String
  schemaVersion  String
  dedupeKey      String            @unique
  status         AgentOutboxStatus @default(PENDING)
  priority       Int               @default(0)
  availableAt    DateTime          @default(now())
  leaseUntil     DateTime?
  lockedBy       String?
  attempts       Int               @default(0)
  maxAttempts    Int               @default(2)
  lastErrorCode  String?
  traceId        String
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  completedAt    DateTime?

  @@unique([domainEventId, agentKey, promptVersion, schemaVersion])
  @@index([status, availableAt, priority])
  @@index([leaseUntil])
  @@index([dealId, createdAt])
  @@index([traceId])
}
```

Proposed additions to existing models:

```prisma
model Opportunity {
  // existing fields...
  version       Int       @default(1)
  deletedAt     DateTime?
  deletedById   String?
  deletedBy     User?     @relation("OpportunityDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull)
  domainEvents  DealDomainEvent[]

  @@index([deletedAt, status, updatedAt])
}

model ActivityLog {
  // existing fields...
  version             Int              @default(1)
  deletedAt           DateTime?
  deletedById         String?
  deletedBy           User?            @relation("ActivityDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull)
  sourceDomainEventId String?
  sourceDomainEvent   DealDomainEvent? @relation("ActivityLogProjection", fields: [sourceDomainEventId], references: [id], onDelete: SetNull)
  revisions           ActivityRevision[]

  @@index([opportunityId, deletedAt, parentId, createdAt])
  @@index([sourceDomainEventId])
}

model User {
  // existing fields...
  changedActivityRevisions ActivityRevision[] @relation("ActivityRevisionChangedBy")
  deletedActivities        ActivityLog[]      @relation("ActivityDeletedBy")
  deletedOpportunities     Opportunity[]      @relation("OpportunityDeletedBy")
  actedDealDomainEvents    DealDomainEvent[]  @relation("DealDomainEventActor")
}
```

## 4. Why domain payload is JSON

The immutable event envelope is strongly typed by enums and relational identifiers. Event-specific before/after fields vary widely, so `payload Json` avoids a sparse table while preserving an explicit TypeScript/Zod schema per `eventType`.

Rules:

- validate payload before database write
- store only canonical IDs/scalars and before/after values
- never store base64 files, provider secrets, Pusher payloads, or an LLM prompt
- version the payload contract through application code; add `payloadVersion` before implementation if more than v1 is expected during Phase 1

Recommendation: add `payloadVersion Int @default(1)` to the final schema patch.

## 5. Command idempotency contract

Every mutating client intent generates a UUID `commandId` once and reuses it for retries. The server generates `traceId`; related technical operations share `correlationId`.

Server behavior:

1. Validate actor/permission and input.
2. Look for an existing `DealDomainEvent.commandId`.
3. If found, verify the event type/deal match and return its canonical `resultRef`/fresh projection rather than reapply mutation.
4. Otherwise perform the mutation and insert the event in one transaction.
5. A unique conflict on `commandId` is treated as a replay and resolved by re-reading the winning event.

The server may generate a command ID for old clients during transition, but that cannot deduplicate a network retry. Client-provided stable IDs are required before Phase 1 exit.

## 6. Transaction helper boundaries

Suggested server-owned functions:

```ts
type DealMutationContext = {
  actor: PipelineActor;
  commandId: string;
  correlationId: string;
  traceId: string;
  occurredAt: Date;
  timezone: "Asia/Bangkok";
};

createDomainEvent(tx, context, eventInput)
enqueueEventSummary(tx, domainEvent, versions)
createSystemProjection(tx, domainEvent, projectionInput)
```

`createDomainEvent` conditionally creates `AgentOutbox` only for `AI_SUMMARY`. It does not call Pusher, external APIs, or AI.

## 7. Mutation transaction designs

### 7.1 Create activity/reply

Before transaction:

- authorize deal access
- validate content/parent relationship
- parse mentions only to determine notification recipients; avoid unbounded all-user query

One transaction:

1. Check command replay.
2. Create `ActivityLog(version=1)`.
3. Create `ActivityRevision(version=1, CREATED)` with hash.
4. Create `ACTIVITY_CREATED` or `REPLY_CREATED` domain event.
5. Create outbox row.
6. Create notification database rows.
7. Store event `resultRef`.

After commit:

- return canonical activity immediately
- publish targeted Activity and notification Pusher events with event/version IDs
- Pusher failure is logged/retried separately and does not change response success

### 7.2 Edit activity/reply

Use optimistic concurrency:

- client sends `expectedVersion`
- conditional `updateMany where { id, version: expectedVersion, deletedAt: null }`
- atomically increment version and update current content
- if count is zero, return a conflict and current canonical record

Same transaction creates the next immutable revision, canonical edit event, and outbox row. Do not overwrite or delete older revisions.

### 7.3 Delete activity/reply

Use the same expected-version check. Set `deletedAt`, `deletedById`, increment version, and create a `DELETED` revision plus audit-only domain event. Replies are not physically cascaded. UI hides deleted rows by default. Later Event AI logic retracts the current summary projection.

Attachment cleanup referenced inside Activity content is a separate cleanup job after commit; deletion of raw Activity history cannot depend on Cloudinary success.

### 7.4 Update deal fields

Use `Opportunity.version` and one command endpoint. In a serializable or optimistic transaction:

1. Load allowed current fields.
2. Compute validated changed-field diff.
3. Return without event for a no-op.
4. Conditional update by expected version.
5. Create exactly one specific domain event from the diff.
6. Create outbox only for `AI_SUMMARY` classifications.
7. Create optional System Log projection linked by `sourceDomainEventId`.

Avoid a generic event when a deterministic business event exists. If one Save changes value and logistics dates, use one `DEAL_FIELDS_UPDATED` event only if the product wants one user-intent summary; otherwise split commands at the UI boundary, not inside the transaction.

Before implementation, either add `DEAL_FIELDS_UPDATED` to the enum or make Customer Information Save a clearly defined single event. Recommended: add `DEAL_FIELDS_UPDATED` for multi-field form saves and include typed changed fields.

### 7.5 Won/Lost

Replace the client sequence with:

```ts
finalizeOpportunity({
  dealId,
  commandId,
  expectedVersion,
  outcome: "WON" | "LOST",
  wonFields?,
  lossReason?
})
```

One transaction validates requirements, updates all fields/status/closedAt, increments version, creates `DEAL_WON` or `DEAL_LOST`, creates one outbox row, and creates one linked System Log projection.

### 7.6 Due date

One transaction updates due date, creates `DEAL_DUE_DATE_CHANGED`, creates its outbox, and optionally creates existing comment/system display projections linked to the same event. The projections cannot create their own Activity domain events.

Longer-term UI can render the canonical event directly and remove duplicate Activity rows.

### 7.7 Transfer and invites

Request transaction:

- create notification/request
- create audit-only requested event
- no completed-transfer System Log

Response transaction:

- atomically claim pending notification
- on rejection, create audit-only rejection event
- on acceptance, mutate owner/member and create `DEAL_OWNER_CHANGED` or `DEAL_MEMBER_ADDED`
- create outbox only for owner change according to Phase 0 classification
- create truthful System Log linked to accepted event

### 7.8 Notes

Create/delete/pin mutations create audit-only domain events. Phase 1 should introduce Note soft-delete/revisions only if Note audit retention is required immediately. Since Notes are excluded from AI v1, recommended scope is:

- add `deletedAt/deletedById/version` to Note in a follow-up Phase 1B migration
- do not block Activity/event ledger rollout on Note revision history

### 7.9 Attachments and external APIs

Upload saga:

1. Upload externally using a deterministic object key derived from command ID.
2. Database transaction creates Attachment + `ATTACHMENT_ADDED` audit event.
3. If DB commit fails, enqueue/attempt idempotent orphan cleanup.

Delete saga:

1. Database transaction marks attachment `DELETION_PENDING`/tombstoned and creates `ATTACHMENT_DELETED` audit event.
2. Cleanup worker deletes Cloudinary/Drive objects idempotently.
3. Mark cleanup complete; retain metadata required for audit.

Never delete external files first and then hope the database transaction succeeds.

## 8. Outbox claiming protocol

Prisma does not expose all row-lock queue semantics ergonomically. Use a small reviewed PostgreSQL statement through `$queryRaw` inside a transaction:

```sql
SELECT id
FROM "AgentOutbox"
WHERE status = 'PENDING'
  AND "availableAt" <= NOW()
  AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW())
ORDER BY priority DESC, "availableAt" ASC
FOR UPDATE SKIP LOCKED
LIMIT $batch_size;
```

Then update claimed rows to `PROCESSING`, increment attempts, set `lockedBy` and `leaseUntil`, and commit before doing any external work.

Rules:

- a worker never holds a DB transaction while calling a provider
- expired leases are reclaimable
- dedupe key and final Event AI unique constraints make processing effectively once at the logical-output layer
- max attempts moves a row to `DEAD`; it never loops indefinitely
- audit-only domain events never enter outbox

## 9. Query changes required for soft delete

Centralize default scopes/helpers rather than relying on every caller to remember filters:

- Activity queries: `deletedAt: null`
- parent validation: parent `deletedAt: null`
- latest Kanban comment projection: exclude deleted
- Opportunity pipeline/completed queries: `deletedAt: null`
- notification acceptance: target deal must not be deleted
- attachment and note routes: target deal must not be deleted
- Pusher recipient queries: deleted deals do not publish normal updates

Audit/admin endpoints may explicitly opt into deleted records.

## 10. Feature flags

Server-only flags with safe defaults:

```text
EVENT_LEDGER_WRITE_ENABLED=false
EVENT_LEDGER_STRICT_MODE=false
EVENT_AI_ENQUEUE_ENABLED=false
EVENT_SOFT_DELETE_ENABLED=false
```

- `WRITE`: dual-write ledger in canonical transactions.
- `STRICT_MODE`: mutation fails if ledger write cannot be made; enable only after parity proof. Before strict mode, log/alert ledger write failures, but avoid pretending non-atomic writes are final architecture.
- `AI_ENQUEUE`: remains false through Phase 1.
- `SOFT_DELETE`: enabled after all default reads are migrated.

Target architecture requires strict atomic ledger writes. Non-strict dual-write is a temporary observation stage only.

## 11. Verification plan

### Schema/migration

- `prisma format`
- `prisma validate`
- generate client
- migrate an empty test database
- migrate a production-like snapshot
- verify constraints and indexes
- verify downgrade procedure does not delete ledger data

### Backfill

- count non-deleted ActivityLogs versus version-1 revisions
- zero duplicate `(activityId, version)`
- content hashes match normalized source bytes
- restart from every batch boundary
- no Pusher/network/provider calls

### Transaction and concurrency

- same command ID sent concurrently produces one mutation/event/outbox
- different commands editing same expected version produce one success and one conflict
- Pusher failure after commit still returns success
- notification creation failure rolls back activity/event/outbox together
- due date creates one canonical event/outbox despite two projections
- Won/Lost produces no partial status/field state
- accepted transfer is truthful and request alone never changes owner
- deletion preserves revisions and prevents normal reads

### Performance

Benchmark before/after p50/p95 for add/edit/delete/reply and deal field save. Record transaction time and inserted bytes. Phase 1 exit requires no material user-perceived regression; LLM/provider time remains zero on mutation path.

## 12. Rollout and rollback

Rollout:

1. Add nullable/defaulted schema only.
2. Backfill and verify.
3. Deploy code with all flags false.
4. Enable ledger write for ADMIN/test cohort.
5. Measure error/latency/parity.
6. Enable strict ledger writes.
7. Cut over soft delete.
8. Remove duplicate client System Logs and multi-action commands.
9. Dry-run outbox claim/retry.

Rollback:

- disable feature flags
- revert application reads/writes to prior paths without dropping new tables/columns
- do not roll back by deleting ledger/revision data
- restore worker only after checkpoint reconciliation

## 13. Phase 1 design decisions requiring implementation confirmation

Recommended and ready for schema patch review:

1. Add `DEAL_FIELDS_UPDATED` for one multi-field Customer Information Save.
2. Use client-generated UUID command IDs and optimistic `version` fields.
3. Keep Notes revision/soft-delete as Phase 1B, while Note domain events remain audit-only.
4. Use soft delete for Opportunity/Activity; physical purge is a later retention job.
5. Split additive migration and restrictive foreign-key migration.
6. Keep AI enqueue disabled for all Phase 1 production rollout.

No migration should be applied until the actual Prisma patch, generated SQL, query-impact list, and rollback review are presented together.
