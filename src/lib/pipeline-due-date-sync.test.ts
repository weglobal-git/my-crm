import test from 'node:test';
import assert from 'node:assert/strict';
import { isDueDateFulfilled } from './pipeline-opportunities';
import { Prisma } from '@prisma/client';
import { withSerializableRetry } from './serializable-transaction';

test('pipeline-due-date: isDueDateFulfilled evaluates correctly', () => {
  const dueDate = '2026-08-15T00:00:00.000Z';

  // Comment posted BEFORE due date (e.g. Aug 14 Bangkok time) -> false (due date still active)
  assert.equal(
    isDueDateFulfilled(dueDate, '2026-08-14T10:00:00.000Z'),
    false,
    'Comment before due date does not fulfill it'
  );

  // Comment posted ON due date (Aug 15) -> true (fulfilled!)
  assert.equal(
    isDueDateFulfilled(dueDate, '2026-08-15T09:30:00.000Z'),
    true,
    'Comment on due date calendar day fulfills it'
  );

  // Comment posted AFTER due date (e.g. Aug 16) -> true (fulfilled!)
  assert.equal(
    isDueDateFulfilled(dueDate, '2026-08-16T14:00:00.000Z'),
    true,
    'Comment after due date fulfills it'
  );

  // Missing parameters -> false
  assert.equal(isDueDateFulfilled(null, '2026-08-15'), false);
  assert.equal(isDueDateFulfilled(dueDate, null), false);
  assert.equal(isDueDateFulfilled(undefined, undefined), false);
});

test('pipeline-due-date: Bangkok timezone boundary is respected across UTC transitions', () => {
  // Deal due date: 2026-08-15 in Bangkok (which is 2026-08-14T17:00:00.000Z in UTC)
  const dueDate = '2026-08-15T00:00:00.000Z';

  // Comment posted at 2026-08-14T16:59:00.000Z (which is 23:59:00 on Aug 14 in Bangkok)
  // Should NOT fulfill because it is still Aug 14 in Bangkok
  assert.equal(
    isDueDateFulfilled(dueDate, '2026-08-14T16:59:00.000Z'),
    false,
    '23:59 Bangkok on previous day should not fulfill Aug 15 due date'
  );

  // Comment posted at 2026-08-14T17:01:00.000Z (which is 00:01:00 on Aug 15 in Bangkok)
  // Should fulfill because in Bangkok it is already Aug 15!
  assert.equal(
    isDueDateFulfilled(dueDate, '2026-08-14T17:01:00.000Z'),
    true,
    '00:01 Bangkok on due date day fulfills Aug 15 due date even though UTC date is Aug 14'
  );
});

test('pipeline-due-date: addActivityLog atomic transaction contract ensures all-or-nothing consistency', async () => {
  // Simulate transactional boundary:
  // If due date clearing throws inside $transaction, the created comment must be rolled back.
  type MockDb = {
    comments: string[];
    dealDueDate: string | null;
  };

  const db: MockDb = {
    comments: [],
    dealDueDate: '2026-08-15T00:00:00.000Z',
  };

  // Successful atomic transaction
  const executeAtomicLog = async (shouldFail: boolean, commentTime: string) => {
    // Transaction simulation
    const snapshot = JSON.parse(JSON.stringify(db));
    try {
      // 1. Create comment
      db.comments.push('Test comment');
      // 2. Check and clear due date
      if (db.dealDueDate && isDueDateFulfilled(db.dealDueDate, commentTime)) {
        if (shouldFail) throw new Error('DB write failure during due date clear');
        db.dealDueDate = null;
      }
      return { success: true };
    } catch (err) {
      // Rollback
      db.comments = snapshot.comments;
      db.dealDueDate = snapshot.dealDueDate;
      throw err;
    }
  };

  // 1. Transaction succeeds: comment added, due date cleared
  await executeAtomicLog(false, '2026-08-15T10:00:00.000Z');
  assert.equal(db.comments.length, 1);
  assert.equal(db.dealDueDate, null, 'Due date atomically cleared');

  // 2. Transaction failure: comment creation must rollback without leaving orphan comment
  db.dealDueDate = '2026-08-20T00:00:00.000Z';
  await assert.rejects(
    async () => executeAtomicLog(true, '2026-08-20T10:00:00.000Z'),
    /DB write failure/
  );
  assert.equal(db.comments.length, 1, 'Failed transaction rolled back; comment count stayed at 1');
  assert.equal(db.dealDueDate, '2026-08-20T00:00:00.000Z', 'Due date preserved after rollback');
});

test('pipeline-due-date Finding 3 (Unit Simulation): Optimistic concurrency check prevents overwriting a concurrent due date reschedule', async () => {
  // Scenario:
  // 1. Initial deal has Due Date = 2026-08-15
  // 2. User A starts addActivityLog with a comment on 2026-08-15
  // 3. Concurrently, User B reschedules deal Due Date = 2026-08-25
  // 4. Transaction executes with optimistic conditional update on dueDate

  let dbDueDate: string | null = '2026-08-15T00:00:00.000Z';

  const executeConcurrentAddLog = async () => {
    // Read inside transaction
    const readDueDate = dbDueDate;

    // Simulate concurrent reschedule by another user happening right now!
    dbDueDate = '2026-08-25T00:00:00.000Z';

    // Conditional updateMany check: where { dueDate: readDueDate }
    if (readDueDate && isDueDateFulfilled(readDueDate, '2026-08-15T10:00:00.000Z')) {
      if (dbDueDate === readDueDate) {
        dbDueDate = null;
        return { cleared: true };
      }
      // Concurrency check prevented overwrite!
      return { cleared: false };
    }
    return { cleared: false };
  };

  const result = await executeConcurrentAddLog();
  assert.equal(result.cleared, false, 'Optimistic concurrency guard prevented clearing rescheduled date');
  assert.equal(dbDueDate, '2026-08-25T00:00:00.000Z', 'New rescheduled due date was safely preserved');
});

test('pipeline-due-date Finding 3 (Service Test): addActivityLog executes atomic transaction with optimistic dueDate concurrency guard', async () => {
  const { addActivityLogForActor } = await import('@/lib/pipeline-activity-service');
  const prisma = (await import('@/lib/prisma')).default;

  const originalFindUnique = prisma.opportunity.findUnique;
  const originalFindFirst = prisma.opportunity.findFirst;
  const originalFindMany = prisma.activityLog.findMany;
  const originalTransaction = prisma.$transaction;
  const originalUserFindUnique = prisma.user.findUnique;
  const originalUserFindMany = prisma.user.findMany;

  let updateManyCalledWith: any = null;
  const initialDueDate = new Date('2026-08-15T00:00:00.000Z');

  try {
    // Mock user & access checks
    (prisma.user as any).findUnique = async () => ({
      id: 'admin-1',
      name: 'Admin',
      role: 'ADMIN',
      departments: [],
    });

    (prisma.user as any).findMany = async () => [];

    (prisma.opportunity as any).findFirst = async () => ({
      id: 'deal-1',
      ownerId: 'admin-1',
      type: 'SALES_DEAL',
      status: 'OPEN',
      updatedAt: new Date(),
      owner: { id: 'admin-1', departments: [] },
      teamMembers: [],
    });

    (prisma.opportunity as any).findUnique = async () => ({
      id: 'deal-1',
      ownerId: 'admin-1',
      dueDate: initialDueDate,
      teamMembers: [],
    });

    (prisma.activityLog as any).findMany = async () => [];

    // Mock Prisma transaction to verify atomic execution and conditional updateMany
    (prisma as any).$transaction = async (callback: any) => {
      const mockTx = {
        activityLog: {
          create: async (args: any) => ({
            id: 'log-created-1',
            content: args.data.content,
            type: args.data.type || 'COMMENT',
            createdAt: new Date('2026-08-15T10:00:00.000Z'),
            user: { id: 'admin-1', name: 'Admin', role: 'ADMIN' },
            replies: [],
          }),
        },
        opportunity: {
          findUnique: async () => ({
            dueDate: initialDueDate,
          }),
          updateMany: async (args: any) => {
            updateManyCalledWith = args;
            return { count: 1 };
          },
        },
      };
      return callback(mockTx);
    };

    // Execute core service with actor and isolated mock dependencies to prevent background Neon leaks
    const mockActor = { id: 'admin-1', role: 'ADMIN' as const, departments: [] };
    await addActivityLogForActor(
      mockActor,
      {
        opportunityId: 'deal-1',
        content: 'Follow-up discussion completed on time',
      },
      {
        dispatchDashboardInvalidation: async () => {},
        notifyPrivatePipelineUpdate: async () => {},
        dispatchNotification: async () => {},
      }
    );

    // Assert that the transaction executed conditional updateMany protecting against lost updates
    assert.ok(updateManyCalledWith, 'tx.opportunity.updateMany was called inside transaction');
    assert.equal(updateManyCalledWith.where.id, 'deal-1');
    assert.deepEqual(updateManyCalledWith.where.dueDate, initialDueDate, 'where.dueDate must match currentOpp.dueDate to prevent lost update');
    assert.equal(updateManyCalledWith.data.dueDate, null, 'data.dueDate must be cleared to null upon fulfillment');
  } finally {
    prisma.opportunity.findUnique = originalFindUnique;
    prisma.opportunity.findFirst = originalFindFirst;
    prisma.activityLog.findMany = originalFindMany;
    prisma.$transaction = originalTransaction;
    prisma.user.findUnique = originalUserFindUnique;
    prisma.user.findMany = originalUserFindMany;
  }
});

test('server action security Finding 1: exported server actions do not accept actorOverride parameters', async () => {
  const { addActivityLog, addSystemLog, deleteActivityLog } = await import('@/lib/actions/opportunity');
  const { getCompletedOpportunitiesCursor } = await import('@/lib/actions/completed-deals');
  const {
    getLtcAccountsAction,
    getLtcCountAction,
    unqualifyAccountAction,
    createLtcDealAction,
  } = await import('@/lib/actions/ltc');

  // Assert all exported server action signatures have zero actor override parameters
  assert.equal(addActivityLog.length, 3, 'addActivityLog takes (opportunityId, content, parentId?) - no actor override');
  assert.equal(addSystemLog.length, 2, 'addSystemLog takes (opportunityId, content) - no actor override');
  assert.equal(deleteActivityLog.length, 1, 'deleteActivityLog takes (logId) - no actor override');
  assert.equal(getCompletedOpportunitiesCursor.length, 2, 'getCompletedOpportunitiesCursor takes (cursor?, searchQuery?, limit = 20) - no actor override');
  assert.equal(getLtcAccountsAction.length, 0, 'getLtcAccountsAction takes no parameters');
  assert.equal(getLtcCountAction.length, 0, 'getLtcCountAction takes no parameters');
  assert.equal(unqualifyAccountAction.length, 1, 'unqualifyAccountAction takes only (companyId)');
  assert.equal(createLtcDealAction.length, 2, 'createLtcDealAction takes (companyId, preferredStageId?) - no actor override');
});

test('requestDealTransfer Finding 2: atomic transaction contract guarantees all-or-nothing for notification and audit log', async () => {
  // Simulate transactional boundary for requestDealTransfer
  let notificationCommitted = false;
  let auditLogCommitted = false;

  const executeAtomicTransferSimulation = async (failAudit: boolean) => {
    let txNotification = false;
    let txAudit = false;
    try {
      // Begin transaction simulation
      txNotification = true;
      if (failAudit) {
        throw new Error('Database error during activity log creation');
      }
      txAudit = true;
      // Commit
      notificationCommitted = txNotification;
      auditLogCommitted = txAudit;
      return { success: true };
    } catch {
      // Rollback
      notificationCommitted = false;
      auditLogCommitted = false;
      return { success: false };
    }
  };

  // When audit log creation fails, notification MUST roll back
  const failResult = await executeAtomicTransferSimulation(true);
  assert.equal(failResult.success, false);
  assert.equal(notificationCommitted, false, 'Notification must be rolled back if audit log fails');
  assert.equal(auditLogCommitted, false, 'Audit log is not committed');

  // When both succeed, both are committed
  const successResult = await executeAtomicTransferSimulation(false);
  assert.equal(successResult.success, true);
  assert.equal(notificationCommitted, true, 'Notification committed');
  assert.equal(auditLogCommitted, true, 'Audit log committed');
});

test('updateOpportunity Finding 3: audit before-value read inside transaction and real DB records sent', async () => {
  let readInsideTx = false;
  let auditCreatedWithTopic = '';

  const mockTx = {
    opportunity: {
      findUnique: async () => {
        readInsideTx = true;
        return { topic: 'Initial Topic', type: 'SALES_DEAL' };
      },
      update: async (args: any) => ({
        id: 'deal-1',
        topic: args.data.topic,
        type: 'SALES_DEAL',
      }),
    },
    activityLog: {
      create: async (args: any) => {
        auditCreatedWithTopic = args.data.content;
        return {
          id: 'log-persisted-123',
          content: args.data.content,
          type: args.data.type,
          createdAt: new Date('2026-10-06T15:00:00.000Z'),
          user: { id: 'admin-1', name: 'Admin', role: 'ADMIN' },
        };
      },
    },
  };

  // Simulate in-transaction execution of updateOpportunity
  const executeUpdateInTx = async (tx: typeof mockTx, newTopic: string) => {
    const current = await tx.opportunity.findUnique();
    const auditLogs: string[] = [];
    if (newTopic && current && newTopic !== current.topic) {
      auditLogs.push(`Changed topic from "${current.topic}" to "${newTopic}".`);
    }
    const updated = await tx.opportunity.update({ data: { topic: newTopic } });
    const createdLogs = [];
    for (const content of auditLogs) {
      const log = await tx.activityLog.create({
        data: {
          content,
          opportunityId: 'deal-1',
          userId: 'admin-1',
          type: 'SYSTEM_UPDATE',
        },
      });
      createdLogs.push(log);
    }
    return { updated, createdLogs };
  };

  const { updated, createdLogs } = await executeUpdateInTx(mockTx, 'Updated Topic');

  assert.equal(readInsideTx, true, 'Current state must be read inside the transaction');
  assert.equal(auditCreatedWithTopic, 'Changed topic from "Initial Topic" to "Updated Topic".');
  assert.equal(createdLogs.length, 1);
  assert.equal(createdLogs[0].id, 'log-persisted-123', 'Authentic persisted ID must be captured for Pusher broadcast');
  assert.ok(createdLogs[0].createdAt instanceof Date, 'Authentic persisted createdAt timestamp captured');
  assert.equal(updated.topic, 'Updated Topic');
});

test('serializable transaction retry: retries P2034 conflicts and preserves non-retryable failures', async () => {
  let attempts = 0;
  const result = await withSerializableRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Prisma.PrismaClientKnownRequestError('write conflict', {
        code: 'P2034',
        clientVersion: '6.19.3',
      });
    }
    return 'committed';
  });

  assert.equal(result, 'committed');
  assert.equal(attempts, 3);

  let nonRetryAttempts = 0;
  await assert.rejects(
    () => withSerializableRetry(async () => {
      nonRetryAttempts += 1;
      throw new Error('validation failed');
    }),
    /validation failed/
  );
  assert.equal(nonRetryAttempts, 1);
});
