import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireChannel,
  acquireChannelWhenConnected,
  releaseChannel,
  getActiveChannel,
  getChannelRefCount,
  releaseAllChannels,
  setTestPusherClient,
} from './pusher-subscription-manager';
import type { Channel } from 'pusher-js';

test.describe('Pusher Subscription Manager (Ref Counting & Lifecycle)', () => {
  const subscribedChannels: string[] = [];
  const unsubscribedChannels: string[] = [];

  const mockChannel = (name: string) => ({
    name,
    bind: () => {},
    unbind: () => {},
  } as unknown as Channel);

  test.beforeEach(() => {
    subscribedChannels.length = 0;
    unsubscribedChannels.length = 0;
    releaseAllChannels();

    setTestPusherClient({
      subscribe: (channelName: string) => {
        subscribedChannels.push(channelName);
        return mockChannel(channelName);
      },
      unsubscribe: (channelName: string) => {
        unsubscribedChannels.push(channelName);
      },
    });
  });

  test.afterEach(() => {
    releaseAllChannels();
    setTestPusherClient(null);
  });

  test('Subscribing first time initializes refCount to 1 and calls client.subscribe', () => {
    const ch = acquireChannel('private-pipeline-user-1');
    assert.ok(ch);
    assert.equal(getChannelRefCount('private-pipeline-user-1'), 1);
    assert.deepEqual(subscribedChannels, ['private-pipeline-user-1']);
    assert.equal(getActiveChannel('private-pipeline-user-1'), ch);
  });

  test('Deferred acquisition does not create a subscription before a connection exists', () => {
    setTestPusherClient(null);
    let setupCalls = 0;

    const cleanup = acquireChannelWhenConnected('private-pipeline-hidden-user', () => {
      setupCalls += 1;
    });

    assert.equal(setupCalls, 0);
    assert.equal(getChannelRefCount('private-pipeline-hidden-user'), 0);
    cleanup();
  });

  test('Acquiring same channel increments refCount and returns same channel without duplicate subscribe', () => {
    const ch1 = acquireChannel('private-pipeline-user-1');
    const ch2 = acquireChannel('private-pipeline-user-1');
    const ch3 = acquireChannel('private-pipeline-user-1');

    assert.equal(ch1, ch2);
    assert.equal(ch2, ch3);
    assert.equal(getChannelRefCount('private-pipeline-user-1'), 3);
    // Only subscribed once on Pusher
    assert.deepEqual(subscribedChannels, ['private-pipeline-user-1']);
  });

  test('Releasing channel decrements refCount without unsubscribing while refCount > 0', () => {
    acquireChannel('private-pipeline-user-1'); // ref: 1
    acquireChannel('private-pipeline-user-1'); // ref: 2

    releaseChannel('private-pipeline-user-1'); // ref: 1
    assert.equal(getChannelRefCount('private-pipeline-user-1'), 1);
    assert.equal(unsubscribedChannels.length, 0); // No unsubscribe yet
    assert.ok(getActiveChannel('private-pipeline-user-1'));
  });

  test('Releasing channel to refCount 0 triggers client.unsubscribe and evicts from registry', () => {
    acquireChannel('private-pipeline-user-1'); // ref: 1
    acquireChannel('private-pipeline-user-1'); // ref: 2

    releaseChannel('private-pipeline-user-1'); // ref: 1
    releaseChannel('private-pipeline-user-1'); // ref: 0 -> unsubscribe

    assert.equal(getChannelRefCount('private-pipeline-user-1'), 0);
    assert.deepEqual(unsubscribedChannels, ['private-pipeline-user-1']);
    assert.equal(getActiveChannel('private-pipeline-user-1'), null);
  });

  test('Simulated KanbanBoard + EditDealPanel + NotesTab lifecycle', () => {
    const channelName = 'private-pipeline-user-99';

    // 1. KanbanBoard mounts
    const kanbanChannel = acquireChannel(channelName);
    assert.equal(getChannelRefCount(channelName), 1);
    assert.deepEqual(subscribedChannels, [channelName]);

    // 2. User opens deal drawer (EditDealPanel mounts)
    const panelChannel = acquireChannel(channelName);
    assert.equal(kanbanChannel, panelChannel);
    assert.equal(getChannelRefCount(channelName), 2);

    // 3. User switches to Notes tab (NotesTab mounts)
    const notesChannel = acquireChannel(channelName);
    assert.equal(kanbanChannel, notesChannel);
    assert.equal(getChannelRefCount(channelName), 3);

    // 4. User switches to Activity tab (NotesTab unmounts)
    releaseChannel(channelName);
    assert.equal(getChannelRefCount(channelName), 2);
    assert.equal(unsubscribedChannels.length, 0); // Still active for Kanban and Panel

    // 5. User closes drawer (EditDealPanel unmounts)
    releaseChannel(channelName);
    assert.equal(getChannelRefCount(channelName), 1);
    assert.equal(unsubscribedChannels.length, 0); // Still active for Kanban!

    // 6. User navigates away from /pipeline (KanbanBoard unmounts)
    releaseChannel(channelName);
    assert.equal(getChannelRefCount(channelName), 0);
    assert.deepEqual(unsubscribedChannels, [channelName]); // Cleanly unsubscribed from Pusher!
  });

  test('releaseAllChannels unsubscribes all active channels on logout/teardown', () => {
    acquireChannel('ch-1');
    acquireChannel('ch-2');
    acquireChannel('ch-3');

    assert.equal(getChannelRefCount('ch-1'), 1);
    assert.equal(getChannelRefCount('ch-2'), 1);
    assert.equal(getChannelRefCount('ch-3'), 1);

    releaseAllChannels();

    assert.equal(getChannelRefCount('ch-1'), 0);
    assert.equal(getChannelRefCount('ch-2'), 0);
    assert.equal(getChannelRefCount('ch-3'), 0);
    assert.equal(unsubscribedChannels.length, 3);
    assert.ok(unsubscribedChannels.includes('ch-1'));
    assert.ok(unsubscribedChannels.includes('ch-2'));
    assert.ok(unsubscribedChannels.includes('ch-3'));
  });

  test('releaseAllChannels with an empty registry does not require or create a client', () => {
    releaseAllChannels();
    setTestPusherClient(null);

    assert.doesNotThrow(() => releaseAllChannels());
    assert.equal(getActiveChannel('missing'), null);
  });
});
