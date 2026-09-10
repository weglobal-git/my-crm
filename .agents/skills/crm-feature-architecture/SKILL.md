---
name: crm-feature-architecture
description: >
  Shared architecture rules for adding, changing, or refactoring CRM pages and
  features. Define code ownership, data loading, cache and mutation boundaries,
  and proportionate verification to prevent coupling and unnecessary network
  transfer. Apply alongside relevant domain skills; not a mandate to redesign
  unrelated code or run a full audit for a small edit.
---

# CRM Feature Architecture

Apply these shared rules to CRM feature work. Read the repository AGENTS.md first.
Domain skills add specific business rules and integration requirements: for Pipeline,
also read `../pipeline-deal-panel-architecture/SKILL.md`. Do not copy Pipeline-specific
draft, stage, badge, or mutation APIs into unrelated pages.

## Start with the actual flow

Before editing, trace the relevant entry point, UI, state/cache owner, server operation,
authorization, and callers of shared code. Check actual exports and signatures rather
than copying an example blindly. Report documentation drift; do not redesign a working
API just to match a stale example. Read relevant installed Next.js guides for framework changes.

Briefly state the files to change, their responsibilities, and expected loading/mutation
effects, then proceed within the request. Ask only for missing decisions that materially
affect correctness or product behavior. Preserve unrelated work in the working tree.

## 1. Feature ownership and state preservation

- Pages, panels, and layout containers compose features. Keep complex feature-specific
  business logic out of these containers; colocate it with its feature.
- Reuse existing modules before adding new ones. Extract along responsibilities and
  testable boundaries, not arbitrary line counts. Do not replace a large component with
  an equally coupled giant hook or create a generic framework for one consumer.
- Separate transient UI state, unsaved drafts, and authoritative server data. Define
  their owners; avoid independent copies of the same server data in several components.
- Inactive views must not perform unnecessary work. Choose mounting and code-splitting
  policies deliberately; conditional rendering alone does not reduce imported JS.
- Preserve required draft, focus, and scroll behavior across navigation. Scope drafts
  and cache by the relevant user/tenant/entity/view. Define cleanup on close, logout,
  access loss, and completion. Do not clear newer input when an older submission succeeds.
- Read [references/file-structure.md](references/file-structure.md) when choosing new
  module locations or extracting a substantial feature.

## 2. Data boundaries and loading cost

- Lists/cards receive only data their rendering, filtering, ordering, counts, and
  interactions require. Keep detail/history/AI context out of list DTOs unless required.
- Give each resource an explicit cache-key factory and fetching owner; reuse the same
  cache for shared directories rather than mixing cached and direct fetch paths.
- Load optional detail when needed. Permit bounded intent-based preloading when it
  improves measured UX. Retain necessary summaries/badges and prevent duplicate reads.
- Do not move SSR data into CSR solely to shrink HTML. Compare total workflow transfer,
  first usable content, and subsequent interactions; preserve authorization boundaries.
- For large lists, assess rendering, sorting, and DOM cost separately from payload size.
  Introduce pagination or virtualization only with complete search/count/keyboard/drag
  behavior preserved where applicable.
- No invented percentage savings or guaranteed zero impact. Measure transferred and
  decoded bytes separately, distinguish cold/warm cache and dev/production, and state
  what was not measured. Use query evidence before changing DB indexes or schema.

## 3. Mutation lifecycle and concurrency

- Use an existing feature mutation owner when available. Paint safe optimistic changes,
  expose pending/error state, await critical persistence, and merge authoritative results.
- Scope rollback to the operation, preserving later edits and other users' changes.
  Inverse field patches alone do not protect repeated edits to the same field.
- Choose ordering/version checks or serialization according to actual conflicting
  operations. A local queue does not solve cross-client concurrency. Event IDs dedupe;
  server-issued revisions order changes; timestamps alone are not a universal ordering contract.
- Distinguish confirmed failure from unknown completion after a lost response. For
  retryable non-idempotent operations, reconcile and use server-enforced idempotency
  where required. Never show a business outcome as completed before it is confirmed.
- Enforce permissions and business rules on the server. Critical audit/side effects need
  reliable persistence or a durable mechanism, not an unobserved fire-and-forget promise.

## 4. Cache merging and realtime recovery

- Match updates to cache shape: entity, filtered list, or cursor-paginated pages.
  Do not replace an array/page cache with a single entity. Preserve membership, sort,
  counts, pagination boundaries, and deduplication across affected views.
- Mutation responses and realtime events must follow consistent reconciliation rules.
  Avoid fetching an entire page after a patchable action; retain targeted invalidation
  when required for correctness and inspect sibling consumers before removing it.
- Scope subscriptions to authorized data, clean up listeners, and coordinate recovery
  after missed events. The acting user's confirmation must not depend solely on Pusher.
- On access loss, evict affected cached data and drafts when known, recheck on reconnect,
  and keep server checks authoritative. Do not promise immediate offline eviction.
- Do not introduce WebSockets or a shared mutation framework where the feature does
  not need them; use existing infrastructure and the smallest sufficient contract.

## 5. Verification and enforceable boundaries

- Inspect package scripts and existing tests to select actual checks. No imaginary
  universal CRM verification command: Pipeline uses its documented `verify:pipeline`.
- Test production helpers/hooks, not separately copied simulations. Cover changed
  behavior and material failure/concurrency risks; do not add ceremonial tests for
  trivial reversible edits.
- For changes to loading or dependencies, verify the affected request/bundle behavior
  with a reproducible fixture or scenario. Key-factory unit tests alone do not prove
  browser network isolation; store tests alone do not prove UI draft retention.
- Use existing lint/import restrictions, type checks, integration tests, and budgets.
  Add a focused regression check when needed for the changed risk. Identify missing
  gates explicitly; do not turn an ordinary feature request into an unsolicited CI overhaul.
- Do not disable checks, hide failures, or raise thresholds merely to pass. Keep budgets
  tied to documented environments/fixtures; explain any necessary adjustment.
- Sweep callers when shared code changes. Report files/responsibilities changed, checks
  actually run and their results, network impact measured or unmeasured, and limitations.
  Report unrelated pre-existing failures without silently fixing or masking them.

These instructions guide agents; they are not themselves a linter or CI gate. Do not
claim architecture or performance is mechanically enforced without an implemented check.

## Reusable user prompt

The Thai prompt in [references/general-prompt.md](references/general-prompt.md) can be
copied for any CRM page. It supplies task intent without repeating all architecture rules.
