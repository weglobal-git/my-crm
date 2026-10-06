import { LtcTier } from "@/components/pipeline/ltc/ltc-types";
import {
  toBangkokDateParts,
  createBangkokDate,
  formatDateToDateKey,
  WORK_DAY_END_HOUR,
  WORK_DAY_END_MINUTE,
} from "@/lib/business-days";

/**
 * Format deal topic for LTC follow-up cards in Bangkok timezone:
 * Format: "LTC-DDMMYY" (e.g. "LTC-061026" for 6 Oct 2026)
 */
export function formatLtcDealTopic(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const year = parts.find((p) => p.type === 'year')?.value || '26';
  return `LTC-${day}${month}${year}`;
}

/**
 * Priority Tier Matrix (RFM Model):
 * - Tier 1 (VIP): Total Won >= 500k OR Purchase Count >= 3 -> Threshold 30 Days
 * - Tier 2 (Regular): Total Won 100k-500k OR Purchase Count 1-2 -> Threshold 60 Days
 * - Tier 3 (Occasional / New): Other -> Threshold 90 Days
 */
export function determineLtcTier(totalWonAmount: number, purchaseCount: number): {
  tier: LtcTier;
  thresholdDays: number;
} {
  if (totalWonAmount >= 500_000 || purchaseCount >= 3) {
    return { tier: 'TIER_1', thresholdDays: 30 };
  }
  if (
    (totalWonAmount >= 100_000 && totalWonAmount < 500_000) ||
    (purchaseCount >= 1 && purchaseCount < 3)
  ) {
    return { tier: 'TIER_2', thresholdDays: 60 };
  }
  return { tier: 'TIER_3', thresholdDays: 90 };
}

/**
 * Formats a Date to "MM/YYYY" string
 */
export function formatMonthYear(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${m}/${y}`;
}

/**
 * Calculate elapsed days since last contact using calendar days in Asia/Bangkok (UTC+7).
 * Both dates are normalized to start-of-day (00:00:00) so that:
 * 1. The days count does NOT flip mid-evening (e.g. at 20:30 or 21:00) based on millisecond differences.
 * 2. An account that becomes LTC is active from the start of the working day (08:00),
 *    giving employees the entire day (08:00 - 17:00) to clear it.
 */
export function calculateDaysSinceContact(
  latestInteractionTime: number | Date,
  asOfDate: Date = new Date()
): number {
  const asOfParts = toBangkokDateParts(asOfDate);
  const contactDate =
    typeof latestInteractionTime === 'number'
      ? new Date(latestInteractionTime)
      : latestInteractionTime;
  const contactParts = toBangkokDateParts(contactDate);

  const asOfDayStart = createBangkokDate(
    asOfParts.year,
    asOfParts.month,
    asOfParts.date,
    0,
    0,
    0,
    0
  );
  const contactDayStart = createBangkokDate(
    contactParts.year,
    contactParts.month,
    contactParts.date,
    0,
    0,
    0,
    0
  );

  return Math.max(
    0,
    Math.round(
      (asOfDayStart.getTime() - contactDayStart.getTime()) / (1000 * 60 * 60 * 24)
    )
  );
}

export interface DailyLtcCompanyDTO {
  id: string;
  createdAt: Date;
  opportunities: Array<{
    id: string;
    value: number | null;
    status: string;
    closedAt: Date | null;
    goodsLoadingDate: Date | null;
    createdAt: Date;
    activityLogs?: Array<{ createdAt: Date }>;
  }>;
}

export interface DailyLtcRecord {
  dateKey: string;
  dayIndex: number;
  dayOfWeek: number;
  isOffDay: boolean;
  offDayReason?: string;
  ltcCount: number;
  isClean: boolean;
}

export interface MonthlyLtcSummary {
  totalWorkingDays: number;
  cleanLtcDaysCount: number;
  teamLtcXp: number; // Max 20 XP
  currentLtcCount: number;
  dailyRecords: DailyLtcRecord[];
}

/**
 * Calculates daily LTC metrics across the month.
 * - Team metric: 1 XP per day when all LTC accounts are cleared (0 LTC at 17:00 end of workday).
 * - Cutoff: 17:00 Bangkok time (end of working day 08:00–17:00).
 * - Sundays and Company Holidays are auto-paused (like Clean Bonus).
 * - Max cap: 20 XP.
 */
export function calculateDailyLtcForMonth(params: {
  companies: DailyLtcCompanyDTO[];
  month: number;
  year: number;
  companyHolidays: Set<string>;
  asOfDate?: Date;
}): MonthlyLtcSummary {
  const { companies, month, year, companyHolidays, asOfDate = new Date() } = params;

  const asOfParts = toBangkokDateParts(asOfDate);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const isCurrentMonth = year === asOfParts.year && month === asOfParts.month + 1;
  const isFutureMonth =
    year > asOfParts.year || (year === asOfParts.year && month > asOfParts.month + 1);

  const maxDay = isFutureMonth
    ? 0
    : isCurrentMonth
    ? Math.min(asOfParts.date, daysInMonth)
    : daysInMonth;

  let totalWorkingDays = 0;
  let cleanLtcDaysCount = 0;
  const dailyRecords: DailyLtcRecord[] = [];

  for (let day = 1; day <= maxDay; day++) {
    // Cutoff is 17:00 Bangkok time (end of workday: 08:00–17:00)
    const isToday = isCurrentMonth && day === asOfParts.date;
    const standardWorkEnd = createBangkokDate(
      year,
      month - 1,
      day,
      WORK_DAY_END_HOUR,
      WORK_DAY_END_MINUTE,
      0,
      0
    );
    const evalDate =
      isToday && asOfDate.getTime() < standardWorkEnd.getTime()
        ? asOfDate
        : standardWorkEnd;

    const dateKey = formatDateToDateKey(evalDate);
    const dayOfWeek = toBangkokDateParts(evalDate).day;
    const isSunday = dayOfWeek === 0;
    const isCompanyHoliday = companyHolidays.has(dateKey);

    if (isSunday || isCompanyHoliday) {
      dailyRecords.push({
        dateKey,
        dayIndex: day,
        dayOfWeek,
        isOffDay: true,
        offDayReason: isSunday ? 'Sunday' : 'Dayoff',
        ltcCount: 0,
        isClean: true,
      });
      continue;
    }

    totalWorkingDays += 1;

    let ltcCountOnDay = 0;

    for (const comp of companies) {
      const compCreatedAt = new Date(comp.createdAt);
      if (compCreatedAt.getTime() > evalDate.getTime()) {
        continue;
      }

      // If company has any open deal at evalDate, it is actively in pipeline (not LTC)
      const hasOpenDealAtEvalDate = comp.opportunities.some((opp) => {
        const oppCreated = new Date(opp.createdAt);
        if (oppCreated.getTime() > evalDate.getTime()) return false;
        if (opp.status === 'OPEN') return true;
        if (opp.closedAt && new Date(opp.closedAt).getTime() > evalDate.getTime()) {
          return true;
        }
        return false;
      });

      if (hasOpenDealAtEvalDate) {
        continue;
      }

      // Check won deals up to evalDate
      const wonDealsBeforeEval = comp.opportunities.filter((opp) => {
        if (opp.status !== 'WON' && (opp.status as string) !== 'COMPLETED') return false;
        const dealDate = opp.closedAt || opp.goodsLoadingDate || opp.createdAt;
        return new Date(dealDate).getTime() <= evalDate.getTime();
      });

      const totalWonAmount = wonDealsBeforeEval.reduce((sum, d) => sum + (d.value || 0), 0);
      const purchaseCount = wonDealsBeforeEval.length;
      const { thresholdDays } = determineLtcTier(totalWonAmount, purchaseCount);

      // Latest interaction up to evalDate
      let latestInteractionTime = compCreatedAt.getTime();

      for (const opp of comp.opportunities) {
        const oppCreated = new Date(opp.createdAt);
        if (oppCreated.getTime() > evalDate.getTime()) continue;

        if (opp.activityLogs && opp.activityLogs.length > 0) {
          for (const act of opp.activityLogs) {
            const actTime = new Date(act.createdAt).getTime();
            if (actTime <= evalDate.getTime() && actTime > latestInteractionTime) {
              latestInteractionTime = actTime;
            }
          }
        }

        const milestoneTime = Math.max(
          opp.closedAt ? new Date(opp.closedAt).getTime() : 0,
          opp.goodsLoadingDate ? new Date(opp.goodsLoadingDate).getTime() : 0,
          oppCreated.getTime()
        );
        if (milestoneTime <= evalDate.getTime() && milestoneTime > latestInteractionTime) {
          latestInteractionTime = milestoneTime;
        }
      }

      const daysSinceContact = calculateDaysSinceContact(latestInteractionTime, evalDate);
      if (daysSinceContact >= thresholdDays) {
        ltcCountOnDay += 1;
      }
    }

    const isClean = ltcCountOnDay === 0;
    if (isClean) {
      cleanLtcDaysCount += 1;
    }

    dailyRecords.push({
      dateKey,
      dayIndex: day,
      dayOfWeek,
      isOffDay: false,
      ltcCount: ltcCountOnDay,
      isClean,
    });
  }

  const teamLtcXp = Math.min(20, cleanLtcDaysCount);
  const latestWorkRecord = [...dailyRecords].reverse().find((r) => !r.isOffDay);
  const currentLtcCount = latestWorkRecord ? latestWorkRecord.ltcCount : 0;

  return {
    totalWorkingDays,
    cleanLtcDaysCount,
    teamLtcXp,
    currentLtcCount,
    dailyRecords,
  };
}
