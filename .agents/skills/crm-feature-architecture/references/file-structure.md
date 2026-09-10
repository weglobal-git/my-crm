# Choosing file ownership

This is a placement guide, not a claim that every illustrated file exists. Inspect the
current feature first. Prefer established locations; do not migrate unrelated features.

| Responsibility | Placement decision |
|---|---|
| Route, metadata, composition | Existing `src/app/<route>/page.tsx` and layout |
| Feature UI | Existing `src/components/<feature>/` convention |
| Feature lifecycle/mutation hook | Existing `src/hooks/` or feature-local hooks |
| Cache keys, DTOs, pure reconciliation | Feature-owned module in existing `src/lib/` convention |
| Authenticated writes | Existing `src/lib/actions/` convention |
| Streaming/HTTP transport | Route Handler when the transport requires one |
| Server orchestration and queries | Server-only feature module; never imported into client code |
| Reusable UI | `src/components/ui/` only when independent of feature business rules |

For a substantial new feature, a cohesive feature directory is an option. Choose it
only when it improves ownership over the established layout, and explain the choice:

```text
src/
  app/<route>/page.tsx                 # compose feature; route responsibilities
  features/<feature>/                 # optional new convention, not required scaffolding
    components/FeatureView.tsx        # feature UI
    useFeature.ts                     # client lifecycle, if needed
    cache.ts                          # key factory + pure merging, if needed
    types.ts                          # client-safe DTO contracts
    server/service.ts                 # server-only business orchestration
    cache.test.ts                     # tests importing real cache implementation
```

Create files only for real responsibilities. Do not create empty directories, barrels,
repositories, services, and hooks for every small feature. Shared code needs actual
consumers; a component count or line limit is not an architectural objective.

Dependency direction: route composes feature UI; UI uses feature lifecycle/data APIs;
authenticated server entry points call server services; services access persistence and
existing integrations. Client code must not import server implementation or secrets.
Client-to-server calls use the framework's supported boundary (e.g. Server Actions),
not a direct import of server internals. DTO/cache utilities remain client-safe.

Before implementing, briefly record:

1. Files to change/create and their responsibilities.
2. Server-data owner, cache scope, and draft lifecycle.
3. Initial versus on-demand requests and shared resources reused.
4. Mutation confirmation/rollback/recovery, if applicable.
5. Checks that can detect the changed behavior breaking.

Scale this explanation to the change: a small fix does not need an architecture document.
