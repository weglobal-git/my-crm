# Phase 1.5 — Soft-delete Query Impact Checklist

> Status: audited; no active query has been changed yet  
> Cutover gate: migrated preview database, regenerated Prisma Client, and `EVENT_SOFT_DELETE_ENABLED=true`

Normal CRM reads must exclude `deletedAt != null`. Audit, backfill, and repair scripts may opt in explicitly and must not reuse normal scopes accidentally.

## Opportunity reads

| Location | Purpose | Required cutover behavior |
|---|---|---|
| `src/lib/pipeline-opportunities.ts` | Kanban/completed Pipeline payload | Compose access/status/search filters with `activeOpportunityWhere(...)`. Nested latest Activity must also exclude deleted rows. |
| `src/lib/pipeline-security.ts` | Permission lookup | `requireOpportunityAccess` must reject deleted Deals. |
| `src/lib/pipeline-security.ts` | Pusher recipients | Deleted Deals return no recipients and publish no normal update. |
| `src/lib/actions/completed-deals.ts` | Completed list | Exclude deleted Deals and deleted nested Activity rows. |
| `src/lib/actions/opportunity.ts` | Create/update/move/due-date reads | Post-write reads and mutation preconditions must reject deleted Deals. |
| `src/lib/actions/notification.ts` | Transfer/invite request and response | Requests cannot target deleted Deals; accepting a pending request must recheck active state inside the transaction. |
| `src/app/api/cron/archive/route.ts` | Attachment archival | Exclude deleted Deals unless a separately approved retention workflow explicitly includes them. |

## Activity reads

| Location | Purpose | Required cutover behavior |
|---|---|---|
| `src/lib/actions/opportunity.ts:getOpportunityActivityLogs` | EditDealPanel timeline | Scope parent rows and nested replies independently with `deletedAt: null`. |
| `src/lib/actions/opportunity.ts:updateDueDateWithLog` | Reload created projections | Return only active rows/replies. Later replace duplicate logs with linked canonical projections. |
| `src/lib/actions/opportunity.ts:editActivityLog` | Edit precondition | Replace with versioned command; deleted Activity must return conflict/not-found. |
| `src/lib/actions/opportunity.ts:deleteActivityLog` | Delete precondition/latest card comment | Replace hard delete; latest-comment reconciliation must exclude deleted parents and replies. |
| `src/lib/pipeline-opportunities.ts` | Latest Kanban comment | Exclude deleted Activity before ordering/take. |
| `src/lib/actions/completed-deals.ts` | Recent Activity preview | Exclude deleted parents. |

## Intentional opt-in reads

- `src/scripts/migrateLogs.ts` and `src/scripts/fixLogs.ts` are repair/migration tooling. They must declare whether deleted records are included rather than silently adopting the normal scope.
- Future audit/admin endpoints may include deleted rows only through an explicitly named audit helper.
- Backfill counts must report active, deleted, and total records separately.

## Cutover verification

1. Query fixtures include active parent, deleted parent, active reply, deleted reply, and deleted Deal.
2. Kanban, EditDealPanel, completed list, permission checks, notifications, and Pusher recipient queries return no deleted projection.
3. Audit queries still resolve revisions and tombstones.
4. Deleting a parent does not physically delete replies or revisions.
5. Latest-comment reconciliation selects the next active comment deterministically.
6. Disabling the soft-delete feature flag restores the pre-cutover query path without deleting ledger data.
