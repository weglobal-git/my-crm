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
