import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rollbackDeletedItem,
  rollbackDeletedPageItem,
  rollbackDueDate,
  type Identifiable,
  type DealWithDueDate,
  type PageWithData,
} from './pipeline-delete-rollback';

test('rollbackDeletedItem: restores item while preserving concurrent additions', () => {
  interface Note extends Identifiable {
    id: string;
    content: string;
  }

  // Suppose note-1 was deleted, but in the meantime note-3 was added concurrently
  const deletedNote: Note = { id: 'note-1', content: 'Deleted Note' };
  const currentNotesAfterConcurrentAdd: Note[] = [
    { id: 'note-3', content: 'Concurrently Added Note' },
    { id: 'note-2', content: 'Existing Note' },
  ];

  // Granular rollback should re-insert note-1 WITHOUT wiping note-3
  const rolledBack = rollbackDeletedItem(currentNotesAfterConcurrentAdd, deletedNote);
  assert.ok(rolledBack);
  assert.equal(rolledBack.length, 3);
  assert.equal(rolledBack[0].id, 'note-1');
  assert.equal(rolledBack[1].id, 'note-3');
  assert.equal(rolledBack[2].id, 'note-2');

  // Verify duplicate prevention
  const duplicateCheck = rollbackDeletedItem(rolledBack, deletedNote);
  assert.equal(duplicateCheck?.length, 3);
});

test('rollbackDeletedItem: sorts when sort function is provided', () => {
  interface PinnedNote extends Identifiable {
    id: string;
    isPinned: boolean;
  }

  const current: PinnedNote[] = [{ id: 'note-2', isPinned: false }];
  const deleted: PinnedNote = { id: 'note-1', isPinned: true };

  const rolledBack = rollbackDeletedItem(current, deleted, (a, b) => Number(b.isPinned) - Number(a.isPinned));
  assert.ok(rolledBack);
  assert.equal(rolledBack[0].id, 'note-1');
  assert.equal(rolledBack[0].isPinned, true);
});

test('rollbackDeletedPageItem: re-inserts item into infinite paginated pages', () => {
  interface Comment extends Identifiable {
    id: string;
    text: string;
  }

  const pages: PageWithData<Comment>[] = [
    { data: [{ id: 'c-2', text: 'Comment 2' }], nextCursor: 'cur-2' },
    { data: [{ id: 'c-3', text: 'Comment 3' }], nextCursor: null },
  ];

  const deletedComment: Comment = { id: 'c-1', text: 'Comment 1' };

  const rolledBack = rollbackDeletedPageItem(pages, deletedComment, 0);
  assert.ok(rolledBack);
  assert.equal(rolledBack[0].data.length, 2);
  assert.equal(rolledBack[0].data[0].id, 'c-1');
  assert.equal(rolledBack[0].data[1].id, 'c-2');
  assert.equal(rolledBack[1].data.length, 1);

  // Duplicate check across pages
  const duplicate = rollbackDeletedPageItem(rolledBack, deletedComment, 0);
  assert.equal(duplicate?.[0].data.length, 2);
});

test('rollbackDueDate: restores previous due date accurately', () => {
  const deals: DealWithDueDate[] = [
    { id: 'deal-1', dueDate: '2026-10-01' },
    { id: 'deal-2', dueDate: '2026-11-01' },
  ];

  const rolledBack = rollbackDueDate(deals, 'deal-1', '2026-09-15');
  assert.ok(rolledBack);
  assert.equal(rolledBack[0].dueDate, '2026-09-15');
  assert.equal(rolledBack[1].dueDate, '2026-11-01');

  // Rollback to null
  const nullRollback = rollbackDueDate(deals, 'deal-1', null);
  assert.ok(nullRollback);
  assert.equal(nullRollback[0].dueDate, null);
});
