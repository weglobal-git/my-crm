/**
 * Granular Rollback Helpers for Delete & Due Date Operations (Pillar 3)
 */

export interface Identifiable {
  id: string;
}

export interface DealWithDueDate extends Identifiable {
  dueDate?: Date | string | null;
}

export interface PageWithData<T> {
  data: T[];
  nextCursor?: string | null;
  [key: string]: unknown;
}

/**
 * Re-inserts a previously deleted item back into an array immutably.
 * If the item is already present, the original array is returned.
 * If a sort function is provided, the resulting array is sorted.
 */
export function rollbackDeletedItem<T extends Identifiable>(
  items: T[] | undefined,
  item: T | null | undefined,
  sortFn?: (a: T, b: T) => number
): T[] | undefined {
  if (!items) return items;
  if (!item) return items;

  if (items.some((i) => i.id === item.id)) {
    return items;
  }

  const updated = [item, ...items];
  if (sortFn) {
    return updated.sort(sortFn);
  }
  return updated;
}

/**
 * Re-inserts a previously deleted item back into paginated SWR infinite pages immutably.
 * Re-inserts into the first page by default (or the designated pageIndex).
 */
export function rollbackDeletedPageItem<T extends Identifiable, P extends PageWithData<T>>(
  pages: P[] | undefined,
  item: T | null | undefined,
  targetPageIndex = 0
): P[] | undefined {
  if (!pages || pages.length === 0) return pages;
  if (!item) return pages;

  // Check if item already exists across any page
  const exists = pages.some((page) => page.data.some((i) => i.id === item.id));
  if (exists) {
    return pages;
  }

  const pageIdx = Math.max(0, Math.min(targetPageIndex, pages.length - 1));

  return pages.map((page, idx) => {
    if (idx === pageIdx) {
      return {
        ...page,
        data: [item, ...page.data],
      };
    }
    return page;
  });
}

/**
 * Granular rollback of a deal's due date in a collection of deals.
 * Preserves other deals and properties.
 */
export function rollbackDueDate<T extends DealWithDueDate>(
  deals: T[] | undefined,
  dealId: string,
  previousDueDate: Date | string | null | undefined
): T[] | undefined {
  if (!deals) return deals;
  return deals.map((d) => {
    if (d.id === dealId) {
      return {
        ...d,
        dueDate: previousDueDate ?? null,
      };
    }
    return d;
  });
}
