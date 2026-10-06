'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import { parseHolidayDates, parseUserLeaves, toggleHolidayDate, toggleUserLeave, type UserLeaveDTO } from '@/lib/holiday-config';
import { dispatchCalendarHolidaysUpdate } from '@/lib/calendar/calendar-realtime-server';
import { notifyPipelineAudience } from '@/lib/pipeline-security';
import { dispatchDashboardInvalidation } from '@/lib/dashboard/dashboard-realtime-server';

export type { UserLeaveDTO } from '@/lib/holiday-config';

const CONFIG_ID = 'company_day_offs';

/**
 * Returns list of company holiday dates formatted as "YYYY-MM-DD"
 */
export async function getCompanyHolidaysAction(): Promise<string[]> {
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { id: CONFIG_ID },
      select: { googleRefreshToken: true },
    });

    if (!row?.googleRefreshToken) {
      return [];
    }

    return parseHolidayDates(row.googleRefreshToken);
  } catch (err) {
    console.error('Failed to get company holidays:', err);
    return [];
  }
}

/**
 * Toggles a company holiday date on/off
 */
export async function toggleCompanyHolidayAction(
  dateStr: string
): Promise<{ success: boolean; holidays: string[] }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Validate format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD.');
  }

  const updatedHolidays = await updateConfigWithSerializableRetry(CONFIG_ID, (value) =>
    toggleHolidayDate(parseHolidayDates(value), dateStr)
  );

  // Broadcast realtime updates across Calendar, Pipeline, and Leaderboard
  void dispatchCalendarHolidaysUpdate({ action: 'HOLIDAYS_UPDATED' });
  void notifyPipelineAudience({ action: 'HOLIDAYS_UPDATED' });
  void dispatchDashboardInvalidation({ resources: ['leaderboard'] });

  return {
    success: true,
    holidays: updatedHolidays,
  };
}

const LEAVES_CONFIG_ID = 'user_leaves';

/**
 * Returns list of all user leaves across the system
 */
export async function getUserLeavesAction(): Promise<UserLeaveDTO[]> {
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { id: LEAVES_CONFIG_ID },
      select: { googleRefreshToken: true },
    });

    if (!row?.googleRefreshToken) {
      return [];
    }

    return parseUserLeaves(row.googleRefreshToken);
  } catch (err) {
    console.error('Failed to get user leaves:', err);
    return [];
  }
}

/**
 * Toggles current user's leave for a specific date
 */
export async function toggleUserLeaveAction(
  dateStr: string
): Promise<{ success: boolean; leaves: UserLeaveDTO[] }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD.');
  }

  const userId = session.user.id;
  const userName = session.user.name || 'Anonymous User';
  const userImage = session.user.image || null;

  const updatedLeaves = await updateConfigWithSerializableRetry(LEAVES_CONFIG_ID, (value) =>
    toggleUserLeave(parseUserLeaves(value), {
        userId,
        userName,
        userImage,
        dateStr,
      })
  );

  // Broadcast realtime updates across Calendar, Pipeline, and Leaderboard
  void dispatchCalendarHolidaysUpdate({ action: 'LEAVES_UPDATED' });
  void notifyPipelineAudience({ action: 'LEAVES_UPDATED' });
  void dispatchDashboardInvalidation({ resources: ['leaderboard'] });

  return {
    success: true,
    leaves: updatedLeaves,
  };
}

async function updateConfigWithSerializableRetry<T>(
  id: string,
  update: (currentValue: string | null) => T[],
): Promise<T[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.systemConfig.findUnique({
          where: { id },
          select: { googleRefreshToken: true },
        });
        const next = update(current?.googleRefreshToken ?? null);
        await tx.systemConfig.upsert({
          where: { id },
          update: { googleRefreshToken: JSON.stringify(next) },
          create: { id, googleRefreshToken: JSON.stringify(next) },
        });
        return next;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) {
        throw error;
      }
    }
  }
  throw new Error('Unable to update calendar configuration');
}
