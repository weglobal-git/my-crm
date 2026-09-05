import assert from 'node:assert/strict';
import test from 'node:test';
import { activityFeedKey } from './pipeline-activity-cache';

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
