# Event AI Agent — Phase 0 Product Contract

> Status: Draft with recommended defaults  
> Runtime impact: None  
> Source of detailed architecture: `event-ai-agent-roadmap.md`

## 1. Purpose

Define which CRM mutations become canonical Deal Domain Events, which events receive AI summaries, who may view/correct them, and the exact structured output contract before any schema migration or provider call is introduced.

## 2. Event processing classes

- `AI_SUMMARY`: create an immutable domain event and enqueue Event Summarizer work.
- `AUDIT_ONLY`: create an immutable domain event but do not call an LLM.
- `NO_EVENT`: no Deal Domain Event is needed for this action.
- `PROJECTION_ONLY`: a display log derived from an existing canonical event; never enqueue AI again.

One user intent may update multiple records but should create one canonical business event. Technical rows or Pusher events are not automatically domain events.

## 3. Canonical event inventory

### 3.1 Deal lifecycle and fields

| Current path | Canonical event | Class | Canonical payload | Notes |
|---|---|---|---|---|
| `createOpportunity` | `DEAL_CREATED` | `AUDIT_ONLY` initially | type, topic, companyId, ownerId, stageId | The current creation System Log becomes `PROJECTION_ONLY`. Promote to AI only if initial description/context is added later. |
| `moveOpportunity` to another open stage | `DEAL_STAGE_CHANGED` | `AI_SUMMARY` | before/after stage IDs and names | Suppress no-op moves. |
| `moveOpportunity(..., WON)` | `DEAL_WON` | `AI_SUMMARY` | status, value, currency, invoiceId, loading date | Replace the current two-call update+move UI flow with one server command in Phase 1. |
| `moveOpportunity(..., LOST)` | `DEAL_LOST` | `AI_SUMMARY` | status and loss reason | Replace the current two-call update+move UI flow with one server command in Phase 1. |
| Other terminal status | `DEAL_STATUS_CHANGED` | `AI_SUMMARY` | before/after status and reason if present | Covers completed/cancelled if exposed. |
| `updateOpportunity(topic)` | `DEAL_TOPIC_CHANGED` | `AI_SUMMARY` | before/after topic | Current client-created System Log becomes `PROJECTION_ONLY`. |
| `updateOpportunity(type)` | `DEAL_TYPE_CHANGED` | `AI_SUMMARY` | before/after type | Current client-created System Log becomes `PROJECTION_ONLY`. |
| value/currency update | `DEAL_VALUE_CHANGED` | `AI_SUMMARY` | before/after value/currency | Combine value+currency changed in one Save intent. |
| goods ready/loading date | `DEAL_LOGISTICS_DATES_CHANGED` | `AI_SUMMARY` | changed date fields only | Use server values, not LLM-inferred dates. |
| reserveId/invoiceId | `DEAL_REFERENCE_CHANGED` | `AUDIT_ONLY` by default | changed reference fields | Avoid sending identifiers to an LLM unless later proven valuable. |
| `updateDueDateWithLog` | `DEAL_DUE_DATE_CHANGED` | `AI_SUMMARY` | before/after due date and user reason | Both current ActivityLog rows become projections of one event; do not summarize either separately. |
| `deleteOpportunity` | `DEAL_DELETED` | `AUDIT_ONLY` | deleter, reason if added, source snapshot hash | Retention policy must be implemented before destructive delete. |

`updateOpportunity` must load the previous canonical row and emit only actual changed fields. No-op saves are `NO_EVENT`.

### 3.2 Activity and replies

| Current path | Canonical event | Class | Notes |
|---|---|---|---|
| root `addActivityLog` | `ACTIVITY_CREATED` | `AI_SUMMARY` | One source activity version equals one summary. |
| reply `addActivityLog` | `REPLY_CREATED` | `AI_SUMMARY` | Parent excerpt may be bounded context; summary describes the reply only. |
| `editActivityLog` root | `ACTIVITY_EDITED` | `AI_SUMMARY` | New immutable source version; prior AI revision becomes superseded. |
| `editActivityLog` reply | `REPLY_EDITED` | `AI_SUMMARY` | Same rules as activity edit. |
| `deleteActivityLog` | `ACTIVITY_DELETED` or `REPLY_DELETED` | `AUDIT_ONLY` | Write tombstone, retract current AI projection, preserve raw revisions. |
| `addSystemLog` derived from another event | matching canonical event projection | `PROJECTION_ONLY` | Store `sourceDomainEventId` to prove derivation. |
| truly standalone admin System Log | `SYSTEM_ACTIVITY_CREATED` | `AUDIT_ONLY` | Promote to AI only through explicit event policy. |

Attachments embedded in an activity do not create a second AI summary. The activity event may include attachment metadata, but the initial summarizer receives filenames/types only, not file contents or signed URLs.

### 3.3 Ownership, membership, and notifications

| Current path | Canonical event | Class | Notes |
|---|---|---|---|
| `requestDealTransfer` | `OWNERSHIP_TRANSFER_REQUESTED` | `AUDIT_ONLY` | A request is not a completed transfer. |
| transfer rejected | `OWNERSHIP_TRANSFER_REJECTED` | `AUDIT_ONLY` | Preserve request correlation ID. |
| transfer accepted | `DEAL_OWNER_CHANGED` | `AI_SUMMARY` | Emit in the same transaction that changes owner. |
| `requestTeamInvite` | `TEAM_INVITE_REQUESTED` | `AUDIT_ONLY` | Notification is transport/projection. |
| invite rejected | `TEAM_INVITE_REJECTED` | `AUDIT_ONLY` | No membership change. |
| invite accepted | `DEAL_MEMBER_ADDED` | `AUDIT_ONLY` initially | Emit in the membership transaction. |
| direct `addTeamMember` | `DEAL_MEMBER_ADDED` | `AUDIT_ONLY` initially | Current client System Log becomes `PROJECTION_ONLY`. |
| `removeTeamMember` | `DEAL_MEMBER_REMOVED` | `AUDIT_ONLY` initially | Current client System Log becomes `PROJECTION_ONLY`. |

Critical current defect: `EditDealPanel.handleTransfer` creates a System Log saying ownership was transferred immediately after sending a request. That log is semantically false until acceptance and must be removed/replaced during Phase 1.

### 3.4 Notes and attachments

| Current path | Canonical event | Class | Notes |
|---|---|---|---|
| `createNote` | `NOTE_CREATED` | `AUDIT_ONLY` initially | Notes may contain private/internal content; LLM inclusion is opt-in later. |
| `deleteNote` | `NOTE_DELETED` | `AUDIT_ONLY` | Replace hard delete with tombstone/revision if notes enter agent memory. |
| `togglePinNote` | `NOTE_PIN_CHANGED` | `AUDIT_ONLY` | No AI value. |
| attachment upload | `ATTACHMENT_ADDED` | `AUDIT_ONLY` | Do not send file/base64/URL to summarizer. |
| attachment delete | `ATTACHMENT_DELETED` | `AUDIT_ONLY` | Preserve metadata/tombstone, not external file contents. |
| archive attachment to Drive | `ATTACHMENT_ARCHIVED` | `AUDIT_ONLY` | Background operational event. |

### 3.5 Actions outside Deal memory

User profile, active status, departments, menu permissions, Google integration, storage reads, Pusher authentication, and avatar upload are `NO_EVENT` for Deal AI. A future organization-level audit system may cover them separately.

## 4. Duplicate-prevention contract

The following current patterns must not produce two AI events:

1. Due date update + comment row + System Log row = one `DEAL_DUE_DATE_CHANGED`.
2. Update Won fields + move to Won = one `DEAL_WON` user intent.
3. Set loss reason + move to Lost = one `DEAL_LOST` user intent.
4. Topic/type update + client `addSystemLog` = one canonical field-change event.
5. Direct team mutation + client `addSystemLog` = one membership audit event.
6. Transfer request + premature client log + accepted transaction log = request event followed later by owner-changed event; never claim transfer at request time.
7. Attachment upload included in a new activity = attachment audit event plus one activity summary, never a second attachment summary.

Every command receives or generates an idempotency/correlation ID. System Logs should carry `sourceDomainEventId` and are never independently enqueued when that field is present.

## 5. Recommended permissions (pending product approval)

### View

Any actor who currently passes `requireOpportunityAccess(dealId)` may view the current accepted AI summary and its raw source link.

### Correct

- Source activity author may correct the summary of their own activity/reply.
- Deal owner and ADMIN may correct any Event Summary on the deal.
- MANAGEMENT may view and mark `NEEDS_REVIEW`; editing is disabled initially unless MANAGEMENT already has owner-equivalent access by explicit policy.
- Other team members may submit feedback but do not replace the accepted revision initially.

### Audit history

ADMIN and deal owner may view AI/human revision history. Ordinary viewers see only the current accepted revision and provenance link.

All correction actions repeat authorization server-side. UI hiding is not authorization.

## 6. Recommended retention (pending legal/product approval)

- Raw Activity revisions and Deal Domain Events: retain with the Deal; no automated purge in MVP.
- AI Event revisions: retain while their raw source is retained.
- Full prompts/provider response bodies: do not persist by default.
- AgentRun and normalized token/cost usage: 13 months for monthly comparison and incident review.
- Redacted operational error details: 90 days.
- API keys: never stored in these records.

Deal deletion should become a policy-aware archive/tombstone before Event AI production. Physical purge, if required, must be a separate audited retention job.

## 7. Time contract

- Store timestamps in UTC.
- Initial business timezone: `Asia/Bangkok`.
- Compute `localEventDate` server-side from `occurredAt` and the versioned business timezone.
- AI cannot modify `occurredAt` or `localEventDate`.
- Dates mentioned in text belong in nullable `mentionedEffectiveDate`; they never replace source time.
- Timeline composition groups current accepted event revisions by `localEventDate`; storage never merges events.

## 8. Initial taxonomy

Allowed `eventType` values for Event Summarizer v1:

- `CUSTOMER_INTEREST`
- `FOLLOW_UP`
- `QUOTATION`
- `PRICE_OR_COMMERCIAL`
- `OBJECTION_OR_RISK`
- `DECISION_OR_APPROVAL`
- `DEADLINE_OR_SCHEDULE`
- `LOGISTICS`
- `PAYMENT_OR_INVOICE`
- `DEAL_STAGE_OR_STATUS`
- `OWNERSHIP_OR_RESPONSIBILITY`
- `INTERNAL_COORDINATION`
- `GENERAL_UPDATE`
- `UNKNOWN`

Domain event name and AI `eventType` are different. `DEAL_WON` is a deterministic domain event; the model may classify its semantic summary as `DEAL_STAGE_OR_STATUS`.

## 9. Strict output contract

The machine-readable schema is `.agents/evals/event-summary.schema.json`.

Additional semantic rules:

- `summary` is one concise factual block and must not contain invented identities, quantities, dates, decisions, or next steps.
- `importance` is 1-5; 5 is reserved for won/lost, blocking risk, binding decision, critical deadline, or equivalent business impact.
- `confidence` measures support from supplied evidence, not general model certainty.
- `needsContext=true` when the note cannot be understood without unavailable context.
- `uncertainties` states what is missing without guessing.
- `nextActions` includes only explicit or safely entailed work. Suggested creative advice is excluded from Event Summary v1.
- `mentionedEffectiveDate` is ISO date-time with explicit offset or `null`.

## 10. Initial context and budget limits (recommended canary defaults)

- Source raw text: maximum 8,000 characters after deterministic sanitization.
- Deal metadata: allowlisted compact fields only.
- Parent context for reply: maximum 2,000 characters.
- Recent accepted events on escalation: maximum 5 events and 3,000 characters total.
- Maximum normalized input: 6,000 tokens.
- Maximum output: 512 tokens.
- Maximum provider attempts: 2 total, including context escalation/fallback.
- Timeout: 20 seconds per attempt.
- Worker concurrency: 2 initially.
- Daily total-token hard cap: 100,000 during canary.
- Monthly total-token hard cap: 1,000,000 during canary.
- Per-run cost and monetary daily/monthly limits: must be configured before a paid model can activate.

These are safety defaults, not capacity promises. Revise them only from measured p50/p95 usage and documented provider quotas.

## 11. Quality gates

Minimum proposed gates before moving from shadow to canary:

- JSON schema validity: 100% after provider adapter processing.
- Source and source-version traceability: 100%.
- Temporal/date correctness on golden set: 100%.
- Material fabricated claims on golden set: 0.
- Supported factual claims: at least 98%.
- Event taxonomy agreement: at least 95%.
- Human-correction overwrite: 0.
- Duplicate logical Event Summary: 0.
- Usage attribution or explicit `UNMETERED`: 100%.
- Mutation-path LLM wait time: 0 ms by architecture.

## 12. Initial evaluation set

`.agents/evals/event-summary-golden.jsonl` contains synthetic/anonymized examples for:

- Thai and English notes
- ambiguous shorthand
- replies with bounded parent context
- due date and price concerns
- Won/Lost business events
- edit/correction behavior
- unsupported-inference traps

Before Phase 4, expand it with approved anonymized patterns from the real workflow. Never copy production customer secrets into the repository.

## 13. Phase 0 open approvals

The following recommended defaults require product-owner confirmation before Phase 0 is marked complete:

1. Permission matrix in section 5.
2. Retention periods in section 6.
3. `Asia/Bangkok` as initial business timezone.
4. Event classification tables, especially Notes and team membership.
5. Canary token limits and quality gates.
6. Provider tier/privacy decision before sending production CRM content.

These approvals do not block read-only design or Phase 1 migration planning, but production AI remains disabled.
