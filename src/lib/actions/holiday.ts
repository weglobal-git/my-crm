'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

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

    const parsed = JSON.parse(row.googleRefreshToken);
    if (Array.isArray(parsed)) {
      return parsed.filter((d): d is string => typeof d === 'string');
    }
    return [];
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

  const currentHolidays = await getCompanyHolidaysAction();
  const set = new Set(currentHolidays);

  if (set.has(dateStr)) {
    set.delete(dateStr);
  } else {
    set.add(dateStr);
  }

  const updatedHolidays = Array.from(set).sort();

  await prisma.systemConfig.upsert({
    where: { id: CONFIG_ID },
    update: {
      googleRefreshToken: JSON.stringify(updatedHolidays),
    },
    create: {
      id: CONFIG_ID,
      googleRefreshToken: JSON.stringify(updatedHolidays),
    },
  });

  return {
    success: true,
    holidays: updatedHolidays,
  };
}

export interface UserLeaveDTO {
  userId: string;
  userName: string;
  userImage?: string | null;
  dateStr: string; // "YYYY-MM-DD"
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

    const parsed = JSON.parse(row.googleRefreshToken);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is UserLeaveDTO => Boolean(item?.userId && item?.dateStr));
    }
    return [];
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

  const currentLeaves = await getUserLeavesAction();
  const existingIndex = currentLeaves.findIndex(
    (l) => l.userId === userId && l.dateStr === dateStr
  );

  let updatedLeaves: UserLeaveDTO[];
  if (existingIndex >= 0) {
    updatedLeaves = currentLeaves.filter((_, idx) => idx !== existingIndex);
  } else {
    updatedLeaves = [
      ...currentLeaves,
      {
        userId,
        userName,
        userImage,
        dateStr,
      },
    ];
  }

  await prisma.systemConfig.upsert({
    where: { id: LEAVES_CONFIG_ID },
    update: {
      googleRefreshToken: JSON.stringify(updatedLeaves),
    },
    create: {
      id: LEAVES_CONFIG_ID,
      googleRefreshToken: JSON.stringify(updatedLeaves),
    },
  });

  return {
    success: true,
    leaves: updatedLeaves,
  };
}
