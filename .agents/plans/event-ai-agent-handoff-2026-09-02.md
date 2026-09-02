# Event AI Agent — Handoff 2026-09-02

## Read first

This is the current continuation checkpoint for `/Users/light/my-crm`.

- Do not assume earlier phase labels mean exit criteria passed. Use the status below.
- Do not apply migrations to Neon `main`. Current database work targets Preview branch `ep-wandering-paper-azila23k`.
- Do not commit until the user reviews and explicitly authorizes it.
- Preserve unrelated dirty-worktree changes.
- `.env` is gitignored and currently contains Preview-only worker/encryption configuration. Never print or commit its secrets.

## Current phase status

| Phase | Status | Meaning |
|---|---|---|
| 1 | Foundation complete | Event ledger foundation and migrations exist. |
| 2 | Foundation complete | Provider config, encryption, gateway, and Admin UI foundation exist. |
| 3 | Remediated, integration exit test pending | Budget and circuit logic were made database-atomic, but real concurrent Preview tests are still required. |
| 4 | Remediated enough for controlled Preview execution | Worker can produce summaries safely in Preview; atomic usage/completion and broader failure recovery still need hardening. |
| 5 | Backend flow passes; browser/two-user QA pending | A real user Activity produced a READY immutable AI Summary. In-app browser could not reach localhost. |
| 6 | Phase 6.1 implemented | Deterministic timeline, read-time Important Facts, and benchmark endpoint exist. Persistent fact lifecycle remains. |

## What was fixed in Phase 3

### Budget

- Replaced read-then-reserve behavior with a PostgreSQL advisory transaction lock per Agent.
- Admission runs in a SERIALIZABLE transaction.
- Counts active `HELD` reservations as well as recorded usage.
- Uses Bangkok day/month boundaries.
- Added idempotent reservation by unique `runId`.
- Reconciliation creates one usage record per `(agentRunId, attempt)` and advances the reservation with compare-and-swap.

### Circuit breaker

- Missing provider config now fails closed.
- Failure transition is protected by provider-specific advisory lock and SERIALIZABLE transaction.
- HALF_OPEN probe respects the five-minute open interval and uses an atomic probe lock.

### Still required for Phase 3 exit

- Real concurrent tests against Preview PostgreSQL: simultaneous budget reservations must never overspend.
- Concurrent circuit failures/probes must prove one correct transition/probe owner.
- Use isolated test rows and clean them after the run.

Relevant files:

- `src/lib/ai/budget.ts`
- `src/lib/ai/circuit-breaker.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260902080000_add_ai_event_revisions/migration.sql`

## What was fixed in Phase 4

- Provider secrets are decrypted only at the provider-call boundary.
- Preview's existing plaintext provider secret was migrated to AES-256-GCM.
- Removed fake `system` ActivityLog writeback. AI output now writes `DealAIEvent` plus immutable `DealAIEventRevision`.
- Added targeted `AI_EVENT_READY` Pusher notification.
- Worker now loads provider/model/prompt/schema/limits from the active `AIModelPolicy`; hard-coded model selection was removed.
- Preview policy was changed from retired `gemini-1.5-flash-001` to provider-advertised `gemini-2.5-flash`.
- Replaced `findFirst` then `update` claim race with one PostgreSQL `FOR UPDATE SKIP LOCKED` claim/update statement.
- Added worker ID, attempt and live-lease fencing to completion/failure updates.
- Cron route fails closed unless both `FEATURE_FLAG_AI_WORKER=true` and `CRON_SECRET` are configured.
- Added an immediate `after()` dispatch after Activity persistence/Pusher. The durable cron remains the retry safety net, so posting does not wait for Gemini.
- Added stage-specific normalized worker errors such as `..._BUDGET_ADMISSION` and `..._PROVIDER_CALL`.

### Still required for Phase 4 exit

- Make AI writeback, AgentRun completion, usage ledger, and reservation reconciliation one recoverable consistency protocol. Today usage reconciliation follows the completion transaction.
- Add explicit pricing/version calculation; controlled run currently records zero cost with provider token usage.
- Validate structured provider output at runtime before writeback.
- Add lease heartbeat or guarantee provider timeout remains safely below lease duration.
- Add integration tests for two workers claiming concurrently, lease loss, retry, DEAD transition, and idempotent replay.
- Review old failed/completed test AgentRuns and reservations in Preview; retain audit rows unless the user explicitly approves cleanup.

Relevant files:

- `src/lib/ai/processor.ts`
- `src/lib/ai/dispatch.ts`
- `src/app/api/cron/process-outbox/route.ts`
- `src/lib/ai/gateway.ts`
- `src/lib/ai/adapters/gemini.ts`
- `src/lib/ai/context-builder.ts`
- `src/lib/ai/prompts/event-summarizer.ts`
- `src/lib/actions/opportunity.ts`

## What was fixed in Phase 5

- Fixed the blank AI Summary tab caused by rendering it inside the Activity/System-only branch.
- Summary data is fetched with a separate SWR key only when the Summary tab is opened.
- Summary cards read `DealAIEvent.currentRevision`, not generated ActivityLogs.
- User correction appends a `USER` revision in a SERIALIZABLE compare-and-swap transaction; it never overwrites raw Activity or an AI revision.
- `AI_EVENT_READY` mutates only the affected Deal's summary SWR cache.
- Added explicit tab semantics and Summary heading/search state.

Relevant files:

- `src/components/pipeline/EditDealPanel.tsx`
- `src/components/pipeline/AISummaryCard.tsx`
- `src/lib/actions/ai-events.ts`

### Real Preview evidence

User source text: payment received 500,000 with 90,288 THB remaining.

Verified chain:

- Activity: `cmtjtutki0005s775famsgtd6`
- Domain event: `cmtjtutpr0009s775cvpuhpzb`
- Outbox: `cmtjtutre000bs775xc8dtn9i` → `COMPLETED`, one successful attempt after controlled reset
- AI event: `cmtjuawna0004s7m2cb30hdcy` → `READY`
- Current revision: `cmtjuawpr0006s7m29ue56fmb`, author `AI`, revision 1
- Model: `gemini-2.5-flash`
- Provider-reported total: 743 tokens
- Usage records for successful run: 1

Generated summary: `Customer paid 500,000, leaving a remaining balance of 90,288 THB.`

### Still required for Phase 5 exit

- Visual test in the user's signed-in browser: reload Pipeline, open the same Deal, select AI Summary, confirm the card is visible.
- Post a new unique test Activity and verify the `after()` dispatch produces a new summary without manually calling cron.
- Open the same Deal as a second authorized user and verify targeted Pusher convergence without duplicate cards or broad board revalidation.
- Correct the summary, verify revision 2 has author `USER`, then refetch and verify correction survives.
- Test unauthorized user/deal access and ensure no summary data or private Pusher event leaks.

The Codex in-app browser repeatedly returned `ERR_CONNECTION_REFUSED` for localhost while host-side curl succeeded, so do not claim browser QA is complete.

## Phase 6 work already started

- `src/lib/ai/timeline.ts` composes a deterministic 30–60 day timeline.
- Groups using stored `localEventDate`; never merges two events into one line.
- Includes event/revision provenance and enforces an estimated-token bound.
- `getDealAITimeline` applies Opportunity authorization.
- Two timeline unit tests cover grouping/provenance and token truncation.

### Phase 6.1 continuation completed

- Added deterministic `composeImportantFacts`; only importance 4–5 summaries and explicit structured blockers qualify.
- Every fact line retains `source:eventId` and `revision:revisionId`; separate events are never merged.
- Added independent Timeline/Fact token budgets.
- Removed duplication: events already included in the Recent Timeline are excluded from the Important Facts section.
- Added authorized `getDealAIContextBenchmark`; it compares raw active COMMENT content with composed context without returning raw content.
- The estimator is explicitly labelled `ceil(UTF-16 characters / 4)` and must not be presented as provider billing-token truth.
- Timeline tests now cover five cases: grouping, budget, fact provenance, independent budgets, and recent/fact deduplication.

Measured Preview sample (`#OEM - Keratin Treatment`):

| Window | Raw activities | Raw estimated tokens | Composed estimated tokens | Estimated reduction |
|---|---:|---:|---:|---:|
| 30 days | 3 | 32 | 46 | -43.75% (worse) |
| 60 days | 3 | 32 | 46 | -43.75% (worse) |
| 365 days | 4 | 70 | 46 | 34.29% better |

Interpretation: composition has fixed heading/provenance overhead and is not economical for a very sparse 30–60 day history. The future context selector should return raw bounded events when raw token estimate is smaller, and switch to composed Timeline/Facts only when it saves tokens or provides required long-term structure. Do not claim universal token reduction from this sample.

Still required:

- Design and migrate `DealAIFact` (or an equivalent persistent-fact projection).
- Implement contradiction/supersession lifecycle.
- Benchmark a representative set of sparse and dense Deals and implement the cheaper-context selection rule.
- Add deterministic rebuild/parity verification.

## Verification completed

- `npm run build` passed after Prisma generation.
- `npx tsc --noEmit` passed.
- Targeted ESLint passed.
- `git diff --check` passed.
- `./node_modules/.bin/tsx --test src/lib/**/*.test.ts` passed: 95 tests, 0 failures.
- A production server was started successfully on port 3003 after the controlled test.

Important: plain `node --test` does not resolve the project's extensionless TypeScript imports and fails. Use `tsx --test` as shown above.

## Recommended next actions

1. Confirm the AI Summary card visually in the user's browser.
2. Perform the new-post automatic-dispatch test and a two-user Pusher convergence test.
3. Add Preview DB concurrency integration tests for Budget, Circuit Breaker, and Outbox claim fencing.
4. Harden Phase 4 completion/usage consistency and runtime schema validation.
5. Complete Phase 6 Important Facts plus token benchmark.
6. Update `event-ai-agent-execution.md` after every material result.
7. Do not commit until the user reviews the diff and authorizes commit.

## Prompt for the next AI Agent

> Continue Event AI Agent work in `/Users/light/my-crm`. Read `.agents/plans/event-ai-agent-handoff-2026-09-02.md`, `.agents/plans/event-ai-agent-execution.md`, and `.agents/plans/event-ai-agent-decisions.md` first. Preserve the dirty worktree and do not commit or touch Neon main. Start by completing Phase 5 browser/two-user convergence tests on the Preview database, then implement real Preview concurrency tests for Phase 3 and Phase 4. Treat the Outbox and immutable revision ledger as sources of truth. Record evidence and remaining uncertainty in the execution checkpoint before handing off.
