---
name: crm-code-simplification
description: Simplify working CRM TypeScript, React, and Next.js code without changing behavior. Use when the user requests cleanup, readability refactoring, complexity reduction, or simplification after a verified feature or performance fix. Do not use this skill to diagnose slowness or justify an unmeasured performance change.
---

# CRM Code Simplification

Reduce accidental complexity while preserving behavior, permissions, data ownership,
and runtime characteristics. Optimize for comprehension and safe future changes, not
line count.

## Required context

Read the repository `AGENTS.md` and `../crm-feature-architecture/SKILL.md` before
editing application code. Read any domain skill named there for the affected feature.
For Pipeline, follow `../pipeline-deal-panel-architecture/SKILL.md`, including its
mandatory verification command. For framework-sensitive changes, inspect the relevant
guide in the installed `node_modules/next/dist/docs/` before relying on remembered
Next.js behavior.

This skill supplements those rules; it never overrides them.

## Scope and routing

Use this skill when working code is harder to understand, test, or extend than needed,
or for a focused cleanup after the original change is already verified.

Do not activate it merely because a page is slow. Start speed investigations with
`performance`; use `trace-performance-bottleneck` when the dominant browser, network,
server, or database layer cannot be localized. Simplification is not evidence of a
speed improvement.

Keep cleanup separate from feature or bug-fix behavior when practical. Do not expand
into unrelated files, introduce a general framework for one consumer, or commit unless
the user explicitly authorizes a commit.

## Workflow

1. Trace the target responsibility, its callers, tests, side effects, and error paths.
   Use existing code and actual signatures as evidence. Check history when an unusual
   boundary may encode a compatibility, security, or concurrency decision.
2. State the behavior that must remain invariant and choose the smallest reviewable
   simplification. Prefer clear names, guard clauses, removal of proven duplication,
   and responsibility-based extraction over clever compression.
3. Change one coherent area at a time. Preserve the surrounding idiom and avoid
   rewriting tests merely to accommodate changed behavior.
4. Run the smallest check that would fail if behavior changed, then the applicable
   project verification. Sweep sibling callers when shared code changes.
5. Report what became simpler, the checks actually run, and any behavior or performance
   property that remains unmeasured.

## CRM invariants

- Preserve server-side authorization, department permissions, and contact masking.
- Preserve feature ownership and the distinction between transient UI state, drafts,
  and authoritative server data.
- Do not collapse cache-key factories, mutation owners, optimistic rollback, or
  realtime reconciliation merely because they have few callers. Their value may be
  correctness and isolation rather than reuse.
- Do not replace operation-scoped rollback with whole-cache restoration, weaken
  ordering/idempotency safeguards, or make critical persistence fire-and-forget.
- Do not merge on-demand detail data into list/card DTOs or eagerly mount inactive
  heavy views in the name of reducing files or abstractions.
- If code is on a measured hot path, repeat an equivalent before/after benchmark.
  Reject the simplification when it materially regresses latency, payload, bundle,
  render work, or database/network operations.

## Decision standard

A simplification is worthwhile only when a new maintainer can understand the real
responsibility faster without losing an intentional boundary. Fewer lines alone are
not evidence. If the reason for an abstraction or branch is still unknown, leave it in
place and report the unresolved question rather than guessing.

Before finishing, confirm that relevant tests pass without weakening them, the diff is
scoped, error behavior remains intact, no unused code was introduced, and all required
domain checks were run in this session.
