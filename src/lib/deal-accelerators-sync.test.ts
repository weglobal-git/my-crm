import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPendingAcceleratorsKey,
  decrementPendingBadge,
  incrementPendingBadge,
  setPendingBadgeCount,
  mergePendingAccelerators,
  type PendingAcceleratorsMap,
} from './deal-accelerators-sync';
import { parseLogContent } from './pipeline-activity-cache';

test('isPendingAcceleratorsKey correctly identifies stable and tuple keys', () => {
  assert.equal(isPendingAcceleratorsKey('pending-accelerators'), true);
  assert.equal(isPendingAcceleratorsKey(['pending-accelerators']), true);
  assert.equal(isPendingAcceleratorsKey(['pending-accelerators', 'deal-1,deal-2']), true);

  assert.equal(isPendingAcceleratorsKey('pipeline-deals'), false);
  assert.equal(isPendingAcceleratorsKey(['pipeline-deals', 'ALL']), false);
  assert.equal(isPendingAcceleratorsKey(null), false);
  assert.equal(isPendingAcceleratorsKey(undefined), false);
  assert.equal(isPendingAcceleratorsKey(123), false);
});

test('decrementPendingBadge: decrements count and preserves earliestPendingAt', () => {
  const initial: PendingAcceleratorsMap = {
    'deal-1': { count: 3, earliestPendingAt: '2026-09-01T10:00:00Z' },
    'deal-2': { count: 1, earliestPendingAt: '2026-09-02T10:00:00Z' },
  };

  const updated = decrementPendingBadge(initial, 'deal-1');
  assert.equal(updated['deal-1']?.count, 2);
  assert.equal(updated['deal-1']?.earliestPendingAt, '2026-09-01T10:00:00Z');
  // Original is not mutated
  assert.equal(initial['deal-1']?.count, 3);
});

test('decrementPendingBadge: completely removes deal key when count drops to 0', () => {
  const initial: PendingAcceleratorsMap = {
    'deal-1': { count: 1, earliestPendingAt: '2026-09-01T10:00:00Z' },
    'deal-2': { count: 2, earliestPendingAt: '2026-09-02T10:00:00Z' },
  };

  const updated = decrementPendingBadge(initial, 'deal-1');
  assert.equal('deal-1' in updated, false);
  assert.equal(updated['deal-1'], undefined);
  assert.equal(updated['deal-2']?.count, 2);
});

test('incrementPendingBadge: increments existing or creates new entry', () => {
  const initial: PendingAcceleratorsMap = {
    'deal-1': { count: 1, earliestPendingAt: '2026-09-01T10:00:00Z' },
  };

  // Increment existing
  const updated1 = incrementPendingBadge(initial, 'deal-1');
  assert.equal(updated1['deal-1']?.count, 2);
  assert.equal(updated1['deal-1']?.earliestPendingAt, '2026-09-01T10:00:00Z');

  // Increment new deal
  const fixedTime = '2026-09-09T12:00:00Z';
  const updated2 = incrementPendingBadge(initial, 'deal-new', fixedTime);
  assert.equal(updated2['deal-new']?.count, 1);
  assert.equal(updated2['deal-new']?.earliestPendingAt, fixedTime);
});

test('setPendingBadgeCount: updates count and deletes on 0', () => {
  const initial: PendingAcceleratorsMap = {
    'deal-1': { count: 2, earliestPendingAt: '2026-09-01T10:00:00Z' },
  };

  const updated = setPendingBadgeCount(initial, 'deal-1', 5);
  assert.equal(updated['deal-1']?.count, 5);

  const cleared = setPendingBadgeCount(initial, 'deal-1', 0);
  assert.equal('deal-1' in cleared, false);
  assert.equal(cleared['deal-1'], undefined);
});

test('mergePendingAccelerators: merges new entries without overwriting existing', () => {
  const existing: PendingAcceleratorsMap = {
    'deal-1': { count: 2, earliestPendingAt: '2026-09-01T10:00:00Z' },
  };

  const incoming = {
    'deal-2': { count: 1, earliestPendingAt: '2026-09-05T00:00:00Z' },
    'deal-3': 0, // should not be added
  };

  const merged = mergePendingAccelerators(existing, incoming);
  assert.equal(merged['deal-1']?.count, 2);
  assert.equal(merged['deal-2']?.count, 1);
  assert.equal('deal-3' in merged, false);
});

test('parseLogContent: extracts images from uploading... tags and strips raw brackets', () => {
  const content = '[ATTACHMENT:uploading...|Screenshot 2026-09-07 at 3.02.48 PM.png|image/png]';
  const { cleanText, images, otherFiles } = parseLogContent(content);

  assert.equal(cleanText, '', 'Raw bracket tag must be completely stripped from cleanText');
  assert.equal(images.length, 1, 'Should recognize attachment as image');
  assert.equal(images[0].url, 'uploading...');
  assert.equal(images[0].filename, 'Screenshot 2026-09-07 at 3.02.48 PM.png');
  assert.equal(images[0].isImage, true);
  assert.equal(otherFiles.length, 0);
});

test('parseLogContent: extracts blob and Cloudinary images alongside clean text', () => {
  const content = 'Attached client quotation\n[ATTACHMENT:https://res.cloudinary.com/demo/image/upload/v1/quote.png|quote.png|image/png]';
  const { cleanText, images, otherFiles } = parseLogContent(content);

  assert.equal(cleanText, 'Attached client quotation');
  assert.equal(images.length, 1);
  assert.equal(images[0].url, 'https://res.cloudinary.com/demo/image/upload/v1/quote.png');
  assert.equal(otherFiles.length, 0);
});

test('parseLogContent: categorizes non-image files into otherFiles', () => {
  const content = 'Check proposal [ATTACHMENT:https://res.cloudinary.com/demo/raw/upload/doc.pdf|proposal.pdf|application/pdf]';
  const { cleanText, images, otherFiles } = parseLogContent(content);

  assert.equal(cleanText, 'Check proposal');
  assert.equal(images.length, 0);
  assert.equal(otherFiles.length, 1);
  assert.equal(otherFiles[0].filename, 'proposal.pdf');
});

