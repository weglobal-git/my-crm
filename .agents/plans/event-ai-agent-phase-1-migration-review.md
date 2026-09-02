# Event AI Agent — Phase 1 Additive Migration Review

> Status: Generated and validated offline; not applied to any database  
> Date: 2026-09-02  
> Prisma: 6.19.3

## Artifacts

- Runtime datamodel proposal: `prisma/schema.prisma`
- Existing-schema baseline: `prisma/migrations/20260902000000_baseline_existing_schema/migration.sql`
- Additive ledger delta: `prisma/migrations/20260902001000_add_event_ledger_foundation/migration.sql`
- Migration provider lock: `prisma/migrations/migration_lock.toml`

Checksums at generation time:

```text
baseline  9b280839b7c0fa5462711b5cf3d7ced05cf43d817626668406bcbdf837099012
delta     7500fdfc735b4b57fe8604a77c0d3e6d8054146ba72d9f0c1b57e80633c16b5d
```

## Why there are two SQL migrations

The repository previously had no `prisma/migrations` directory. A delta-only history could update the existing database but could not reconstruct a new database from zero.

- `baseline_existing_schema` reconstructs the pre-Event-AI schema for a new database.
- `add_event_ledger_foundation` transforms that baseline into the proposed additive ledger schema.

For an existing database that already contains the baseline schema, future deployment must first verify schema parity, then mark the baseline migration as applied, then apply the additive migration. Do not run the baseline SQL against the populated existing database because it creates tables that already exist.

No `migrate resolve`, `migrate deploy`, `db push`, or SQL execution has been run in this slice.

## Delta safety inspection

The generated additive SQL contains:

- six new enums
- three new tables
- nullable/defaulted columns on `Opportunity` and `ActivityLog`
- indexes and foreign keys

The delta contains no:

- `DROP`
- `TRUNCATE`
- `DELETE FROM`
- dropped columns/constraints
- data backfill
- provider/API/network call

`version` columns use `NOT NULL DEFAULT 1`; delete/projection fields are nullable. Existing rows therefore remain representable after the additive SQL is applied.

## Temporary cascade policy

The additive migration intentionally uses `ON DELETE CASCADE` for new ledger ownership relations:

- ActivityLog -> ActivityRevision
- Opportunity -> DealDomainEvent
- ActivityRevision -> DealDomainEvent
- DealDomainEvent -> AgentOutbox

This is temporary compatibility while current runtime code still performs hard deletes. Ledger writing and backfill must remain disabled until soft-delete code is deployed and enabled. After soft-delete is proven, a separate migration changes these new relations to `RESTRICT`.

This temporary policy is not the final audit guarantee. Enabling ledger writes before soft delete would allow a hard delete to erase ledger rows and is prohibited.

## Prisma validation

Completed:

- `prisma format` on a working copy; whole-file formatting churn was intentionally not retained.
- `prisma validate --schema prisma/schema.prisma` passed.
- Prisma Client generation against the new schema passed.
- The generated client was then restored to the old schema so the currently running application cannot query not-yet-migrated columns.
- Offline `prisma migrate diff` produced the baseline and additive SQL.
- `git diff --check` passed.

Important: `npm run build` runs `prisma generate`. Until the target development database has the additive migration, building/restarting with a newly generated client may cause queries without explicit `select` to request columns that do not exist. Do not deploy or build this schema against an unmigrated runtime database.

## Soft-delete query impact checklist

The additive migration alone does not change query behavior. Before enabling `EVENT_SOFT_DELETE_ENABLED`, update and test these paths.

### Pipeline and permissions

- `src/lib/pipeline-opportunities.ts`: add `deletedAt: null` to canonical Opportunity where clause and latest Activity relation filter.
- `src/lib/pipeline-security.ts`: access and recipient lookups must exclude deleted deals.
- `src/lib/actions/completed-deals.ts`: exclude deleted deals and deleted Activity projections.

### Opportunity actions

- `src/lib/actions/opportunity.ts`: all deal/activity reads, parent validation, activity pagination, latest comment lookup, edits, and deletes.
- `deleteOpportunity`: replace physical delete with versioned tombstone.
- `deleteActivityLog`: replace physical delete/cascade with versioned tombstone.
- Every update must reject a deleted target.

### Notifications

- `src/lib/actions/notification.ts`: transfer/invite request and acceptance must reject deleted deals.
- Accepted transfer/member transaction must emit canonical events rather than independent unlinked System Logs.

### Attachments, notes, and archive

- `src/lib/actions/notes.ts`: reject deleted deals; Note soft-delete remains Phase 1B.
- `src/app/api/upload/opportunity/route.ts`: reject deleted deals.
- `src/app/api/opportunities/[id]/attachments/[attachmentId]/route.ts`: reject deleted deals and later use deletion saga.
- `src/app/api/cron/archive/route.ts`: exclude deleted deals/attachments.

### Scripts

- `src/scripts/migrateLogs.ts`, `fixLogs.ts`, `migrateCsv.ts`, and `setOwnerYui.ts` must explicitly choose whether deleted records are included.
- Destructive migration scripts must not run after `RESTRICT` ledger constraints without a dedicated retention/purge process.

## Required checks before database application

1. Identify whether `DATABASE_URL` is local, staging, or production without exposing credentials.
2. Back up or create a Neon branch/preview database.
3. Compare the live schema with the generated baseline; resolve drift first.
4. Test baseline + delta on a new empty database.
5. Test baseline resolution + delta on a production-like database copy.
6. Measure lock time and index-creation impact.
7. Confirm the running app/client deployment order.
8. Do not enable ledger writes, backfill, or AI enqueue.

## Current deployment state

```text
schema.prisma patched           YES
schema validation               PASS
offline SQL generated           YES
database connected              NO
baseline marked applied         NO
additive migration applied      NO
runtime dual-write implemented  NO
soft delete enabled             NO
AI enqueue enabled              NO
commit created                  NO
```
