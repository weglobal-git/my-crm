# Event AI Agent & AI Control Center — Long-term Implementation Plan

> Project: `/Users/light/my-crm`  
> Target UI: `/pipeline?tab=workspace` and `/system/general`  
> Status: Architecture and implementation roadmap; no production AI behavior is implied by this document.  
> Last updated: 2026-09-02 (Asia/Bangkok)

## 1. Executive decision

Build the first AI capability as a narrow, event-driven summarization worker rather than a fully autonomous agent.

The system must first establish four foundations:

1. Immutable source history so every AI statement can be traced to the exact source version.
2. A transactional outbox so AI work never blocks or changes the correctness of a user's card update.
3. A provider-independent AI gateway so an admin can choose Gemini, OpenAI, or a future provider without changing agent code.
4. An AI Control Center under `/system/general` with budget limits, monitoring, alerts, pause controls, and safe model rollout.

Only after these foundations are reliable should the system add timeline composition, persistent facts, or an AI Manager.

## 2. Goals

- Create one independently traceable AI summary for each source event version.
- Preserve raw activity content and revisions permanently, including edits and deletion tombstones.
- Return card/activity mutations to the user without waiting for an LLM.
- Allow users to correct AI summaries without destroying the original AI output.
- Let an ADMIN choose provider/model and fallback policy through `/system/general`.
- Detect token explosions, retry loops, malformed output, provider outages, and unexpected spending.
- Support a low-cost or provider free-tier model as an initial candidate, such as a currently available Gemini Flash model, without hard-coding a model ID that may later change.
- Make every AgentRun reproducible from source version, prompt version, schema version, provider, model, and configuration snapshot.
- Give future agents a compact chronological memory without sending the entire raw history to an LLM.

## 3. Non-goals for the first release

- No autonomous email, customer contact, deal updates, or task creation.
- No direct database access by an LLM.
- No vector database or broad RAG layer.
- No board-wide AI Manager in the initial Event Summary release.
- No automatic replacement of a human-corrected summary.
- No guarantee that an LLM is semantically 100% accurate. The system guarantees provenance, validation, idempotency, bounded cost, and recoverability instead.

## 4. Findings in the current codebase

### 4.1 Raw history is not immutable yet

`ActivityLog.content` is updated in place by `editActivityLog`. `deleteActivityLog` hard-deletes the row, and replies cascade when a parent is deleted. This conflicts with the requirement that raw data must always remain available for audit and correction.

Relevant files:

- `prisma/schema.prisma`, model `ActivityLog`
- `src/lib/actions/opportunity.ts`, `editActivityLog` and `deleteActivityLog`

### 4.2 Posting still waits for side effects

`addActivityLog` currently waits for notification creation, notification Pusher delivery, and pipeline Pusher delivery before returning. Activity creation and notification creation are not one atomic transaction. A side effect may fail after the activity was saved, making the caller believe the post failed and potentially causing a duplicate retry.

### 4.3 `/system/general` is an appropriate admin entry point

The route already rejects non-ADMIN users server-side. `SystemGeneralClient` already uses a tabbed settings layout, so an `AI Control Center` tab can be added without introducing a second settings application.

### 4.4 `SystemConfig` should not become a catch-all

The current singleton `SystemConfig` stores Google configuration. It may hold a small global AI pointer or kill switch, but provider configuration, usage records, model policy, and run history require normalized tables. API keys must not be returned to the browser or stored as recoverable plaintext.

## 5. Invariants

These rules are mandatory across every phase:

1. One source event version produces at most one logical Event Summary per agent/prompt version.
2. Raw activity revisions are append-only.
3. AI generations and human corrections are append-only revisions.
4. A human correction is never overwritten automatically.
5. `occurredAt` comes from server-side source data, never from an LLM.
6. Events are not merged in storage, whether they occur on the same or different days.
7. Timeline grouping happens only when reading/composing data and uses the configured business timezone.
8. Database commit is the source of truth. Pusher is notification/transport, not durable state.
9. LLM calls never occur inside the user's database mutation transaction or response critical path.
10. Every request has a hard input limit, hard output limit, timeout, retry limit, and idempotency key.
11. Every run records usage or is explicitly marked `UNMETERED` and alerts operators.
12. Disabling AI must not disable CRM posting, editing, or reading.

## 6. Target architecture

```text
CRM client optimistic update
          |
          v
Authorized server mutation
          |
          v
Single database transaction
  |- Activity/Deal mutation
  |- ActivityRevision or DomainEvent
  `- AgentOutbox row (unique dedupe key)
          |
          `---- commit ----> return canonical result to client
                                  |
                                  `-> targeted CRM Pusher event

Background worker / queue consumer
          |
          |- atomically claim outbox row with lease
          |- budget admission + reservation
          |- load bounded context through server-owned query functions
          |- resolve active versioned model policy
          |- call provider through AIGateway
          |- normalize usage/errors
          |- validate strict output schema
          |- write AgentRun + DealAIEventRevision
          |- reconcile budget reservation
          `- targeted AI_EVENT_READY Pusher event
```

For an initial low-volume deployment, the worker may poll a Neon outbox from a protected scheduled endpoint. For lower latency or higher volume, replace the polling trigger with a managed queue while preserving the same outbox and idempotency contracts. A detached Promise or serverless fire-and-forget call is not a durable worker.

## 7. Source event model

An `activityId` is sufficient only for comments and replies. Card field changes such as stage, due date, owner, value, team membership, won/lost status, and attachments need a canonical domain event too.

Recommended event envelope:

```ts
type DealDomainEvent = {
  id: string;
  dealId: string;
  eventType: string;
  sourceEntityType: "ACTIVITY" | "OPPORTUNITY" | "NOTE" | "ATTACHMENT";
  sourceEntityId: string;
  sourceVersion: number;
  actorId: string;
  occurredAt: string;       // server UTC time
  localEventDate: string;   // business timezone projection
  changedFields?: Record<string, { before: unknown; after: unknown }>;
  traceId: string;
};
```

For a reply, the reply itself is one event. The summarizer may receive a bounded parent excerpt as context, but the generated summary must describe only the new reply.

## 8. Proposed database boundaries

The exact Prisma names can change during implementation, but the responsibilities must remain separated.

### 8.1 `ActivityRevision`

Immutable raw history:

- `id`
- `activityId`
- `version`
- `changeType`: `CREATED | EDITED | DELETED`
- `content`
- `contentHash`
- `changedById`
- `createdAt`
- unique `(activityId, version)`

An activity deletion writes a `DELETED` revision/tombstone and hides it from normal UI. It does not erase previous content.

### 8.2 `DealDomainEvent`

Immutable normalized source events for all card actions:

- `id`, `dealId`, `eventType`
- `sourceEntityType`, `sourceEntityId`, `sourceVersion`
- `actorId`, `occurredAt`, `localEventDate`
- `changedFields` JSON when applicable
- `traceId`
- indexes on `(dealId, occurredAt)` and `(sourceEntityType, sourceEntityId, sourceVersion)`

### 8.3 `AgentOutbox`

Durable work intent:

- `id`, `agentKey`, `domainEventId`, `dealId`
- `dedupeKey` unique
- `status`: `PENDING | PROCESSING | COMPLETED | FAILED | DEAD | CANCELLED`
- `priority`, `availableAt`, `leaseUntil`
- `attempts`, `maxAttempts`, `lastErrorCode`
- `traceId`, `createdAt`, `completedAt`

Example dedupe key:

```text
event-summary:{domainEventId}:{sourceVersion}:{promptVersion}:{schemaVersion}
```

### 8.4 `DealAIEvent`

Logical summary attached to one source event:

- `id`, `dealId`, `domainEventId`
- nullable `activityId` for direct activity linkage
- `occurredAt`, `localEventDate`
- `status`: `PENDING | READY | NEEDS_REVIEW | RETRACTED | FAILED`
- `currentRevisionId`
- unique logical identity for source event and agent kind

### 8.5 `DealAIEventRevision`

Immutable generated/corrected content:

- `eventId`, `revision`
- `authorType`: `AI | USER | SYSTEM`
- `summary`, `structuredData`
- `eventType`, `importance`, `confidence`, `needsContext`
- `provider`, `model`, `promptVersion`, `schemaVersion`
- `sourceContentHash`
- `createdById`, `supersedesRevisionId`, `createdAt`

Changing a summary creates a revision and updates the logical event's `currentRevisionId`. Regeneration produces a candidate revision. If the current revision is human-authored, the candidate cannot become current without explicit user approval.

### 8.6 `AIProviderConfig`

Provider-level configuration:

- `providerKey`: e.g. `GOOGLE_GEMINI`, `OPENAI`
- `enabled`, `status`
- `secretRef`, never the recoverable secret value
- `baseUrl` only for approved providers
- `timeoutMs`, `maxConcurrentRequests`
- `lastHealthCheckAt`, `lastHealthStatus`
- `createdById`, `updatedById`, timestamps

Secrets should live in deployment secret storage or an encrypted KMS-backed store. The UI may display only `Configured`, last four fingerprint characters, last rotation time, and connection status.

### 8.7 `AIModelPolicy`

Versioned selection policy per agent:

- `agentKey`: initially `EVENT_SUMMARIZER`
- `version`, `status`: `DRAFT | ACTIVE | RETIRED`
- primary `providerKey` and `modelId`
- optional fallback provider/model
- capability contract: structured JSON, supported input types, maximum context
- `maxInputTokens`, `maxOutputTokens`
- `timeoutMs`, `maxAttempts`, `temperature/reasoning settings` where supported
- `dailyTokenLimit`, `monthlyTokenLimit`
- `dailyCostLimitMicros`, `monthlyCostLimitMicros`
- `perRunCostLimitMicros`, `maxConcurrentRuns`
- `promptVersion`, `schemaVersion`
- `effectiveFrom`, creator and approver

Runs snapshot the resolved policy. Historical runs must not change when an admin later changes the active model.

### 8.8 `AgentRun`

One execution attempt group:

- `id`, `agentKey`, `outboxId`, `domainEventId`, `dealId`, `traceId`
- status and attempt count
- policy version, provider, model, prompt/schema versions
- timing: queued, started, provider latency, validation, completed
- normalized error category/code; redacted error message
- input/output content hashes
- token/cost totals
- output event revision ID

### 8.9 `AIUsageRecord`

Append-only metering record per provider request/attempt:

- `agentRunId`, `attempt`, `providerRequestId`
- provider/model and price-version snapshot
- `inputTokens`, `cachedInputTokens`, `outputTokens`, `reasoningTokens`, `totalTokens`
- estimated/actual cost in integer micros and currency
- latency, HTTP status, outcome
- `usageSource`: `PROVIDER_REPORTED | ESTIMATED | UNMETERED`
- timestamps

Never use floating point for money.

### 8.10 `AIBudgetReservation`

Prevents concurrent workers from jointly exceeding a budget:

- scope: global/provider/agent
- period key: day or month
- reserved token/cost maximum
- status: `HELD | RECONCILED | RELEASED | EXPIRED`
- expiry and run ID

Before dispatch, reserve the run's worst-case configured amount atomically. After response, reconcile to provider-reported usage. Expired reservations are recovered by a scheduled job.

### 8.11 `AIAlert` and `AIConfigAuditLog`

Alerts record anomalies and their acknowledgement/resolution. Config audit records the previous/new non-secret configuration, actor, reason, and timestamp. Admin changes must be attributable and reversible.

## 9. Provider-independent AI Gateway

Agent code must not import Gemini/OpenAI SDKs directly. It calls a stable interface:

```ts
interface AIGateway {
  generateStructured<T>(request: StructuredAIRequest<T>): Promise<AIResult<T>>;
  healthCheck(config: ProviderConfig): Promise<ProviderHealth>;
  validateModel(config: ProviderConfig, modelId: string): Promise<ModelCapabilities>;
}
```

Provider adapters normalize:

- structured output behavior
- token usage fields
- provider request IDs
- timeouts and cancellation
- rate limit/retry hints
- safety refusals
- context/output limit errors
- transient versus permanent errors

The summarizer uses no tools. It receives a server-built context and returns strict structured data. Future tool-using agents must go through separately authorized server tools.

## 10. Model selection in `/system/general`

Add an ADMIN-only sidebar tab named `AI Control Center`. Keep the existing server-side role check and repeat authorization inside every settings Server Action/API route.

### 10.1 Overview panel

Show:

- system state: `RUNNING | PAUSED | DEGRADED | BUDGET_BLOCKED`
- active Event Summarizer provider/model/policy version
- queue depth and oldest pending age
- today/month token and cost usage
- successful/failed/retried/dead runs
- p50/p95 queue lag and provider latency
- human correction rate and needs-review rate
- open critical alerts
- last provider health check

### 10.2 Models & Providers panel

ADMIN can:

- configure provider secret by write-only input
- test connection without revealing the key
- enable/disable a provider
- refresh or validate available model IDs
- select primary and optional fallback model for each agent
- inspect capability validation: structured output, token limits, supported modalities
- activate a versioned model policy
- rollback to the previous active policy

Do not allow arbitrary model strings to become active immediately. A model must pass provider validation and a compatibility test against the Event Summary JSON schema.

### 10.3 Budget & Limits panel

Configurable global and per-agent limits:

- maximum input/output tokens per run
- maximum context event count and raw characters
- maximum retry attempts
- timeout and concurrency
- requests/tokens per minute guard
- daily/monthly tokens
- daily/monthly cost
- per-run maximum cost
- warning thresholds, e.g. 50%, 75%, 90%
- anomaly threshold relative to trailing baseline

Hard limits are enforced server-side before calling a provider. UI limits are not security controls.

### 10.4 Monitoring panel

Filters:

- date range, agent, provider, model, status, error code
- run ID, trace ID, deal ID, domain event ID

Views:

- tokens and cost over time
- request/error/retry rate
- top token-consuming runs
- input versus output distribution
- queue lag and latency percentiles
- usage by model and agent
- schema validation failures
- unmetered responses
- duplicate/idempotency conflicts

Detailed run inspection should show metadata, timings, hashes, redacted errors, and source links. Raw CRM content and full prompts should not be displayed by default or written to ordinary logs.

### 10.5 Operations panel

Controls:

- global AI kill switch
- pause one agent
- drain without accepting new work
- resume
- retry an eligible failed/dead run
- cancel pending work
- acknowledge/resolve alerts
- run provider health check

Disabling AI must leave the outbox event either pending or explicitly cancelled according to policy; it must never roll back the user's CRM mutation.

## 11. Gemini Flash as an initial candidate

Use `provider = GOOGLE_GEMINI` with a validated current Flash model ID selected from the admin catalog. Do not encode the phrase `gemini flash` as a permanent model ID because available model names, pricing, quotas, and preview status change.

At the time this plan was written, Google documents free-tier availability for several Gemini models, but limits vary by project, model, and tier. The active limits must be viewed/verified for the actual project before production activation.

Important privacy gate: Google's pricing documentation distinguishes free and paid data handling and currently indicates that some free-tier usage may be used to improve products. CRM customer notes may contain personal or commercially sensitive information. Before using a free tier with production CRM data, the owner must explicitly approve the provider's current terms or the application must redact/minimize data. A paid tier with appropriate data controls may be safer even if a free tier exists.

Recommended rollout:

1. Development with synthetic/anonymized events.
2. Shadow mode with redacted production samples and no user-visible result.
3. Human evaluation against a golden dataset.
4. Limited canary percentage.
5. Full activation only after accuracy, privacy, and budget gates pass.

## 12. Cost and token safety system

### 12.1 Admission control before every request

Reject or defer a run when any condition fails:

- agent/system paused
- provider unhealthy with no eligible fallback
- estimated input exceeds policy
- output allowance exceeds policy
- daily/monthly budget cannot reserve worst-case cost
- concurrency/rate guard exceeded
- source event is stale, superseded, deleted, or already completed

### 12.2 Hard request bounds

Every call sets:

- maximum input size before SDK invocation
- `maxOutputTokens`
- provider timeout/cancellation
- no tools for Event Summarizer
- strict output schema
- maximum context events and per-field character limits

### 12.3 Retry policy

Retry only transient categories such as timeout, selected 429 responses, and selected provider 5xx responses. Use exponential backoff with jitter and respect provider retry hints.

Never retry indefinitely. Suggested initial maximum is three total provider attempts, subject to measurement. Do not retry safety refusals, invalid configuration, permanent schema incompatibility, or over-budget rejection.

Fallback is permitted only for retryable provider failure and only when the fallback passes the same schema/capability contract. Record both attempts. Fallback must not create a second logical Event Summary.

### 12.4 Circuit breakers

Open the circuit and pause dispatch for a provider/model when a rolling window exceeds configured thresholds, for example:

- repeated provider 5xx/timeouts
- schema failure spike
- token-per-event above absolute cap
- missing usage metadata
- cost velocity above budget threshold
- repeated identical source processing

The CRM remains functional. The queue waits or moves to a validated fallback according to policy.

### 12.5 Token explosion detection

Create alerts for:

- any run above an absolute token threshold
- input/output more than a configured multiple of the trailing p95
- one source event producing multiple provider attempts unexpectedly
- rapid daily consumption acceleration
- repeated context escalation for the same source version
- output truncated by maximum tokens
- provider-reported totals that differ materially from local estimates

Never rely only on provider billing dashboards; application-level event/run attribution is required.

### 12.6 Usage accounting

OpenAI Responses exposes usage fields such as input, cached input, output/reasoning, and total tokens. Provider adapters must normalize their provider's available fields into `AIUsageRecord`. A response without usage is not treated as zero; mark it `UNMETERED`, apply a conservative reservation reconciliation rule, and alert.

Pricing is versioned configuration, not a constant in agent code. Store the price snapshot used for estimation because providers can change pricing later. Provider-reported billing remains the final external source for invoice reconciliation.

## 13. Event Summary contract

Store structured output in addition to human-readable summary:

```json
{
  "summary": "Customer requested a revised quotation for 5,000 units.",
  "eventType": "QUOTATION_REQUEST",
  "importance": 4,
  "confidence": 0.93,
  "needsContext": false,
  "nextActions": [
    { "text": "Prepare revised quotation", "ownerHint": null, "dueDate": null }
  ],
  "blockers": ["Target price is below the current offer"],
  "uncertainties": [],
  "mentionedEffectiveDate": null
}
```

Rules:

- summarize only facts supported by the source and supplied context
- use `null`/uncertainty rather than guessing
- maximum summary length
- fixed enum taxonomy
- `importance` is bounded
- `occurredAt` is not model-generated
- no tool calls
- provider output must pass server-side schema validation before persistence

## 14. Context and token strategy

First-pass input contains only:

- source event version
- compact deal identity/stage metadata
- actor role/name only when necessary
- parent excerpt for a reply
- stable instructions and strict schema

It does not contain the full board or complete deal history.

If the first pass returns `needsContext`, a bounded second pass may add the most recent accepted Event Summaries, for example three to five relevant events. This escalation counts as another metered attempt and must remain within the run budget. It must not loop recursively.

Future AI Manager retrieval:

```text
current structured Deal fields
+ current accepted Event Summaries for recent 30-60 days
+ active persistent facts
+ open tasks
```

## 15. Realtime and consistency behavior

1. Client performs optimistic CRM mutation.
2. Server commits canonical CRM state and outbox atomically.
3. Client reconciles with canonical server result.
4. Worker eventually creates the AI summary.
5. A targeted private Pusher event informs authorized viewers that an AI event is ready.
6. Clients mutate only the affected SWR cache/key and may revalidate the specific event endpoint.

Pusher payloads should carry IDs, versions, and small projections rather than complete timelines. Client state is a projection; the database remains authoritative.

## 16. Security and privacy

- Repeat ADMIN authorization in every read/write settings endpoint.
- Encrypt or externally store provider secrets; never send them back to the client.
- Add CSRF/session validation consistent with the application architecture.
- Validate provider/model values against a server catalog.
- Redact API keys, raw prompts, customer PII, and provider response bodies from logs.
- Treat activity content as untrusted data, not instructions to the agent.
- Event Summarizer has no tools and cannot exfiltrate through actions.
- Tool-using agents later receive least-privilege tools with permission checks, audit logs, and idempotency.
- Define data retention for provider request storage and application run logs.
- Record consent/policy decision before sending real CRM data through a provider free tier.

## 17. Detailed implementation phases

### Phase 0 — Product contract, privacy, and evaluation baseline

Deliverables:

- enumerate every card action that creates a domain event
- define event taxonomy and strict output schema
- define business timezone and retention rules
- decide what user roles may view/edit AI summaries
- create an anonymized golden dataset covering Thai, English, short notes, replies, edits, deletions, ambiguous notes, attachments, dates, prices, and mentions
- define quality rubric: supported facts, temporal correctness, omissions, fabricated claims, event type, importance, next action
- document provider data-handling approval

Tests:

- schema accepts valid examples and rejects unknown/missing fields
- every action maps to exactly one intended domain event
- ambiguous examples require uncertainty rather than invented context

Exit criteria:

- approved schema/taxonomy
- minimum evaluation dataset accepted by product owner
- explicit production-data provider policy

Rollback: documentation/data only; no runtime impact.

### Phase 1 — Immutable event ledger and reliable outbox

Deliverables:

- `ActivityRevision`, soft-delete/tombstone behavior
- `DealDomainEvent` for activity and card field changes
- `AgentOutbox` with unique dedupe key, lease, retry state
- atomic Prisma transactions for canonical mutation + revision/event + outbox
- separate notification/Pusher failure from CRM mutation success
- migration/backfill policy for existing activities

Tests:

- create/edit/delete/reply preserve all raw versions
- transaction failure leaves neither partial mutation nor orphan outbox
- retrying the same client request/outbox event cannot create duplicates
- parent deletion does not destroy raw reply history
- Pusher failure does not report the saved CRM mutation as failed

Exit criteria:

- raw provenance 100%
- duplicate domain/outbox event rate 0 in concurrency tests
- posting latency has no material regression beyond the additional local transaction writes

Rollback:

- stop outbox creation behind a feature flag while retaining revision data
- do not reverse migrations destructively

### Phase 2 — AI Gateway and Admin Control Center foundation

Deliverables:

- provider adapter interface
- initial Gemini adapter; optional OpenAI adapter
- normalized output, usage, errors, timeout, cancellation
- provider/config/model policy tables and config audit log
- ADMIN-only `AI Control Center` tab in `/system/general`
- write-only secret setup and connection test
- primary/fallback selection with versioned activation and rollback
- global and per-agent pause switches

Tests:

- non-ADMIN cannot read or mutate AI settings
- secret never appears in HTML/RSC/JSON/logs
- invalid or schema-incompatible model cannot activate
- a model policy change does not alter historical run metadata
- gateway contract tests return identical normalized shapes across adapters

Exit criteria:

- admin can configure, test, select, activate, pause, and roll back safely
- no production event dispatch yet

Rollback:

- deactivate policy/disable provider; CRM remains unaffected

### Phase 3 — Usage ledger, budgets, monitoring, and circuit breakers

This phase must complete before production AI generation is enabled.

Deliverables:

- `AgentRun`, `AIUsageRecord`, `AIBudgetReservation`, `AIAlert`
- server-side admission control
- per-run/day/month hard limits
- concurrency and retry limits
- circuit breakers and alert rules
- monitoring screens and filtered run inspection
- protected operational actions: pause, resume, retry, acknowledge
- scheduled reservation cleanup and budget reconciliation

Tests:

- concurrent workers cannot overspend the same remaining budget
- missing usage never counts as zero
- retry/fallback usage is fully attributed
- token explosion opens circuit at configured threshold
- hard budget blocks new calls but not CRM mutations
- kill switch takes effect for newly claimed work

Exit criteria:

- all provider calls produce a usage or unmetered record
- synthetic runaway tests are contained automatically
- monitoring identifies agent, source event, model, attempts, tokens, and outcome

Rollback:

- global pause; preserve outbox for later replay

### Phase 4 — Event Summarizer shadow mode

Deliverables:

- bounded context builder
- versioned prompt and strict JSON schema
- worker claim/lease/heartbeat behavior
- Event Summary generation and immutable revision persistence
- no user-visible summary by default
- automated evaluation report against golden samples

Tests:

- worker crash/timeout can be reclaimed without duplicate logical events
- stale source version cannot become the current summary
- structured validation and refusal/error paths
- context/output always remain within hard limits
- Thai/English and ambiguous input quality evaluation

Exit criteria:

- supported-claim and temporal accuracy meet agreed thresholds
- hallucination rate under agreed threshold
- cost/tokens per event and p50/p95 latency measured
- no mutation-path latency impact from LLM execution

Rollback:

- pause worker; shadow records may remain for analysis

### Phase 5 — User-visible summaries, correction, and realtime

Deliverables:

- pending/ready/needs-review/failed UI states
- show source link and generated metadata appropriate for users
- user correction creates `USER` revision
- regenerate as candidate without overwriting human correction
- targeted `AI_EVENT_READY` Pusher event and precise SWR mutation
- user feedback reason categories

Tests:

- human correction survives regeneration/model change
- unauthorized user cannot edit summary
- duplicate Pusher delivery is idempotent
- refresh/reconnect yields the same canonical current revision
- activity edit/delete supersedes or retracts the right AI projection

Exit criteria:

- source-to-summary traceability 100%
- human correction survival 100%
- no duplicate visible summaries
- DB/client convergence verified across two users

Rollback:

- hide AI UI feature flag; retain audit history

### Phase 6 — Timeline composer and persistent facts

Deliverables:

- query current accepted events by date, type, and importance
- group by `localEventDate` at read time
- recent 30-60 day compact timeline endpoint
- separate `DealAIFact` projection with provenance and active/superseded/retracted lifecycle
- rebuildable snapshots/caches only when measured as necessary

Tests:

- no cross-event merge in storage
- timezone/day-boundary correctness
- corrected/retracted events compose correctly
- facts retain source event IDs and contradicting facts supersede safely
- deterministic token-budgeted composition

Exit criteria:

- timeline can be rebuilt entirely from canonical events/revisions
- important facts are provenance-backed
- measured token reduction versus raw-history prompts

Rollback:

- disable composer/fact projection; Event Summary remains usable

### Phase 7 — AI Manager, read-only first

Deliverables:

- explicit Goal, Context, Reasoning, Tools, Guardrails contract
- read-only tools: `getDealContext`, `listDealEvents`, `listActiveFacts`, `listOpenTasks`
- board-level risk/work summaries with source citations
- separate budgets/model policy/monitoring for `AI_MANAGER`
- approval workflow design for any future mutating tool

Tests:

- permission scoping by role/department/deal
- prompt injection attempts in activity text cannot invoke unauthorized actions
- every manager claim links to source events/facts
- board query remains within fixed token budget

Exit criteria:

- read-only quality and permission evaluation accepted
- no mutating tools enabled

Rollback:

- pause AI Manager independently from Event Summarizer

### Phase 8 — Scale and optimization

Deliverables only when measurement justifies them:

- move from polling to managed queue for latency/volume
- batching where it preserves one-event provenance
- prompt/provider caching
- retention/partition strategy for large usage tables
- sampled traces while retaining complete billing counters
- provider quality/cost routing using controlled experiments
- disaster recovery and replay tooling

Tests and exit criteria:

- benchmark before/after with p50/p95 queue lag, latency, throughput, tokens, and cost
- controlled experiment proves each optimization's causal benefit
- replay remains idempotent

Rollback:

- route back to previous worker/provider policy version

## 18. Required metrics and service objectives

Initial targets must be confirmed after baseline measurement:

- CRM mutation success independent of AI/provider availability: 100% architectural separation
- source revision/domain event/outbox atomic traceability: 100%
- duplicate logical Event Summaries: 0
- human correction overwritten automatically: 0
- provider calls with usage attribution or explicit unmetered status: 100%
- dead-letter visibility: 100%
- budget admission bypass: 0
- queue lag p50/p95
- provider latency p50/p95
- tokens and cost per event p50/p95/max
- schema validation, retry, fallback, refusal, needs-review rates
- unsupported-claim rate from evaluation sampling
- user correction rate by model/prompt version

## 19. Operational runbooks

### Token spike

1. Circuit breaker pauses the affected agent/provider/model.
2. Alert captures time window, policy version, top runs, attempts, and token distribution.
3. Admin verifies retry loop, context growth, output cap, model change, or usage parsing.
4. Keep CRM active; do not discard pending events.
5. Patch/test in shadow mode.
6. Activate a new policy version and resume a small canary.

### Provider outage or rate limit

1. Categorize retryable error.
2. Apply bounded backoff.
3. Use validated fallback only when policy allows.
4. Open circuit if rolling threshold is crossed.
5. Preserve outbox ordering/provenance; delayed summary is preferable to duplicate or incorrect data.

### Incorrect summary

1. User creates a correction revision.
2. Preserve AI revision and exact source hash.
3. Add anonymized pattern to evaluation dataset if permitted.
4. Update prompt/schema/model via new version and shadow-test.
5. Never retroactively overwrite human corrections.

### Lost or stuck job

1. Find by domain event, outbox ID, run ID, or trace ID.
2. Verify lease expiry and provider request state.
3. Reclaim through idempotent worker path.
4. Do not manually insert a second Event Summary.

## 20. Decisions still required before implementation

- Which card actions produce user-facing summaries versus audit-only domain events?
- Who may view and correct AI summaries: all deal viewers, author, owner, management, or admin?
- Required raw/AI/usage retention periods.
- Business timezone if it may differ from `Asia/Bangkok`.
- Whether production CRM content is approved for a provider free tier under its current data terms.
- Initial hard daily/monthly token and monetary budgets.
- Quality thresholds for shadow-to-canary promotion.
- Acceptable Event Summary delay for the first worker deployment.

## 21. Recommended implementation order

Do not begin by adding an LLM call to `addActivityLog`.

The safe order is:

```text
Phase 0 contract/evals
-> Phase 1 immutable events/outbox
-> Phase 2 provider gateway/admin settings
-> Phase 3 budgets/monitoring/circuit breakers
-> Phase 4 shadow summarizer
-> Phase 5 user-visible/correctable summaries
-> Phase 6 timeline/facts
-> Phase 7 AI Manager
```

The first production AI call is allowed only after Phases 0-3 pass their exit criteria.

## 22. References

- OpenAI Responses API: model selection, output limits, structured output configuration, metadata, status, and token usage: https://developers.openai.com/api/reference/cli/resources/responses/methods/create
- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI Background mode: https://developers.openai.com/api/docs/guides/background
- OpenAI Webhooks: https://developers.openai.com/api/docs/guides/webhooks
- Gemini API pricing and current free/paid distinctions: https://ai.google.dev/gemini-api/docs/pricing
- Gemini API rate-limit dimensions and project-level limits: https://ai.google.dev/gemini-api/docs/rate-limits

Provider pricing, model availability, quotas, and data terms are time-sensitive. Re-verify official provider documentation and the actual provider project/account immediately before activating a model in production.
