# Phase 1.9 — Activity Revision Backfill Runbook

> Status: dry-run planner implemented; no database write performed

## Mandatory ordering

1. Confirm a non-production Neon preview branch.
2. Apply/rehearse the additive ledger migration.
3. Regenerate Prisma Client against that migrated preview.
4. Deploy compatible soft-delete reads/writes with all ledger/AI flags off.
5. Enable and verify Activity soft delete for the test cohort.
6. Run this backfill in dry-run mode until every page plans cleanly.
7. Apply bounded pages with an idempotent `(activityId, version=1)` insert.
8. Run full count/hash/provenance verification.
9. Only then consider ledger dual-write; AI enqueue remains off.

Backfill must never run before soft delete because the current hard-delete cascade can erase the history being established.

## Page query contract

- order by Activity ID ascending
- use an exclusive ID cursor
- request `batchSize + 1` rows for lookahead
- include only `deletedAt = null`
- include existing revision version 1 for parity/idempotency checks
- batch size 1–500

Each planned revision preserves:

- exact `content` bytes, without trim/normalization
- SHA-256 content hash
- Activity type
- parent ID
- original author as `changedById`
- Activity creation time as revision creation time
- `version=1`, `changeType=CREATED`

Historical backfill creates no domain events, outbox rows, notifications, Pusher events, or AI calls.

## Fail-closed cases

- source Activity has `version != 1` without trustworthy original revision
- existing revision differs in content/hash/type/parent/author/time
- reader returns deleted, duplicate, unordered, or pre-cursor rows
- invalid timestamp/identity
- post-backfill counts or parity do not match

## Resume record per applied page

Persist operational output outside business tables:

```text
runId
preview branch/database identity
startedAt/completedAt
input cursor
next cursor
scanned/planned/already-complete/inserted counts
error machine code
schema migration checksum
application commit SHA
```

Never store CRM content in operational logs.

## Final gate

Phase passes only when:

```text
active Activity count == version-1 revision count
duplicate (activityId, version=1) count == 0
content/provenance parity mismatch count == 0
side-effect count == 0
```
