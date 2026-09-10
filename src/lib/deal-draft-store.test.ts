import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDealDraft,
  setDealDraft,
  clearDealDraft,
  clearAllDraftsForDeal,
  resetAllDrafts,
  type ActivityDraft,
} from './deal-draft-store';

test.beforeEach(() => {
  resetAllDrafts();
});

test('Draft Store: Saves and retrieves draft by dealId and tabId', () => {
  const dealId = 'deal-101';
  const draft: ActivityDraft = {
    text: 'Followed up with client regarding quotation discounts',
    pendingDueDate: new Date('2026-09-20'),
    pendingAttachments: [],
    isManagerCallMode: false,
    replies: { 'log-1': 'Sure, will check' },
  };

  setDealDraft(dealId, 'activity', draft);
  const retrieved = getDealDraft<ActivityDraft>(dealId, 'activity');

  assert.ok(retrieved);
  assert.equal(retrieved.text, 'Followed up with client regarding quotation discounts');
  assert.deepEqual(retrieved.replies, { 'log-1': 'Sure, will check' });
});

test('Draft Store: Switching tabs unmounts but retains draft across navigation', () => {
  const dealId = 'deal-102';

  // 1. User types in Activity tab
  setDealDraft(dealId, 'activity', {
    text: 'Draft comment before switching tabs',
  });

  // 2. User switches to Collaborate tab (Activity tab unmounts)
  // Collaborate might store its own draft or no draft
  setDealDraft(dealId, 'collaborate', { note: 'Collaborate tab state' });

  // 3. User switches back to Activity tab (re-hydrating from store)
  const activityDraft = getDealDraft<ActivityDraft>(dealId, 'activity');
  assert.ok(activityDraft);
  assert.equal(activityDraft.text, 'Draft comment before switching tabs');
});

test('Draft Store: Clearing draft on successful submission clears only that tab', () => {
  const dealId = 'deal-103';

  setDealDraft(dealId, 'activity', { text: 'Submitted comment' });
  setDealDraft(dealId, 'notes', { text: 'Unsubmitted notes draft' });

  // Clear activity draft upon successful post
  clearDealDraft(dealId, 'activity');

  assert.equal(getDealDraft(dealId, 'activity'), undefined);
  // Notes draft remains intact
  assert.ok(getDealDraft(dealId, 'notes'));
});

test('Draft Store: Closing deal panel clears all drafts for that deal to prevent memory leaks', () => {
  const dealA = 'deal-A';
  const dealB = 'deal-B';

  setDealDraft(dealA, 'activity', { text: 'Draft for Deal A' });
  setDealDraft(dealB, 'activity', { text: 'Draft for Deal B' });

  // User closes Deal A panel
  clearAllDraftsForDeal(dealA);

  assert.equal(getDealDraft(dealA, 'activity'), undefined);
  // Deal B draft is preserved
  assert.equal(getDealDraft<ActivityDraft>(dealB, 'activity')?.text, 'Draft for Deal B');
});

test('Draft Store: Multiple deals are completely isolated', () => {
  setDealDraft('deal-alpha', 'activity', { text: 'Alpha text' });
  setDealDraft('deal-beta', 'activity', { text: 'Beta text' });

  assert.equal(getDealDraft<ActivityDraft>('deal-alpha', 'activity')?.text, 'Alpha text');
  assert.equal(getDealDraft<ActivityDraft>('deal-beta', 'activity')?.text, 'Beta text');
});
