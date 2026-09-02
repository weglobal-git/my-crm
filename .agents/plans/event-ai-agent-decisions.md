# Event AI Agent — Decision Log

> Append-only architecture and product decisions.  
> Do not erase superseded decisions; add a new decision that references the old one.

## D-001 — Start with a worker, not an autonomous agent

- Date: 2026-09-02
- Status: Accepted
- Decision: The first Event Summarizer is a narrow event-driven worker with no tools and no direct database access by the LLM.
- Reason: It minimizes permissions, latency coupling, cost, and failure surface while producing structured memory for future agents.

## D-002 — Durable transactional outbox

- Date: 2026-09-02
- Status: Accepted
- Decision: CRM mutation, immutable source event, and AI work intent are committed atomically. LLM execution happens after commit in a durable worker.
- Reason: Provider/Pusher failure must not change whether the user's CRM mutation succeeded.

## D-003 — Versioned source and summary history

- Date: 2026-09-02
- Status: Accepted
- Decision: One source event version maps to one logical Event Summary. Raw revisions, AI generations, and human corrections are append-only.
- Reason: Traceability and user correction cannot be reliable if edits overwrite source or AI output.

## D-004 — Provider-independent gateway

- Date: 2026-09-02
- Status: Accepted
- Decision: Agent code calls an internal AI Gateway; provider SDKs are isolated in adapters. ADMIN selects a validated versioned model policy through `/system/general`.
- Reason: Gemini Flash may be the first candidate, but model IDs, quotas, pricing, and privacy terms change.

## D-005 — Monitoring and budgets precede production AI

- Date: 2026-09-02
- Status: Accepted
- Decision: Usage ledger, hard per-run/day/month limits, retry caps, budget reservation, alerts, and circuit breakers must pass tests before production Event Summary calls are enabled.
- Reason: A provider retry loop or expanding context must fail closed without consuming unbounded tokens.

## D-006 — Repository is the continuity source

- Date: 2026-09-02
- Status: Accepted
- Decision: Agent continuity relies on `AGENTS.md`, `.cursor/rules/event-ai-continuity.mdc`, and the execution checkpoint rather than chat memory.
- Reason: Quota, context, model, or agent changes must not make implementation state ambiguous.

## D-007 — Canonical domain event beats System Log

- Date: 2026-09-02
- Status: Accepted
- Decision: AI is triggered only from canonical server-side Deal Domain Events. System Logs derived from a domain event are projections and cannot enqueue a second summary.
- Reason: Current UI/server flows create duplicate logs and some multi-step actions. Using display logs as AI sources would duplicate or misstate history.

## D-008 — Transfer requests are not ownership changes

- Date: 2026-09-02
- Status: Accepted
- Decision: A transfer request is audit-only. `DEAL_OWNER_CHANGED` is emitted only in the accepted ownership-change transaction.
- Reason: The current client writes a transferred-ownership System Log before acceptance, which is not factual.

## D-009 — Notes excluded from AI by default

- Date: 2026-09-02
- Status: Accepted
- Decision: Note events are audit-only in the first release; their content is not sent to the Event Summarizer.
- Reason: Notes may contain more private/internal information and need an explicit permission/privacy decision.

## D-010 — Phase 0 safety defaults

- Date: 2026-09-02
- Status: Accepted
- Decision: Begin canary with Asia/Bangkok, 6,000 input tokens, 512 output tokens, two total attempts, concurrency two, 100,000 daily tokens, and 1,000,000 monthly tokens.
- Reason: Conservative hard limits contain token explosions until real p50/p95 usage is measured.

## D-011 — Phase 0 product contract approved

- Date: 2026-09-02
- Status: Accepted
- Decision: The classifications, permissions, retention defaults, Asia/Bangkok timezone, canary token limits, quality gates, and provider privacy gate in `event-ai-agent-phase-0-spec.md` are approved as the implementation baseline.
- Reason: The product owner authorized work to begin after reviewing the proposed defaults.

## D-012 — Phase 1 uses staged additive migrations

- Date: 2026-09-02
- Status: Accepted
- Decision: Add ledger tables/nullable fields first, backfill without AI, dual-write behind flags, then cut over soft delete and restrictive foreign keys in later releases.
- Reason: A staged rollout preserves compatibility, enables rollback, and avoids destructive migration risk.

## D-013 — Baseline missing migration history

- Date: 2026-09-02
- Status: Accepted
- Decision: Preserve an offline baseline migration for the existing pre-Event-AI schema and a separate additive ledger delta. Existing databases must verify parity and mark the baseline applied before deploying the delta.
- Reason: The repository had no Prisma migration directory, and a delta-only history cannot reconstruct a new database.

## D-014 — Temporary cascade until soft-delete cutover

- Date: 2026-09-02
- Status: Accepted
- Decision: New ledger ownership foreign keys use temporary cascade semantics in the additive migration. Ledger writes/backfill remain disabled until soft delete is active; then a separate migration changes them to restrict.
- Reason: Immediate restrictive foreign keys would break current hard-delete code after ledger rows exist, while early backfill with cascade would not satisfy immutable retention.

## D-015 — Transaction helpers remain structurally typed and inert

- Date: 2026-09-02
- Status: Accepted
- Decision: Phase 1.3 defines a minimal structural transaction interface and pure validation around replay lookup, domain-event creation, and outbox intent. It is not imported into live mutation paths until the additive schema is migrated and Prisma Client is regenerated against a confirmed preview database.
- Reason: This makes transaction semantics testable now without allowing the current pre-migration application to query or write tables that do not exist. Audit-only events remain independent from AI prompt/model policy, while AI-summary enqueue fails closed when its version policy is missing.

## D-016 — System Logs cannot use Activity summary commands

- Date: 2026-09-02
- Status: Accepted
- Decision: Phase 1.4 Activity commands accept canonical user comments/replies only. `SYSTEM_UPDATE` rows require a separate projection command linked to `sourceDomainEventId`; they cannot independently create Activity summary events or outbox work.
- Reason: Current System Logs are often duplicate display projections for topic, due-date, team, transfer, and outcome mutations. Treating them as canonical Activity sources would duplicate or misstate AI memory.

## D-017 — Normal reads compose mandatory active scopes

- Date: 2026-09-02
- Status: Accepted
- Decision: Normal Opportunity and Activity reads compose `deletedAt: null` with caller filters through `AND`; nested replies receive their own active scope. Audit/backfill tooling must opt into deleted records explicitly.
- Reason: Spreading a default filter into caller input can be overwritten accidentally, and filtering only parent Activity rows can still leak deleted replies. Explicit composition makes soft-delete behavior predictable and reviewable.

## D-018 — Deal user intent maps to one versioned command

- Date: 2026-09-02
- Status: Accepted
- Decision: Stage movement, due-date change, multi-field save, and Won/Lost each perform one compare-and-swap Deal update and create one canonical domain event. Won/Lost required fields and outcome state are never split across server actions.
- Reason: The existing Won/Lost UI can save fields successfully and then fail the status transition, leaving partial intent. A single versioned command makes retries, chronology, Event Summary identity, and client/server consistency deterministic.

## D-019 — Collaboration requests carry immutable Deal provenance

- Date: 2026-09-02
- Status: Accepted
- Decision: Transfer/invite requests store target user, previous owner, and Deal version in their audit event. Accept requires matching recipient, request provenance, owner, and Deal version; Reject may close a stale request without mutating the Deal. Ownership changes only on accepted transfer.
- Reason: Notification rows do not contain a command ID or Deal-version snapshot. Without immutable request provenance, a delayed acceptance could apply to a materially different Deal and create a false ownership timeline.

## D-020 — Outbox attempts are lease fencing tokens

- Date: 2026-09-02
- Status: Accepted
- Decision: Claim increments `attempts`; completion, failure, and heartbeat must match item ID, `PROCESSING`, worker ID, claimed attempt, and an unexpired lease. Reaping plus claiming uses one short PostgreSQL transaction with `FOR UPDATE SKIP LOCKED`, committed before external work.
- Reason: Worker ID and expiry alone cannot stop a slow invocation from writing after its lease is reclaimed, especially if an invocation ID is reused. The attempt number provides a monotonic fencing token and bounded retries guarantee eventual `DEAD` state.

## D-021 — Historical backfill never invents missing version 1

- Date: 2026-09-02
- Status: Accepted
- Decision: Backfill plans version 1 only for active Activities still at version 1. If an Activity has advanced without an existing trustworthy version-1 revision, planning fails closed. Existing revision integrity is verified from its own byte-exact content hash and immutable provenance, allowing safe reruns after later edits.
- Reason: Current content from version 2+ cannot reconstruct overwritten original text. Inventing it as version 1 would corrupt chronological memory and undermine auditability.

## D-022 — AES-256-GCM for API Keys

- Date: 2026-09-02
- Status: Accepted
- Decision: Use AES-256-GCM authenticated encryption with a random IV and versioned key ring (from environment variable `AI_SECRET_KEY_RING`) for storing provider secrets.
- Reason: The database cannot store plaintext secrets. Hashes cannot be decrypted by the gateway. CBC lacks authentication. GCM ensures secrecy, integrity, and supports seamless key rotation.

## D-023 — Admin Server Actions over API Routes

- Date: 2026-09-02
- Status: Accepted
- Decision: Implement AI Control Center actions using Next.js Server Actions with strict server-side session and `ADMIN` role checks.
- Reason: Server Actions tightly couple with Next.js sessions and permission context, making them preferable to API Routes except for external webhook callbacks. Prevents relying on client-side UI hiding for security.

## Pending decisions

- Production provider tier and data-handling approval.
- Final Phase 1 schema-patch choices listed in `event-ai-agent-phase-1-design.md` section 13.

## D-024 — AI summaries use a separate immutable revision ledger

- Date: 2026-09-02
- Status: Accepted
- Decision: User-visible summaries are stored as `DealAIEvent` logical records with append-only `DealAIEventRevision` generations/corrections. `ActivityLog` and System Logs are not AI summary storage. Current revision changes use compare-and-swap, and timeline composition reads accepted current revisions with source provenance.
- Reason: Editing a JSON System Log destroyed the original AI output, conflated display projections with memory, and could not guarantee that human corrections survive regeneration.
