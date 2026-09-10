<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:event-ai-continuity -->

## Event AI project continuity

When working on Event AI, read these files before changing code:

1. `.agents/plans/event-ai-agent-roadmap.md`
2. `.agents/plans/event-ai-agent-execution.md`
3. `.agents/plans/event-ai-agent-decisions.md`

Treat `event-ai-agent-execution.md` as the resumable source of current work. Work in small verified slices. Before ending a turn, quota exhaustion, handoff, or context switch, update its checkpoint with completed work, incomplete work, changed files, verification results, blockers, and the exact next command/action. Do not claim a phase complete unless its exit criteria and tests are recorded. Do not commit Event AI changes unless the user explicitly authorizes a commit.

<!-- END:event-ai-continuity -->

<!-- BEGIN:crm-feature-architecture -->

## Shared CRM Feature Architecture

Before adding, changing, or refactoring CRM application features on any page, read
`.agents/skills/crm-feature-architecture/SKILL.md` and apply it alongside relevant
domain skills. It is the shared guide for code ownership, data loading, mutations,
cache/realtime recovery, and proportionate verification. Existing domain rules add
specific requirements; do not copy Pipeline-only conventions into other pages.

Use existing code and actual API signatures as evidence. Keep the change scoped to
the request and report documentation conflicts. Reusable prompt:
`.agents/skills/crm-feature-architecture/references/general-prompt.md`.

<!-- END:crm-feature-architecture -->

<!-- BEGIN:pipeline-deal-panel-architecture -->

## Pipeline Workspace & EditDealPanel Architecture Continuity

When working on Pipeline (`/pipeline`), KanbanBoard, EditDealPanel, or any deal-related tabs/features, you MUST read and strictly adhere to:
`.agents/skills/pipeline-deal-panel-architecture/SKILL.md`

### Core Invariants:
1. **Do NOT bloat `EditDealPanel.tsx`**: It is strictly a drawer orchestrator, header bar, and tab switcher. Any new tab, modal, or complex section MUST be extracted into a dedicated subcomponent (`src/components/pipeline/Deal<Feature>Tab.tsx`).
2. **Tab-Level Isolation & Unmounting**: Inactive tabs MUST unmount from the DOM. Never keep heavy background components mounted.
3. **State Preservation via `deal-draft-store.ts`**: Form drafts, pending text, and attachments MUST be stored in `src/lib/deal-draft-store.ts` keyed by `[dealId, tabId]` so users never lose drafts when switching tabs.
4. **On-Demand Data Boundaries**: Heavy assets (Deal Summary, Shared Media) must ONLY be fetched when their tab is active via `dealSummaryKey` and `sharedMediaKey`. Never add eager background preloads on card open.
5. **Operation-Based Mutations & Sync**: Use `src/lib/deal-accelerators-sync.ts` for accelerator badges, and `useDealMembersMutation` for team members with Granular Delta Rollback. Never wipe SWR cache or re-add `revalidatePath('/pipeline')` to high-frequency actions.
6. **Mandatory Verification**: You MUST run `npm run verify:pipeline` before completing your turn, ensuring 0 TypeScript errors and all automated tests pass.

<!-- END:pipeline-deal-panel-architecture -->
