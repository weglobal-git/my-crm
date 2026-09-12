import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectOpportunityDatesToCalendarItems,
  type OpportunityProjectionRow,
} from './calendar-queries';
import { calendarMonthKey } from './calendar-cache';
import type { CalendarActor } from './calendar-access';

describe('Calendar Month Projection & Access Matrix (Phase 1)', () => {
  const rangeStart = new Date('2026-08-30T00:00:00.000Z');
  const rangeEnd = new Date('2026-10-03T23:59:59.999Z');

  const baseOpportunity: OpportunityProjectionRow = {
    id: 'opp-1',
    topic: 'Frozen Shrimp Order 500T',
    goodsReadyDate: new Date('2026-09-10T00:00:00.000Z'),
    goodsLoadingDate: new Date('2026-09-12T00:00:00.000Z'),
    type: 'SALES_DEAL',
    status: 'OPEN',
    ownerId: 'user-export-owner',
    owner: {
      id: 'user-export-owner',
      name: 'Somchai',
      image: null,
      departments: [{ id: 'dept-export', name: 'Export' }],
    },
    teamMembers: [
      {
        id: 'user-export-member',
        departments: [{ name: 'Export' }],
      },
    ],
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
  };

  describe('Item projection & source types', () => {
    it('projects Goods Ready and Goods Loading as distinct items without Due Date', () => {
      const adminActor: CalendarActor = {
        id: 'admin-1',
        name: 'Admin',
        role: 'ADMIN',
        departments: [],
        hasInformationPerm: true,
      };

      const items = projectOpportunityDatesToCalendarItems(
        [baseOpportunity],
        adminActor,
        rangeStart,
        rangeEnd
      );

      assert.equal(items.length, 2);

      const readyItem = items.find(i => i.sourceType === 'DEAL_GOODS_READY');
      assert.ok(readyItem);
      assert.equal(readyItem.id, 'deal:opp-1:goodsReadyDate');
      assert.equal(readyItem.title, 'Frozen Shrimp Order 500T');
      assert.equal(readyItem.allDay, true);
      assert.equal(readyItem.color, '#10B981');
      assert.equal(readyItem.canEdit, true);

      const loadingItem = items.find(i => i.sourceType === 'DEAL_GOODS_LOADING');
      assert.ok(loadingItem);
      assert.equal(loadingItem.id, 'deal:opp-1:goodsLoadingDate');
      assert.equal(loadingItem.title, 'Frozen Shrimp Order 500T');
      assert.equal(loadingItem.allDay, true);
      assert.equal(loadingItem.color, '#0EA5E9');
      assert.equal(loadingItem.canEdit, true);

    });
  });

  describe('Permission & Visibility Matrix', () => {
    it('omits Goods Ready & Loading for user without pipeline.information permission', () => {
      const generalActorWithoutPerm: CalendarActor = {
        id: 'user-no-info',
        name: 'Regular Staff',
        role: 'GENERAL',
        departments: ['Export'],
        hasInformationPerm: false, // NO pipeline.information
      };

      const items = projectOpportunityDatesToCalendarItems(
        [baseOpportunity],
        generalActorWithoutPerm,
        rangeStart,
        rangeEnd
      );

      assert.equal(items.length, 0);
    });

    it('allows Management in same department to edit deal dates', () => {
      const exportManager: CalendarActor = {
        id: 'manager-export',
        name: 'Manager Export',
        role: 'MANAGEMENT',
        departments: ['Export'],
        hasInformationPerm: true,
      };

      const items = projectOpportunityDatesToCalendarItems(
        [baseOpportunity],
        exportManager,
        rangeStart,
        rangeEnd
      );

      assert.equal(items.length, 2);
      for (const item of items) {
        assert.equal(item.canEdit, true, `Item ${item.sourceType} should be editable by department manager`);
      }
    });

    it('denies Management in different department from editing deal dates', () => {
      const marketingManager: CalendarActor = {
        id: 'manager-marketing',
        name: 'Manager Marketing',
        role: 'MANAGEMENT',
        departments: ['Marketing'],
        hasInformationPerm: true,
      };

      const items = projectOpportunityDatesToCalendarItems(
        [baseOpportunity],
        marketingManager,
        rangeStart,
        rangeEnd
      );

      assert.equal(items.length, 2);
      for (const item of items) {
        assert.equal(item.canEdit, false, `Item ${item.sourceType} should NOT be editable by unrelated department manager`);
      }
    });

    it('allows deal Owner to edit deal dates', () => {
      const ownerActor: CalendarActor = {
        id: 'user-export-owner',
        name: 'Somchai (Owner)',
        role: 'GENERAL',
        departments: ['Export'],
        hasInformationPerm: true,
      };

      const items = projectOpportunityDatesToCalendarItems(
        [baseOpportunity],
        ownerActor,
        rangeStart,
        rangeEnd
      );

      assert.equal(items.length, 2);
      for (const item of items) {
        assert.equal(item.canEdit, true, `Owner should be allowed to edit ${item.sourceType}`);
      }
    });

    it('sets canEdit = false for General Team Member who is not owner', () => {
      const memberActor: CalendarActor = {
        id: 'user-export-member',
        name: 'Team Member (Not Owner)',
        role: 'GENERAL',
        departments: ['Export'],
        hasInformationPerm: true,
      };

      const items = projectOpportunityDatesToCalendarItems(
        [baseOpportunity],
        memberActor,
        rangeStart,
        rangeEnd
      );

      assert.equal(items.length, 2);
      for (const item of items) {
        assert.equal(item.canEdit, false, `Non-owner team member should be read-only for ${item.sourceType}`);
      }
    });

    it('keeps archived deal milestones visible but prevents editing and dragging', () => {
      const adminActor: CalendarActor = { id: 'admin', name: 'Admin', role: 'ADMIN', departments: [], hasInformationPerm: true };
      const items = projectOpportunityDatesToCalendarItems([{ ...baseOpportunity, status: 'COMPLETED' }], adminActor, rangeStart, rangeEnd);
      assert.equal(items.length, 2);
      assert.ok(items.every((item) => item.canEdit === false));
    });
  });

  describe('User-Scoped Cache Key Factory', () => {
    it('includes userId in month cache key to prevent cross-account leakage', () => {
      const userAKey = calendarMonthKey('user-A', 2026, 9);
      const userBKey = calendarMonthKey('user-B', 2026, 9);

      assert.notDeepEqual(userAKey, userBKey);
      assert.equal(userAKey[0], 'calendar-month');
      assert.equal(userAKey[1], 'user-A');
      assert.equal(userAKey[2], 2026);
      assert.equal(userAKey[3], 9);
    });
  });
});
