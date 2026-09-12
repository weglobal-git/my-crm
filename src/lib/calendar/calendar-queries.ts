import 'server-only';
import prisma from '@/lib/prisma';
import { addDays } from 'date-fns';
import { getGridRangeForMonth, expandEventOccurrences, type CalendarRepeatFrequency } from './calendar-recurrence';
import { getOpportunityAccessWhere } from '@/lib/pipeline-security';
import { CalendarActor, canUserEditOpportunityDate } from './calendar-access';
import type { CalendarMonthItemDTO, CalendarMonthSnapshotDTO } from './calendar-dto';

export interface OpportunityProjectionRow {
  id: string;
  topic: string;
  goodsReadyDate: Date | null;
  goodsLoadingDate: Date | null;
  type: string | null;
  status: string;
  ownerId: string;
  owner: {
    id: string;
    name: string | null;
    image: string | null;
    departments?: { id: string; name: string }[];
  } | null;
  teamMembers?: {
    id: string;
    departments?: { name: string }[];
  }[];
  company?: { name: string; displayName: string | null } | null;
  updatedAt: Date;
}

/**
 * Pure helper to project opportunity dates into minimal CalendarMonthItemDTO items.
 * Separated for testability without database mocks.
 */
export function projectOpportunityDatesToCalendarItems(
  opportunities: OpportunityProjectionRow[],
  actor: CalendarActor,
  rangeStart: Date,
  rangeEnd: Date
): CalendarMonthItemDTO[] {
  const items: CalendarMonthItemDTO[] = [];

  for (const opp of opportunities) {
    const revision = opp.updatedAt ? new Date(opp.updatedAt).getTime() : Date.now();
    const ownerData = opp.owner
      ? { id: opp.owner.id, name: opp.owner.name, image: opp.owner.image }
      : { id: opp.ownerId, name: 'Unknown', image: null };
    const departmentId = opp.owner?.departments?.[0]?.id ?? null;

    // 1. Goods Ready Date projection (requires pipeline.information & SALES_DEAL)
    if (
      opp.goodsReadyDate &&
      actor.hasInformationPerm &&
      (!opp.type || opp.type === 'SALES_DEAL')
    ) {
      const readyDate = new Date(opp.goodsReadyDate);
      if (readyDate >= rangeStart && readyDate <= rangeEnd) {
        const nextDay = addDays(readyDate, 1);
        const canEdit = !['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(opp.status) && canUserEditOpportunityDate(actor, opp, 'DEAL_GOODS_READY', actor.hasInformationPerm);
        items.push({
          id: `deal:${opp.id}:goodsReadyDate`,
          sourceType: 'DEAL_GOODS_READY',
          sourceId: opp.id,
          title: opp.topic,
          accountName: opp.company?.displayName || opp.company?.name || null,
          startAt: readyDate.toISOString(),
          endAt: nextDay.toISOString(),
          allDay: true,
          color: '#10B981', // Emerald
          tagIds: [],
          owner: ownerData,
          departmentId,
          departmentName: opp.owner?.departments?.[0]?.name ?? null,
          canEdit,
          revision,
        });
      }
    }

    // 2. Goods Loading Date projection (requires pipeline.information & SALES_DEAL)
    if (
      opp.goodsLoadingDate &&
      actor.hasInformationPerm &&
      (!opp.type || opp.type === 'SALES_DEAL')
    ) {
      const loadingDate = new Date(opp.goodsLoadingDate);
      if (loadingDate >= rangeStart && loadingDate <= rangeEnd) {
        const nextDay = addDays(loadingDate, 1);
        const canEdit = !['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(opp.status) && canUserEditOpportunityDate(actor, opp, 'DEAL_GOODS_LOADING', actor.hasInformationPerm);
        items.push({
          id: `deal:${opp.id}:goodsLoadingDate`,
          sourceType: 'DEAL_GOODS_LOADING',
          sourceId: opp.id,
          title: opp.topic,
          accountName: opp.company?.displayName || opp.company?.name || null,
          startAt: loadingDate.toISOString(),
          endAt: nextDay.toISOString(),
          allDay: true,
          color: '#0EA5E9', // Sky blue
          tagIds: [],
          owner: ownerData,
          departmentId,
          departmentName: opp.owner?.departments?.[0]?.name ?? null,
          canEdit,
          revision,
        });
      }
    }

  }

  // Stable sort: all-day items first, then by start time, then stable id
  items.sort((a, b) => {
    if (a.allDay !== b.allDay) {
      return a.allDay ? -1 : 1;
    }
    const timeDiff = new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });

  return items;
}

export interface CalendarEventWithRelations {
  id: string;
  name: string;
  detail?: string | null;
  departmentId: string;
  department: { id: string; name: string };
  ownerId: string;
  owner: {
    id: string;
    name: string | null;
    image: string | null;
  };
  allDay: boolean;
  startAt: Date;
  endAt: Date;
  timezone: string;
  repeatFrequency: CalendarRepeatFrequency;
  repeatUntil: Date | null;
  revision: number;
  tags: {
    tagId: string;
    tag: { id: string; name: string; color: string };
  }[];
  recipients?: {
    userId: string;
    reminderEnabled: boolean;
    reminderOffsetMins: number;
  }[];
  exceptions: {
    occurrenceStartAt: Date;
    overrideStartAt: Date | null;
    overrideEndAt: Date | null;
    isCancelled: boolean;
  }[];
}

/**
 * Pure helper to project calendar events and expand recurrences into CalendarMonthItemDTO.
 */
export function projectCalendarEventsToCalendarItems(
  events: CalendarEventWithRelations[],
  actor: CalendarActor,
  rangeStart: Date,
  rangeEnd: Date
): CalendarMonthItemDTO[] {
  const items: CalendarMonthItemDTO[] = [];

  for (const event of events) {
    const isOwner = actor.id === event.ownerId;
    const isDeptManager =
      actor.role === 'MANAGEMENT' &&
      actor.departments.includes(event.department.name);
    const canEdit = actor.role === 'ADMIN' || isDeptManager || isOwner;
    const tagColor = event.tags?.[0]?.tag?.color || '#3B82F6';
    const tagIds = event.tags?.map((t) => t.tagId) || [];

    if (event.repeatFrequency === 'NONE') {
      const start = new Date(event.startAt);
      const end = new Date(event.endAt);
      if (start <= rangeEnd && end >= rangeStart) {
        items.push({
          id: event.id,
          sourceType: 'EVENT',
          sourceId: event.id,
          title: event.name,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          allDay: event.allDay,
          color: tagColor,
          tagIds,
          owner: {
            id: event.owner.id,
            name: event.owner.name,
            image: event.owner.image,
          },
          departmentId: event.departmentId,
          departmentName: event.department.name,
          tags: event.tags.map(({ tag }) => tag),
          canEdit,
          revision: event.revision,
        });
      }
    } else {
      // Recurring series expansion
      const occurrences = expandEventOccurrences(
        {
          id: event.id,
          name: event.name,
          startAt: new Date(event.startAt),
          endAt: new Date(event.endAt),
          allDay: event.allDay,
          repeatFrequency: event.repeatFrequency,
          repeatUntil: event.repeatUntil ? new Date(event.repeatUntil) : null,
          exceptions: event.exceptions.map((exc) => ({
            eventId: event.id,
            occurrenceStartAt: new Date(exc.occurrenceStartAt),
            overrideStartAt: exc.overrideStartAt ? new Date(exc.overrideStartAt) : null,
            overrideEndAt: exc.overrideEndAt ? new Date(exc.overrideEndAt) : null,
            isCancelled: exc.isCancelled,
          })),
        },
        {
          rangeStart,
          rangeEnd,
        }
      );

      for (const occ of occurrences) {
        items.push({
          id: occ.occurrenceId,
          sourceType: 'EVENT',
          sourceId: event.id,
          title: event.name,
          startAt: occ.startAt.toISOString(),
          endAt: occ.endAt.toISOString(),
          allDay: occ.allDay,
          color: tagColor,
          tagIds,
          owner: {
            id: event.owner.id,
            name: event.owner.name,
            image: event.owner.image,
          },
          departmentId: event.departmentId,
          departmentName: event.department.name,
          tags: event.tags.map(({ tag }) => tag),
          canEdit,
          revision: event.revision,
        });
      }
    }
  }

  return items;
}

/**
 * Server query fetching the authoritative 42-day month snapshot for the given actor.
 */
export async function getCalendarMonthSnapshot(
  year: number,
  month: number, // 1-12
  actor: CalendarActor
): Promise<CalendarMonthSnapshotDTO> {
  const queryStartedAt = performance.now();
  const monthIndex = month - 1;
  const { rangeStart, rangeEnd } = getGridRangeForMonth(year, monthIndex, 0);

  const accessWhere = getOpportunityAccessWhere({
    id: actor.id,
    name: actor.name,
    role: actor.role,
    departments: actor.departments,
  });

  const dateOrFilters: Record<string, unknown>[] = [
    { goodsReadyDate: { gte: rangeStart, lte: rangeEnd } },
    { goodsLoadingDate: { gte: rangeStart, lte: rangeEnd } },
  ];

  // Construct CalendarEvent access condition
  let eventAccessWhere: Record<string, unknown> = {};
  if (actor.role === 'ADMIN') {
    eventAccessWhere = {};
  } else if (actor.role === 'MANAGEMENT') {
    eventAccessWhere = {
      OR: [
        { department: { name: { in: actor.departments } } },
        { ownerId: actor.id },
        { recipients: { some: { userId: actor.id } } },
      ],
    };
  } else {
    // GENERAL role: owner or recipient only
    eventAccessWhere = {
      OR: [
        { ownerId: actor.id },
        { recipients: { some: { userId: actor.id } } },
      ],
    };
  }

  // Parallel query: Opportunities + CalendarEvents
  const [opportunities, calendarEvents] = await Promise.all([
    actor.hasInformationPerm ? prisma.opportunity.findMany({
      where: {
        AND: [
          accessWhere,
          { OR: dateOrFilters },
        ],
      },
      select: {
        id: true,
        topic: true,
        goodsReadyDate: true,
        goodsLoadingDate: true,
        type: true,
        status: true,
        ownerId: true,
        owner: {
          select: {
            id: true,
            name: true,
            image: true,
            departments: { select: { id: true, name: true } },
          },
        },
        teamMembers: {
          select: {
            id: true,
            departments: { select: { name: true } },
          },
        },
        company: { select: { name: true, displayName: true } },
        updatedAt: true,
      },
    }) : Promise.resolve([] as OpportunityProjectionRow[]),
    prisma.calendarEvent.findMany({
      where: {
        AND: [
          eventAccessWhere,
          {
            OR: [
              // Non-recurring intersecting range
              {
                repeatFrequency: 'NONE',
                startAt: { lte: rangeEnd },
                endAt: { gte: rangeStart },
              },
              // Recurring series that may intersect range
              {
                repeatFrequency: { not: 'NONE' },
                startAt: { lte: rangeEnd },
                OR: [
                  { repeatUntil: null },
                  { repeatUntil: { gte: rangeStart } },
                ],
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
        ownerId: true,
        owner: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        allDay: true,
        startAt: true,
        endAt: true,
        timezone: true,
        repeatFrequency: true,
        repeatUntil: true,
        revision: true,
        tags: {
          select: {
            tagId: true,
            tag: { select: { id: true, name: true, color: true } },
          },
        },
        exceptions: {
          select: {
            occurrenceStartAt: true,
            overrideStartAt: true,
            overrideEndAt: true,
            isCancelled: true,
          },
        },
      },
    }),
  ]);

  const dealItems = projectOpportunityDatesToCalendarItems(
    opportunities,
    actor,
    rangeStart,
    rangeEnd
  );

  const eventItems = projectCalendarEventsToCalendarItems(
    calendarEvents as CalendarEventWithRelations[],
    actor,
    rangeStart,
    rangeEnd
  );

  const allItems = [...dealItems, ...eventItems];

  // Stable sort: all-day items first, then by start time, then stable id
  allItems.sort((a, b) => {
    if (a.allDay !== b.allDay) {
      return a.allDay ? -1 : 1;
    }
    const timeDiff = new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });

  const snapshot = {
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    year,
    month,
    items: allItems,
    generatedAt: new Date().toISOString(),
  };
  const durationMs = Math.round(performance.now() - queryStartedAt);
  if (durationMs > 750) {
    console.warn('[CALENDAR-PERF] Slow month snapshot', { year, month, durationMs, itemCount: allItems.length });
  }
  return snapshot;
}
