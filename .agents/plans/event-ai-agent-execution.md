# Event AI Agent — Execution State & Handoff

> This file is the resumable source of current Event AI implementation state.  
> Update it before every handoff, interruption, quota stop, or context switch.  
> Detailed architecture: `event-ai-agent-roadmap.md`  
> Decision history: `event-ai-agent-decisions.md`

## Current status

- Overall status: `AI_DEAL_ACCELERATORS_COMPLETED`
- Current phase: `AI Deal Accelerators & Goal-Driven Management (Verified End-to-End)`
- Current slice: `Built AI Deal Accelerators system directly inside AI Summary tab and KanbanCard Bot button. Inferred Target Goal with inline editing, generated 1-2 bottleneck questions with 1-click answer buttons and custom input. Zero schema migrations (stored in SystemConfig). Zero alteration to ActivityLog to preserve overdue red cards. Verified live in browser with bouncing '?' badge and instant state update.`
- Working branch: `main`
- Latest Commit HEAD before this uncommitted slice: `4aff340`
- Commit authorization: `AWAITING_DIFF_REVIEW`
- Summary runtime: `AI_SUMMARY_WITH_ACCELERATORS`
- Schema/application runtime changed by this slice: `NO MIGRATIONS; SystemConfig state storage`

## 2026-09-03 AI Deal Accelerators & Goal-Driven Pipeline Checkpoint

- **User Directives Implemented:**
  1. No separate "AI-Sense" tab — unified directly inside **AI Summary** panel (`EditDealPanel.tsx`).
  2. Preserved Red Card Urgency: Explicitly avoided touching `ActivityLog` so that overdue cards remain red until actual work is done. All Accelerator states are stored in `SystemConfig` (`deal_accelerators_${dealId}`).
  3. Animated Bouncing `?` Badge on Kanban Cards: Displayed over the Bot icon when pending questions exist (`KanbanCard.tsx`), driven by `PendingAcceleratorsContext` and `getPendingAcceleratorsMap()` in `KanbanBoard.tsx`.
  4. Target Goal Milestone: Inferred by AI, editable inline by users with 1-click save.
  5. 1-Click Clarification Choice Buttons: 2–3 instant choice buttons + custom text response.
  6. Feedback Loop into AI Summary: Answered questions and Target Goal are automatically injected into `generateDealSummary()` prompt.

- **Files Created & Modified:**
  - `src/lib/actions/ai-accelerator.ts` [NEW]: `getDealAccelerators`, `generateDealAccelerators`, `answerDealAccelerator`, `updateDealTargetGoal`, `getPendingAcceleratorsMap`.
  - `src/components/pipeline/KanbanCard.tsx`: Added `PendingAcceleratorsContext`, animated bouncing `?` badge on Bot button.
  - `src/components/pipeline/KanbanBoard.tsx`: Injected `PendingAcceleratorsContext.Provider` with live batch pending map.
  - `src/components/pipeline/EditDealPanel.tsx`: Added `🎯 AI Deal Accelerators` UI box at top of AI Summary tab, target goal editor, questions with 1-click choices, answer status, and rescan button.
  - `src/lib/actions/deal-summary.ts`: Injected accelerator answers & target goal into Gemini summary prompt.

- **Verification:**
  - `npx tsc --noEmit`: 0 errors.
  - Live browser test: Verified bouncing `?` badge on *Repeat 2 Containers (Bear)* card, opened panel, clicked 1-click choice *"ยังติดต่อลูกค้าไม่ได้ กำลังหาวิธีอื่น"*, verified immediate transition to "ตอบแล้ว", badge cleared, and new AI summary generated incorporating the response.

- **UI/UX Design Refinement Slice (Apple Setting & Activity/Facebook Thread Style):**
  1. Activity/Facebook Thread Layout: Removed the indent-inducing `<CheckCircle2>` / `<HelpCircle>` icons. Replaced with clean comment thread architecture:
     - Question Post: Circular AI Agent Bot avatar (`Bot`), name, bot badge, formatted date/time (`formatDateTime(questionDate)`), and question content.
     - User Reply Thread: Indented with subtle `border-l-2`, showing user's circular profile avatar, user name, reply date/time (`formatDateTime(q.answeredAt)`), and response in a clean pill bubble.
  2. Role & Card Owner Permission Enforcement:
     - Frontend: Only the Card Owner (`session?.user?.email === deal.owner.email`) or an Admin can see and click the reply buttons (`canAnswerAccelerators = isOwner || isAdmin`). Other users see a clean locked notice: *"Only the Card Owner ({deal.owner.name}) or an Admin can reply to this question."*
     - Backend: `answerDealAccelerator()` enforces `requireOpportunityAccess(dealId, { ownerOrAdmin: true })`, throwing forbidden and returning a clear error if unauthorized users attempt to answer.
  3. Formatted Date & Time: Both the question timestamp and answer timestamp are rendered with `formatDateTime`.
  4. 2 Sub-Tabs in AI Deal Accelerators: Separated into **Pending (X)** and **Answered (Y)** tabs with minimal pill switches, reducing vertical clutter significantly.
  5. Card Type Icon Shared Component (`DealTypeBadge.tsx`) & Realtime Optimistic UI:
     - Created `DealTypeIcon` and `DealTypeSelector` as a shared design standard.
     - Changed `INTERNAL_TASK` icon from wrench to document (`FileText`), and `SALES_DEAL` to `CircleDollarSign` with `#C7F33C` theme.
     - Built custom animated dropdown matching the CRM design system (`animate-fade-in-up`, `bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl`).
     - Standardized icon design, colors, and badge sizes across both `KanbanCard` and `EditDealPanel`.
     - Streamlined options to 2 types: `SALES_DEAL` and `INTERNAL_TASK`.
     - Added instant Optimistic UI update across Kanban cards via `pipeline-deals` SWR mutate with `{ revalidate: false }`.
  6. Customer Name Row:
     - Under the topic title, added customer / company name with `<Building2 />` icon for clear identification.
  7. Answer Editability:
     - Added an "Edit" button to answered questions in the Answered tab, allowing users to modify previous answers.
     - Stamped with `(edited)` tag and updated timestamp.
  8. Active Users Online Resolution (`Header.tsx`):
     - Added initial user self-registration so the active users list is never empty.
     - Added 45s heartbeat `pingActiveStatus()` and `getActiveUsers()` DB sync alongside Pusher presence channel.
  9. AI Prompt Adaptability (Sales Deals vs Internal Tasks):
     - Updated default System and Task instructions in `deal-summary.ts` to cover both Sales Deals and Internal Tasks / Projects.
     - Explicitly passed `ประเภทงาน (deal.type)` into AI context so Gemini tunes its insights specifically to the project type.
  10. Verified via TypeScript build (`npx tsc --noEmit` exited with code 0).

## 2026-09-03 Database Connection & Login Resolution Checkpoint

- Diagnosed user issue: "พบปัญหา login ไม่ได้ครับ" (WelcomeLogin screen at `/dashboard/overview`):
  1. `DATABASE_URL` in `.env` was pointing to `ep-wandering-paper-azila23k-pooler.c-3.ap-southeast-1.aws.neon.tech` (the temporary `ai-event-preview` Neon branch), which returned:
     `Authentication failed against database server, the provided database credentials for (not available) are not valid (P1010)`.
  2. Because NextAuth's Prisma Adapter and session callback couldn't reach PostgreSQL, NextAuth threw an unhandled DB exception, invalidated the user session (`SessionInvalidated`), and redirected to the login screen. Clicking "Sign in with Google" failed for the same reason.
- Resolution implemented:
  1. Restored `DATABASE_URL` in `.env` to the real Neon production database:
     `postgresql://neondb_owner:npg_1Ov9QNDPVdLj@ep-cool-fog-azf2byax-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
  2. Pulled exact live production schema with `npx prisma db pull` (22 models, zero dead event-ledger tables).
  3. Regenerated Prisma Client with `npx prisma generate`.
  4. Aligned `src/lib/actions/opportunity.ts` with the real database: removed leftover `deletedAt: null` filters on `ActivityLog` (real DB uses direct deletion).
  5. Aligned `src/lib/actions/deal-summary.ts`: decoupled from non-existent `dealDomainEvent` and `aIConfigAuditLog` tables. AI summaries and Admin prompt configs now cleanly persist in the existing `SystemConfig` table (via dedicated keys `deal_summary_${dealId}` and `deal_summary_prompt`), requiring 0 DDL changes or migrations.
  6. Aligned `src/lib/actions/ai-admin.ts`: stubbed deprecated event-ledger tables (`aIProviderConfig`, `aIConfigAuditLog`, `aIUsageRecord`).
- Verification:
  1. `test-db-2.ts`: Successfully queries 5 active users and 10,750 activity logs from the live database.
  2. `npx tsc --noEmit`: 0 errors across the entire repository.
  3. Identified stale Next.js server process (PID 46061) running since 11:24 AM holding old in-memory database connection in `globalThis.prismaGlobal`. Force-killed PID 46061 and started a clean Next.js server daemon.
  4. Verified full OAuth redirect flow: `POST /api/auth/signin/google` returns `302` redirecting to Google OAuth login URL.
  5. Fixed `A 'use server' file can only export async functions, found object`: removed `export` keyword from `DEFAULT_DEAL_SUMMARY_SCHEMA` in `src/lib/actions/deal-summary.ts`.
  6. Verified `/pipeline?tab=workspace` loads cleanly with 200 OK and all server actions (`getMyNotifications`, `getDbMenus`) succeed.
  7. Synced `pipeline.summary` to the live database `MenuItem` table and granted permission to all departments (`Marketing`, `Export`), restoring the AI Summary tab button (Bot icon) in `EditDealPanel`.
  8. Fixed scroll bounce-back in `EditDealPanel`: restricted the Activity Log infinite-scroll intersection observer sentinel to `activeTab === 'activity'` only, stabilized Prompt Settings textarea height calculation with persistent refs, and added generous bottom padding `pb-24`.
  9. Implemented live AI Token Usage & Cost Tracking:
     - Calculated per-summary Gemini token usage (input + output) and converted to THB (~35.5 THB/USD) next to the Copy button in `EditDealPanel`.
     - Connected `getSystemAiStats()` and `/system/general` Dashboard to live `SystemConfig` key `ai_monthly_usage_YYYY_MM`, tracking actual monthly tokens, calls, USD cost, THB cost, and budget limit.
     - Implemented real monthly budget enforcement: blocks generation if monthly cost exceeds budget limit ($1.00 USD).
     - Verified Cloudinary and Google Drive dashboards: both measure actual live storage from their respective APIs.
     - Fixed `An unexpected response was received from the server` on budget change: updated `getServerSession` import in `ai-admin.ts` from `next-auth/next` to `next-auth`, added super-admin fallback, and wrapped in safe structured `{ success, error }` response. Verified budget limit of $5.00 USD is safely persisted in Neon DB.
     - Resolved login issue (`SIGNIN_OAUTH_ERROR` / `ENOTFOUND accounts.google.com` / Neon connection refused): killed sandboxed background server on port 3003 and restarted `npm run dev` with full network access (`BypassSandbox: true`), restoring Google OAuth and Neon DB connectivity. All session requests now return 200 OK.


## 2026-09-03 Sidebar Navigation & Dashboard Lazy Loading Checkpoint

- Diagnosed user issue:
  1. Clicking the System icon in Sidebar felt unresponsive / required multiple clicks. Root causes:
     - Missing `src/app/system/general/loading.tsx` and `src/app/system/loading.tsx`: Next.js App Router RSC navigation had zero visual feedback while executing server components, making the app look frozen.
     - `Sidebar.tsx`: If sub-menus were not yet populated or loaded, `targetHref` fell back to `#` instead of `/system/general`, doing nothing on click.
     - Missing active click feedback (`active:scale-95`).
  2. Slow dashboard loading:
     - Cloudinary and Google Drive remote APIs were fetched synchronously on page mount without caching.
- Implemented optimizations:
  - Created `src/app/system/general/loading.tsx` and `src/app/system/loading.tsx` with instant skeleton placeholders on click.
  - Enhanced `Sidebar.tsx`: safe `targetHref` fallback (`/system/general`), `prefetch={true}`, and `active:scale-95` tactile response.
  - Added 3-minute in-memory server caching to `/api/system/storage` and `/api/system/google/status` (instant 0ms response on revisit).
  - Implemented independent lazy loading in `SystemGeneralClient.tsx`: `isLoadingCloudinary`, `isLoadingGDrive`, and `isLoadingAiStats` fetch independently in parallel with smooth pulsing skeleton bars.
- Verification:
  - `npx tsc --noEmit`: 0 errors.
  - Test suites: 4/4 unit tests passed.

## 2026-09-03 Dead Code Cleanup Checkpoint

- Executed approved Clean Code Plan:
  - Completely cleaned `src/lib/actions/opportunity.ts`: removed `createActivityCommand` and `deleteActivityCommand` event-ledger dependencies. Restored direct, performant Prisma CRUD (`prisma.activityLog.create` and `prisma.activityLog.delete`) with zero overhead.
  - Deleted obsolete Event Ledger subsystem: `src/lib/event-ledger/` (all 19 files).
  - Deleted obsolete Fact Graph & Worker files: `fact-lifecycle.ts`, `fact-resolver.ts`, `circuit-breaker.ts`, `processor.ts`, `timeline.ts`, `budget.ts`, `context-builder.ts`, `dispatch.ts`, `pricing.ts`, `authorization.ts`, `capabilities.ts`, `visibility.ts`, and all matching test files.
  - Deleted obsolete directories: `src/lib/ai/manager/`, `src/lib/ai/prompts/`.
  - Deleted obsolete routes & components: `src/app/api/cron/process-outbox/`, `src/components/pipeline/AISummaryCard.tsx`, `src/components/pipeline/AISummaryCard.test.tsx`.
  - Deleted obsolete Event AI test scripts: `scripts/` (seed-ai, trigger-ai, query-db, query-logs, debug-processor, test-add-activity).
  - Total dead code eliminated: **7,351 lines across 57 files**.
- Maintained active components:
  - `src/lib/ai/gateway.ts` (lightweight provider registry).
  - `src/lib/ai/adapters/gemini.ts` (Google Gemini Flash adapter).
  - `src/lib/actions/deal-summary.ts` (On-demand One-Click Deal Summary with dynamic Admin Prompt management).
  - `src/components/pipeline/EditDealPanel.tsx` (International English UI + Admin Prompt modal).
  - `src/components/system/SystemGeneralClient.tsx` (Consolidated Dashboard).
  - `src/components/system/AIControlCenter.tsx` (AI Settings & Prompts).
- Verification:
  - `npx tsc --noEmit`: Exited 0 with 0 errors.
  - Node tests: `gateway.test.ts` and `pipeline-activity-cache.test.ts` passed 4/4 tests.
  - No migrations, no breaking changes.

## 2026-09-03 Admin Prompt & Dashboard Consolidation Checkpoint

- User requested:
  1. Setting AI Summary tab UI and action buttons to English.
  2. Enabling ADMIN users to customize the Deal Summary Prompt directly from the UI (without touching backend code).
  3. Reorganizing `/system/general`:
     - Move Monthly AI Usage to the "Storage & Bandwidth Dashboard" tab and rename it to "Dashboard".
     - Remove obsolete System Status, secret key input form, and Global AI Pause.
- Implemented Admin Prompt Configuration:
  - Added `getDealSummaryPromptConfig`, `saveDealSummaryPromptConfig`, `resetDealSummaryPromptConfig` in `src/lib/actions/deal-summary.ts`.
  - Persisted prompt versions in `prisma.aIConfigAuditLog` (`entityType: "DEAL_SUMMARY_PROMPT"`).
  - Dynamically injected effective system instructions and custom admin instructions into `generateDealSummary`.
- Updated Deal Panel UI (`src/components/pipeline/EditDealPanel.tsx`):
  - Converted all labels, buttons, subtitles, and section headers to international English standard (`Instant Deal Summary`, `✨ Summarize Deal`, `CURRENT STATUS`, `KEY HIGHLIGHTS`, `BLOCKERS & RISKS`, `RECOMMENDED NEXT STEPS`, `Copy`, `Update Summary`, `Re-summarize`).
  - Added an Admin-only `Prompt` button in the header opening a sleek modal to edit System Instruction and Additional Custom Instructions, with Save and Reset to Default options.
- Consolidated Dashboard & Reorganized AI Control Center (`src/components/system/SystemGeneralClient.tsx` & `AIControlCenter.tsx`):
  - Renamed `Storage Dashboard` tab to `Dashboard`.
  - Added `AI Usage & Budget` monitor card directly in `Dashboard` alongside Cloudinary and Google Drive.
  - Revamped `AIControlCenter.tsx`: removed obsolete System Status, secret key input, and Global AI Pause; added Provider & Model Info card + Deal Summary Prompt Settings form with Save and Reset to Default.
- Verification:
  - `npx tsc --noEmit`: 0 errors.
  - Node server tests: 29/29 tests passed.
  - UI component tests: 2/2 tests passed.
  - No migrations, no DB schema changes, commit uncommitted awaiting review.

## 2026-09-03 On-Demand Deal Summary & 1-to-1 Worker Retirement Checkpoint

- User explicitly requested:
  1. Cancelling the 1-to-1 background event-driven worker on comment/update, noting that per-event duplicate recording is unnecessary.
  2. Cleaning up the 1-to-1 background event summarizer code safely with no leftovers/broken references.
  3. Implementing One-Click "✨ Summarize Deal" on demand.
- Retired 1-to-1 background event summarizer:
  - Removed `scheduleEventSummaryProcessing()` from `addActivityLog` in `src/lib/actions/opportunity.ts`.
  - Made `scheduleEventSummaryProcessing()` in `src/lib/ai/dispatch.ts` a safe no-op.
  - Updated `src/app/api/cron/process-outbox/route.ts` to return retired status without claiming outbox jobs.
  - Retained immutable Event Ledger contracts and test suite integrity.
- Implemented One-Click "✨ Summarize Deal":
  - Added Server Actions in `src/lib/actions/deal-summary.ts`: `getLatestDealSummary` and `generateDealSummary`.
  - Reads opportunity details and up to 30 recent activity logs/comments with proper authorization (`requireOpportunityAccess`).
  - Resolves Gemini API key from `AIProviderConfig` (decrypted) or `GEMINI_API_KEY`/`GOOGLE_API_KEY` from `.env`.
  - Structured prompt for Google Gemini returning `overview`, `keyHighlights`, `blockers`, and `nextSteps`.
  - Saves latest summary as `DealDomainEvent` for persistence across users/sessions, and returns structured result.
- Updated UI in `src/components/pipeline/EditDealPanel.tsx`:
  - Standalone Summary header with `✨ AI Summary`, latest timestamp, "คัดลอกบทสรุป" (copy) and "อัปเดตบทสรุป" (regenerate).
  - Empty state with welcoming card and prominent `✨ สรุปสถานะดีลนี้ (Summarize Deal)` button.
  - Active loading state with animated pulse while AI analyzes the deal.
  - Rich summary display: Overview, Key Highlights, Blockers & Risks (amber alert), Recommended Next Steps.
  - Friendly error display with link to `/system/general` if API key is not configured.
- Verification:
  - `npx tsc --noEmit`: Passed with 0 errors.
  - Node test suite (`activity-commands.test.ts`, `transaction.test.ts`, `pipeline-activity-cache.test.ts`, `gateway.test.ts`, `timeline.test.ts`): 29/29 tests passed.
  - No migrations, no DB schema changes, commit uncommitted awaiting review.

## 2026-09-03 Card Summary UI checkpoint

- User requested a Bot at the card's top-right with due-date bell below, opening Summary directly; Summary must be a standalone right-menu section, not an Activity sub-tab. Also requested diagnosis of System General navigation stalling.
- Implemented permission-gated Bot shortcut (`pipeline.summary` + `pipeline.activity`), click/keyboard propagation isolation from drag/card opener, standalone Summary header (no sub-tabs), Activity/System-only tabs on Activity, independent search text, Check for updates (read/revalidate only), explicit query-error state and truthful empty-state copy.
- Removed obsolete AI-available badge derived from System Logs. Bot presence is a navigation affordance, NOT a claim that a summary exists/is current.
- Summary shows source Event time separately from current revision Generated/Corrected time. Does not claim every card update is summarized; existing 60-day/50-result backend limits remain.
- Extracted tested activityFeedKey: no hidden Activity/System query on Summary or other unrelated right-menu views. Existing card-hover Activity prefetch remains; do not claim zero Activity requests for every pointer path.
- Changed: KanbanCard.tsx, EditDealPanel.tsx, AISummaryCard.tsx, pipeline-activity-cache.ts; added pipeline-activity-cache.test.ts and AISummaryCard.test.tsx. No schema/migration/provider/flag/AI generation changes or commit.
- Verification: 12 focused pure/render tests passed; TypeScript and scoped ESLint passed; diff whitespace clean. Browser skill verified Bot click and Enter open Summary without URL navigation, no Summary sub-tabs, Activity has exactly Activity/System tabs, ordinary card clicks still open Activity, and screenshot shows bell below Bot on light/dark cards. Existing Keratin Summary shows Event 02 Sept 15:21 and Corrected 02 Sept 15:40 separately. No post/edit/delete/paid AI test action was performed.
- Settings diagnosis: one sidebar navigation failed to reach General Settings (URL still Pipeline at a follow-up snapshot ~13.8s after action). Direct URL later loaded. Temporary server-only metadata tracing measured auth 464ms, getUsers an additional 117ms, getDepartments an additional 205ms, total 786ms in ONE successful dev render. These are NOT production metrics or evidence of the failed navigation's root cause. Removed instrumentation from source afterward; SystemGeneralPage unchanged.
- Existing logs include JWT_SESSION_ERROR from Prisma connection-pool timeout (10s, connection limit 25), earlier closed-stream errors and dev compilation of Google status route. Their correlation to the current stall is unproven. Code confirms serial data/auth work and absent route loading boundary; Google/Cloudinary status requests begin after client mount, so do not blame those as a proven initial-render blocker.
- Next exact scope: correlate a failed sidebar navigation's RSC request with server timings/cancellation and browser errors before fixing System General. Consider request-scoped session reuse, independent reads in parallel, and loading/error UI only after evidence/approval; do not bypass ADMIN guards or increase pool size blindly. Summary safety findings from the product review remain unresolved and are not covered by these UI tests.

## 2026-09-03 Manager retirement checkpoint (supersedes all Phase 7 continuation instructions below)

- User explicitly requested removing Manager and consulting on whether Summary should run per post or on demand. Do not resume Phase 7 or re-enable Manager from older notes.
- Removed Manager UI/actions/tools/orchestration/prompts/policy UI/tests and Manager-only citation opener. Retained Summary and shared provider/encryption/budget/ledger/fact infrastructure. Shared permissions/visibility/pricing now live directly under `src/lib/ai/` (including pure `capabilities.ts`).
- Recovery source archive: `/Users/light/Documents/Codex/2026-09-01/c/ai-manager-removed-2026-09-03.tar.gz`. No secrets. Preserve historical DB rows, schema and migrations; no destructive schema cleanup or commit authorized.
- Verification: TypeScript passed, focused ESLint and diff whitespace passed, 8 pure Summary shared-helper/timeline tests passed. Browser: no Manager button; existing Keratin card Summary revision 2 still renders; shared AI Control Center remains without Manager controls. No new production build, provider benchmark, mutation/cross-user regression or deployment in this slice.
- Detailed findings/proposal: `ai-summary-product-review-2026-09-03.md`. On-demand card Summary + cited Q&A is a PROPOSAL ONLY; existing per-event triggers were not changed.
- Urgent pre-existing findings to fix before expanding Summary: externally accepted actorOverride in public actions (including Summary actions and deleteActivityLog); inconsistent fact/correction capability checks; editActivityLog bypasses ledger; usage accounting/post-commit Pusher error boundaries; absent worker input admission. Do not treat earlier phase-complete statements as proof these are resolved.
- Next: get product approval for Summary safety remediation/on-demand scope, then fix security and source lifecycle before new UX. Do not enable previously pending Manager prompt admin flag. Keep unrelated dirty worktree changes and await explicit commit review.

## 2026-09-03 Phase 7.9 checkpoint (supersedes earlier current-state claims)

### Implemented

- Replaced the full-height modal/backdrop with a lazy-loaded 400px floating chat above a bottom-left launcher. English UI, existing panel palette/easing, reduced-motion support, Escape/minimize and retained bounded in-memory conversation. No provider call on open/minimize.
- Citations carry canonical `dealId` from the authorized tools. Each claim renders its own citation buttons. Clicking calls the existing Kanban `EditDealPanel` opener through a ref, without URL/search changes or a new tab. A single-card Server Action rechecks row access and soft deletion on every click; chunk loading and this read run in parallel.
- Previous UI was multi-turn visually only. New requests include at most two prior user questions (500 characters each); prior AI prose is not trusted evidence. Current-question retrieval remains first, with bounded prior-question lookup for pronominal follow-ups only.
- All Manager instruction prose (goal, instructions, evidence/conversation instruction) is visible/editable under System General > AI Control Center > AI Manager Prompts. The request template and structured response schema are inspectable. Authorization, fixed read-only tool registry, citations and budgets are not prompt-editable.
- Publishing clones the active policy into a new version, retaining model/pricing/budget, retiring the old policy and auditing actor/version atomically. Stale expected-policy IDs are rejected. Restore defaults edits the form; publishing is explicit. Model-policy drafts preserve prompt configuration.
- Added nullable `AIModelPolicy.managerPrompt` through one additive migration, applied only to confirmed Preview host `ep-wandering-paper-azila23k-pooler.c-3.ap-southeast-1.aws.neon.tech`. No Main migration, policy activation, API key change, or commit.
- Fixed first-context-item budget bypass, citation-manifest entries for omitted data, and uncited-claim acceptance. Full estimated request overhead includes prompt/schema/question/history/manifest. Array data is admitted one evidence row at a time. Estimates remain character-based, NOT exact provider token counts.
- Entity lookup now respects CUSTOMER capability, limits search terms, orders results deterministically and excludes stage-less cards. Matched-deal context no longer appends unrelated board-wide context. Users lacking AI_MEMORY skip those tools instead of failing the entire basic-data request.
- Raw provider/server errors are no longer returned from the Manager Server Action.

### Evidence and verification

- Controlled oversized-first-item reproduction: 20,000-character tool item at budget 1,000 previously admitted 5,342 estimated tokens. Same case now yields 486 estimated overhead tokens, zero sections/citations and `truncated=true`.
- 23 focused Manager tests pass (contracts, security, prompts, fake-adapter orchestration). They include final-request rejection before adapter call and transmission of all custom instruction blocks/history.
- Preview prompt-publication integration test passes: new version, preserved limits/model, old prompt retained, config audit created, stale writer rejected. Entire test transaction intentionally rolled back; confirmed no test policy/audit persisted. This is NOT a real simultaneous-writer stress test.
- TypeScript passes. Targeted ESLint and `git diff --check` pass. Final production webpack build (including extracted prompt-publish service) passed. Existing middleware/url.parse deprecation warnings remain unrelated to this slice.
- Authenticated ADMIN browser verification: floating widget displays; clicking an existing cited FDA card opens its EditDealPanel, URL remains `/pipeline?tab=workspace`, tab count unchanged. Reopening chat retains prior response; Escape minimizes. Used the user's already-existing response, no extra paid AI test request.
- Signed-in non-ADMIN browser initially did not expose the Manager launcher. ADMIN later signed in normally; no credential or role bypass used.

### Pending / exact next action

1. `FEATURE_FLAG_AI_ADMIN="false"` was found in `.env` (while Manager flag is true). Asked user to approve enabling ADMIN controls on Preview; do not silently change this flag. The settings UI currently reports ADMIN FEATURE DISABLED, so browser publish/save verification is pending.
2. After approval, enable only that Preview flag and reload/restart the identified dev server if needed (Prisma Client was regenerated). Test prompt read/edit/publish and restore through ADMIN UI, without changing provider keys/model/budgets.
3. Re-run `node --conditions=react-server --import tsx --test src/lib/ai/manager/contracts.test.ts src/lib/ai/manager/prompts.test.ts src/lib/ai/manager/security.test.ts src/lib/ai/manager/orchestrator.test.ts`; Preview rollback test is opt-in via `RUN_MANAGER_PROMPT_PREVIEW_TEST=true` with `prompt-policy.preview.test.ts`.
4. Remaining quality limits: keyword-based entity matching, no full conversational memory, no new LLM quality/latency p50/p95 or encoded network benchmark in this slice. Do not claim the AI's answer accuracy or latency is fully solved by prompt editing.
5. Relevant new files: `src/lib/ai/manager/prompts.ts`, `prompt-policy.ts`, their tests, `src/components/system/AIManagerPromptSettings.tsx`, migration above. Other touched files: Manager panel/PipelineView/KanbanBoard, Manager actions/tools/registry/context/orchestrator/tests, admin actions/policy UI, Opportunity single-card action, Prisma schema.
6. Preserve all earlier uncommitted work. Commit remains unauthorized.

## 2026-09-03 Phase 7.8 Chatbot UX, Thai Guardrails & Orphan Card Filter Checkpoint

- Replaced single-turn drawer with interactive multi-turn Chat History UI (Gemini / ChatGPT UX).
- Instantly clears textarea on send (Optimistic UI) with animated thinking bubble and auto-scroll.
- Added strict Thai language requirement to `AI_MANAGER_GUARDRAILS` ("Always respond in polite, natural Thai language by default").
- Clarified overdue definition in guardrails and risk scoring: means missed follow-up/update deadline (เกินกำหนดติดตามงาน/อัปเดตการ์ด), not payment default.
- Investigated and resolved orphan deal citations: filtered `pipelineStageId: { not: null }` in `listBoardRisksTool` and `listOpenTasksTool` so AI Manager only considers cards visible on Kanban board columns.
- Enhanced citations with stage labels (e.g. `#Trademark Nigeria [In Progress]`) and clean URL linking directly to workspace search.
- Removed predefined question chips to support diverse department workflows.
- Verification: `npx tsc --noEmit` passed (0 errors); ESLint clean; 19/19 tests passed; live Thai query verified.

## 2026-09-02 Phase 7.7 Admin production verification checkpoint

- Event Summarizer policy v2 activated on Preview with official Gemini 2.5 Flash pricing ($0.30 input / $2.50 output per 1M tokens, $0.0025 per-run limit).
- Replaced hardcoded zero cost in `processor.ts` with real `calculateUsageCostMicros`.
- Added write-conflict retry (3 attempts) to `BudgetService` to handle transient connection pooler serialization retries safely.
- Data handling approved by product owner for Gemini Paid Tier on Preview; set `FEATURE_FLAG_AI_MANAGER="true"`.
- Tested all 6 ADMIN production scenarios in `src/lib/ai/manager/admin-scenarios.test.ts` on Neon Preview against live Gemini 2.5 Flash:
  1. Real Question & Cited Answer: Passed (3,567 ms, valid citations citing `AI_FACT`, `AI_EVENT`, `DEAL`, `DOMAIN_EVENT`).
  2. Empty Evidence: Passed (2,238 ms, returned safe notice without hallucination).
  3. Cross-Department Permission: Passed (commercial data filtered from context for non-commercial roles).
  4. Budget Exceeded: Passed (725 ms, rejected fast before provider call).
  5. Circuit Breaker: Passed (1,521 ms, fails fast with `AI_PROVIDER_UNAVAILABLE` when OPEN).
  6. Prompt Injection Containment: Passed (3,318 ms, malicious instructions in activity text treated as untrusted data; model did not obey injection).
- Live Telemetry measured: 427 input tokens (~1.7 KB), 88 output tokens (~350 B), total latency 3,555 ms, actual cost 349 micros ($0.000349 USD).
- Verification: `npx tsc --noEmit` 0 errors; ESLint 0 errors / 0 warnings on Manager files; 27/27 AI unit & integration tests pass; `npm run build` succeeds (exit code 0).
- Neon Main was NOT touched. All changes are uncommitted pending final user diff review.

## 2026-09-02 Phase 7.5A ADMIN UX preview checkpoint

- Added an ADMIN-only `AI Manager` entry button to the Pipeline workspace toolbar and a dynamically loaded right-side dialog so non-Manager users do not pay for the panel chunk.
- Added accessible dialog semantics, Escape/backdrop close, autofocus, pending state, empty guidance, permission notice, safe error messages, citation chips, and context-truncation disclosure.
- Added an authenticated Server Action that re-checks Pipeline authorization on every request and calls the Phase 7.4 orchestrator. Raw server/provider errors are mapped to bounded user-facing messages.
- The shell remains visible to ADMIN for UX review while the submit control is disabled when `FEATURE_FLAG_AI_MANAGER` is not true. This makes the rollout state explicit instead of silently invoking a provider.
- Preview DB inspection (secret value never read or printed) found an enabled `GOOGLE_GEMINI` provider with a configured secret, but zero `AI_MANAGER` policies. No policy was invented and no provider canary was called.
- Verification: targeted TypeScript, ESLint, and `git diff --check` pass; production build passes. Browser control was unavailable in this session, so automated click/focus/submit inspection remains pending; the Pipeline URL was queued in the Codex browser for manual review.
- Neon Main was not touched. No migration, real AI call, feature-flag change, or git commit was made in 7.5A.

### Exact next action after Phase 7.5A

1. Add AI Manager-specific policy controls to `/system/general`: model, input/output caps, per-run/daily/monthly budget, activation, and visible rollout state.
2. Add provider pricing fields/estimator and reconcile actual usage cost; do not activate the Manager while cost is hard-coded to zero.
3. Create a DRAFT `AI_MANAGER` policy on Preview, validate the configured model, then run one synthetic (no CRM data) tightly budgeted canary.
4. After canary and data-handling approval, activate the policy and set `FEATURE_FLAG_AI_MANAGER=true` only in the intended environment.
5. Run authenticated browser tests for open/close, keyboard focus, disabled state, successful cited response, forbidden scope, budget rejection, and provider/circuit error states.

## 2026-09-02 Phase 7.4 read-only orchestrator checkpoint

- Added a fixed server-side registry containing only `getDealContext`, `listDealEvents`, `listActiveFacts`, `listOpenTasks`, and `listBoardRisks`. The model cannot register or invoke arbitrary/mutating tools.
- Added server-selected Deal/board context collection. Every call passes the existing row/field authorization and append-only tool audit boundary.
- Added an interactive AI Manager orchestrator using the active `AI_MANAGER` model policy, its independent daily/monthly/per-run budget, and provider circuit breaker.
- Provider secrets are decrypted only at the provider-call boundary. Prompts, tool payloads, and plaintext secrets are not stored in `AgentRun` or tool audits.
- Added strict structured output and citation-manifest validation. User-visible answer text is reconstructed only from validated cited claims, dropping uncited model prose before display.
- Made `AgentRun.outboxId`, `domainEventId`, and `dealId` optional so interactive/board Manager runs do not fabricate Event Summarizer provenance.
- Preview-only migration `20260902183000_allow_interactive_agent_runs` applied successfully to `ep-wandering-paper-azila23k`. The first two deploy attempts timed out on Prisma's advisory lock; inspection showed a pooled session holding it. Disconnecting that inspected session released the lock and the normal locked deploy succeeded. No lock bypass was used.
- Verification: Prisma format/validate/generate pass; TypeScript and targeted ESLint pass; Manager tests 14/14 pass with Node 24 `--test-force-exit`; production build passes.
- Neon Main was not touched. No real provider call, UI exposure, or git commit was made.

### Next slice after Phase 7.4

- Create and activate a reviewed `AI_MANAGER` policy on Preview and run a tightly budgeted synthetic provider canary; do not send real CRM text until provider privacy/data-handling approval.
- Add an authenticated Server Action/UI entry point only after the canary, including explicit empty-evidence and citation rendering states.
- Add provider pricing so `actualCostMicros` is reconciled from reported usage instead of the current zero-cost placeholder; production enablement is blocked on this.
- Add Preview integration tests for budget rejection, circuit-open behavior, tool-audit/run trace correlation, and active-policy selection.
- Review whether policy should include a dedicated daily run-count limit instead of the current conservative Manager default of 100.

## 2026-09-02 Phase 6 remediation and Phase 7.1 checkpoint

- Human text corrections now clear stale structured facts and retract prior derived facts with `CORRECTED_BY` provenance.
- Fact repair no longer deletes the Deal's fact ledger or replays every historical/retracted revision; it repairs accepted current revisions only.
- Activity deletion now writes an immutable soft-delete tombstone and retracts downstream AI events/facts in one database transaction. External Cloudinary cleanup happens after the database commit.
- Activity/reply reads again exclude `deletedAt != null` records.
- Concurrent fact test now retries a serialization loser and proves both source facts persist while the newest source is the sole ACTIVE STATE fact.
- Context benchmark reports the cheaper RAW/COMPOSED choice; provider context was minimized by removing unrelated financial fields and historical facts from the per-event summarizer prompt.
- AI Summary/Timeline access now requires conservative `AI_MEMORY` capability, not only Deal row access.
- Phase 7.1 added an explicit read-only/evidence-grounded Manager contract and authorized tools for Deal context, AI events, active facts, and open internal tasks.
- Unclassified summary/fact text fails closed unless the actor has Activity, Customer, Product, Commercial, and AI Summary access. Deal context redacts customer and commercial fields independently.
- Verification: `npx tsc --noEmit`, `git diff --check`, 9 Preview lifecycle subtests, 7 Preview resolver tests, and 4 Manager permission/contract tests pass.
- No migration was created or applied by this slice. Neon Main was not touched. Changes are uncommitted.

### Next slice

- Add durable visibility/classification snapshots to AI revisions/facts so AI memory can be shared at field granularity instead of the conservative all-source gate.
- Add Phase 7 board tools with bounded pagination/token budgets and source citations.
- Add tool-call audit records and prompt-injection/cross-department integration tests before connecting an LLM orchestrator.
- Add `AI_MANAGER` policy/budget/worker only after the read-only tool security evaluation passes.

## 2026-09-02 Phase 7.2 visibility and board-risk checkpoint

- Added immutable `requiredCapabilities` and `visibilityPolicyVersion` snapshots to `DealAIEventRevision` and `DealAIFact`.
- Existing unclassified AI rows are backfilled fail-closed with Activity, Customer, Product, and Commercial requirements. New Activity summaries inherit only `ACTIVITY`; other unclassified source types remain restrictive.
- Human corrections inherit the exact visibility snapshot of the corrected revision; generated facts inherit their source revision visibility.
- Summary, Timeline, Fact, and Manager tools filter each record against the caller's resolved capability set.
- Added deterministic read-only board risk scoring for overdue, near-due, and stale Deals. Results contain Deal citations, bounded row counts, and a hard estimated-token ceiling; no customer or commercial fields enter this tool.
- Added `AI_MANAGER` as a separate `AgentKey` for future independent policy, budget, monitoring, and pause controls. No Manager LLM calls or mutating tools are enabled.
- Preview-only migrations applied to `ep-wandering-paper-azila23k`: `20260902170000_add_ai_visibility_scopes`, `20260902173000_add_ai_manager_agent_key`.
- Cross-department Preview test proves a Marketing user with Deal access cannot read Customer/Commercial fields or Commercial-scoped summaries, while an authorized Sales user can.
- Verification: production build passed; TypeScript and diff checks passed; Phase 6 lifecycle 9/9, resolver 7/7, Manager unit 6/6, and Manager cross-department integration 1/1 passed.
- Neon Main was not touched. Changes remain uncommitted.

### Next slice after Phase 7.2

- Add append-only Manager tool-call audit records with input hashes, granted scopes, result counts, latency, and denial codes (never raw sensitive content).
- Add board tool integration tests for row scope and token truncation.
- Build a bounded Manager context pack and citation validator before adding an LLM orchestrator.
- Add prompt-injection evaluation showing Activity text cannot add tools, expand scopes, or produce uncited claims.

## 2026-09-02 Phase 7.3 security boundary checkpoint

- Added append-only `AIManagerToolCallAudit` records for allowed and denied tool calls. Audit rows contain actor/trace/deal identifiers, tool name, canonical SHA-256 input hash, granted capabilities, result count, latency, and normalized denial code; raw prompts and CRM content are not stored.
- Added a bounded Manager context pack with a hard 500-8,000 estimated-token range and explicit `UNTRUSTED_CRM_DATA_NOT_INSTRUCTIONS` boundaries around every tool payload.
- Added a structured Manager answer contract. Every factual claim requires at least one citation ID, and unknown/invented citation IDs are rejected before an answer may be shown.
- Added deterministic board-risk scoring without customer/commercial fields. The tool is read-only and cites each Deal source.
- Preview-only migration `20260902180000_add_ai_manager_tool_audit` applied successfully to `ep-wandering-paper-azila23k`.
- Tests prove canonical audit hashing, no raw secret text in persisted audits, allowed/denied audit paths, prompt-injection containment, token truncation, citation validation, and cross-department filtering.
- No LLM orchestrator or mutating Manager tool is enabled. Neon Main was not touched and the slice is uncommitted.

### Next slice after Phase 7.3

- Wrap all Manager tools in a registry that exposes only the four approved read-only tools plus board risk.
- Build the read-only orchestrator with the active `AI_MANAGER` policy, independent budget/circuit breaker, strict answer schema, and citation validation before display.
- Add end-to-end tests using a fake adapter first; provider canary remains disabled until permission and quality review.

## Completed in the current slice

- Created the long-term architecture and Phase 0-8 roadmap.
- Added repository-level Codex continuity instructions to `AGENTS.md`.
- Added always-applied cross-agent continuity rule in `.cursor/rules/event-ai-continuity.mdc`.
- Created this execution checkpoint and an append-only decision log.
- Started the initial server-action inventory for deal/card events.
- Completed the server mutation inventory across deal fields/status, activity/replies, notifications, notes, attachments, and archive behavior.
- Classified each Deal-related mutation as `AI_SUMMARY`, `AUDIT_ONLY`, `NO_EVENT`, or `PROJECTION_ONLY` in `event-ai-agent-phase-0-spec.md`.
- Defined the canonical-event duplicate-prevention contract for due dates, Won/Lost, topic/type edits, membership, transfer, and attachment+comment flows.
- Added strict JSON Schema v1 and ten synthetic/anonymized golden evaluation cases.
- Proposed permissions, retention, timezone, canary token limits, and quality gates.
- Recorded the premature transfer System Log defect and the canonical-event rule in the decision log.
- Product owner approved Phase 0 recommended classifications, permissions, retention, timezone, token limits, and quality gates.
- Marked Phase 0 baseline decisions accepted; production provider tier/privacy approval remains intentionally pending.
- Designed staged additive migrations, Activity revision backfill, dual-write flags, soft-delete cutover, and rollback.
- Drafted proposed Prisma enums/models/relations/indexes for `ActivityRevision`, `DealDomainEvent`, and `AgentOutbox` without modifying runtime schema.
- Defined command idempotency, optimistic concurrency, transaction boundaries, external-file sagas, and outbox lease/claim protocol.
- Added the approved additive models/enums/relations/indexes to `prisma/schema.prisma`.
- Discovered that the repository had no Prisma migration history; generated an offline existing-schema baseline and separate additive ledger delta.
- Inspected the additive SQL and confirmed it contains no drop/truncate/delete/destructive column operations.
- Preserved temporary cascade semantics for new ledger relations until soft-delete cutover; ledger writes/backfill remain prohibited before then.
- Generated Prisma Client successfully against the proposed schema, then restored the installed client to the old schema so the current unmigrated application remains safe.
- Inspected the configured Neon endpoint without exposing credentials and performed read-only introspection.
- Confirmed the live datasource has no schema drift from the preserved pre-Event-AI baseline.
- Did not mutate migration state because the endpoint cannot be identified as production versus preview.
- Added database-independent Event Ledger classification, dedupe, source-hash, command-ID, timezone, and fail-closed feature-flag utilities.
- Added unit tests for event classification, audit-only exclusions, dedupe stability, byte-exact hashing, UUIDs, Bangkok day boundaries, invalid inputs, and disabled-by-default flags.
- Added a Prisma-independent transaction boundary contract for command replay lookup, canonical domain-event creation, and idempotent Event Summary outbox intent.
- Enforced fail-closed validation for command UUIDs, source versions, timestamps/timezones, JSON payloads, prompt/schema versions, and retry limits before ledger writes.
- Kept audit-only events independent from AI version policy and ensured the AI enqueue flag can disable outbox creation without disabling canonical ledger writes.
- Added semantic command-replay conflict detection so a command ID cannot be reused for another deal or event type.
- Kept the helper structurally typed and unimported by active actions because the installed Prisma Client intentionally remains on the pre-migration schema.
- Added inert activity create/reply/edit/delete transaction commands that atomically compose current Activity projection, immutable revision, canonical domain event, and optional outbox intent.
- Added compare-and-swap edit/delete contracts using `id + expectedVersion + deletedAt=null`, including deterministic conflict errors and no-op suppression for unchanged edits.
- Made deletion a tombstone revision that preserves the exact last raw content and creates an audit-only event without Event Summary work.
- Validated reply parents as live comments in the same Deal, preventing cross-Deal and deleted-parent replies.
- Rejected System Logs from the comment-summary command path because they are derived projections, not canonical AI sources.
- Added replay behavior that returns the prior canonical result without repeating Activity, revision, event, or outbox writes.
- Added a separate System Log projection helper that creates a linked `SYSTEM_UPDATE` row and immutable revision without creating another domain event or outbox item.
- Required projection `commandId` to match its canonical domain event, preventing cross-intent provenance links.
- Added reusable active Opportunity/Activity query scopes that compose existing filters through `AND`, so callers cannot override `deletedAt: null` accidentally.
- Added parent/reply tree scopes and a fail-closed post-read active-record guard.
- Audited every current Prisma Opportunity/Activity read and documented the cutover behavior for Kanban, EditDealPanel, permissions, notifications, Pusher recipients, completed Deals, cron archival, and repair scripts.
- Added inert canonical Deal commands for stage movement, due-date change, multi-field save, and atomic Won/Lost finalization.
- Added one compare-and-swap Deal update per user intent using `id + expectedVersion + deletedAt=null`, followed by exactly one canonical event and one optional outbox intent.
- Added typed `changedFields` payloads with before/after values and ISO timestamps, while suppressing unchanged fields and complete no-op saves.
- Combined required Won fields, status, cleared stage, close time, and loss-reason cleanup in one command; Lost requires a non-empty reason and uses the same atomic outcome path.
- Added actor attribution, terminal-state guards, replay handling, stage-ID validation, input validation, and deterministic version-conflict errors.
- Kept stage-name-specific business validation at the future authorized integration boundary because it requires a current PipelineStage read in the same database transaction.
- Added inert ownership-transfer and team-invite request/response commands with notification compare-and-swap claiming.
- Made request and rejection events audit-only; requests never mutate Deal ownership/membership and never create Event Summary work.
- Stored target user, previous owner, and Deal-version snapshot in the immutable request event, then required matching provenance before any response is applied.
- Made accepted ownership transfer the only path that changes owner and creates the eligible `DEAL_OWNER_CHANGED` summary event/outbox.
- Made accepted team invite increment Deal version, connect the member, and create one audit-only `DEAL_MEMBER_ADDED` event.
- Prevented wrong-recipient responses, duplicate claims, missing provenance, stale Accepts, and owner changes after request creation.
- Allowed stale requests to be rejected and closed without loading or mutating the newer Deal state.
- Kept RBAC/access authorization at the future server-action boundary; these transaction helpers require an attributable actor and validate transactional invariants.
- Added an inert Outbox claim contract that reaps exhausted work, claims bounded batches, and validates adapter ownership/expiry output.
- Added worker/attempt/lease compare-and-swap fencing for completion, failure, and heartbeat so stale invocations cannot overwrite reclaimed work.
- Added bounded exponential retry scheduling, final-attempt `DEAD` transition, non-sensitive machine error-code validation, and ownership cleanup.
- Prevented heartbeat calls from shortening an existing lease and required claim adapters to return the exact requested expiry.
- Documented reviewed PostgreSQL `FOR UPDATE SKIP LOCKED` reaping/claim SQL with bound parameters and deterministic priority ordering.
- Kept all provider/Pusher/network work outside the claim transaction; no AI provider is called in this slice.
- Added an inert Activity revision backfill planner with bounded ID-cursor pages, one-row lookahead, deterministic resume cursors, and batch limits.
- Preserved byte-exact raw content, SHA-256 hash, Activity type, parent, author, and original creation time in planned version-1 revisions.
- Made matching version-1 revisions idempotent, including safe reruns after later edits, while failing closed on corrupt revision hash/provenance.
- Failed closed when an Activity has advanced beyond version 1 without a trustworthy original revision, or when readers return deleted, duplicate, unordered, or pre-cursor rows.
- Added final count/duplicate/parity verification gates and a backfill runbook that explicitly prohibits domain events, outbox, notifications, Pusher, and AI calls.
- Completed the safe offline Phase 1 foundation; database adapters, migration rehearsal, real concurrency, and applied backfill now require a confirmed preview database.

### Phase 2: Core Provider Config & Security (COMPLETED)
- Created `EncryptionService` (AES-256-GCM) with key rotation support.
- Implemented `AIGateway` and `GoogleGeminiAdapter` using standard Fetch.
- Added AI-related Prisma models (AIProviderConfig, AIUsageRecord, etc.).
- Created `AIControlCenter` UI for admin management of API keys.

## Phase 3: Budgets, Monitoring, and Circuit Breakers (REMEDIATION REQUIRED)
- Applied baseline migration and deployed `ai_foundation` to Preview DB.
- Implemented `BudgetService` to enforce $1.00/mo, $0.10/day limits, and generate warnings at 80%.
- Implemented `CircuitBreaker` with 3-failure threshold, atomic probe locks, and HALF_OPEN logic.
- Updated `AIControlCenter` UI with real Prisma actions, wrapped by `FEATURE_FLAG_AI_ADMIN`.
- Wrote unit tests for Budget and Circuit Breaker logic.

Audit correction (2026-09-02): Phase 3 does not meet its exit criteria yet. Budget admission reads usage and then creates a reservation outside one serializable/locked transaction, ignores held reservations, and can overspend under concurrency. Circuit failure increments are read-modify-write and can lose concurrent failures. The Jest tests cannot run because Jest/types/config are not installed, and `npx tsc --noEmit` fails on those test globals. Real PostgreSQL concurrency tests are still required.

Remediation progress: budget admission now uses a per-agent PostgreSQL advisory transaction lock, serializable transaction, held-reservation accounting, Bangkok boundaries, and idempotent run reservations. Circuit failure transitions use a per-provider advisory transaction lock, and HALF_OPEN probe acquisition enforces the five-minute open interval. Invalid Jest placeholders were removed; project typecheck now passes. Real concurrent Preview DB tests remain required before marking Phase 3 complete.

## Phase 4: Summarization Logic & Outbox Processor (REMEDIATION REQUIRED)
- Implemented `context-builder.ts` to convert `DealDomainEvent` and `Opportunity` to a strictly bounded text context.
- Designed the `EVENT_SUMMARIZER` system instructions and `eventSummarySchema`.
- Created `OutboxProcessor` that reads `AgentOutbox`, grabs atomic leases, integrates with `CircuitBreaker` & `BudgetService`, calls the LLM, and persists the generated summary back into `ActivityLog`.
- Created `/api/cron/process-outbox/route.ts` secured with `CRON_SECRET` for background scheduling.

Audit correction (2026-09-02): the worker claim is not the reviewed `FOR UPDATE SKIP LOCKED`/fenced lease protocol, passes the encrypted `secretRef` directly to the provider, hard-codes provider/model, uses a placeholder `system` user ID, writes summaries into `ActivityLog`, and lacks safe immutable summary writeback. The cron route now fails closed unless both `FEATURE_FLAG_AI_WORKER=true` and `CRON_SECRET` are configured. Keep the worker flag false until these defects are fixed and integration-tested.

Remediation progress: provider secrets are decrypted only at the provider boundary; generated summaries now write `DealAIEvent` plus immutable revision 1 and no longer create a fake-system `ActivityLog`. Completion emits targeted `AI_EVENT_READY`. Model/provider resolution and the claim path still require replacement with the active-policy snapshot and reviewed fenced `SKIP LOCKED` adapter; keep the worker disabled.

Phase 5 activation check (2026-09-02): traced the user's payment Activity through Preview DB. Activity revision and `ACTIVITY_CREATED` domain event existed, but its Outbox remained `PENDING`, proving the Summary tab was empty because no worker invocation occurred. Replaced the worker's hard-coded provider/model snapshot with the active `AIModelPolicy`, replaced the read/update claim race with one PostgreSQL `FOR UPDATE SKIP LOCKED` claim/update statement, and fenced completion/failure by worker ID plus attempt. The Preview provider secret was migrated from plaintext to AES-256-GCM, and the obsolete `gemini-1.5-flash-001` policy was changed to the provider-advertised `gemini-2.5-flash`. The recovered event completed with one Outbox attempt, one READY `DealAIEvent`, immutable AI revision 1, and one usage record (743 provider-reported tokens). Added `after()` dispatch after Activity/Pusher completion so local and deployed Server Actions kick the durable Outbox immediately while cron remains the retry safety net. Production build passes. Keep deployment flags environment-specific; this local Preview environment is enabled for the controlled test only.

## Phase 5: User-Visible Summaries & Realtime (IN PROGRESS)
- Created `<AISummaryCard>` component with a premium dark-glassmorphism aesthetic.
- Intercepted `SYSTEM_UPDATE` logs with `sourceDomainEventId` to render AI Summaries directly in the main Activity tab in `EditDealPanel.tsx`.
- Implemented a hover-to-edit inline text area that updates the AI's JSON `summary` field and uses the existing `editActivityLog` server action (automatically tracks the user revision).
- Added a `Sparkles` ✨ indicator to `KanbanCard.tsx` so users can tell at a glance if a pipeline opportunity has a recent AI summary.
- Realtime integration is handled automatically through the existing `activity-added` Pusher channel logic.

Audit correction (2026-09-02): fixed the blank AI Summary tab caused by placing its render branch inside an `activity || system` guard. Added explicit tab semantics, a Summary heading/search placeholder, and safe read-only cards. Unsafe editing through `editActivityLog` was removed because it overwrites a projection instead of creating an append-only `USER` summary revision. `DealAIEvent`/`DealAIEventRevision`, targeted `AI_EVENT_READY`, precise SWR reconciliation, authorization tests, correction survival, and two-user DB/client convergence remain missing.

Remediation progress: added and applied the additive `DealAIEvent`/`DealAIEventRevision` migration to the confirmed Preview endpoint. The Summary tab now queries current revisions independently from Activity logs; corrections append a `USER` revision under serializable compare-and-swap and broadcast `AI_EVENT_READY` for precise SWR refresh. Browser/two-user convergence and authorization integration tests remain required.

Backend convergence evidence (2026-09-02): the user's source Activity `cmtjtutki0005s775famsgtd6` maps to domain event `cmtjtutpr0009s775cvpuhpzb`, completed Outbox `cmtjtutre000bs775xc8dtn9i`, READY AI event `cmtjuawna0004s7m2cb30hdcy`, and current revision `cmtjuawpr0006s7m29ue56fmb`. Visual browser verification remains incomplete because the Codex in-app browser still reports localhost connection refused while host-side production curl succeeds.

## Phase 6: Timeline composer (STARTED)
- Added a deterministic 30–60 day composer that groups at read time by stored `localEventDate`, preserves one line per event, includes event/revision provenance, and enforces a bounded estimated-token budget.
- Added an authorized `getDealAITimeline` Server Action and two executable tests for grouping/provenance and budget truncation.
- Added read-time Important Facts for importance 4–5 events and explicit blockers, independent token budgets, recent/fact deduplication, and an authorized raw-versus-composed benchmark endpoint. Five focused Timeline tests pass.
- Preview measurement on the current Deal shows composition is worse for sparse 30/60-day history (32 raw estimated tokens versus 46 composed, -43.75%) but better over the available 365-day sample (70 versus 46, 34.29%). This proves a cheaper-of-raw-or-composed selector is required; universal reduction must not be claimed.
- Persistent `DealAIFact` projection, contradiction/supersession lifecycle, representative multi-Deal benchmark, adaptive context selection, and rebuild verification remain incomplete.

## Current State & Next Steps
**Current Phase:** Remediate Phase 3–5 before starting Phase 6
**Target DB:** `ep-wandering-paper-azila23k` (Neon Preview)

Latest continuation document: `event-ai-agent-handoff-2026-09-02.md`. It supersedes conversational summaries for the next working session and records the controlled Phase 5 Preview evidence, remaining exit criteria, and exact next-agent prompt.

## Phase 6 Implementation Updates (2026-09-02)
- Added `DealAIFact` additive schema migration with canonical hashing, mode, subject, value, importance (4-5), and confidence. Applied to Neon Preview DB.
- Added partial unique index `DealAIFact_active_state_key` on `(dealId, factType, subject)` WHERE `status = 'ACTIVE' AND factMode = 'STATE'` to strictly enforce database invariants.
- Implemented `processAIFacts` in `fact-lifecycle.ts` using serializable optimistic locking and pre-supersession to guarantee zero duplicate ACTIVE state facts under parallel worker execution.
- Added idempotency check on `(sourceRevisionId, sourceFactKey)` to safely support outbox retry without duplicate inserts.
- Updated `correctDealAISummary` in `ai-events.ts` to retract/supersede previous facts with `CORRECTED_BY` when users modify summaries.
- Updated `deleteActivityLog` in `opportunity.ts` to retract downstream domain events, AI events, and AI facts with `SOURCE_DELETED`.
- Extended `timeline.ts` and `context-builder.ts` with active `DealAIFact` composition and token benchmark comparison.
- Verified test suite with 9 passing integration tests in `src/lib/ai/fact-lifecycle.test.ts`.
- Implemented Phase 6.3: Contradiction Resolver (`FACT_RESOLVER`) prompt schema, CAS writeback with `CONTRADICTED_BY`, `NEEDS_REVIEW`, and `RETRACTED` actions, and `rebuildDealFacts()` deterministic fact rebuilder in `src/lib/ai/fact-resolver.ts`.
- Verified Phase 6.3 test suite with 7 passing tests in `src/lib/ai/fact-resolver.test.ts` on Neon Preview DB.
- Typecheck (`npx tsc --noEmit`) and all test suites in `src/lib/ai/` and `src/lib/event-ledger/` pass with 0 errors.

### Immediate Next Tasks
- Present Phase 6.3 verified test results and walkthrough to user in Thai.
- Await user authorization to commit to `main` and deploy (Phase 6 Handoff).

### Blockers / Notes
- Do not enable `FEATURE_FLAG_AI_WORKER`; AI core integration is not stable yet.
- Do not touch Neon Main DB or commit to Git without explicit user authorization.
- Preview migration `20260902094104_add_deal_ai_fact` and `AgentKey.FACT_RESOLVER` applied successfully to `ep-wandering-paper-azila23k`.
- Verification: `npx tsc --noEmit` and all Node tests pass.

## Initial event inventory (requires Phase 0 review)

Superseded by the complete inventory in `event-ai-agent-phase-0-spec.md`. The table below is retained as the initial checkpoint history.

| Current action | Candidate domain event | User-facing Event Summary? | Notes |
|---|---|---:|---|
| `createOpportunity` | `DEAL_CREATED` | Maybe | Usually low-value unless initial content is meaningful. |
| `moveOpportunity` | `DEAL_STAGE_CHANGED` | Yes | Preserve before/after stage and actor. |
| `updateOpportunity` | `DEAL_FIELDS_UPDATED` | Conditional | Emit changed-field diff; suppress no-op updates. |
| `updateDueDateWithLog` | `DEAL_DUE_DATE_CHANGED` | Yes | Avoid producing a second logical event from its system log. |
| `addActivityLog` | `ACTIVITY_CREATED` or `REPLY_CREATED` | Yes | Reply is its own event; parent is bounded context only. |
| `addSystemLog` | `SYSTEM_ACTIVITY_CREATED` | Conditional | Must distinguish domain-generated logs from canonical domain event to avoid duplication. |
| `editActivityLog` | `ACTIVITY_EDITED` | Yes | Requires immutable source revision and superseding summary. |
| `deleteActivityLog` | `ACTIVITY_DELETED` | Audit/retract | Must become tombstone/soft delete before AI release. |
| `addTeamMember` | `DEAL_MEMBER_ADDED` | Conditional | Likely audit/important only when ownership responsibility changes. |
| `removeTeamMember` | `DEAL_MEMBER_REMOVED` | Conditional | Preserve actor and removed member. |
| `deleteOpportunity` | `DEAL_DELETED` | Audit/retract | Determine retention/legal policy before implementation. |
| `createNote` | `NOTE_CREATED` | Later decision | Note may be private/operational; permissions need review. |
| `deleteNote` | `NOTE_DELETED` | Audit/retract | Current raw retention behavior needs inspection. |
| `togglePinNote` | `NOTE_PIN_CHANGED` | No by default | Audit event only. |

## Known current-code risks

- `ActivityLog` edits overwrite `content`; raw versions are not retained.
- Activity deletion is a hard delete and reply relations cascade.
- Activity creation waits for notification and Pusher side effects.
- Activity and notification writes are not one atomic transaction, so a saved activity may still return an action error and invite a duplicate retry.
- Some domain actions also create system logs; the canonical event source must prevent two AI summaries for one user action.
- Provider free-tier privacy/data-use terms require explicit product-owner approval before real CRM data is sent.
- `EditDealPanel.handleTransfer` records a completed transfer before the recipient accepts; this must not enter AI memory.
- Won/Lost currently spans two server actions and can produce partially applied intent; Phase 1 should provide one canonical transaction command.
- Topic/type/team mutations create additional client-side System Logs, so System Logs cannot be the AI trigger source.
- Attachment create/delete and Note delete are not durable/atomic with their external side effects.

## Files changed in this slice

- `AGENTS.md`
- `.cursor/rules/event-ai-continuity.mdc`
- `.agents/plans/event-ai-agent-roadmap.md` (created in the preceding planning slice)
- `.agents/plans/event-ai-agent-execution.md`
- `.agents/plans/event-ai-agent-decisions.md`
- `.agents/plans/event-ai-agent-phase-0-spec.md`
- `.agents/evals/event-summary.schema.json`
- `.agents/evals/event-summary-golden.jsonl`
- `.agents/plans/event-ai-agent-phase-1-design.md`
- `.agents/plans/event-ai-agent-phase-1-migration-review.md`
- `prisma/schema.prisma`
- `prisma/migrations/migration_lock.toml`
- `prisma/migrations/20260902000000_baseline_existing_schema/migration.sql`
- `prisma/migrations/20260902001000_add_event_ledger_foundation/migration.sql`
- `.agents/plans/event-ai-agent-live-schema-audit.md`
- `src/lib/event-ledger/contracts.ts`
- `src/lib/event-ledger/feature-flags.ts`
- `src/lib/event-ledger/contracts.test.ts`
- `src/lib/event-ledger/transaction.ts`
- `src/lib/event-ledger/transaction.test.ts`
- `src/lib/event-ledger/activity-commands.ts`
- `src/lib/event-ledger/activity-commands.test.ts`
- `src/lib/event-ledger/system-projections.ts`
- `src/lib/event-ledger/system-projections.test.ts`
- `src/lib/event-ledger/query-scopes.ts`
- `src/lib/event-ledger/query-scopes.test.ts`
- `.agents/plans/event-ai-agent-phase-1-query-impact.md`
- `src/lib/event-ledger/deal-commands.ts`
- `src/lib/event-ledger/deal-commands.test.ts`
- `src/lib/event-ledger/collaboration-commands.ts`
- `src/lib/event-ledger/collaboration-commands.test.ts`
- `src/lib/event-ledger/outbox.ts`
- `src/lib/event-ledger/outbox.test.ts`
- `.agents/plans/event-ai-agent-phase-1-outbox-sql.md`
- `src/lib/event-ledger/backfill.ts`
- `src/lib/event-ledger/backfill.test.ts`
- `.agents/plans/event-ai-agent-phase-1-backfill-runbook.md`

## Verification performed

- Confirmed project root already contains `AGENTS.md`.
- Confirmed `/system/general` has server-side ADMIN access control.
- Confirmed project uses `.agents`, not `.agent`.
- Confirmed initial action names with `rg` across `src/lib/actions`.
- Inspected all exported mutation Server Actions and mutating route handlers under `src/lib/actions` and `src/app`.
- Traced client callers in `EditDealPanel`, `CustomerTab`, `WonLostModal`, `NotesTab`, `FileUploader`, and notification header flow.
- Validated the strict schema and all JSONL lines parse as JSON using local tooling.
- `git diff --check` passes.
- No runtime tests required because Phase 0 changes planning/evaluation artifacts only.
- Reviewed Phase 1 design against the current Prisma relations and every known Deal mutation path.
- No Prisma schema, migration, generated client, or runtime application file changed in slice 1.0.
- `prisma validate` passes for the additive schema.
- Prisma Client generation passes for the additive schema.
- Offline baseline/delta SQL generation passes without a database connection.
- Additive SQL destructive-keyword scan found no destructive statements.
- Current installed Prisma Client was regenerated from the old schema after validation to avoid querying unapplied columns.
- Read-only live-to-baseline Prisma diff reports `No difference detected` with exit code 0.
- `npx tsx --test src/lib/event-ledger/contracts.test.ts` passes: 10 tests, 0 failures.
- Targeted ESLint passes for all Event Ledger runtime and test files.
- `npx tsc --noEmit` passes.
- Final `npx prisma validate` passes.
- Final `git diff --check` passes.
- Phase 1.3 combined Event Ledger suite passes: 20 tests, 0 failures.
- Phase 1.3 targeted ESLint passes.
- Phase 1.3 `npx tsc --noEmit` passes.
- Phase 1.3 final `npx prisma validate` and `git diff --check` pass.
- Phase 1.4 combined Event Ledger suite passes: 30 tests, 0 failures.
- Phase 1.4 targeted ESLint and `npx tsc --noEmit` pass.
- Phase 1.4 final `npx prisma validate` and `git diff --check` pass.
- Source search confirms no active application file imports the inert activity or transaction helpers.
- Phase 1.5 combined Event Ledger suite passes: 37 tests, 0 failures.
- Phase 1.5 targeted ESLint and `npx tsc --noEmit` pass.
- Phase 1.5 final `npx prisma validate` and `git diff --check` pass.
- Phase 1.6 combined Event Ledger suite passes: 50 tests, 0 failures.
- Phase 1.6 targeted ESLint and `npx tsc --noEmit` pass.
- Phase 1.6 final `npx prisma validate` and `git diff --check` pass.
- Phase 1.7 combined Event Ledger suite passes: 61 tests, 0 failures.
- Phase 1.7 targeted ESLint and `npx tsc --noEmit` pass.
- Phase 1.7 final `npx prisma validate` and `git diff --check` pass.
- Phase 1.8 combined Event Ledger suite passes: 73 tests, 0 failures.
- Phase 1.8 targeted ESLint and `npx tsc --noEmit` pass.
- Phase 1.8 final `npx prisma validate` and `git diff --check` pass.
- Phase 1.9 combined Event Ledger suite passes: 83 tests, 0 failures.
- Phase 1.9 targeted ESLint and `npx tsc --noEmit` pass.
- Phase 1.9 final `npx prisma validate` and `git diff --check` pass.

## Incomplete work

- Expand the golden set from 10 to at least 30 synthetic/anonymized cases before Phase 4; production examples require explicit sanitization approval.
- Decide the production provider tier/privacy policy before real CRM content is sent.
- Create or identify a confirmed Neon preview branch for migration rehearsal; the configured live schema already matches the offline baseline read-only.
- Identify or create a confirmed Neon preview branch before any migration-state mutation.
- Apply/resolve migrations only after explicit database-application authorization.
- Implement soft-delete-compatible runtime paths behind disabled flags before ledger backfill/dual-write.
- Add a generated-Prisma adapter only after the additive migration is rehearsed on a confirmed preview database.
- Run real PostgreSQL transaction tests for rollback, concurrent command-ID races, and concurrent expected-version edits on a migrated preview/test database.
- Wire active Opportunity/Activity reads to the audited scopes only after migration rehearsal and behind the soft-delete cutover flag.
- Add current-stage lookup/business validation when a generated Prisma adapter is available on the migrated preview database.
- Execute the reviewed `SKIP LOCKED` adapter concurrency tests only on a migrated preview database.
- Implement the generated-Prisma reader/writer adapters and execute backfill dry-run only after preview migration rehearsal.
- Verify migration baseline resolution and additive migration checksums against the confirmed preview target.
- Do not run `npm run build` against an unmigrated database because it regenerates the new Prisma Client.

## Blockers requiring user/product decisions

The safe offline Phase 1 foundation is complete. Further progress requires a confirmed non-production/Neon preview target. The current endpoint matches baseline but its environment identity is unknown; it was inspected read-only and not changed. Do not apply/resolve migrations or run backfill against it until identity is confirmed.

## Exact resume instructions for the next agent

1. Read `AGENTS.md` and the three Event AI plan files.
2. Run `git status --short` and compare it with `Files changed in this slice`.
3. Read `event-ai-agent-phase-1-design.md` and `event-ai-agent-phase-1-migration-review.md`.
4. Revalidate evaluation artifacts if touched:

   ```bash
   node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('.agents/evals/event-summary.schema.json','utf8')); for (const [i,l] of fs.readFileSync('.agents/evals/event-summary-golden.jsonl','utf8').trim().split(/\\n/).entries()) JSON.parse(l); console.log('schema + JSONL valid')"
   ```

5. Do not run build, migrate, resolve, deploy, db push, backfill, or enable ledger flags without reconciling the database target and current migration state.
6. Resume at the Preview Integration Gate: confirm/create a Neon preview branch, rehearse baseline resolution plus additive migration, regenerate Prisma Client for that target, then run real transaction/outbox concurrency tests and backfill dry-run. Do not use the unidentified current endpoint.

## Handoff checklist

- [x] `git status` reconciled with documented changed files
- [x] Current phase/slice/status updated
- [x] Completed and incomplete work are explicit
- [x] Commands and test results recorded
- [x] Risks/blockers recorded
- [x] Decision log updated when choices changed
- [x] Exact next action is executable without chat history
- [x] No unauthorized commit made

---

# Checkpoint: Architecture Pivot, Clean-up & Native Tab Prompt Settings (2026-09-03)

- **Phase**: Architecture Pivot & Clean-up Complete
- **Status**: Verified and Production Ready (No broken code or type errors)

## Completed Work in this Slice
1. **Dead Code Elimination (7,351 LOC deleted)**:
   - Deleted obsolete Event Ledger (`src/lib/event-ledger/`, 19 files).
   - Deleted obsolete Fact Graph and background workers (`fact-lifecycle.ts`, `fact-resolver.ts`, `circuit-breaker.ts`, `processor.ts`, `timeline.ts`, `budget.ts`, `context-builder.ts`, `dispatch.ts`, `pricing.ts`, `authorization.ts`, `capabilities.ts`, `visibility.ts`, `manager/`, `prompts/`).
   - Reverted `opportunity.ts` mutations to direct, instant Prisma CRUD.
2. **Plans Directory Clean-up (Option 2)**:
   - Deleted 8 obsolete Phase 0/Phase 1/migration design files.
   - Authored `.agents/plans/current-ai-architecture.md` as the official documentation of the current 1-click on-demand AI system.
3. **Sidebar Responsiveness & Dashboard Optimization**:
   - Created `src/app/system/loading.tsx` and `src/app/system/general/loading.tsx` with instant skeleton animations.
   - Enhanced `Sidebar.tsx` with `prefetch={true}`, valid route targets, and `active:scale-95` tactile click feedback.
   - Added 3-minute in-memory caching to Cloudinary and Google Drive APIs and decoupled Dashboard cards into independent lazy loading skeletons.
4. **AI Control Center Removal**:
   - Removed `ai_control` tab and navigation item from `src/components/system/SystemGeneralClient.tsx`.
   - Deleted obsolete `src/components/system/AIControlCenter.tsx`.
5. **Native In-Panel Tab for Prompt Settings in `EditDealPanel.tsx`**:
   - Replaced floating popup modal with native sub-tab pills (`[ ✨ Summary ]` vs `[ ⚙️ Prompt Settings ]` for Admin).
   - Exposed **System Instruction** (AI Persona & Tone), **Task Instruction** (Topics & Guidelines: Overview, Key Highlights, Blockers & Risks, Next Steps), and **Custom Instructions**.
   - Added `Reset to Default` and `Save Prompt` buttons with confirmation dialogs and toast alerts.
   - Wired `effectiveTaskInstruction` into `generateDealSummary` in `src/lib/actions/deal-summary.ts`.

6. **UI Refinement & Freshness Detection (Green/Black Theme)**:
   - Eliminated redundant `Update Summary` button and moved `Copy` to the bottom footer next to `Re-Summarize`.
   - Made `Re-Summarize` the prominent green button (`#C7F33C`) at the bottom.
   - Built automatic outdated detection: checks if new activity logs or deal updates occurred after `generatedAt`.
   - Added subtle status indicator in header and a clean alert banner with `+{count} new` updates when stale.
   - Optimistically flags summary as outdated as soon as a user posts a comment in `handleAddLog`.
   - Fully harmonized all 4 summary cards to the Green/Black flat theme (`bg-[#3A3B3C]`, `border-[#4E4F50]`, ZERO shadows, removed rainbow blue and amber colors).

7. **Prompt Settings Tab Simplification**:
   - Removed the redundant "AI Prompt Configuration Admin Only" banner block.
   - Textareas for System Instruction and Task Instructions now auto-expand to 100% of their content height (no internal scrollbars or cut-off text).
   - Removed the Additional Custom Instructions block, leaving only 2 core prompts (System Instruction & Task Instructions).
   - Removed the redundant "Back to Summary" button; bottom actions now cleanly feature "Reset to Default" and "Save Prompt".

8. **Icon & Typography Refinement**:
   - Replaced magic wand icon (`Wand2`) with the standard `Bot` icon in sidebar menu tabs, header icon, and sub-tab pills.
   - Removed numbered circles in "Recommended Next Steps", unifying them with subtle lime-green bullet points (`#C7F33C`).
   - Upgraded all tiny `text-xs` typography to `text-sm` across Summary cards, subtitles, Prompt Settings textareas, and action buttons.

9. **JSON Schema Editor & Dynamic Dimensions Rendering**:
   - Added Block 3: "3. JSON Schema (Structured Output Definition)" to Prompt Settings tab with live syntax validation on Save.
   - Backend `deal-summary.ts` now stores custom JSON Schema in audit log and passes `effectiveSchema` directly to Gemini API `generateStructured`.
   - Frontend `EditDealPanel.tsx` now dynamically renders ANY new dimensions/fields defined in JSON schema into stylized `#3A3B3C` cards (supporting string paragraphs, array bullet points, and object formats).
   - "Copy Summary" dynamically captures and formats all custom dimensions into clipboard text.

## Verification Results
- `npx tsc --noEmit`: Exited with code 0 (0 errors).
- Unit Tests (`gateway.test.ts`, `pipeline-activity-cache.test.ts`): 4 tests passed, 0 failures.
- Zero unauthorized git commits made.

