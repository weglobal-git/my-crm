import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOptimisticTopicPatch,
  rollbackTopicPatch,
  shouldAcceptRevision,
  normalizeRevision,
  type TopicContainer,
} from './deal-topic-sync';

test('applyOptimisticTopicPatch: updates matching deal immutably', () => {
  const initial: TopicContainer[] = [
    { id: 'deal-1', topic: 'Old Deal 1' },
    { id: 'deal-2', topic: 'Deal 2' },
  ];

  const updated = applyOptimisticTopicPatch(initial, 'deal-1', 'Updated Deal 1');
  assert.ok(updated);
  assert.equal(updated.length, 2);
  assert.equal(updated[0].topic, 'Updated Deal 1');
  assert.equal(updated[1].topic, 'Deal 2');

  // Verify immutability
  assert.equal(initial[0].topic, 'Old Deal 1');
});

test('applyOptimisticTopicPatch: handles undefined gracefully', () => {
  const result = applyOptimisticTopicPatch(undefined, 'deal-1', 'Updated Deal 1');
  assert.equal(result, undefined);
});

test('rollbackTopicPatch: reverts deal topic to previous value', () => {
  const modified: TopicContainer[] = [
    { id: 'deal-1', topic: 'Optimistic Failed Topic' },
    { id: 'deal-2', topic: 'Deal 2' },
  ];

  const rolledBack = rollbackTopicPatch(modified, 'deal-1', 'Original Topic');
  assert.ok(rolledBack);
  assert.equal(rolledBack[0].topic, 'Original Topic');
  assert.equal(rolledBack[1].topic, 'Deal 2');
});

test('normalizeRevision: parses various formats correctly', () => {
  const now = 1725900000000;
  assert.equal(normalizeRevision(now), now);

  const iso = '2026-09-09T16:00:00.000Z';
  assert.equal(normalizeRevision(iso), new Date(iso).getTime());

  const dateObj = new Date(iso);
  assert.equal(normalizeRevision(dateObj), dateObj.getTime());

  assert.equal(normalizeRevision(undefined), 0);
  assert.equal(normalizeRevision(null), 0);
  assert.equal(normalizeRevision(NaN), 0);
  assert.equal(normalizeRevision('invalid-date'), 0);
});

test('shouldAcceptRevision: accepts newer or equal revision, rejects stale out-of-order', () => {
  const rev1 = 1000;
  const rev2 = 2000;
  const rev3 = 1500;

  // Initial state (lastKnown = 0)
  assert.equal(shouldAcceptRevision(0, rev1), true);

  // Progressive update (rev2 > rev1)
  assert.equal(shouldAcceptRevision(rev1, rev2), true);

  // Equal revision
  assert.equal(shouldAcceptRevision(rev2, rev2), true);

  // Stale out-of-order update (rev3 < rev2) -> MUST REJECT
  assert.equal(shouldAcceptRevision(rev2, rev3), false);

  // Handle null / undefined
  assert.equal(shouldAcceptRevision(undefined, rev1), true);
  assert.equal(shouldAcceptRevision(rev1, undefined), false);
  assert.equal(shouldAcceptRevision(0, 0), true);
});
