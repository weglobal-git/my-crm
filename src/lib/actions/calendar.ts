"use server";

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { canUserEditOpportunityDate, requireCalendarActor, type CalendarActor } from '@/lib/calendar/calendar-access';
import { addDays } from 'date-fns';
import { canAccessCalendarDepartment, canManageCalendarEvent } from '@/lib/calendar/calendar-policy';
import { getCalendarMonthSnapshot } from '@/lib/calendar/calendar-queries';
import { buildCalendarRealtimeEvent, dispatchCalendarRealtimeEvent, dispatchCalendarRealtimeToUsers } from '@/lib/calendar/calendar-realtime-server';
import { getCalendarEventAffectedRange } from '@/lib/calendar/calendar-realtime';
import { expandEventOccurrences, hasRecurrenceShapeChanged } from '@/lib/calendar/calendar-recurrence';
import type { CalendarMonthItemDTO, CalendarMonthSnapshotDTO, CalendarEventDetailDTO, CalendarFinancialInfoDTO, CalendarSearchResultDTO } from '@/lib/calendar/calendar-dto';
import {
  createCalendarEventSchema,
  updateCalendarEventSchema,
  deleteCalendarEventSchema,
  createCalendarTagSchema,
  type CreateCalendarEventInput,
  type UpdateCalendarEventInput,
  type DeleteCalendarEventInput,
  type CreateCalendarTagInput,
} from '@/lib/calendar/calendar-validation';
import { updateOpportunity } from '@/lib/actions/opportunity';
import { getOpportunityAccessWhere, getPipelineRecipientUserIds, requireOpportunityDateEdit } from '@/lib/pipeline-security';
import type { CalendarItemType } from '@/lib/calendar/calendar-dto';
import { getDealDateAffectedRange, parseCalendarDealDateMutation } from '@/lib/calendar/calendar-deal-date';

type EventReferenceInput = Pick<CreateCalendarEventInput, 'departmentId' | 'tagIds' | 'recipients'>;

function calendarRecipientWhere(departmentId: string): Prisma.UserWhereInput {
  return {
    role: { in: ['ADMIN', 'MANAGEMENT', 'GENERAL'] },
    departments: { some: { id: departmentId } },
    OR: [
      { role: 'ADMIN' },
      { departments: { some: { permissions: { some: { visible: true, menuItem: { key: 'calendar' } } } } } },
    ],
  };
}

async function validateEventReferences(
  input: EventReferenceInput,
  actor: CalendarActor,
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  const [department, tags, recipients] = await Promise.all([
    db.department.findUnique({ where: { id: input.departmentId }, select: { id: true, name: true } }),
    input.tagIds.length === 0 ? Promise.resolve([]) : db.calendarTag.findMany({
      where: { id: { in: input.tagIds }, departmentId: input.departmentId },
      select: { id: true },
    }),
    input.recipients.length === 0 ? Promise.resolve([]) : db.user.findMany({
      where: {
        ...calendarRecipientWhere(input.departmentId),
        id: { in: input.recipients.map((recipient) => recipient.userId) },
      },
      select: { id: true },
    }),
  ]);

  if (!department) throw new Error('DEPARTMENT_NOT_FOUND');
  if (!canAccessCalendarDepartment(actor, department.name)) throw new Error('FORBIDDEN');
  if (tags.length !== input.tagIds.length) throw new Error('INVALID_TAG_SCOPE');
  if (recipients.length !== input.recipients.length) throw new Error('INVALID_RECIPIENT_SCOPE');
  return department;
}

function toMonthItem(event: {
  id: string; name: string; startAt: Date; endAt: Date; allDay: boolean; departmentId: string; revision: number;
  owner: { id: string; name: string | null; image: string | null };
  tags: Array<{ tagId: string; tag: { color: string } }>;
}): CalendarMonthItemDTO {
  return {
    id: event.id, sourceType: 'EVENT', sourceId: event.id, title: event.name,
    startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString(), allDay: event.allDay,
    color: event.tags[0]?.tag.color ?? '#3B82F6', tagIds: event.tags.map((tag) => tag.tagId),
    owner: event.owner, departmentId: event.departmentId, canEdit: true, revision: event.revision,
  };
}

export async function getMonthSnapshotAction(
  year: number,
  month: number
): Promise<{ success: boolean; data?: CalendarMonthSnapshotDTO; error?: string }> {
  try {
    if (!Number.isInteger(year) || year < 1970 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return { success: false, error: 'INVALID_MONTH' };
    }
    const actor = await requireCalendarActor();
    const snapshot = await getCalendarMonthSnapshot(year, month, actor);
    return { success: true, data: snapshot };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch calendar month snapshot';
    return { success: false, error: message };
  }
}

export async function getCalendarFinancialInfoAction(
  opportunityId: string
): Promise<{ success: boolean; data?: CalendarFinancialInfoDTO; error?: string }> {
  try {
    const actor = await requireCalendarActor();
    if (!actor.hasInformationPerm || !opportunityId) return { success: false, error: 'FORBIDDEN' };
    const accessWhere = getOpportunityAccessWhere({
      id: actor.id,
      name: actor.name,
      role: actor.role,
      departments: actor.departments,
    });
    const opportunity = await prisma.opportunity.findFirst({
      where: { AND: [{ id: opportunityId, type: 'SALES_DEAL' }, accessWhere] },
      select: {
        id: true,
        topic: true,
        value: true,
        currency: true,
        reserveId: true,
        invoiceId: true,
        goodsReadyDate: true,
        goodsLoadingDate: true,
        status: true,
        updatedAt: true,
        ownerId: true,
        owner: { select: { departments: { select: { name: true } } } },
        teamMembers: { select: { id: true, departments: { select: { name: true } } } },
        company: { select: { name: true, displayName: true } },
      },
    });
    if (!opportunity) return { success: false, error: 'FORBIDDEN' };
    const canEdit = !['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(opportunity.status) &&
      canUserEditOpportunityDate(actor, opportunity, 'DEAL_GOODS_READY', actor.hasInformationPerm);
    return {
      success: true,
      data: {
        opportunityId: opportunity.id,
        accountName: opportunity.company?.displayName || opportunity.company?.name || null,
        topicName: opportunity.topic,
        totalValue: opportunity.value,
        currency: opportunity.currency || 'THB',
        reserveId: opportunity.reserveId,
        invoiceNumber: opportunity.invoiceId,
        goodsReadyDate: opportunity.goodsReadyDate?.toISOString() ?? null,
        goodsLoadingDate: opportunity.goodsLoadingDate?.toISOString() ?? null,
        status: opportunity.status,
        revision: opportunity.updatedAt.getTime(),
        canEdit,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to load financial info' };
  }
}

export async function updateCalendarSaleDealAction(input: {
  opportunityId: string;
  totalValue: number | null;
  currency: string;
  reserveId: string | null;
  invoiceNumber: string | null;
  goodsReadyDate: string | null;
  goodsLoadingDate: string | null;
  expectedRevision: number;
  mutationId: string;
}): Promise<{ success: boolean; revision?: number; error?: string }> {
  try {
    await requireCalendarActor();
    if (!input.opportunityId || !input.mutationId || !Number.isFinite(input.expectedRevision)) {
      return { success: false, error: 'INVALID_INPUT' };
    }
    const ready = input.goodsReadyDate ? new Date(`${input.goodsReadyDate}T00:00:00`) : null;
    const loading = input.goodsLoadingDate ? new Date(`${input.goodsLoadingDate}T00:00:00`) : null;
    if ((ready && !Number.isFinite(ready.getTime())) || (loading && !Number.isFinite(loading.getTime()))) {
      return { success: false, error: 'INVALID_DATE' };
    }

    const access = await requireOpportunityDateEdit(input.opportunityId, 'goodsReadyDate');
    if (access.opportunity.updatedAt.getTime() !== input.expectedRevision) {
      return { success: false, error: 'CONFLICT' };
    }
    await requireOpportunityDateEdit(input.opportunityId, 'goodsLoadingDate', access.actor);
    const before = await prisma.opportunity.findUnique({
      where: { id: input.opportunityId },
      select: { goodsReadyDate: true, goodsLoadingDate: true },
    });
    if (!before) return { success: false, error: 'FORBIDDEN' };

    const result = await updateOpportunity(input.opportunityId, {
      value: input.totalValue,
      currency: input.currency,
      reserveId: input.reserveId?.trim() || null,
      invoiceId: input.invoiceNumber?.trim() || null,
      goodsReadyDate: ready,
      goodsLoadingDate: loading,
    }, input.mutationId, input.expectedRevision);
    const revision = new Date(result.updatedAt).getTime();
    const recipients = await getPipelineRecipientUserIds(input.opportunityId);
    const changes = [
      { field: 'goodsReadyDate' as const, sourceType: 'DEAL_GOODS_READY' as const, oldValue: before.goodsReadyDate, value: ready },
      { field: 'goodsLoadingDate' as const, sourceType: 'DEAL_GOODS_LOADING' as const, oldValue: before.goodsLoadingDate, value: loading },
    ].filter((change) => change.oldValue?.getTime() !== change.value?.getTime());
    await Promise.all(changes.map(async (change) => {
      const range = getDealDateAffectedRange(change.oldValue, change.value);
      await dispatchCalendarRealtimeToUsers(buildCalendarRealtimeEvent({
        action: 'ITEM_UPDATED',
        itemId: `deal:${input.opportunityId}:${change.field}`,
        sourceType: change.sourceType,
        revision,
        mutationId: input.mutationId,
        startAt: range.startAt,
        endAt: range.endAt,
      }), recipients);
    }));
    return { success: true, revision };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unable to update Sale Deal' };
  }
}

export async function searchCalendarAction(input: {
  query: string;
  cursor?: number;
  limit?: number;
}): Promise<{ success: boolean; items?: CalendarSearchResultDTO[]; nextCursor?: number | null; error?: string }> {
  try {
    const actor = await requireCalendarActor();
    const query = input.query.trim();
    if (query.length < 2) return { success: true, items: [], nextCursor: null };
    const cursor = Math.max(0, input.cursor || 0);
    const limit = Math.min(50, Math.max(1, input.limit || 30));
    const eventAccess: Prisma.CalendarEventWhereInput = actor.role === 'ADMIN' ? {} : actor.role === 'MANAGEMENT'
      ? { OR: [{ department: { name: { in: actor.departments } } }, { ownerId: actor.id }, { recipients: { some: { userId: actor.id } } }] }
      : { OR: [{ ownerId: actor.id }, { recipients: { some: { userId: actor.id } } }] };

    const opportunityPromise = actor.hasInformationPerm
      ? prisma.opportunity.findMany({
          where: {
            AND: [
              getOpportunityAccessWhere({ id: actor.id, name: actor.name, role: actor.role, departments: actor.departments }),
              { type: 'SALES_DEAL' },
              { OR: [
                { topic: { contains: query, mode: 'insensitive' } },
                { company: { is: { OR: [
                  { name: { contains: query, mode: 'insensitive' } },
                  { displayName: { contains: query, mode: 'insensitive' } },
                ] } } },
              ] },
              { OR: [{ goodsReadyDate: { not: null } }, { goodsLoadingDate: { not: null } }] },
            ],
          },
          take: 200,
          select: {
            id: true, topic: true, goodsReadyDate: true, goodsLoadingDate: true, status: true, updatedAt: true, ownerId: true,
            company: { select: { name: true, displayName: true } },
            owner: { select: { id: true, name: true, image: true, departments: { select: { id: true, name: true } } } },
            teamMembers: { select: { id: true, departments: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]);
    const [opportunities, events] = await Promise.all([
      opportunityPromise,
      prisma.calendarEvent.findMany({
        where: { AND: [eventAccess, { OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { detail: { contains: query, mode: 'insensitive' } },
          { tags: { some: { tag: { name: { contains: query, mode: 'insensitive' } } } } },
        ] }] },
        take: 200,
        select: {
          id: true, name: true, detail: true, startAt: true, endAt: true, allDay: true, revision: true,
          timezone: true, repeatFrequency: true, repeatUntil: true,
          departmentId: true, department: { select: { name: true } },
          ownerId: true, owner: { select: { id: true, name: true, image: true } },
          tags: { select: { tagId: true, tag: { select: { id: true, name: true, color: true } } } },
          exceptions: { select: { occurrenceStartAt: true, overrideStartAt: true, overrideEndAt: true, isCancelled: true } },
        },
      }),
    ]);

    const results: CalendarSearchResultDTO[] = [];
    for (const opportunity of opportunities) {
      const accountName = opportunity.company?.displayName || opportunity.company?.name || null;
      const department = opportunity.owner.departments[0] || null;
      const base = {
        sourceId: opportunity.id, title: opportunity.topic, accountName, departmentId: department?.id || null,
        departmentName: department?.name || null, tagIds: [], tags: [], allDay: true,
        owner: { id: opportunity.owner.id, name: opportunity.owner.name, image: opportunity.owner.image },
        canEdit: canUserEditOpportunityDate(actor, opportunity, 'DEAL_GOODS_READY', actor.hasInformationPerm),
        revision: opportunity.updatedAt.getTime(), color: null, matchContext: accountName,
      };
      if (opportunity.goodsReadyDate) results.push({ ...base, id: `deal:${opportunity.id}:goodsReadyDate`, sourceType: 'DEAL_GOODS_READY', startAt: opportunity.goodsReadyDate.toISOString(), endAt: addDays(opportunity.goodsReadyDate, 1).toISOString() });
      if (opportunity.goodsLoadingDate) results.push({ ...base, id: `deal:${opportunity.id}:goodsLoadingDate`, sourceType: 'DEAL_GOODS_LOADING', startAt: opportunity.goodsLoadingDate.toISOString(), endAt: addDays(opportunity.goodsLoadingDate, 1).toISOString() });
    }
    const searchRangeStart = new Date(); searchRangeStart.setFullYear(searchRangeStart.getFullYear() - 1); searchRangeStart.setHours(0, 0, 0, 0);
    const searchRangeEnd = new Date(); searchRangeEnd.setFullYear(searchRangeEnd.getFullYear() + 2); searchRangeEnd.setHours(23, 59, 59, 999);
    for (const event of events) {
      const canEdit = actor.role === 'ADMIN' || actor.id === event.ownerId || (actor.role === 'MANAGEMENT' && actor.departments.includes(event.department.name));
      const occurrences = event.repeatFrequency === 'NONE' ? [{
        occurrenceId: event.id, eventId: event.id, startAt: event.startAt, endAt: event.endAt, allDay: event.allDay, isException: false,
      }] : expandEventOccurrences({
        id: event.id, name: event.name, startAt: event.startAt, endAt: event.endAt, allDay: event.allDay,
        timezone: event.timezone, repeatFrequency: event.repeatFrequency, repeatUntil: event.repeatUntil, exceptions: event.exceptions.map((exception) => ({ eventId: event.id, ...exception })),
      }, { rangeStart: searchRangeStart, rangeEnd: searchRangeEnd, timezone: event.timezone, maxOccurrences: 100 });
      for (const occurrence of occurrences) {
        results.push({
          id: event.repeatFrequency === 'NONE' ? event.id : occurrence.occurrenceId,
          sourceId: event.id, sourceType: 'EVENT', title: event.name,
          startAt: occurrence.startAt.toISOString(), endAt: occurrence.endAt.toISOString(), allDay: occurrence.allDay,
          color: event.tags[0]?.tag.color || '#3B82F6', tagIds: event.tags.map(({ tagId }) => tagId), tags: event.tags.map(({ tag }) => tag),
          owner: event.owner, departmentId: event.departmentId, departmentName: event.department.name,
          canEdit, revision: event.revision, matchContext: event.detail || null,
        });
        if (results.length >= 400) break;
      }
      if (results.length >= 400) break;
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    results.sort((a, b) => {
      const aTime = Date.parse(a.startAt); const bTime = Date.parse(b.startAt);
      const aPast = aTime < today.getTime(); const bPast = bTime < today.getTime();
      if (aPast !== bPast) return aPast ? -1 : 1;
      return aPast ? bTime - aTime : aTime - bTime;
    });
    const page = results.slice(cursor, cursor + limit);
    return { success: true, items: page, nextCursor: cursor + limit < results.length ? cursor + limit : null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Search failed' };
  }
}

export async function createCalendarEventAction(
  rawInput: CreateCalendarEventInput
): Promise<{
  success: boolean;
  item?: CalendarMonthItemDTO;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}> {
  try {
    const parseResult = createCalendarEventSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        success: false,
        error: 'Validation failed',
        fieldErrors: parseResult.error.flatten().fieldErrors,
      };
    }
    const input = parseResult.data;
    const actor = await requireCalendarActor();

    await validateEventReferences(input, actor);

    const prior = await prisma.calendarEvent.findUnique({
      where: { ownerId_clientRequestId: { ownerId: actor.id, clientRequestId: input.idempotencyKey } },
      include: { owner: { select: { id: true, name: true, image: true } }, tags: { include: { tag: true } } },
    });
    if (prior) return { success: true, item: toMonthItem(prior) };

    // Transactional create
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.calendarEvent.create({
        data: {
          name: input.name,
          detail: input.detail,
          departmentId: input.departmentId,
          ownerId: actor.id,
          clientRequestId: input.idempotencyKey,
          allDay: input.allDay,
          startAt: new Date(input.startAt),
          endAt: new Date(input.endAt),
          timezone: input.timezone,
          repeatFrequency: input.repeatFrequency,
          repeatUntil: input.repeatUntil ? new Date(input.repeatUntil) : null,
          revision: 1,
          recipients: {
            create: input.recipients.map((r) => ({
              userId: r.userId,
              reminderEnabled: r.reminderEnabled,
              reminderOffsetMins: r.reminderOffsetMins,
            })),
          },
          tags: {
            create: input.tagIds.map((tagId) => ({
              tagId,
            })),
          },
        },
        include: {
          owner: { select: { id: true, name: true, image: true } },
          tags: {
            include: { tag: true },
          },
        },
      });

      return created;
    });

    const createdRange = getCalendarEventAffectedRange(event);
    await dispatchCalendarRealtimeEvent(buildCalendarRealtimeEvent({
      action: 'ITEM_CREATED', itemId: event.id, revision: event.revision,
      mutationId: input.idempotencyKey, ...createdRange,
    }), [{ ownerId: event.owner.id, departmentId: event.departmentId, recipientIds: input.recipients.map((recipient) => recipient.userId) }]);

    return { success: true, item: toMonthItem(event) };
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const parsed = createCalendarEventSchema.safeParse(rawInput);
      if (parsed.success) {
        const actor = await requireCalendarActor();
        const prior = await prisma.calendarEvent.findUnique({
          where: { ownerId_clientRequestId: { ownerId: actor.id, clientRequestId: parsed.data.idempotencyKey } },
          include: { owner: { select: { id: true, name: true, image: true } }, tags: { include: { tag: true } } },
        });
        if (prior) return { success: true, item: toMonthItem(prior) };
      }
    }
    const message = err instanceof Error ? err.message : 'Failed to create event';
    return { success: false, error: message };
  }
}

export async function updateCalendarEventAction(
  rawInput: UpdateCalendarEventInput
): Promise<{
  success: boolean;
  item?: CalendarMonthItemDTO;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  currentRevision?: number;
}> {
  try {
    const parseResult = updateCalendarEventSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        success: false,
        error: 'Validation failed',
        fieldErrors: parseResult.error.flatten().fieldErrors,
      };
    }
    const input = parseResult.data;
    const actor = await requireCalendarActor();

    const existing = await prisma.calendarEvent.findUnique({
      where: { id: input.id },
      include: { department: true, recipients: { select: { userId: true, reminderEnabled: true, reminderOffsetMins: true } } },
    });

    if (!existing) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // Permission check
    if (!canManageCalendarEvent(actor, existing)) {
      return { success: false, error: 'FORBIDDEN' };
    }

    await validateEventReferences(input, actor);
    const recurrenceShapeChanged = hasRecurrenceShapeChanged(existing, {
      startAt: new Date(input.startAt), endAt: new Date(input.endAt), allDay: input.allDay,
      timezone: input.timezone, repeatFrequency: input.repeatFrequency,
      repeatUntil: input.repeatUntil ? new Date(input.repeatUntil) : null,
    });
    const reminderRecipientsChanged = JSON.stringify(
      existing.recipients
        .map(({ userId, reminderEnabled, reminderOffsetMins }) => ({ userId, reminderEnabled, reminderOffsetMins }))
        .sort((a, b) => a.userId.localeCompare(b.userId))
    ) !== JSON.stringify(
      input.recipients
        .map(({ userId, reminderEnabled, reminderOffsetMins }) => ({ userId, reminderEnabled, reminderOffsetMins }))
        .sort((a, b) => a.userId.localeCompare(b.userId))
    );

    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.calendarEvent.updateMany({
        where: { id: input.id, revision: input.expectedRevision },
        data: {
          name: input.name, detail: input.detail, departmentId: input.departmentId,
          allDay: input.allDay, startAt: new Date(input.startAt), endAt: new Date(input.endAt),
          timezone: input.timezone, repeatFrequency: input.repeatFrequency,
          repeatUntil: input.repeatUntil ? new Date(input.repeatUntil) : null,
          revision: { increment: 1 },
        },
      });
      if (claimed.count !== 1) throw new Error('REVISION_CONFLICT');

      // An occurrence exception is keyed to the previous recurrence pattern.
      // Remove it atomically when the series timing/pattern changes so stale
      // exceptions cannot become orphaned or affect a different occurrence.
      if (recurrenceShapeChanged) await tx.calendarEventException.deleteMany({ where: { eventId: input.id } });

      // Re-sync tags
      await tx.calendarEventTag.deleteMany({
        where: { eventId: input.id },
      });
      if (input.tagIds && input.tagIds.length > 0) {
        await tx.calendarEventTag.createMany({
          data: input.tagIds.map((tagId) => ({
            eventId: input.id,
            tagId,
          })),
        });
      }

      // Re-sync recipients
      await tx.calendarEventRecipient.deleteMany({
        where: { eventId: input.id },
      });
      if (input.recipients && input.recipients.length > 0) {
        await tx.calendarEventRecipient.createMany({
          data: input.recipients.map((r) => ({
            eventId: input.id,
            userId: r.userId,
            reminderEnabled: r.reminderEnabled,
            reminderOffsetMins: r.reminderOffsetMins,
          })),
        });
      }

      // Pending rows describe the old schedule/recipient set. Re-materialization
      // on the next cron creates only the currently valid reminder keys.
      if (recurrenceShapeChanged || reminderRecipientsChanged) {
        await tx.calendarReminderDelivery.updateMany({
          where: { eventId: input.id, status: { in: ['PENDING', 'PROCESSING'] } },
          data: { status: 'CANCELLED', lastError: 'EVENT_RESCHEDULED_OR_RECIPIENT_CHANGED' },
        });
      }

      const res = await tx.calendarEvent.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          owner: { select: { id: true, name: true, image: true } },
          tags: { include: { tag: true } },
        },
      });

      return res;
    });

    const oldRange = getCalendarEventAffectedRange(existing);
    const newRange = getCalendarEventAffectedRange(updated);
    const affectedStart = new Date(Math.min(oldRange.startAt.getTime(), newRange.startAt.getTime()));
    const affectedEnd = new Date(Math.max(oldRange.endAt.getTime(), newRange.endAt.getTime()));
    await dispatchCalendarRealtimeEvent(buildCalendarRealtimeEvent({
      action: 'ITEM_UPDATED', itemId: updated.id, revision: updated.revision,
      mutationId: input.mutationId, startAt: affectedStart, endAt: affectedEnd,
    }), [
      { ownerId: existing.ownerId, departmentId: existing.departmentId, recipientIds: existing.recipients.map((recipient) => recipient.userId) },
      { ownerId: existing.ownerId, departmentId: updated.departmentId, recipientIds: input.recipients.map((recipient) => recipient.userId) },
    ]);

    const tagColor = updated.tags?.[0]?.tag?.color || '#3B82F6';
    const tagIds = updated.tags?.map((t) => t.tagId) || [];

    const item: CalendarMonthItemDTO = {
      id: updated.id,
      sourceType: 'EVENT',
      sourceId: updated.id,
      title: updated.name,
      startAt: updated.startAt.toISOString(),
      endAt: updated.endAt.toISOString(),
      allDay: updated.allDay,
      color: tagColor,
      tagIds,
      owner: {
        id: updated.owner.id,
        name: updated.owner.name,
        image: updated.owner.image,
      },
      departmentId: updated.departmentId,
      canEdit: true,
      revision: updated.revision,
    };

    return { success: true, item };
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'REVISION_CONFLICT') {
      const current = await prisma.calendarEvent.findUnique({ where: { id: rawInput.id }, select: { revision: true } });
      return { success: false, error: 'REVISION_CONFLICT', currentRevision: current?.revision };
    }
    const message = err instanceof Error ? err.message : 'Failed to update event';
    return { success: false, error: message };
  }
}

export async function deleteCalendarEventAction(
  rawInput: DeleteCalendarEventInput
): Promise<{
  success: boolean;
  deletedId?: string;
  error?: string;
  currentRevision?: number;
}> {
  try {
    const parseResult = deleteCalendarEventSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return { success: false, error: 'Invalid delete input' };
    }
    const input = parseResult.data;
    const actor = await requireCalendarActor();

    const existing = await prisma.calendarEvent.findUnique({
      where: { id: input.id },
      include: { department: true, recipients: { select: { userId: true } } },
    });

    if (!existing) {
      return { success: true, deletedId: input.id }; // idempotent delete
    }

    if (!canManageCalendarEvent(actor, existing)) {
      return { success: false, error: 'FORBIDDEN' };
    }

    const deleted = await prisma.calendarEvent.deleteMany({
      where: { id: input.id, ...(input.expectedRevision ? { revision: input.expectedRevision } : {}) },
    });
    if (deleted.count !== 1) {
      const current = await prisma.calendarEvent.findUnique({ where: { id: input.id }, select: { revision: true } });
      return current
        ? { success: false, error: 'REVISION_CONFLICT', currentRevision: current.revision }
        : { success: true, deletedId: input.id };
    }

    const deletedRange = getCalendarEventAffectedRange(existing);
    await dispatchCalendarRealtimeEvent(buildCalendarRealtimeEvent({
      action: 'ITEM_DELETED', itemId: existing.id, revision: existing.revision + 1,
      mutationId: input.mutationId, ...deletedRange,
    }), [{ ownerId: existing.ownerId, departmentId: existing.departmentId, recipientIds: existing.recipients.map((recipient) => recipient.userId) }]);

    return { success: true, deletedId: input.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete event';
    return { success: false, error: message };
  }
}

export async function cancelCalendarEventOccurrenceAction(input: {
  eventId: string;
  occurrenceStartAt: string;
  expectedRevision: number;
  mutationId: string;
}): Promise<{ success: boolean; revision?: number; cancelledItemId?: string; error?: string }> {
  try {
    const actor = await requireCalendarActor();
    const occurrenceStartAt = new Date(input.occurrenceStartAt);
    if (!input.eventId || !input.mutationId || !Number.isFinite(occurrenceStartAt.getTime())) return { success: false, error: 'INVALID_OCCURRENCE' };
    const existing = await prisma.calendarEvent.findUnique({
      where: { id: input.eventId },
      include: { department: true, recipients: { select: { userId: true } } },
    });
    if (!existing) return { success: false, error: 'NOT_FOUND' };
    if (!canManageCalendarEvent(actor, existing)) return { success: false, error: 'FORBIDDEN' };
    if (existing.repeatFrequency === 'NONE') return { success: false, error: 'NOT_RECURRING' };
    const duration = Math.max(1, existing.endAt.getTime() - existing.startAt.getTime());
    const isOccurrence = expandEventOccurrences({
      id: existing.id, name: existing.name, startAt: existing.startAt, endAt: existing.endAt,
      allDay: existing.allDay, repeatFrequency: existing.repeatFrequency, repeatUntil: existing.repeatUntil, exceptions: [],
    }, { rangeStart: new Date(occurrenceStartAt.getTime() - 1), rangeEnd: new Date(occurrenceStartAt.getTime() + duration), maxOccurrences: 2 })
      .some((occurrence) => occurrence.startAt.getTime() === occurrenceStartAt.getTime());
    if (!isOccurrence) return { success: false, error: 'INVALID_OCCURRENCE' };

    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.calendarEvent.updateMany({ where: { id: existing.id, revision: input.expectedRevision }, data: { revision: { increment: 1 } } });
      if (claimed.count !== 1) throw new Error('REVISION_CONFLICT');
      await tx.calendarEventException.upsert({
        where: { eventId_occurrenceStartAt: { eventId: existing.id, occurrenceStartAt } },
        create: { eventId: existing.id, occurrenceStartAt, isCancelled: true },
        update: { isCancelled: true, overrideStartAt: null, overrideEndAt: null },
      });
      await tx.calendarReminderDelivery.updateMany({
        where: { eventId: existing.id, occurrenceStartAt, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'CANCELLED', lastError: 'OCCURRENCE_CANCELLED' },
      });
      return tx.calendarEvent.findUniqueOrThrow({ where: { id: existing.id }, select: { revision: true } });
    });
    await dispatchCalendarRealtimeEvent(buildCalendarRealtimeEvent({
      action: 'ITEM_UPDATED', itemId: existing.id, revision: updated.revision, mutationId: input.mutationId,
      startAt: occurrenceStartAt, endAt: new Date(occurrenceStartAt.getTime() + duration),
    }), [{ ownerId: existing.ownerId, departmentId: existing.departmentId, recipientIds: existing.recipients.map(({ userId }) => userId) }]);
    return { success: true, revision: updated.revision, cancelledItemId: `event:${existing.id}:${occurrenceStartAt.toISOString()}` };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to cancel occurrence' };
  }
}

export async function getCalendarEventDetailAction(
  eventId: string
): Promise<{
  success: boolean;
  event?: CalendarEventDetailDTO;
  error?: string;
}> {
  try {
    const actor = await requireCalendarActor();

    const event = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
      include: {
        department: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, image: true, email: true } },
        recipients: {
          include: {
            user: { select: { id: true, name: true, image: true, email: true } },
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        exceptions: true,
      },
    });

    if (!event) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const isOwner = actor.id === event.ownerId;
    const isDeptManager = actor.role === 'MANAGEMENT' && actor.departments.includes(event.department.name);
    const isRecipient = event.recipients.some((r) => r.userId === actor.id);
    const canView = actor.role === 'ADMIN' || isDeptManager || isOwner || isRecipient;

    if (!canView) {
      return { success: false, error: 'FORBIDDEN' };
    }

    const canEdit = canManageCalendarEvent(actor, event);

    return {
      success: true,
      event: {
        id: event.id,
        name: event.name,
        detail: event.detail,
        departmentId: event.departmentId,
        department: event.department,
        ownerId: event.ownerId,
        owner: event.owner,
        allDay: event.allDay,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt.toISOString(),
        timezone: event.timezone,
        repeatFrequency: event.repeatFrequency,
        repeatUntil: event.repeatUntil ? event.repeatUntil.toISOString() : null,
        revision: event.revision,
        canEdit,
        tags: event.tags.map((t) => t.tag),
        recipients: event.recipients.map((r) => ({
          userId: r.userId,
          name: r.user.name,
          email: r.user.email,
          image: r.user.image,
          reminderEnabled: r.reminderEnabled,
          reminderOffsetMins: r.reminderOffsetMins,
        })),
        exceptions: event.exceptions,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch event detail';
    return { success: false, error: message };
  }
}

export async function getDepartmentTagsAction(
  departmentId: string
): Promise<{
  success: boolean;
  tags?: Array<{ id: string; name: string; color: string; departmentId: string }>;
  error?: string;
}> {
  try {
    const actor = await requireCalendarActor();
    const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } });
    if (!department || !canAccessCalendarDepartment(actor, department.name)) {
      return { success: false, error: department ? 'FORBIDDEN' : 'DEPARTMENT_NOT_FOUND' };
    }
    const tags = await prisma.calendarTag.findMany({
      where: { departmentId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true, departmentId: true },
    });
    return { success: true, tags };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch tags';
    return { success: false, error: message };
  }
}

export async function createCalendarTagAction(
  rawInput: CreateCalendarTagInput
): Promise<{
  success: boolean;
  tag?: { id: string; name: string; color: string; departmentId: string };
  error?: string;
}> {
  try {
    const parseResult = createCalendarTagSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return { success: false, error: 'Invalid tag input' };
    }
    const input = parseResult.data;
    const actor = await requireCalendarActor();

    const department = await prisma.department.findUnique({
      where: { id: input.departmentId },
    });
    if (!department) {
      return { success: false, error: 'Department not found' };
    }

    if (actor.role !== 'ADMIN' && !actor.departments.includes(department.name)) {
      return { success: false, error: 'FORBIDDEN' };
    }

    const normalizedName = input.name.trim().toLowerCase();

    const tag = await prisma.calendarTag.upsert({
      where: {
        departmentId_normalizedName: {
          departmentId: input.departmentId,
          normalizedName,
        },
      },
      create: {
        name: input.name.trim(),
        normalizedName,
        color: input.color,
        departmentId: input.departmentId,
      },
      update: {
        color: input.color,
      },
      select: { id: true, name: true, color: true, departmentId: true },
    });

    return { success: true, tag };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create tag';
    return { success: false, error: message };
  }
}

export async function getCalendarRecipientsAction(
  departmentId: string
): Promise<{
  success: boolean;
  users?: Array<{ id: string; name: string | null; email: string | null; image: string | null; role: string }>;
  error?: string;
}> {
  try {
    const actor = await requireCalendarActor();
    const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } });
    if (!department || !canAccessCalendarDepartment(actor, department.name)) {
      return { success: false, error: department ? 'FORBIDDEN' : 'DEPARTMENT_NOT_FOUND' };
    }

    const whereClause = calendarRecipientWhere(departmentId);

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });

    return { success: true, users };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch recipients';
    return { success: false, error: message };
  }
}

export async function getUserDepartmentsAction(): Promise<{
  success: boolean;
  departments?: Array<{ id: string; name: string }>;
  error?: string;
}> {
  try {
    const actor = await requireCalendarActor();
    if (actor.role === 'ADMIN') {
      const allDepts = await prisma.department.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      return { success: true, departments: allDepts };
    }

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { departments: { select: { id: true, name: true } } },
    });

    return { success: true, departments: user?.departments || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch departments';
    return { success: false, error: message };
  }
}

export async function updateCalendarDealDateAction(input: {
  opportunityId: string;
  sourceType: Exclude<CalendarItemType, 'EVENT'>;
  value: string | null;
  reason?: string;
  expectedRevision: number;
  mutationId: string;
}): Promise<{ success: boolean; revision?: number; value?: string | null; error?: string }> {
  try {
    await requireCalendarActor();
    if (!input.opportunityId || !input.mutationId || !Number.isFinite(input.expectedRevision)) {
      return { success: false, error: 'Invalid deal date input' };
    }
    const { field, value } = parseCalendarDealDateMutation(input);
    const access = await requireOpportunityDateEdit(input.opportunityId, field);
    const currentRevision = access.opportunity.updatedAt.getTime();
    if (currentRevision !== input.expectedRevision) return { success: false, error: 'CONFLICT' };

    const before = await prisma.opportunity.findUnique({
      where: { id: input.opportunityId },
      select: { goodsReadyDate: true, goodsLoadingDate: true },
    });
    if (!before) return { success: false, error: 'Forbidden' };
    const oldValue = before[field];

    const result = await updateOpportunity(input.opportunityId, { [field]: value }, input.mutationId, input.expectedRevision);
    const revision = new Date(result.updatedAt).getTime();

    const { startAt: rangeStart, endAt: rangeEnd } = getDealDateAffectedRange(oldValue, value);
    const event = buildCalendarRealtimeEvent({
      action: 'ITEM_UPDATED',
      itemId: `deal:${input.opportunityId}:${field}`,
      sourceType: input.sourceType,
      revision,
      mutationId: input.mutationId,
      startAt: rangeStart,
      endAt: rangeEnd,
    });
    const recipients = await getPipelineRecipientUserIds(input.opportunityId);
    await dispatchCalendarRealtimeToUsers(event, recipients);
    return { success: true, revision, value: value?.toISOString() ?? null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update deal date' };
  }
}

export async function moveCalendarItemAction(input: {
  sourceType: CalendarItemType;
  sourceId: string;
  itemId: string;
  startAt: string;
  endAt: string;
  previousStartAt: string;
  previousEndAt: string;
  expectedRevision: number;
  mutationId: string;
  recurrenceScope?: 'THIS_OCCURRENCE' | 'ENTIRE_SERIES';
}): Promise<{ success: boolean; revision?: number; startAt?: string; endAt?: string; error?: string }> {
  try {
    const actor = await requireCalendarActor();
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    const previousStartAt = new Date(input.previousStartAt);
    const previousEndAt = new Date(input.previousEndAt);
    if (![startAt, endAt, previousStartAt, previousEndAt].every((date) => Number.isFinite(date.getTime())) || endAt <= startAt) {
      return { success: false, error: 'Invalid move range' };
    }

    if (input.sourceType !== 'EVENT') {
      const response = await updateCalendarDealDateAction({
        opportunityId: input.sourceId,
        sourceType: input.sourceType,
        value: startAt.toISOString(),
        expectedRevision: input.expectedRevision,
        mutationId: input.mutationId,
      });
      return response.success
        ? { success: true, revision: response.revision, startAt: response.value || startAt.toISOString(), endAt: endAt.toISOString() }
        : { success: false, error: response.error };
    }

    const existing = await prisma.calendarEvent.findUnique({
      where: { id: input.sourceId },
      include: { department: true, recipients: { select: { userId: true } } },
    });
    if (!existing) return { success: false, error: 'NOT_FOUND' };
    if (!canManageCalendarEvent(actor, existing)) return { success: false, error: 'FORBIDDEN' };
    const recurring = existing.repeatFrequency !== 'NONE';
    if (recurring && !input.recurrenceScope) return { success: false, error: 'RECURRENCE_SCOPE_REQUIRED' };

    const moved = await prisma.$transaction(async (tx) => {
      const deltaMs = startAt.getTime() - previousStartAt.getTime();
      const claimed = await tx.calendarEvent.updateMany({
        where: { id: existing.id, revision: input.expectedRevision },
        data: recurring && input.recurrenceScope === 'THIS_OCCURRENCE'
          ? { revision: { increment: 1 } }
          : {
              startAt: new Date(existing.startAt.getTime() + deltaMs),
              endAt: new Date(existing.endAt.getTime() + deltaMs),
              repeatUntil: existing.repeatUntil ? new Date(existing.repeatUntil.getTime() + deltaMs) : null,
              revision: { increment: 1 },
            },
      });
      if (claimed.count !== 1) throw new Error('REVISION_CONFLICT');
      if (recurring && input.recurrenceScope === 'THIS_OCCURRENCE') {
        const prefix = `event:${existing.id}:`;
        const encodedOccurrence = input.itemId.startsWith(prefix)
          ? input.itemId.slice(prefix.length).replace(/:override$/, '')
          : input.previousStartAt;
        const occurrenceStartAt = new Date(encodedOccurrence);
        if (!Number.isFinite(occurrenceStartAt.getTime())) throw new Error('Invalid occurrence');
        const matchingOccurrence = expandEventOccurrences({
          id: existing.id,
          name: existing.name,
          startAt: existing.startAt,
          endAt: existing.endAt,
          allDay: existing.allDay,
          repeatFrequency: existing.repeatFrequency,
          repeatUntil: existing.repeatUntil,
          exceptions: [],
        }, {
          rangeStart: new Date(occurrenceStartAt.getTime() - 1),
          rangeEnd: new Date(occurrenceStartAt.getTime() + Math.max(1, existing.endAt.getTime() - existing.startAt.getTime())),
          maxOccurrences: 2,
        }).some((occurrence) => occurrence.startAt.getTime() === occurrenceStartAt.getTime());
        if (!matchingOccurrence) throw new Error('Invalid occurrence');
        await tx.calendarEventException.upsert({
          where: { eventId_occurrenceStartAt: { eventId: existing.id, occurrenceStartAt } },
          create: { eventId: existing.id, occurrenceStartAt, overrideStartAt: startAt, overrideEndAt: endAt },
          update: { overrideStartAt: startAt, overrideEndAt: endAt, isCancelled: false },
        });
      } else if (recurring && input.recurrenceScope === 'ENTIRE_SERIES') {
        const exceptions = await tx.calendarEventException.findMany({ where: { eventId: existing.id } });
        if (exceptions.length > 0) {
          await tx.calendarEventException.deleteMany({ where: { eventId: existing.id } });
          await tx.calendarEventException.createMany({
            data: exceptions.map((exception) => ({
              eventId: existing.id,
              occurrenceStartAt: new Date(exception.occurrenceStartAt.getTime() + deltaMs),
              overrideStartAt: exception.overrideStartAt ? new Date(exception.overrideStartAt.getTime() + deltaMs) : null,
              overrideEndAt: exception.overrideEndAt ? new Date(exception.overrideEndAt.getTime() + deltaMs) : null,
              isCancelled: exception.isCancelled,
            })),
          });
        }
      }
      return tx.calendarEvent.findUniqueOrThrow({ where: { id: existing.id } });
    });

    let affectedStart = new Date(Math.min(previousStartAt.getTime(), startAt.getTime()));
    let affectedEnd = new Date(Math.max(previousEndAt.getTime(), endAt.getTime()));
    if (recurring && input.recurrenceScope === 'ENTIRE_SERIES') {
      const oldRange = getCalendarEventAffectedRange(existing);
      const newRange = getCalendarEventAffectedRange(moved);
      affectedStart = new Date(Math.min(oldRange.startAt.getTime(), newRange.startAt.getTime()));
      affectedEnd = new Date(Math.max(oldRange.endAt.getTime(), newRange.endAt.getTime()));
    }
    await dispatchCalendarRealtimeEvent(buildCalendarRealtimeEvent({
      action: 'ITEM_UPDATED', itemId: existing.id, revision: moved.revision, mutationId: input.mutationId,
      startAt: affectedStart, endAt: affectedEnd,
    }), [{ ownerId: existing.ownerId, departmentId: existing.departmentId, recipientIds: existing.recipients.map((recipient) => recipient.userId) }]);
    return { success: true, revision: moved.revision, startAt: startAt.toISOString(), endAt: endAt.toISOString() };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to move calendar item' };
  }
}
