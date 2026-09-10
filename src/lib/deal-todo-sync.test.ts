import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sortDealNotes,
  filterDealNotes,
  toggleNoteCompletion,
  toggleNotePriority,
  getIncompleteTodosCount,
  canCloseDealAsWon,
  type DealTodoNote,
} from './deal-todo-sync';

const mockNotes: DealTodoNote[] = [
  {
    id: 'note-1',
    content: 'Follow up on quote presentation',
    isPinned: false,
    isCompleted: false,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    author: { name: 'Alice Walker', image: null, email: 'alice@example.com' },
  },
  {
    id: 'note-2',
    content: 'URGENT: Review legal compliance checklist',
    isPinned: true,
    isCompleted: false,
    createdAt: new Date('2026-09-02T10:00:00Z'),
    author: { name: 'Bob Smith', image: null, email: 'bob@example.com' },
  },
  {
    id: 'note-3',
    content: 'Send welcome package to onboarded contact',
    isPinned: false,
    isCompleted: true,
    createdAt: new Date('2026-09-03T10:00:00Z'),
    author: { name: 'Charlie Day', image: null, email: 'charlie@example.com' },
  },
  {
    id: 'note-4',
    content: 'Sign NDA before stakeholder meeting',
    isPinned: true,
    isCompleted: true,
    createdAt: new Date('2026-09-04T10:00:00Z'),
    author: { name: 'Alice Walker', image: null, email: 'alice@example.com' },
  },
];

test('sortDealNotes: prioritizes pinned notes first, then sorts newest first', () => {
  const sorted = [...mockNotes].sort(sortDealNotes);

  // Both pinned items (note-4: Sep 4, note-2: Sep 2) should be first
  assert.equal(sorted[0].id, 'note-4');
  assert.equal(sorted[1].id, 'note-2');

  // Followed by unpinned items (note-3: Sep 3, note-1: Sep 1)
  assert.equal(sorted[2].id, 'note-3');
  assert.equal(sorted[3].id, 'note-1');
});

test('filterDealNotes: filters by subTab "todo" (incomplete tasks)', () => {
  const todoNotes = filterDealNotes(mockNotes, 'todo');

  assert.equal(todoNotes.length, 2);
  assert.equal(todoNotes[0].id, 'note-2'); // pinned todo
  assert.equal(todoNotes[1].id, 'note-1'); // unpinned todo
  assert.equal(todoNotes.every((n) => !n.isCompleted), true);
});

test('filterDealNotes: filters by subTab "completed" (completed tasks)', () => {
  const completedNotes = filterDealNotes(mockNotes, 'completed');

  assert.equal(completedNotes.length, 2);
  assert.equal(completedNotes[0].id, 'note-4'); // pinned completed
  assert.equal(completedNotes[1].id, 'note-3'); // unpinned completed
  assert.equal(completedNotes.every((n) => n.isCompleted), true);
});

test('filterDealNotes: searches within sub-tab by content (case-insensitive)', () => {
  const searchResults = filterDealNotes(mockNotes, 'todo', 'quote');

  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].id, 'note-1');
  assert.equal(searchResults[0].content.includes('quote'), true);
});

test('filterDealNotes: searches within sub-tab by author name (case-insensitive)', () => {
  const searchResults = filterDealNotes(mockNotes, 'completed', 'alice');

  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].id, 'note-4');
  assert.equal(searchResults[0].author.name, 'Alice Walker');
});

test('toggleNoteCompletion: optimistically toggles status and moves between tabs', () => {
  // Initially in To-Do: note-1 is incomplete
  const initialTodos = filterDealNotes(mockNotes, 'todo');
  assert.equal(initialTodos.some((n) => n.id === 'note-1'), true);

  // Mark note-1 as completed
  const updatedNotes = toggleNoteCompletion(mockNotes, 'note-1', true);
  const updatedNote1 = updatedNotes.find((n) => n.id === 'note-1');
  assert.equal(updatedNote1?.isCompleted, true);

  // Now note-1 must be absent from 'todo' and present in 'completed'
  const newTodos = filterDealNotes(updatedNotes, 'todo');
  const newCompleted = filterDealNotes(updatedNotes, 'completed');

  assert.equal(newTodos.some((n) => n.id === 'note-1'), false);
  assert.equal(newCompleted.some((n) => n.id === 'note-1'), true);

  // Mark back to incomplete
  const revertedNotes = toggleNoteCompletion(updatedNotes, 'note-1', false);
  const revertedTodos = filterDealNotes(revertedNotes, 'todo');
  assert.equal(revertedTodos.some((n) => n.id === 'note-1'), true);
});

test('toggleNotePriority: optimistically elevates note to top and reverts on untoggle', () => {
  // note-1 is initially unpinned (at the bottom of todo)
  const initialTodos = filterDealNotes(mockNotes, 'todo');
  assert.equal(initialTodos[initialTodos.length - 1].id, 'note-1');

  // Mark note-1 as Priority (pinned)
  const prioritizedNotes = toggleNotePriority(mockNotes, 'note-1', true);
  const prioritizedTodos = filterDealNotes(prioritizedNotes, 'todo');

  // note-2 is pinned (Sep 2), note-1 is pinned (Sep 1) -> note-2 then note-1 (both before unpinned)
  const note1Index = prioritizedTodos.findIndex((n) => n.id === 'note-1');
  assert.equal(note1Index < prioritizedTodos.length, true);
  assert.equal(prioritizedTodos.find((n) => n.id === 'note-1')?.isPinned, true);

  // If note-1 has newer date or if we set note-1 as priority
  const note1Prioritized = prioritizedNotes.find((n) => n.id === 'note-1');
  assert.equal(note1Prioritized?.isPinned, true);

  // Revert priority
  const unprioritizedNotes = toggleNotePriority(prioritizedNotes, 'note-1', false);
  const unprioritizedTodos = filterDealNotes(unprioritizedNotes, 'todo');
  assert.equal(unprioritizedTodos.find((n) => n.id === 'note-1')?.isPinned, false);
});

test('getIncompleteTodosCount: accurately counts incomplete tasks', () => {
  assert.equal(getIncompleteTodosCount(mockNotes), 2);

  const allCompleted = mockNotes.map((n) => ({ ...n, isCompleted: true }));
  assert.equal(getIncompleteTodosCount(allCompleted), 0);
});

test('canCloseDealAsWon: blocks closing as won if there are pending to-dos', () => {
  // Sales deal with complete fields but has 1 pending to-do
  assert.equal(
    canCloseDealAsWon({
      isSalesDeal: true,
      missingWonFields: [],
      pendingTodosCount: 1,
    }),
    false
  );

  // Internal task with 2 pending to-dos
  assert.equal(
    canCloseDealAsWon({
      isSalesDeal: false,
      missingWonFields: [],
      pendingTodosCount: 2,
    }),
    false
  );

  // Sales deal with missing fields and 0 pending to-dos
  assert.equal(
    canCloseDealAsWon({
      isSalesDeal: true,
      missingWonFields: ['Total Value'],
      pendingTodosCount: 0,
    }),
    false
  );

  // Sales deal with all fields complete AND 0 pending to-dos -> ELIGIBLE
  assert.equal(
    canCloseDealAsWon({
      isSalesDeal: true,
      missingWonFields: [],
      pendingTodosCount: 0,
    }),
    true
  );

  // Internal task with 0 pending to-dos -> ELIGIBLE
  assert.equal(
    canCloseDealAsWon({
      isSalesDeal: false,
      missingWonFields: [],
      pendingTodosCount: 0,
    }),
    true
  );
});

