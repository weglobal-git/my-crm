# Phase 1.8 — PostgreSQL Outbox Claim Adapter Contract

> Status: reviewed SQL contract; not executed against a database  
> Runtime provider calls: disabled

The generated-Prisma adapter must run reaping and claiming in one short database transaction. It commits before any provider, Pusher, or other network call.

## Reap exhausted work

```sql
UPDATE "AgentOutbox"
SET status = 'DEAD',
    "lockedBy" = NULL,
    "leaseUntil" = NULL,
    "completedAt" = $1,
    "lastErrorCode" = COALESCE("lastErrorCode", 'ATTEMPTS_EXHAUSTED'),
    "updatedAt" = $1
WHERE attempts >= "maxAttempts"
  AND (
    status IN ('PENDING', 'FAILED')
    OR (status = 'PROCESSING' AND "leaseUntil" <= $1)
  );
```

## Claim eligible work

```sql
WITH candidates AS (
  SELECT id
  FROM "AgentOutbox"
  WHERE attempts < "maxAttempts"
    AND (
      (status IN ('PENDING', 'FAILED') AND "availableAt" <= $1)
      OR (status = 'PROCESSING' AND "leaseUntil" <= $1)
    )
  ORDER BY priority DESC, "availableAt" ASC, id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT $2
)
UPDATE "AgentOutbox" AS outbox
SET status = 'PROCESSING',
    attempts = outbox.attempts + 1,
    "lockedBy" = $3,
    "leaseUntil" = $4,
    "lastErrorCode" = NULL,
    "completedAt" = NULL,
    "updatedAt" = $1
FROM candidates
WHERE outbox.id = candidates.id
RETURNING outbox.*;
```

Parameters are bound values, never interpolated SQL:

1. server `now`
2. bounded batch size, maximum 100
3. unique worker/invocation ID
4. bounded lease expiry

## Completion/failure fencing

Every completion, retry, dead-letter, and heartbeat update must match all of:

```text
id
status = PROCESSING
lockedBy = claimed worker ID
attempts = claimed attempt number
leaseUntil > server now
```

`attempts` is the fencing token. It prevents a slow invocation from completing work after an expired lease has been reclaimed, including when the replacement happens to reuse the same worker ID.

## Preview integration tests required

- two workers claim disjoint rows under concurrency
- an expired `PROCESSING` lease is reclaimed with incremented attempt
- a stale attempt cannot complete/fail/heartbeat after reclaim
- final failure becomes `DEAD`
- priority ordering is deterministic
- claim transaction commits before simulated provider latency
- killing a worker after claim leaves work reclaimable
