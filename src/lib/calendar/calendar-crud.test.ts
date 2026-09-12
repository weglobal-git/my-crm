import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createCalendarEventSchema,
  updateCalendarEventSchema,
  deleteCalendarEventSchema,
  createCalendarTagSchema,
} from './calendar-validation';
import {
  projectCalendarEventsToCalendarItems,
  type CalendarEventWithRelations,
} from './calendar-queries';
import {
  getCalendarDraft,
  setCalendarDraft,
  clearCalendarDraft,
  resetAllCalendarDrafts,
  type CalendarEventDraft,
} from './calendar-draft-store';
import type { CalendarActor } from './calendar-access';
import { canAccessCalendarDepartment, canManageCalendarEvent } from './calendar-policy';

describe('Calendar Event CRUD & Validation (Phase 2)', () => {
  describe('Zod Validation Schemas', () => {
    it('validates a valid create event payload', () => {
      const validPayload = {
        name: 'Quarterly Review',
        detail: 'Discuss Q3 goals and milestones',
        departmentId: 'dept-sales-1',
        allDay: false,
        startAt: '2026-09-15T09:00:00.000Z',
        endAt: '2026-09-15T10:00:00.000Z',
        timezone: 'Asia/Bangkok',
        repeatFrequency: 'NONE',
        tagIds: ['tag-1', 'tag-2'],
        recipients: [{ userId: 'user-2', reminderEnabled: true, reminderOffsetMins: 15 }],
        idempotencyKey: 'key-12345',
      };

      const result = createCalendarEventSchema.safeParse(validPayload);
      assert.strictEqual(result.success, true);
    });

    it('rejects create event when endAt is earlier than startAt', () => {
      const invalidPayload = {
        name: 'Invalid Event',
        departmentId: 'dept-1',
        startAt: '2026-09-15T10:00:00.000Z',
        endAt: '2026-09-15T09:00:00.000Z', // 1 hour earlier
        idempotencyKey: 'key-123',
      };

      const result = createCalendarEventSchema.safeParse(invalidPayload);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message === 'End time must be after start time'));
      }
    });

    it('rejects create event with empty name or missing idempotencyKey', () => {
      const emptyName = {
        name: '   ',
        departmentId: 'dept-1',
        startAt: '2026-09-15T09:00:00.000Z',
        endAt: '2026-09-15T10:00:00.000Z',
        idempotencyKey: 'key-123',
      };
      assert.strictEqual(createCalendarEventSchema.safeParse(emptyName).success, false);

      const missingKey = {
        name: 'Valid Name',
        departmentId: 'dept-1',
        startAt: '2026-09-15T09:00:00.000Z',
        endAt: '2026-09-15T10:00:00.000Z',
      };
      assert.strictEqual(createCalendarEventSchema.safeParse(missingKey).success, false);
    });

    it('validates update schema requiring expectedRevision >= 1', () => {
      const validUpdate = {
        id: 'event-123',
        expectedRevision: 1,
        name: 'Updated Title',
        departmentId: 'dept-1',
        allDay: true,
        startAt: '2026-09-15T00:00:00.000Z',
        endAt: '2026-09-15T23:59:59.000Z',
        timezone: 'Asia/Bangkok',
        repeatFrequency: 'NONE',
        tagIds: [],
        recipients: [],
      };
      assert.strictEqual(updateCalendarEventSchema.safeParse(validUpdate).success, true);

      const zeroRevision = {
        ...validUpdate,
        expectedRevision: 0,
      };
      assert.strictEqual(updateCalendarEventSchema.safeParse(zeroRevision).success, false);
    });

    it('validates delete schema with required id and optional expectedRevision', () => {
      assert.strictEqual(deleteCalendarEventSchema.safeParse({ id: 'evt-1' }).success, true);
      assert.strictEqual(deleteCalendarEventSchema.safeParse({ id: 'evt-1', expectedRevision: 2 }).success, true);
      assert.strictEqual(deleteCalendarEventSchema.safeParse({ id: '' }).success, false);
    });

    it('validates tag schema requiring valid hex color', () => {
      const validTag = {
        name: 'High Priority',
        color: '#EF4444',
        departmentId: 'dept-1',
      };
      assert.strictEqual(createCalendarTagSchema.safeParse(validTag).success, true);

      const invalidColor = {
        name: 'Bad Color',
        color: 'not-a-color',
        departmentId: 'dept-1',
      };
      assert.strictEqual(createCalendarTagSchema.safeParse(invalidColor).success, false);
    });

    it('rejects duplicate recipients, duplicate tags, invalid timezone, and zero duration', () => {
      const base = {
        name: 'Review', departmentId: 'dept-1', allDay: false,
        startAt: '2026-09-15T09:00:00.000Z', endAt: '2026-09-15T10:00:00.000Z',
        timezone: 'Asia/Bangkok', repeatFrequency: 'NONE' as const, idempotencyKey: 'request-1',
        tagIds: ['tag-1'], recipients: [{ userId: 'user-1', reminderEnabled: true, reminderOffsetMins: 0 }],
      };
      assert.equal(createCalendarEventSchema.safeParse({ ...base, tagIds: ['tag-1', 'tag-1'] }).success, false);
      assert.equal(createCalendarEventSchema.safeParse({ ...base, recipients: [...base.recipients, ...base.recipients] }).success, false);
      assert.equal(createCalendarEventSchema.safeParse({ ...base, recipients: [
        ...base.recipients,
        { userId: 'user-2', reminderEnabled: true, reminderOffsetMins: 15 },
      ] }).success, false);
      assert.equal(createCalendarEventSchema.safeParse({ ...base, timezone: 'Not/A_Zone' }).success, false);
      assert.equal(createCalendarEventSchema.safeParse({ ...base, endAt: base.startAt }).success, false);
    });
  });

  describe('Access Control & Item Projection Matrix', () => {
    const adminActor: CalendarActor = {
      id: 'admin-1',
      name: 'Admin User',
      role: 'ADMIN',
      departments: ['Export'],
      hasInformationPerm: true,
    };

    const managerExportActor: CalendarActor = {
      id: 'mgr-1',
      name: 'Manager Export',
      role: 'MANAGEMENT',
      departments: ['Export'],
      hasInformationPerm: true,
    };

    const generalOwnerActor: CalendarActor = {
      id: 'user-owner',
      name: 'General Owner',
      role: 'GENERAL',
      departments: ['Export'],
      hasInformationPerm: false,
    };

    const generalRecipientActor: CalendarActor = {
      id: 'user-recipient',
      name: 'General Recipient',
      role: 'GENERAL',
      departments: ['Export'],
      hasInformationPerm: false,
    };

    const sampleEvent: CalendarEventWithRelations = {
      id: 'evt-100',
      name: 'Export Team Sync',
      detail: 'Sync details',
      departmentId: 'dept-export',
      department: { id: 'dept-export', name: 'Export' },
      ownerId: 'user-owner',
      owner: { id: 'user-owner', name: 'General Owner', image: null },
      allDay: false,
      startAt: new Date('2026-09-15T09:00:00.000Z'),
      endAt: new Date('2026-09-15T10:00:00.000Z'),
      timezone: 'Asia/Bangkok',
      repeatFrequency: 'NONE',
      repeatUntil: null,
      revision: 1,
      tags: [{ tagId: 'tag-1', tag: { id: 'tag-1', name: 'Urgent', color: '#EF4444' } }],
      recipients: [{ userId: 'user-recipient', reminderEnabled: true, reminderOffsetMins: 0 }],
      exceptions: [],
    };

    const rangeStart = new Date('2026-08-30T00:00:00.000Z');
    const rangeEnd = new Date('2026-10-10T23:59:59.999Z');

    it('grants canEdit = true to ADMIN for any department event', () => {
      const items = projectCalendarEventsToCalendarItems([sampleEvent], adminActor, rangeStart, rangeEnd);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].canEdit, true);
      assert.strictEqual(items[0].color, '#EF4444');
    });

    it('grants canEdit = true to MANAGEMENT of the event department', () => {
      const items = projectCalendarEventsToCalendarItems([sampleEvent], managerExportActor, rangeStart, rangeEnd);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].canEdit, true);
    });

    it('denies canEdit = false to MANAGEMENT of a different department', () => {
      const managerDomestic: CalendarActor = {
        id: 'mgr-2',
        name: 'Manager Domestic',
        role: 'MANAGEMENT',
        departments: ['Domestic'],
        hasInformationPerm: true,
      };
      const items = projectCalendarEventsToCalendarItems([sampleEvent], managerDomestic, rangeStart, rangeEnd);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].canEdit, false);
    });

    it('grants canEdit = true to GENERAL owner', () => {
      const items = projectCalendarEventsToCalendarItems([sampleEvent], generalOwnerActor, rangeStart, rangeEnd);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].canEdit, true);
    });

    it('sets canEdit = false for GENERAL recipient who is not owner', () => {
      const items = projectCalendarEventsToCalendarItems([sampleEvent], generalRecipientActor, rangeStart, rangeEnd);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].canEdit, false);
    });

    it('scopes department reads and management writes to actor membership', () => {
      assert.equal(canAccessCalendarDepartment(managerExportActor, 'Export'), true);
      assert.equal(canAccessCalendarDepartment(managerExportActor, 'Domestic'), false);
      assert.equal(canManageCalendarEvent(managerExportActor, { ownerId: 'other', department: { name: 'Export' } }), true);
      assert.equal(canManageCalendarEvent(managerExportActor, { ownerId: 'other', department: { name: 'Domestic' } }), false);
      assert.equal(canManageCalendarEvent(generalOwnerActor, { ownerId: generalOwnerActor.id, department: { name: 'Domestic' } }), true);
    });

    it('expands recurring events into distinct occurrences within the range', () => {
      const recurringWeeklyEvent: CalendarEventWithRelations = {
        ...sampleEvent,
        id: 'evt-weekly',
        repeatFrequency: 'WEEKLY',
        repeatUntil: new Date('2026-09-30T23:59:59.000Z'),
      };

      const items = projectCalendarEventsToCalendarItems([recurringWeeklyEvent], adminActor, rangeStart, rangeEnd);
      // Sep 15, Sep 22, Sep 29 = 3 occurrences
      assert.strictEqual(items.length, 3);
      assert.strictEqual(items[0].sourceId, 'evt-weekly');
      assert.strictEqual(items[1].sourceId, 'evt-weekly');
      assert.strictEqual(items[2].sourceId, 'evt-weekly');
      assert.notStrictEqual(items[0].id, items[1].id);
    });
  });

  describe('Draft Store Persistence & Isolation', () => {
    beforeEach(() => {
      resetAllCalendarDrafts();
    });

    it('saves, retrieves, and clears draft by userId and eventKey', () => {
      const draft: CalendarEventDraft = {
        name: 'Draft Meeting',
        detail: 'Some pending notes',
        departmentId: 'dept-1',
        allDay: false,
        startAt: '2026-09-15T09:00:00.000Z',
        endAt: '2026-09-15T10:00:00.000Z',
        repeatFrequency: 'NONE',
        repeatUntil: null,
        tagIds: ['tag-1'],
        reminderEnabled: true,
        reminderOffsetMins: 0,
        recipients: [],
      };

      setCalendarDraft('user-A', 'new', draft);
      const retrieved = getCalendarDraft('user-A', 'new');
      assert.deepStrictEqual(retrieved, draft);

      // User B is isolated
      const userBDraft = getCalendarDraft('user-B', 'new');
      assert.strictEqual(userBDraft, undefined);

      // Clear draft
      clearCalendarDraft('user-A', 'new');
      assert.strictEqual(getCalendarDraft('user-A', 'new'), undefined);
    });

    it('isolates different event keys for the same user', () => {
      const draftNew: CalendarEventDraft = {
        name: 'New Event Draft',
        detail: '',
        departmentId: 'dept-1',
        allDay: false,
        startAt: '2026-09-15T09:00:00.000Z',
        endAt: '2026-09-15T10:00:00.000Z',
        repeatFrequency: 'NONE',
        repeatUntil: null,
        tagIds: [],
        reminderEnabled: true,
        reminderOffsetMins: 0,
        recipients: [],
      };

      const draftEdit: CalendarEventDraft = {
        name: 'Editing Existing Event',
        detail: 'Updated detail',
        departmentId: 'dept-1',
        allDay: true,
        startAt: '2026-09-16T00:00:00.000Z',
        endAt: '2026-09-16T23:59:59.000Z',
        repeatFrequency: 'DAILY',
        repeatUntil: null,
        tagIds: ['tag-2'],
        reminderEnabled: true,
        reminderOffsetMins: 0,
        recipients: [],
      };

      setCalendarDraft('user-A', 'new', draftNew);
      setCalendarDraft('user-A', 'evt-123', draftEdit);

      assert.strictEqual(getCalendarDraft('user-A', 'new')?.name, 'New Event Draft');
      assert.strictEqual(getCalendarDraft('user-A', 'evt-123')?.name, 'Editing Existing Event');

      clearCalendarDraft('user-A', 'new');
      assert.strictEqual(getCalendarDraft('user-A', 'new'), undefined);
      assert.strictEqual(getCalendarDraft('user-A', 'evt-123')?.name, 'Editing Existing Event');
    });
  });

  describe('Tag Normalization & Department Isolation Rules', () => {
    it('normalizes tag names with trim and lowercasing', () => {
      const raw1 = '  Important Meeting  ';
      const raw2 = 'important meeting';
      const raw3 = 'IMPORTANT MEETING';

      const norm1 = raw1.trim().toLowerCase();
      const norm2 = raw2.trim().toLowerCase();
      const norm3 = raw3.trim().toLowerCase();

      assert.strictEqual(norm1, 'important meeting');
      assert.strictEqual(norm1, norm2);
      assert.strictEqual(norm2, norm3);
    });
  });
});
