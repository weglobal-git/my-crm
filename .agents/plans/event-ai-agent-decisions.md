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

## D-025 — AI Manager authorization fails closed at field and memory boundaries

- Date: 2026-09-02
- Status: Accepted
- Decision: Phase 7 begins with read-only server tools. Every tool composes Deal row authorization with department menu-derived field capabilities. Existing unclassified AI Summary/Fact text is readable only by actors authorized for every source category it may contain; future visibility metadata may safely narrow that restriction.
- Reason: Deal-level access alone does not imply permission to view customer, product, commercial, activity, or AI-derived text. Filtering after an LLM call is too late because unauthorized data has already entered the prompt.

## D-026 — AI visibility is immutable source metadata

- Date: 2026-09-02
- Status: Accepted
- Decision: Every AI revision and derived fact stores a versioned list of required capabilities. Activity-derived summaries require Activity access; source types without an approved field classifier use the restrictive unclassified scope. Corrections and facts inherit their source revision scope.
- Reason: Recomputing visibility from current roles can expose historical text after a permission-model change. A source-time snapshot is auditable, and per-record checks allow safe sharing without granting access to unrelated customer or commercial content.

## D-027 — AI Manager starts with deterministic read-only board tools

- Date: 2026-09-02
- Status: Accepted
- Decision: Board risk begins as deterministic code over already-authorized basic Deal fields, with bounded rows/tokens and source citations. `AI_MANAGER` has a separate AgentKey, but no LLM orchestration or mutating tools are enabled until tool auditing and security evaluations pass.
- Reason: Rule-based overdue/stale detection is cheaper, explainable, and resistant to prompt injection. Separating the Agent key permits independent budgets and emergency pause controls later.

## D-028 — Manager tool audit stores hashes, not CRM payloads

- Date: 2026-09-02
- Status: Accepted
- Decision: Every Manager tool execution is audited as allowed or denied using a canonical input hash, granted capability snapshot, result count, latency, and normalized error category. Ordinary audit rows never store raw tool input, prompts, summaries, or customer content.
- Reason: Operations need traceability and anomaly monitoring, but duplicating sensitive CRM text into logs would expand the permission and retention surface.

## D-029 — Tool output is untrusted and every Manager claim is cited

- Date: 2026-09-02
- Status: Accepted
- Decision: Tool payloads are serialized inside an explicit untrusted-data boundary. Manager output uses a strict schema where each factual claim has one or more citation IDs that must exist in the server-built citation manifest.
- Reason: CRM activities can contain prompt-injection text. The model cannot gain tools or permissions from data, and invented evidence must be rejected before user display.

## D-030 — Manager orchestration is server-selected and display output is claim-derived

- Date: 2026-09-02
- Status: Accepted
- Decision: The AI Manager receives context from a fixed server-side read-only registry selected by Deal/board scope; it cannot request arbitrary tools. Before display, every claim must reference a server-issued citation, and displayed answer text is reconstructed only from those validated claims. Manager runs use a distinct active policy, budget, circuit breaker, trace, and nullable interactive `AgentRun` provenance.
- Reason: Allowing model-selected tools or uncited narrative creates prompt-injection and authorization bypass paths. Reusing mandatory Event Summarizer provenance would require fake event IDs and corrupt operational audit history.

## D-031 — ADMIN may review the Manager shell before provider activation

- Date: 2026-09-02
- Status: Accepted
- Decision: Show the AI Manager entry and disabled preview dialog to ADMIN even when the Manager feature flag is off. Keep submission disabled and explain the missing activation gates. Non-ADMIN users do not receive the entry point in this initial UX slice; server authorization remains mandatory regardless of UI visibility.
- Reason: Product can review placement, language, and safety disclosure without spending tokens or exposing CRM data. Hiding the entire surface until activation would mix UX approval with provider/privacy rollout and encourage unsafe flag changes merely to inspect the interface.

## D-032 — Provider pricing is policy-versioned and thinking is disabled for bounded extraction

- Date: 2026-09-02
- Status: Accepted
- Decision: Store input/output USD-per-million-token pricing as integer micros on each model policy and reconcile each run from provider-reported tokens. Count Gemini thinking tokens as output and request a zero thinking budget for Event Summary/AI Manager structured extraction.
- Reason: A hard-coded zero cost defeats budget enforcement, while global mutable pricing makes historical run costs irreproducible. The synthetic canary showed that a low output cap can be exhausted entirely by hidden thinking before structured JSON is emitted.

## D-033 — Event Summarizer policy v2 and runtime cost reconciliation

- Date: 2026-09-02
- Status: Accepted
- Decision: Version the active Event Summarizer policy to v2 on Preview with $0.30 input / $2.50 output per million tokens and increase per-run reservation to $0.0025 (2,500 micros) to safely exceed worst-case token cap cost ($0.00185). Update `processor.ts` to compute actual cost from reported usage and policy pricing rather than hardcoding zero.
- Reason: The legacy v1 policy had zero pricing and a $0.001 limit, which caused budget reservations to fall short of token-cap worst case and prevented accurate usage ledger recording.

## D-034 — Editable Manager instructions are policy-versioned, not permission controls

- Date: 2026-09-03
- Status: Implemented; ADMIN UI acceptance pending the disabled admin flag
- Decision: Store every Manager instruction block in nullable `AIModelPolicy.managerPrompt`. ADMIN publishing creates a new policy snapshot plus audit, with stale-policy protection. Existing model, prices and budget are preserved. Null policies use documented defaults. Read-only registry, authorization, source validation and cost admission remain enforced in code.
- Reason: Product needs direct prompt iteration without code deployment, but prompt editing must not grant database access or rewrite historical run configuration.

## D-035 — Citations open the canonical card without navigating away

- Date: 2026-09-03
- Status: Implemented and browser verified
- Decision: Server-built citations include the canonical Deal ID. Client calls an authorized single-card read and opens the existing Kanban panel. Chat is a nonmodal bottom-left widget, lazy-loaded on first open and retained only in memory while mounted.
- Reason: Search-by-label/new-tab links are ambiguous and interrupt the workflow. Rechecking current access prevents old chat citations from bypassing revoked Deal permissions.

## D-036 — Retire AI Manager; retain Summary pending product review

- Date: 2026-09-03
- Status: Manager removal implemented at explicit user request; Summary redesign proposed only
- Decision: Remove Manager-specific runtime/UI/admin prompt code and tests. Preserve Summary/shared services, DB usage/provenance history and applied migrations. Extract shared permissions/visibility/pricing into `src/lib/ai/` so Summary has no dependency on Manager. Remove local Manager flag; no DB mutation, deployment or commit in this slice.
- Reason: Current board-wide Manager does not demonstrate enough value over deterministic filters/sorts for the user's workflow. Prefer evaluating on-demand per-card synthesis with citations rather than extending Manager by default. Raw activity should remain durable regardless of LLM invocation frequency.
- Supersedes: D-030/D-031/D-034/D-035 as active Manager rollout instructions; preserves them as historical decisions. D-032/D-033 pricing principles remain relevant to Summary.
- Next authorization: Summary trigger changes/on-demand implementation require a new approved scope. Security/lifecycle findings and evaluation plan are recorded in `ai-summary-product-review-2026-09-03.md`; no claim of complete Summary safety audit.

## D-037 — Card Bot is a Summary shortcut, not a generation trigger

- Date: 2026-09-03
- Status: Implemented at user request
- Decision: Place the Bot above the due-date bell on each authorized card. It opens the standalone Summary right-menu section. Activity retains only Activity/System sub-tabs. Check for updates reloads saved Summary records; generation frequency remains unchanged.
- Reason: Summary is separate from human Activity and System Logs. A visible Bot must not imply an up-to-date summary exists or incur a provider call when clicked. Source event time and revision creation time are labeled separately to prevent misleading freshness claims.

## D-038 — Complete Elimination of 1-to-1 Event Ledger & Outbox Over-Engineering

- Date: 2026-09-03
- Status: Approved by User and Implemented (7,351 lines eliminated)
- Decision: Completely remove the complex Event Ledger (`src/lib/event-ledger/`), Fact Graph (`fact-lifecycle.ts`, `fact-resolver.ts`, `circuit-breaker.ts`), and worker processor loops. Revert `opportunity.ts` mutations back to instant, direct Prisma CRUD (`prisma.activityLog.create`, `prisma.activityLog.delete`). Delete all obsolete Phase 0/1 plan files and maintain `current-ai-architecture.md` as the single source of truth.
- Reason: Logging every comment/update into duplicate event ledgers and running background event processors caused excessive complexity, potential database strain, and dead code without user benefit. The user requested pure 1-click on-demand AI summarization directly from existing database records.

## D-039 — Removal of Obsolete AI Control Center and Dashboard Optimization

- Date: 2026-09-03
- Status: Approved by User and Implemented
- Decision: Remove the redundant `AI Control Center` tab from `/system/general` and delete `AIControlCenter.tsx`. Retain the AI Usage & Budget card inside the unified System Dashboard. Optimize System Dashboard by implementing 3-minute in-memory caching for Cloudinary and Google Drive APIs and decoupling card loading states into independent skeletons so they do not block sidebar navigation or page rendering.
- Reason: The prompt settings are now managed directly in context within `EditDealPanel`, making a separate AI Control Center page redundant and confusing. Heavy third-party API calls caused navigation lag when clicking sidebar items.

## D-040 — Native In-Panel Tab for AI Prompt Settings (Exposing Task Instruction)

- Date: 2026-09-03
- Status: Approved by User and Implemented
- Decision: Replace the floating popup modal with a native sub-tab pill switcher (`[ ✨ Summary ]` vs `[ ⚙️ Prompt Settings ]` for Admin) inside `EditDealPanel`. Expose both the **System Instruction** (AI Persona and Tone) and the **Task Instruction** (Analysis Topics & Guidelines: Overview, Key Highlights, Blockers & Risks, Next Steps) along with optional Custom Instructions. Persist configurations into `AIConfigAuditLog` via Server Actions.
- Reason: Floating modal overlays violated the application's clean design system. Users need full control not just over the AI's persona, but specifically over *what topics and questions the AI is instructed to summarize* without having to edit backend source code.
