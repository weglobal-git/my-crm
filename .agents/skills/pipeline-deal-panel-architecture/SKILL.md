---
name: pipeline-deal-panel-architecture
description: >
  Mandatory architecture guidelines and code structure for Pipeline, KanbanBoard,
  EditDealPanel, and all Deal Drawer Tabs. Agents MUST consult this skill before
  modifying, adding tabs to, or refactoring the CRM Pipeline.
license: MIT
metadata:
  author: WeGlobal Team
  version: "1.0"
---

# Pipeline & EditDealPanel Architecture Standard (v2)

> [!IMPORTANT]
> **MANDATORY FOR ALL AI AGENTS & DEVELOPERS:**
> `EditDealPanel.tsx` was previously an unmaintainable monolith of 4,000+ lines.
> Through a 6-phase architectural overhaul, it has been streamlined into a lightweight orchestrator (~1,600 lines) with isolated tabs, on-demand data loading, and in-memory draft retention.
> **DO NOT** add inline tab logic or heavy state back into `EditDealPanel.tsx`. Follow the 5-pillar structure below.

---

## 🏛️ The 5 Pillars of Pipeline Architecture

### Pillar 1: Tab-Level Isolation & Clean Unmounting
- **Rule**: Inactive tabs **MUST NOT** stay mounted in the DOM.
- **Why**: Keeping 7+ tabs mounted causes memory leaks, excessive DOM elements, duplicate Pusher listeners, and sluggish tab switching.
- **Pattern**:
  ```tsx
  {activeTab === 'activity' ? (
    <ActivityFeedTab deal={deal} ... />
  ) : (
    <div className="flex-1 overflow-y-auto ...">
      {activeTab === 'summary' && <DealSummaryTab dealId={deal.id} ... />}
      {activeTab === 'system' && <DealSystemLogsTab ... />}
      {activeTab === 'manager-call' && <DealManagerCallTab ... />}
      {activeTab === 'collaborate' && <DealCollaborateTab ... />}
      {activeTab === 'information' && <CustomerTab ... />}
      {activeTab === 'notes' && <NotesTab ... />}
      {activeTab === 'sharedMedia' && <SharedMediaTab ... />}
    </div>
  )}
  ```

### Pillar 2: Draft & State Retention (`src/lib/deal-draft-store.ts`)
- **Rule**: Because tabs unmount when switching, form inputs and drafts **MUST** be preserved in `deal-draft-store.ts`.
- **Key Pattern**: `[dealId, tabId]`
- **Usage**:
  ```typescript
  import { useDealDraft } from '@/lib/deal-draft-store';

  // Inside ActivityFeedTab or any tab:
  const { draft, setDraft, clearDraft } = useDealDraft<ActivityDraft>(deal.id, 'activity', {
    text: '',
    pendingDueDate: null,
    pendingAttachments: [],
    isManagerCallMode: false,
    replies: {},
  });
  ```
- **Lifecycle Cleanups**:
  - `clearDraft()`: Call immediately upon successful submission.
  - `clearAllDraftsForDeal(deal.id)`: Called automatically when `EditDealPanel` closes.

### Pillar 3: On-Demand Data Boundaries & KanbanCardDTO
- **Rule**: **NEVER** preload heavy content (AI Summary, Shared Media list, Activity logs, Notes) on deal card open or on the Kanban board.
- **KanbanCardDTO Contract (`src/lib/pipeline-card-dto.ts`)**:
  - The Kanban board only fetches `KanbanCardDTO` via `pipelineCardSelect` (ID, topic, status, type, value, dueDate, avatars, and 1 latest activity log).
  - Both `getPipelineOpportunitiesForActor` and `getMoreCompletedOpportunities` MUST use `select: pipelineOpportunitySelect`.
  - Never use heavy `include: { ... }` with deep nested models on board list queries.
- **Key Factories**:
  ```typescript
  // src/lib/pipeline-activity-cache.ts
  dealSummaryKey(dealId, activeTab, isOpen); // Returns ['deal-summary-on-demand', dealId] ONLY if activeTab === 'summary'
  sharedMediaKey(dealId, activeTab, isOpen); // Returns ['opportunity-shared-media', dealId] ONLY if activeTab === 'sharedMedia'
  activityFeedKey(dealId, activeTab, isOpen, prev); // Returns ['activity-logs', ...] ONLY if activeTab === 'activity' | 'system'
  ```
- **Directory Sharing**:
  - Use `useSWR("all-users", getAllUsers, { dedupingInterval: 120_000 })` for user lists across Collaborate, Transfer, and Invite. Never call `getAllUsers().then(...)` directly inside components.

### Pillar 4: Operation-Based Mutation & Synchronized Badges
- **Rule**:
  1. Optimistically paint local state in `<10ms`.
  2. Mutate SWR cache without forcing full-page re-renders (`{ revalidate: false }`).
  3. Clean up badge keys when count drops to 0 (`delete next[deal.id]`).
- **Accelerator & Manager Call Helpers** (`src/lib/deal-accelerators-sync.ts`):
  - `decrementPendingBadge(prevMap, dealId)`: Decrements badge and deletes deal key on 0.
  - `incrementPendingBadge(prevMap, dealId, timestamp?)`: Increments badge for manager call.
  - `setPendingBadgeCount(prevMap, dealId, count, timestamp?)`: Authoritative count setter.
  - `isPendingAcceleratorsKey(key)`: Matches `'pending-accelerators'` and `['pending-accelerators', ...]`.
- **Never Use `revalidatePath('/pipeline')`** in high-frequency actions (moving deals, logging activity, updating due dates, transfer requests). Let SWR + Pusher handle real-time sync.

### Pillar 5: Machine-Enforced Guardrails
- **Rule**: Every change to pipeline must pass the automated verification gate:
  ```bash
  npm run verify:pipeline
  ```
- This runs `npx tsc --noEmit` and all unit test suites (`deal-members-concurrency`, `pipeline-activity-cache`, `deal-draft-store`, `deal-accelerators-sync`).

---

## 📁 File Structure Map

```
src/
├── components/pipeline/
│   ├── KanbanBoard.tsx                 # Kanban board, columns, stable 'pending-accelerators' SWR hook
│   ├── KanbanColumn.tsx                # Column container & drop target
│   ├── KanbanCard.tsx                  # Deal card UI & orange pending badges
│   ├── EditDealPanel.tsx               # Drawer orchestrator, header, sub-bar, tab switcher
│   ├── EditDealMainBar.tsx             # Deal topic editor, card actions button, close button
│   ├── EditDealSubBar.tsx              # Sub-navigation bar, tab switches, search input
│   ├── ActivityFeedTab.tsx             # Activity comments, full-width portaled dock, file drops
│   ├── ActivityCommentItem.tsx         # Activity comment bubble, avatar, timestamp, replies
│   ├── DealSummaryTab.tsx              # Instant AI summary, prompt editor, cost calculator
│   ├── DealManagerCallTab.tsx          # Target goal milestone editor, pending/answered question cards
│   ├── DealCollaborateTab.tsx          # Collaborate tab container
│   ├── DealTeamMembersSection.tsx      # Team members list, remove/leave permissions
│   ├── DealSystemLogsTab.tsx           # System update timeline with search highlighting
│   ├── DealImageLightbox.tsx           # Full-screen image preview lightbox with keyboard nav
│   ├── DealActionsDrawer.tsx           # Card lifecycle actions (Won, Lost, Convert, Delete)
│   ├── MemberSelectDrawer.tsx          # User selection drawer (single for transfer, multi for invite)
│   ├── RewriteCommentModal.tsx         # AI comment polish modal
│   ├── CustomerTab.tsx                 # Customer / Organization details
│   ├── NotesTab.tsx                    # Deal notes tab with search
│   └── SharedMediaTab.tsx              # Photos, links, and documents tab
└── lib/
    ├── deal-draft-store.ts             # In-memory draft store keyed by [dealId, tabId]
    ├── deal-accelerators-sync.ts       # Pending badge mutation helpers & key predicates
    ├── pipeline-activity-cache.ts      # Activity feed cache key generator & event merger
    ├── pusher-connection-manager.ts    # Tab dormancy, cross-tab BroadcastChannel, connection hygiene
    └── hooks/
        └── useDealMembersMutation.ts   # Team members mutation with Granular Delta Rollback
```

---

## 🛑 Rules for Adding New Features to EditDealPanel

1. **If adding a new Tab**:
   - Create `src/components/pipeline/Deal<Feature>Tab.tsx`.
   - Add tab definition to `SubBarTab` in `EditDealSubBar.tsx`.
   - Render tab conditionally under `{activeTab === '<feature>' && <Deal<Feature>Tab ... />}`.
   - If tab requires draft retention, register schema in `deal-draft-store.ts`.
2. **If adding an Action or Modal**:
   - Create a dedicated modal component (`<Feature>Modal.tsx` or `<Feature>Drawer.tsx`).
   - Keep state (`isOpen`, `isSubmitting`) isolated inside that component or minimal boolean flags in `EditDealPanel.tsx`.
3. **If modifying Badges or Counts**:
   - Always check `isPendingAcceleratorsKey(key)` when mutating `pending-accelerators`.
   - Always delete the deal key when count is 0 to avoid zombie orange borders.
4. **Before committing or finishing**:
   - Always execute `npm run verify:pipeline`. Never leave failing tests or type errors.
