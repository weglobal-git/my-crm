---
name: crm-performance-optimization
description: Optimize Core Web Vitals (LCP, INP, CLS) and Database Query Performance for the CRM. Use when asked to "improve page load", "fix slow loading", "optimize INP", or "improve performance".
license: MIT
metadata:
  author: agent
  version: "1.0"
---

# CRM Performance Optimization (React + Prisma)

This skill provides guidelines for optimizing page load speed, interaction responsiveness, and database query efficiency specifically for our CRM architecture (Next.js App Router + Prisma). 

Through a recent major optimization case study (reducing Pipeline page load from ~1.8MB to 4.32KB), we have established the following core performance pillars for this project.

## 1. Network & Payload Optimization (CSR + SWR Architecture)

Passing massive serialized JSON objects (e.g., arrays of Opportunities with deep relations) from Server Components (like `page.tsx`) to Client Components (like `KanbanBoard.tsx`) blocks the initial HTML stream and bloats the document size (causing slow TTFB and LCP).

**The Ultimate Strategy:**
- **Zero Heavy Data on SSR:** Do NOT fetch heavy lists or deep relations in Server Components. Pass `undefined` or empty arrays as the initial state.
- **Lightweight Shell:** Let the Server Component render a lightweight HTML shell (with CSS/JS bundles heavily cached by the browser).
- **Client-Side Fetching:** Use `useSWR` in the Client Component to fetch data asynchronously after the shell loads, showing a CSS spinner or Skeleton Loader in the meantime. This keeps the initial HTML transfer size to < 5KB.

## 2. Database Query Efficiency (Indexes & Selects)

Client-side fetching is only fast if the underlying database query is fast.

**Optimization Checklist:**
- **Lean Querying (`select` vs `include`):** Never use `include: true` for deep relations if you only need a few fields. Use `select` to specify exactly which fields the UI needs (e.g., only `name` and `image` for a User, not their `departments` or password hash). This reduces the JSON payload by 40-50%.
- **Database Indexes (`@@index`):** Identify fields frequently used in `where` or `orderBy` clauses (e.g., `status`, `ownerId`, `updatedAt` in `Opportunity`). Ensure they have `@@index` in `schema.prisma` and run `npx prisma db push`. This reduces query times from seconds to ~100-300ms.

## 3. Core Web Vitals (LCP, INP, CLS)

### LCP: Largest Contentful Paint (Goal: ≤ 2.5s)
- **Component Splitting**: Dynamically import heavy, non-initial components (like `EditDealPanel` or Modals) so they don't block initial JS execution.
  ```javascript
  import dynamic from 'next/dynamic';
  const EditDealPanel = dynamic(() => import('./EditDealPanel').then(mod => mod.EditDealPanel), { ssr: false });
  ```
- **Images**: Use `unoptimized` for external dynamic SVGs (like DiceBear avatars) to prevent Next.js image optimization bottlenecks.

### INP: Interaction to Next Paint (Goal: ≤ 200ms)
- **Drag and Drop**: In Kanban boards (`@dnd-kit`), ensure `setState` operations during drag don't trigger cascading renders across unrelated components.
- **Optimistic UI**: When moving a deal or submitting a comment, update the UI state immediately, then fire the Server Action in the background.

```javascript
// ✅ Optimistic UI pattern
const handleMove = async (id, newStage) => {
  setDeals(optimisticUpdate); // Instant visual feedback (< 50ms)
  try {
    await moveOpportunityServerAction(id, newStage); // Background processing
  } catch {
    setDeals(revertUpdate); // Revert on failure
  }
};
```

### CLS: Cumulative Layout Shift (Goal: ≤ 0.1)
- **Fixed Dimensions**: Always provide `width` and `height` for `<Image>` components or reserve space using Skeleton loaders.
- **Conditional Rendering**: Avoid inserting elements at the top of the DOM dynamically without reserving space first.

## 4. Maintenance & Bundle Size (Dead Code Elimination)

When heavily refactoring or migrating architectures (e.g., from SSR to CSR), always rigorously audit for dead code.
- **Unused Imports:** Remove unused module imports, especially heavy libraries or server-side Prisma types left in Client Components. This prevents Webpack/Turbopack from accidentally including them in the client JS bundle.
- **Orphaned Logic:** Clean up leftover variables, complex conditional logic (e.g., old `where` clauses in Server Components), or unused props.
- **Why it matters:** Dead code not only adds cognitive load for developers but can drastically bloat the JavaScript payload that the browser has to download, parse, and execute—directly harming TTI (Time to Interactive) and INP.

## 5. Debugging Checklist

If a page is slow, follow this diagnostic flow:
1. **Network Tab**: Is the document request (HTML shell) > 10KB? If yes, you are leaking data via SSR props.
2. **Check DB Queries**: Look at `prisma.findMany`. Are there deep `include`s? Are we fetching rows we don't need?
3. **Check Client Side Rendering**: Is there a heavy `useEffect` running on mount causing layout thrashing?
4. **Dead Code Check**: Are there unused imports or orphaned logic artificially bloating the component bundle?

