import assert from 'node:assert/strict';
import test from 'node:test';
import { activityFeedKey, dealSummaryKey, sharedMediaKey } from './pipeline-activity-cache';

test('standalone Summary and other right-menu views do not fetch Activity/System logs', () => {
  for (const view of ['summary', 'collaborate', 'information', 'notes', 'sharedMedia']) {
    assert.equal(activityFeedKey('deal', view, true, null), null);
  }
  assert.equal(activityFeedKey('deal', 'activity', false, null), null);
});

test('Activity/System keep separate cache keys and stop at the last page', () => {
  assert.deepEqual(activityFeedKey('deal', 'activity', true, null), ['activity-logs', 'deal', 'COMMENT', '']);
  assert.deepEqual(activityFeedKey('deal', 'system', true, { nextCursor: 'next' }), ['activity-logs', 'deal', 'SYSTEM_UPDATE', 'next']);
  assert.equal(activityFeedKey('deal', 'system', true, {}), null);
});

test('dealSummaryKey: only fetches on-demand when actively viewing summary tab', () => {
  assert.equal(dealSummaryKey('deal-1', 'activity', true), null);
  assert.equal(dealSummaryKey('deal-1', 'collaborate', true), null);
  assert.equal(dealSummaryKey('deal-1', 'notes', true), null);
  assert.equal(dealSummaryKey('deal-1', 'sharedMedia', true), null);
  assert.equal(dealSummaryKey('deal-1', 'summary', false), null);
  assert.equal(dealSummaryKey(undefined, 'summary', true), null);
  assert.deepEqual(dealSummaryKey('deal-1', 'summary', true), ['deal-summary-on-demand', 'deal-1']);
});

test('sharedMediaKey: only fetches on-demand when actively viewing sharedMedia tab', () => {
  assert.equal(sharedMediaKey('deal-1', 'activity', true), null);
  assert.equal(sharedMediaKey('deal-1', 'summary', true), null);
  assert.equal(sharedMediaKey('deal-1', 'notes', true), null);
  assert.equal(sharedMediaKey('deal-1', 'sharedMedia', false), null);
  assert.equal(sharedMediaKey(undefined, 'sharedMedia', true), null);
  assert.deepEqual(sharedMediaKey('deal-1', 'sharedMedia', true), ['opportunity-shared-media', 'deal-1']);
});

