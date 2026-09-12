import 'server-only';

import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { pusherServer } from '@/lib/pusher-server';
import { CALENDAR_CHANNEL_EVENT, filterCalendarAudienceCandidates, type CalendarRealtimeAction, type CalendarRealtimeEvent } from './calendar-realtime';
import type { CalendarItemType } from './calendar-dto';

export interface CalendarAudienceSnapshot {
  ownerId: string;
  departmentId: string;
  recipientIds: string[];
}

export async function resolveCalendarAudience(snapshot: CalendarAudienceSnapshot): Promise<string[]> {
  const candidates = await prisma.user.findMany({
    where: {
      OR: [
        { id: snapshot.ownerId },
        { id: { in: snapshot.recipientIds } },
        { role: 'ADMIN' },
        { role: 'MANAGEMENT', departments: { some: { id: snapshot.departmentId } } },
      ],
    },
    select: {
      id: true,
      role: true,
      departments: {
        select: { permissions: { where: { visible: true, menuItem: { key: 'calendar' } }, select: { id: true } } },
      },
    },
  });

  return filterCalendarAudienceCandidates(candidates);
}

export function buildCalendarRealtimeEvent(input: {
  action: CalendarRealtimeAction;
  itemId: string;
  revision: number;
  mutationId?: string;
  startAt: Date;
  endAt: Date;
  sourceType?: CalendarItemType;
}): CalendarRealtimeEvent {
  return {
    schemaVersion: 1,
    eventId: randomUUID(),
    action: input.action,
    itemId: input.itemId,
    sourceType: input.sourceType ?? 'EVENT',
    revision: input.revision,
    mutationId: input.mutationId,
    affectedRange: { startAt: input.startAt.toISOString(), endAt: input.endAt.toISOString() },
  };
}

export async function filterCalendarRecipientIds(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const candidates = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: {
      id: true,
      role: true,
      departments: {
        select: { permissions: { where: { visible: true, menuItem: { key: 'calendar' } }, select: { id: true } } },
      },
    },
  });
  return filterCalendarAudienceCandidates(candidates);
}

export async function dispatchCalendarRealtimeToUsers(
  event: CalendarRealtimeEvent,
  userIds: string[],
): Promise<void> {
  try {
    const recipientIds = await filterCalendarRecipientIds(userIds);
    for (let index = 0; index < recipientIds.length; index += 90) {
      const channels = recipientIds.slice(index, index + 90).map((userId) => `private-calendar-${userId}`);
      if (channels.length > 0) await pusherServer.trigger(channels, CALENDAR_CHANNEL_EVENT, event);
    }
  } catch (error) {
    console.error('[CALENDAR-REALTIME] Deal date publish failed; Neon remains authoritative:', error);
  }
}

export async function dispatchCalendarRealtimeEvent(
  event: CalendarRealtimeEvent,
  snapshots: CalendarAudienceSnapshot[]
): Promise<void> {
  try {
    const recipientGroups = await Promise.all(snapshots.map(resolveCalendarAudience));
    const recipientIds = [...new Set(recipientGroups.flat())];
    for (let index = 0; index < recipientIds.length; index += 90) {
      const channels = recipientIds.slice(index, index + 90).map((userId) => `private-calendar-${userId}`);
      if (channels.length > 0) await pusherServer.trigger(channels, CALENDAR_CHANNEL_EVENT, event);
    }
  } catch (error) {
    console.error('[CALENDAR-REALTIME] Publish failed; Neon remains authoritative:', error);
  }
}
