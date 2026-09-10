export interface DealTodoNote {
  id: string;
  content: string;
  isPinned: boolean;
  isCompleted?: boolean;
  createdAt: Date;
  author: { name: string | null; image: string | null; email: string | null };
}

/**
 * Sorts notes with Priority (isPinned) first, then by creation date descending (newest first).
 */
export function sortDealNotes<T extends Pick<DealTodoNote, 'isPinned' | 'createdAt'>>(a: T, b: T): number {
  const priorityDiff = Number(b.isPinned) - Number(a.isPinned);
  if (priorityDiff !== 0) return priorityDiff;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * Filters notes based on the active sub-tab ('todo' | 'completed') and optional search query.
 */
export function filterDealNotes<T extends DealTodoNote>(
  notes: T[],
  subTab: 'todo' | 'completed' = 'todo',
  searchQuery?: string
): T[] {
  const query = searchQuery?.trim().toLowerCase() || '';

  return notes
    .filter((note) => {
      const isCompleted = !!note.isCompleted;
      if (subTab === 'completed' && !isCompleted) return false;
      if (subTab !== 'completed' && isCompleted) return false;

      if (query) {
        const matchContent = note.content.toLowerCase().includes(query);
        const matchAuthor = note.author.name?.toLowerCase().includes(query);
        return matchContent || matchAuthor;
      }
      return true;
    })
    .sort(sortDealNotes);
}

/**
 * Optimistically toggles the completion status of a note.
 */
export function toggleNoteCompletion<T extends DealTodoNote>(
  notes: T[],
  noteId: string,
  targetCompleted: boolean
): T[] {
  return notes.map((note) =>
    note.id === noteId ? { ...note, isCompleted: targetCompleted } : note
  );
}

/**
 * Optimistically toggles the priority (pinned) status of a note and maintains sorted order.
 */
export function toggleNotePriority<T extends DealTodoNote>(
  notes: T[],
  noteId: string,
  targetPinned: boolean
): T[] {
  return notes
    .map((note) =>
      note.id === noteId ? { ...note, isPinned: targetPinned } : note
    )
    .sort(sortDealNotes);
}

/**
 * Counts the number of incomplete To-Do tasks in a list of notes.
 */
export function getIncompleteTodosCount<T extends Pick<DealTodoNote, 'isCompleted'>>(
  notes: T[]
): number {
  return notes.filter((n) => !n.isCompleted).length;
}

/**
 * Validates whether a deal is eligible to be marked as Won:
 * 1. Must have all required sales fields completed (if it's a sales deal).
 * 2. Must have 0 incomplete To-Do tasks.
 */
export function canCloseDealAsWon(params: {
  isSalesDeal: boolean;
  missingWonFields: string[];
  pendingTodosCount: number;
}): boolean {
  if (params.pendingTodosCount > 0) return false;
  if (params.isSalesDeal && params.missingWonFields.length > 0) return false;
  return true;
}

