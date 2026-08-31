---
name: crm-performance-optimization
description: Optimize Core Web Vitals (LCP, INP, CLS) and Database Query Performance for the CRM. Use when asked to "improve page load", "fix slow loading", "optimize INP", or "improve performance".
license: MIT
metadata:
  author: agent
  version: "1.0"
---

# CRM Performance Optimization (React + Prisma)

This skill provides guidelines for optimizing page load speed, interaction responsiveness, and database query efficiency specifically for our CRM architecture.

## 1. The Root Cause of Slow CRM Pages (Data Over-fetching)

The most common reason for 6-8 second load times in our CRM (e.g., the Pipeline page) is **Cartesian Product (N+1) querying** via Prisma's `include` combined with passing massive serialized data from Server Components to Client Components.

### The Problem
When loading a list of items (like Opportunities on a Kanban board), querying deep relations (like ALL `activityLogs`, `replies`, and `users`) multiplies the response size exponentially.

```javascript
// ❌ SLOW: Fetches entire history for EVERY deal on the board
const opportunities = await prisma.opportunity.findMany({
  include: {
    activityLogs: { include: { replies: true, user: true } } // Massive JSON payload!
  }
});
```

### The Solution: Lazy Loading & Shallow Queries
For lists and boards, **only fetch the bare minimum data required to render the card**.
Fetch detailed history/relations **only when the user clicks** to open the details panel.

```javascript
// ✅ FAST: Shallow fetch for the board
const opportunities = await prisma.opportunity.findMany({
  include: {
    company: true,
    owner: true,
    // Only fetch the 1 most recent log to determine "Red Card" status
    activityLogs: { 
      take: 1, 
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true } // Only fetch what's needed
    }
  }
});

// Fetch full details later via Server Action when EditDealPanel opens
```

---

## 2. Server Components vs Client Components

Passing huge JSON objects from Server Components (like `page.tsx`) to Client Components (like `KanbanBoard.tsx`) blocks the initial HTML stream (TTFB) and increases the LCP delay because the client has to download and parse a massive `<script>` tag containing the hydration data.

**Optimization Checklist:**
- [ ] Are we passing only the strictly necessary props to Client Components?
- [ ] Can heavy components (like `EditDealPanel`) be dynamically imported so they don't block initial JS execution?

```javascript
// ✅ Use next/dynamic for heavy, non-initial components
import dynamic from 'next/dynamic';
const EditDealPanel = dynamic(() => import('./EditDealPanel').then(mod => mod.EditDealPanel), { ssr: false });
```

---

## 3. Core Web Vitals (LCP, INP, CLS)

### LCP: Largest Contentful Paint (Goal: ≤ 2.5s)
- **Optimize TTFB**: Reduce DB query time (see section 1).
- **Images**: Use `unoptimized` for external dynamic SVGs (like DiceBear avatars) to prevent Next.js image optimization bottlenecks, but use `priority` for the main hero/LCP images.

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

---

## 4. Debugging Checklist

If a page is slow, follow this diagnostic flow:
1. **Check DB Queries**: Look at `prisma.findMany`. Are there deep `include`s? Are we fetching rows we don't need?
2. **Check Prop Sizes**: Console log the props being passed from Server to Client. Is the JSON payload > 100KB?
3. **Check Client Side Rendering**: Is there a heavy `useEffect` running on mount?
4. **Network Tab**: Is the document request (TTFB) taking > 1s? (Indicates slow DB/Server).

