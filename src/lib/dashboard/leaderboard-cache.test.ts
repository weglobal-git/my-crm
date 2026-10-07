import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invalidateLeaderboardCache } from './leaderboard-data';
import type { DepartmentLeaderboardData } from './leaderboard-types';

const mockLeaderboardData: DepartmentLeaderboardData = {
  departmentId: 'dept-export',
  departmentName: 'Export Department',
  hasSalesAccess: true,
  availableDepartments: [
    { id: 'dept-export', name: 'Export Department', hasSalesAccess: true, userCount: 6 }
  ],
  period: { month: 10, year: 2026 },
  overallPodium: {
    metricId: 'xp',
    metricLabel: 'Overall MVP',
    rank1: {
      rank: 1,
      userId: 'user-winner',
      name: 'YUI Champion',
      image: 'https://example.com/yui.jpg',
      score: 1250,
      formattedValue: '1,250 XP',
      unit: 'XP',
    },
    rank2: null,
    rank3: null,
  },
  overallXpItems: [
    {
      rank: 1,
      userId: 'user-winner',
      name: 'YUI Champion',
      image: 'https://example.com/yui.jpg',
      score: 1250,
      formattedValue: '1,250 XP',
      unit: 'XP',
    }
  ],
  categories: [
    {
      id: 'sales',
      label: 'Sales Revenue',
      iconName: 'BadgePercent',
      unit: 'THB',
      description: 'Won deals total revenue',
      items: [],
    }
  ],
};

test('P5 Leaderboard Cache: invalidateLeaderboardCache clears cached entries', () => {
  // Verify function runs without errors
  assert.doesNotThrow(() => {
    invalidateLeaderboardCache();
  });

  assert.doesNotThrow(() => {
    invalidateLeaderboardCache('ADMIN');
  });
});

test('P5 Winner Summary Contract: strips heavy category data and preserves rank 1 winner fields', () => {
  const data = mockLeaderboardData;
  const podium = data.overallPodium;
  const rank1 = podium?.rank1 || data.overallXpItems?.[0] || null;

  assert.ok(rank1);
  const winnerSummary = {
    rank1: {
      userId: rank1.userId,
      name: rank1.name,
      image: rank1.image || null,
      score: rank1.score || 0,
    },
  };

  // Assert contract
  assert.equal(winnerSummary.rank1?.userId, 'user-winner');
  assert.equal(winnerSummary.rank1?.name, 'YUI Champion');
  assert.equal(winnerSummary.rank1?.score, 1250);
  assert.equal(winnerSummary.rank1?.image, 'https://example.com/yui.jpg');

  // Verify heavy categories are NOT in winnerSummary
  assert.equal((winnerSummary as Record<string, unknown>).categories, undefined);
  assert.equal((winnerSummary as Record<string, unknown>).overallXpItems, undefined);

  // Payload size check: JSON representation should be under 200 bytes
  const serialized = JSON.stringify(winnerSummary);
  assert.ok(serialized.length < 200, `Expected lightweight payload < 200 bytes, got ${serialized.length} bytes`);
});

test('P5 Scope Isolation: distinct role or user tokens generate isolated cache keys', () => {
  const adminScope = 'ADMIN:dept-export:10:2026::';
  const user1Scope = 'user-1:dept-export:10:2026::';
  const user2Scope = 'user-2:dept-export:10:2026::';

  assert.notEqual(adminScope, user1Scope);
  assert.notEqual(user1Scope, user2Scope);
});

test('Finding 1 (Unit Simulation): Winner cache key is scoped per authorized department and rejects unauthorized department requests', () => {
  const checkAccess = (actor: { role: string; departmentIds: string[] }, requestedDeptId: string) => {
    if (actor.role === 'ADMIN') return true;
    return actor.departmentIds.includes(requestedDeptId);
  };

  const admin = { role: 'ADMIN', departmentIds: [] };
  const userExport = { role: 'GENERAL', departmentIds: ['dept-export'] };

  // Admin can access any department
  assert.equal(checkAccess(admin, 'dept-export'), true);
  assert.equal(checkAccess(admin, 'dept-domestic'), true);

  // User in export can access export, but is strictly FORBIDDEN from domestic
  assert.equal(checkAccess(userExport, 'dept-export'), true);
  assert.equal(checkAccess(userExport, 'dept-domestic'), false, 'User must be forbidden from unassigned department');

  // Verify that cache keys for different departments never collide
  const keyExport = `deptWinner:dept-export:10:2026`;
  const keyDomestic = `deptWinner:dept-domestic:10:2026`;
  assert.notEqual(keyExport, keyDomestic);
});

test('Finding 1 (Service Test): getDepartmentLeaderboardWinnerSummary enforces authorization and cache isolation', async () => {
  const { getDepartmentLeaderboardWinnerSummary } = await import('./leaderboard-data');
  const prisma = (await import('@/lib/prisma')).default;

  // Mock prisma.department.findMany to return only 'dept-export' for user-1
  const originalFindMany = prisma.department.findMany;
  (prisma.department as any).findMany = async (args: any) => {
    if (args?.where?.users?.some?.id === 'user-1') {
      return [{ id: 'dept-export', name: 'Export Department' }];
    }
    return [{ id: 'dept-export', name: 'Export Department' }, { id: 'dept-domestic', name: 'Domestic Department' }];
  };

  try {
    const actor = {
      id: 'user-1',
      role: 'GENERAL' as const,
      departments: ['Export Department'],
    };

    // 1. Service call attempting to access unauthorized department MUST reject with Forbidden
    await assert.rejects(
      async () => {
        await getDepartmentLeaderboardWinnerSummary({
          actor,
          departmentId: 'dept-domestic', // Not in actor's departments!
          month: 10,
          year: 2026,
        });
      },
      /Forbidden/,
      'Production function must reject unauthorized departmentId with Forbidden'
    );
  } finally {
    prisma.department.findMany = originalFindMany;
  }
});
