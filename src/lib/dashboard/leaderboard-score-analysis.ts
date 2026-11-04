import { HEAVY_LOAD_SHIELD_MIN_ACTIVE_CARDS } from '@/lib/business-days';
import type {
  DailyCardHealthRecord,
  LeaderboardItem,
  RedCardMiniDetail,
} from './leaderboard-types';

export type AnalysisTone = 'excellent' | 'good' | 'shield' | 'warning' | 'danger' | 'neutral';

export interface TodayScoreSnapshotTh {
  dateLabelTh: string;
  tone: AnalysisTone;
  statusBadgeTh: string;
  headlineTh: string;
  detailsTh: string[];
  redCardsToday: RedCardMiniDetail[];
}

export interface CategoryMathBreakdownTh {
  id: 'card_health' | 'discipline_ltc' | 'velocity_teamwork' | 'outcome';
  titleTh: string;
  earnedXp: number;
  maxXp: number;
  tone: AnalysisTone;
  summaryTextTh: string;
  formulaText: string;
  bulletsTh: string[];
}

export interface ActionableQuickWinTh {
  id: string;
  potentialXpLabel: string;
  titleTh: string;
  detailTh: string;
}

export interface UserLeaderboardAnalysisTh {
  userId: string;
  userName: string;
  rank: number;
  totalXp: number;
  maxTotalXp: 100;
  periodLabelTh: string;
  isCurrentPeriod: boolean;
  portfolioSummaryTh: string;
  executiveSummaryTh: string;
  todaySnapshot: TodayScoreSnapshotTh;
  categories: CategoryMathBreakdownTh[];
  quickWins: ActionableQuickWinTh[];
}

export interface BuildAnalysisOptions {
  month: number;
  year: number;
  currentMonth?: number;
  currentYear?: number;
  departmentName?: string;
}

const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

function fmt(val: number | undefined, decimals = 1): string {
  const safe = Number.isFinite(val) ? (val as number) : 0;
  const rounded =
    decimals === 0 ? Math.round(safe) : Math.round(safe * Math.pow(10, decimals)) / Math.pow(10, decimals);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals);
}

function fmtBaht(val: number | undefined): string {
  const safe = Math.max(0, Math.round(val ?? 0));
  return `฿${safe.toLocaleString('en-US')}`;
}

function formatDateKeyTh(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  const year = Number(parts[0]);
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const mShort = THAI_MONTHS_SHORT[monthIdx] || parts[1];
  return `${day} ${mShort} ${year}`;
}

function getLatestDailyRecord(records: DailyCardHealthRecord[] | undefined): DailyCardHealthRecord | null {
  if (!records || records.length === 0) return null;
  let latest = records[0];
  for (const r of records) {
    if (r.dayIndex > latest.dayIndex) {
      latest = r;
    }
  }
  return latest;
}

/**
 * Pure deterministic Thai diagnostic engine (`0ms` latency, 0 API tokens, 100% exact math parity)
 * that explains both TODAY's live board state and the full 4-category 100 XP calculation in Thai.
 */
export function buildThaiLeaderboardAnalysis(
  item: LeaderboardItem,
  options: BuildAnalysisOptions
): UserLeaderboardAnalysisTh {
  const b = item.breakdown;
  const healthSummary = item.dailyHealthSummary;
  const ltcSummary = item.dailyLtcSummary;

  const monthNameTh = THAI_MONTHS_FULL[options.month - 1] || `${options.month}`;
  const isCurrentPeriod =
    options.currentMonth !== undefined && options.currentYear !== undefined
      ? options.month === options.currentMonth && options.year === options.currentYear
      : true;
  const periodLabelTh = `${monthNameTh} ${options.year}`;

  const totalXp = b?.totalXp ?? item.score ?? 0;
  const cardHealthXp = b?.cardHealthTotalXp ?? 0;
  const disciplineXp = b?.disciplineTotalXp ?? (b ? b.cleanBonusXp + (b.ltcXp ?? 0) : 0);
  const velocityXp = b?.velocityXp ?? 0;
  const outcomeXp = b?.outcomeXp ?? 0;

  const salesPct = b?.salesWeightPct ?? 100;
  const taskPct = b?.taskWeightPct ?? 0;
  const ownedSales = b?.ownedSalesDeals ?? 0;
  const ownedTasks = b?.ownedInternalTasks ?? 0;
  const collabCards = b?.collaboratorDeals ?? 0;
  const activeCardsNow = healthSummary?.currentActiveCards ?? b?.activeCards ?? 0;
  const redCardsNow = healthSummary?.currentRedCards ?? b?.redCards ?? 0;
  const hasSalesAccess = b?.hasSalesAccess ?? true;

  const isPureTaskOrCollabTrack =
    !hasSalesAccess ||
    (ownedSales === 0 &&
      (ownedTasks > 0 || collabCards > 0) &&
      (b?.ltcXp ?? 0) === 0 &&
      (b?.cleanBonusXp ?? 0) > 10);

  const portfolioParts: string[] = [];
  if (ownedSales > 0) portfolioParts.push(`การ์ดขาย ${ownedSales} ใบ`);
  if (ownedTasks > 0) portfolioParts.push(`งานภายใน ${ownedTasks} ใบ`);
  if (collabCards > 0) portfolioParts.push(`ช่วยงานเพื่อน ${collabCards} ใบ`);
  const portfolioCardsDesc =
    portfolioParts.length > 0 ? portfolioParts.join(' • ') : 'ยังไม่มีการ์ดที่มีความเคลื่อนไหวในเดือนนี้';

  const portfolioSummaryTh = `งานที่ดูแลเดือนนี้: ${portfolioCardsDesc}`;

  // ============================================================================
  // SECTION A: TODAY'S LIVE BOARD & SCORE SNAPSHOT (สถานะคะแนนของวันปัจจุบัน)
  // ============================================================================
  const latestDay = getLatestDailyRecord(healthSummary?.dailyRecords);
  const dateLabelTh = latestDay
    ? isCurrentPeriod
      ? `สถานะบอร์ดของคุณวันนี้ (${formatDateKeyTh(latestDay.dateKey)})`
      : `สถานะบอร์ดวันสุดท้ายของเดือน (${formatDateKeyTh(latestDay.dateKey)})`
    : isCurrentPeriod
    ? `สถานะบอร์ดของคุณวันนี้ (${periodLabelTh})`
    : `สรุปสถานะประจำเดือน (${periodLabelTh})`;

  let todayTone: AnalysisTone = 'neutral';
  let todayBadgeTh = 'รอข้อมูลการ์ด';
  let todayHeadlineTh = '';
  const todayDetailsTh: string[] = [];
  const redCardsToday: RedCardMiniDetail[] = latestDay?.redCardDetails ?? [];

  const cleanDayUnitXp = !hasSalesAccess || isPureTaskOrCollabTrack ? 1.0 : 0.5;
  const shieldDayUnitXp = !hasSalesAccess || isPureTaskOrCollabTrack ? 0.5 : 0.25;

  if (latestDay?.isOffDay) {
    todayTone = 'neutral';
    const reasonTh =
      latestDay.offDayReason === 'Leave'
        ? 'วันลาหยุดส่วนตัว'
        : latestDay.offDayReason === 'Sunday'
        ? 'วันอาทิตย์'
        : 'วันหยุดบริษัท';
    todayBadgeTh = `หยุดเดินเวลา (${reasonTh})`;
    todayHeadlineTh = `วันนี้เป็น${reasonTh} ระบบหยุดเดินเวลาการ์ดให้ทั้งหมด 100%`;
    todayDetailsTh.push(
      `การ์ดที่เปิดอยู่ ${activeCardsNow} ใบ จะไม่เดินเวลาและไม่กลายเป็นสีแดงในวันนี้ พักผ่อนได้สบายใจครับ`
    );
  } else if (activeCardsNow > 0 || (latestDay && latestDay.activeCardsCount > 0)) {
    const dayActive = latestDay?.activeCardsCount ?? activeCardsNow;
    const dayRed = latestDay?.redCardsCount ?? redCardsNow;

    if (dayRed === 0) {
      todayTone = 'excellent';
      todayBadgeTh = `เขียวทุกใบ 0/${dayActive} ใบ`;
      todayHeadlineTh = `ยอดเยี่ยม! วันนี้การ์ดทั้ง ${dayActive} ใบในมือคุณไม่หลุดเป็นสีแดงเลย (Daily 0/${dayActive})`;
      todayDetailsTh.push(
        isCurrentPeriod
          ? `เคลียร์การ์ดสีเหลือง (Yellow Card) ให้ทันภายในวันนี้ก่อน 08:00 น. วันทำงานถัดไป จะได้รับแต้มวินัยเต็ม +${fmt(cleanDayUnitXp)} XP`
          : `ดูแลบอร์ดไร้การ์ดแดงตลอดวันทำงาน ได้รับแต้มวินัยรายวัน +${fmt(cleanDayUnitXp)} XP`
      );
      todayDetailsTh.push(
        `ยิ่งแต่ละวันไม่มีการ์ดแดง เปอร์เซ็นต์สีแดงสะสมของทั้งเดือนก็จะยิ่งลดลง ช่วยดึงแต้ม "สุขภาพการ์ด" ให้สูงขึ้นด้วย`
      );
    } else if (dayActive >= HEAVY_LOAD_SHIELD_MIN_ACTIVE_CARDS && dayRed === 1) {
      todayTone = 'shield';
      todayBadgeTh = `เกราะช่วยเซฟ 1/${dayActive} ใบ`;
      todayHeadlineTh = `คุณถือการ์ดเยอะถึง ${dayActive} ใบ และหลุดเป็นสีแดงเพียง 1 ใบ — ได้รับเกราะคุ้มครองคนทำงานหนัก (Heavy-Load Shield)!`;
      todayDetailsTh.push(
        `ปกติถ้ามีการ์ดแดงเกิดขึ้นในวันทำงาน (ตั้งแต่ 08:00 น.) จะไม่ได้แต้มวินัยรายวัน แต่เพราะคุณรับผิดชอบการ์ดตั้งแต่ ${HEAVY_LOAD_SHIELD_MIN_ACTIVE_CARDS} ใบขึ้นไป ระบบจึงยังช่วยเซฟแต้มให้ครึ่งหนึ่ง (+${fmt(shieldDayUnitXp)} XP)`
      );
      if (isCurrentPeriod) {
        todayDetailsTh.push(
          `คำแนะนำ: รีบเข้าไปอัปเดตเคลียร์การ์ดแดงให้เร็วที่สุด เพื่อหยุดชั่วโมงสีแดงสะสมไม่ให้วิ่งเพิ่มในเวลาทำงาน 08:00–17:00 น.`
        );
      }
    } else {
      todayTone = dayRed >= 3 ? 'danger' : 'warning';
      todayBadgeTh = `มีการ์ดแดง ${dayRed}/${dayActive} ใบ`;
      todayHeadlineTh = `วันนี้มีการ์ดขึ้นสีแดง ${dayRed} ใบ จากการ์ดที่ถือทั้งหมด ${dayActive} ใบ (Daily ${dayRed}/${dayActive})`;
      todayDetailsTh.push(
        `การ์ดจะเตือนเป็นสีเหลือง (Yellow Card) ตลอดทั้งวันก่อนถึงกำหนด และจะตัดเป็นสีแดงตอน 08:00 น. ของวันทำงานถัดไป โดยคิดชั่วโมงสีแดงตามเวลาทำงานจริงจนกว่าจะเคลียร์`
      );
      if (isCurrentPeriod) {
        if (dayActive >= HEAVY_LOAD_SHIELD_MIN_ACTIVE_CARDS && dayRed > 1) {
          todayDetailsTh.push(
            `แนะนำให้รีบเข้าไปอัปเดตความคืบหน้าหรือลงนัด Due Date ทันทีเพื่อหยุดชั่วโมงสีแดงสะสมวันนี้ และอย่าลืมเคลียร์การ์ดสีเหลืองใบอื่นก่อน 08:00 น. วันทำงานถัดไป`
          );
        } else {
          todayDetailsTh.push(
            `แนะนำให้รีบเข้าไปอัปเดตความคืบหน้าหรือลงวันนัดหมาย (Due Date) ทันที เพื่อหยุดชั่วโมงสีแดงสะสม (08:00–17:00 น.) ไม่ให้กระทบคะแนนสุขภาพการ์ดเพิ่ม`
          );
        }
      }
    }
  } else if (b?.isCollaboratorCardHealth) {
    todayTone = 'good';
    todayBadgeTh = `ผู้ช่วยทีม (${b.teammate27hAssistsCount ?? 0} ใบ)`;
    todayHeadlineTh = `คุณไม่ได้ถือการ์ดเป็นชื่อตัวเอง แต่ได้รับคะแนนจากการเข้าไปช่วยดูแลการ์ดของเพื่อนในทีม (${b.teammate27hAssistsCount ?? 0} ใบ)`;
    todayDetailsTh.push(
      `ระบบคิดคะแนนสุขภาพการ์ดให้จากความสะอาดของการ์ดเพื่อนที่คุณเข้าไปช่วยอัปเดต (ได้สูงสุดถึง 25.5 XP)`
    );
  } else {
    todayTone = 'neutral';
    todayBadgeTh = 'ถือการ์ด 0 ใบ (Daily 0/0)';
    todayHeadlineTh = `ตอนนี้ยังไม่มีการ์ดงานที่เปิดในชื่อของคุณ (Daily 0/0)`;
    todayDetailsTh.push(
      `เมื่อยังไม่ได้ถือการ์ด ระบบจึงยังไม่เริ่มคิดคะแนนหมวดสุขภาพการ์ด — สามารถเริ่มสร้างการ์ดงานใหม่ หรือเข้าไปช่วยอัปเดตงานในการ์ดเพื่อนตั้งแต่ 3 ใบขึ้นไปเพื่อเริ่มเก็บแต้มได้ทันที`
    );
  }

  if (hasSalesAccess && ltcSummary && ltcSummary.totalWorkingDays > 0) {
    const pendingLtc = ltcSummary.currentLtcCount ?? 0;
    if (pendingLtc === 0) {
      todayDetailsTh.push(
        `ปุ่มลูกค้าห่างหาย (LTC) ของทีมตอนนี้: เคลียร์หมดเหลือ 0 รายแล้ว! (ถ้าเป็น 0 รายตอน 17:00 น. ทุกคนในทีมได้โบนัสเพิ่มคนละ +0.1 XP)`
      );
    } else {
      todayDetailsTh.push(
        `ปุ่มลูกค้าห่างหาย (LTC) ของทีมตอนนี้: มีรอติดตามอยู่ ${pendingLtc} ราย (กดดึงมาทักดูแลได้แต้มส่วนตัวสูงสุดใบละ +2 XP และถ้าทีมช่วยกันเคลียร์หมดก่อน 17:00 น. ได้โบนัสยกทีม +0.1 XP)`
      );
    }
  }

  // ============================================================================
  // SECTION B: 4-CATEGORY PLAIN-THAI EXPLANATION (อธิบายที่มาคะแนนทั้ง 4 หมวดแบบเข้าใจง่าย)
  // ============================================================================
  const totalCardHrs = healthSummary?.totalCardHours ?? 0;
  const totalRedHrs = healthSummary?.totalRedCardHours ?? b?.redHours ?? 0;
  const avgRedRate = b?.redRate ?? healthSummary?.avgMonthlyRedRate ?? 0;
  const hasCardExposure =
    activeCardsNow > 0 || totalCardHrs > 0 || Boolean(b?.isCollaboratorCardHealth);

  // 1. Card Health (Max 30 XP)
  let healthSummaryText = '';
  let healthFormula = '';
  const healthBullets: string[] = [];
  let healthTone: AnalysisTone = 'neutral';

  if (!hasCardExposure) {
    healthSummaryText = 'เดือนนี้ยังไม่ได้ถือการ์ดงาน จึงยังไม่มีคะแนนในหมวดนี้ (0 / 30 XP)';
    healthFormula = 'ชั่วโมงถือครองการ์ด = 0 ชม. → 0.0 / 30 XP';
    healthBullets.push(
      'เริ่มสร้างการ์ดงานที่คุณดูแลเอง หรือเข้าไปเป็น Team Member ช่วยอัปเดตงานในการ์ดเพื่อนครบ 3 ใบ เพื่อปลดล็อกคะแนนหมวดนี้ (เต็ม 30 แต้ม)'
    );
  } else if (b?.isCollaboratorCardHealth) {
    const assists = b.teammate27hAssistsCount ?? 0;
    const rawPts =
      avgRedRate === 0
        ? 30
        : avgRedRate <= 5
        ? 30 - 1.6 * avgRedRate
        : Math.max(0, 22 - 2.2 * (avgRedRate - 5));
    healthTone = cardHealthXp >= 20 ? 'excellent' : 'good';
    healthSummaryText = `ช่วยดูแลการ์ดเพื่อน ${assists} ใบ (มีการ์ดค้างแดงสะสม ${fmt(avgRedRate)}%) → ได้ ${fmt(cardHealthXp)} / 30 XP`;
    healthFormula = `เพดานผู้ช่วยล้วน 85% × ${fmt(rawPts)} (จากอัตราแดง ${fmt(avgRedRate)}%) = ${fmt(cardHealthXp)} / 30 XP`;
    healthBullets.push(
      `แม้ไม่ได้เป็นเจ้าของหลักของการ์ด แต่คุณช่วยอัปเดตงานจริงในการ์ดเพื่อนถึง ${assists} ใบ ระบบจึงคำนวณแต้มสุขภาพการ์ดให้ (สูงสุด 25.5 แต้ม)`
    );
    healthBullets.push(
      `การ์ดเพื่อนที่คุณช่วยดูแลมีการ์ดแดงสะสมเพียง ${fmt(avgRedRate)}% จึงได้รับคะแนน ${fmt(cardHealthXp)} แต้ม`
    );
  } else if (avgRedRate === 0) {
    healthTone = 'excellent';
    healthSummaryText = `เดือนนี้ดูแลการ์ดสะอาดมาก ไม่ปล่อยการ์ดค้างสีแดงเลย (Accu 0%) → ได้เต็ม 30 / 30 XP`;
    healthFormula = `Red Rate 0.0% (ไร้การ์ดแดงทั้งเดือน) → ได้เต็ม 30.0 / 30 XP`;
    healthBullets.push(
      `ป้าย Accu 0% แปลว่า ตลอดเดือนนี้การ์ดทุกใบของคุณได้รับการอัปเดตทันเวลา ไม่เคยปล่อยค้างเป็นสีแดงเลย`
    );
    healthBullets.push(
      `ได้รับคะแนนเต็มเพดาน 30 แต้ม — แค่คอยอัปเดตหรือลงนัดหมาย (Due Date) ตามรอบแบบนี้ต่อไปก็ได้แต้มเต็มต่อเนื่องครับ`
    );
  } else if (avgRedRate <= 5) {
    healthTone = 'excellent';
    healthSummaryText = `เดือนนี้มีการ์ดค้างสีแดงสะสมแค่ ${fmt(avgRedRate)}% (อยู่ในเกณฑ์ดีมาก ไม่เกิน 5%) → ได้ ${fmt(cardHealthXp)} / 30 XP`;
    healthFormula = `อยู่ในเป้าหมาย ≤ 5%: 30 - (1.6 × ${fmt(avgRedRate)}) = ${fmt(cardHealthXp)} / 30 XP`;
    healthBullets.push(
      totalCardHrs > 0
        ? `ป้าย Accu ${fmt(avgRedRate)}% คืออะไร?: คิดจากเวลาทำงานของการ์ดทุกใบที่คุณถือรวมกันทั้งเดือน (${fmt(totalCardHrs, 0)} ชม.) มีช่วงที่เผลอปล่อยให้การ์ดขึ้นสีแดงรวม ${fmt(totalRedHrs)} ชม. หรือคิดเป็นแค่ ${fmt(avgRedRate)}%`
        : `ป้าย Accu ${fmt(avgRedRate)}% คือสัดส่วนเวลาที่การ์ดขึ้นสีแดงเทียบกับเวลาทำงานของการ์ดทั้งหมดในเดือนนี้`
    );
    healthBullets.push(
      `ทำไมได้ ${fmt(cardHealthXp)} แต้ม?: เกณฑ์ของบริษัทคือ ถ้าไม่แดงเลยได้ 30 แต้ม และถ้ามีหลุดแดงบ้างแต่ไม่เกิน 5% จะถือว่าดูแลดีมาก (ได้อยู่ในช่วง 22–30 แต้ม)`
    );
    healthBullets.push(
      `วิธีดึงแต้มให้เข้าใกล้ 30 เต็ม: แค่ดูแลการ์ดที่มีอยู่ (${activeCardsNow} ใบ) ไม่ให้ขึ้นสีแดงในวันต่อๆ ไป เปอร์เซ็นต์สีแดงสะสมจะค่อยๆ ลดลง และแต้มจะขยับขึ้นเองอัตโนมัติครับ`
    );
  } else if (avgRedRate < 15) {
    healthTone = avgRedRate < 10 ? 'warning' : 'danger';
    const over5 = Math.max(0, avgRedRate - 5);
    healthSummaryText = `เดือนนี้ปล่อยการ์ดค้างสีแดงไป ${fmt(avgRedRate)}% ของเวลาทั้งหมด (เกินเกณฑ์ปลอดภัย 5% มาเล็กน้อย) → ได้ ${fmt(cardHealthXp)} / 30 XP`;
    healthFormula = `ช่วง 5%–15%: 22 - 2.2 × (${fmt(avgRedRate)} - 5.0) = 22 - ${fmt(2.2 * over5)} = ${fmt(cardHealthXp)} / 30 XP`;
    healthBullets.push(
      totalCardHrs > 0
        ? `ป้าย Accu ${fmt(avgRedRate)}% มาจากไหน?: เดือนนี้การ์ดทุกใบของคุณมีเวลาทำงานรวมกัน ${fmt(totalCardHrs, 0)} ชม. และมีช่วงที่ปล่อยให้การ์ดค้างเป็นสีแดงรวม ${fmt(totalRedHrs)} ชม. (คิดเป็น ${fmt(avgRedRate)}% ของเวลาทั้งหมด)`
        : `ป้าย Accu ${fmt(avgRedRate)}% คือสัดส่วนเวลาที่การ์ดในมือถูกปล่อยค้างเป็นสีแดงสะสมในเดือนนี้`
    );
    healthBullets.push(
      `ทำไมได้ ${fmt(cardHealthXp)} แต้ม?: กติกาง่ายๆ คือ ถ้าคุมสีแดงไม่ให้เกิน 5% จะได้ 22–30 แต้ม • แต่พอเกิน 5% มาอยู่ที่ ${fmt(avgRedRate)}% แต้มจึงลดลงมาเหลือ ${fmt(cardHealthXp)} แต้ม (และถ้าปล่อยแดงถึง 15% จะเหลือ 0 แต้ม)`
    );
    healthBullets.push(
      `วิธีดึงแต้มกลับขึ้นมาง่ายๆ: ไม่ต้องกังวลว่าแต้มเสียแล้วเสียเลย! แค่ดูแลการ์ดทั้ง ${activeCardsNow} ใบในมือไม่ให้ขึ้นสีแดงในวันถัดๆ ไป ค่าเฉลี่ยสีแดง (${fmt(avgRedRate)}%) จะค่อยๆ ลดลงเอง แล้วคะแนนจะขยับเพิ่มขึ้นอัตโนมัติทุกวันครับ`
    );
  } else {
    healthTone = 'danger';
    healthSummaryText = `เดือนนี้ปล่อยการ์ดค้างสีแดงสะสมสูงถึง ${fmt(avgRedRate)}% (เกินเพดาน 15%) → ตอนนี้จึงได้ 0 / 30 XP`;
    healthFormula = `Red Rate ${fmt(avgRedRate)}% (≥ 15.0% เพดานสูงสุด) → 0.0 / 30 XP`;
    healthBullets.push(
      totalCardHrs > 0
        ? `ป้าย Accu ${fmt(avgRedRate)}% มาจากไหน?: การ์ดในมือถูกปล่อยค้างเป็นสีแดงรวมถึง ${fmt(totalRedHrs)} ชม. จากเวลาทำงานของการ์ดทั้งหมด ${fmt(totalCardHrs, 0)} ชม. ในเดือนนี้`
        : `ป้าย Accu ${fmt(avgRedRate)}% แปลว่ามีการ์ดค้างสีแดงสะสมเกินกว่า 15% ของเวลาทำงานทั้งหมด`
    );
    healthBullets.push(
      `ทำไมได้ 0 แต้ม?: ตามกติกา หากปล่อยการ์ดค้างสีแดงสะสมตั้งแต่ 15% ขึ้นไป คะแนนหมวดนี้จะถูกตัดเหลือ 0 แต้มชั่วคราว`
    );
    healthBullets.push(
      `วิธีแก้เพื่อดึงแต้มกลับมา: รีบเข้าไปอัปเดตความคืบหน้าในการ์ดสีแดง (หรือลงวันนัด Due Date ถ้ารอลูกค้า / ปิด Lost ถ้าลูกค้ายกเลิกจริง) เพื่อหยุดเวลาสีแดงทันที พอดูแลต่อเนื่องจนค่าสะสมลดต่ำกว่า 15% แต้มจะกลับคืนมาครับ`
    );
  }

  // 2. Discipline & LTC Care (Max 20 XP)
  const cleanDays = healthSummary?.cleanDaysCount ?? b?.cleanBonusDays ?? 0;
  const graceDays = healthSummary?.graceDaysCount ?? b?.graceDaysCount ?? 0;
  const cleanBonusXp = b?.cleanBonusXp ?? 0;
  const indivLtcXp = b?.individualLtcXp ?? 0;
  const indivLtcCards = b?.individualLtcCardsCount ?? 0;
  const teamZeroXp = b?.teamZeroLtcXp ?? ltcSummary?.teamZeroBonusXp ?? 0;
  const cleanLtcDays = ltcSummary?.cleanLtcDaysCount ?? 0;
  const totalWorkDays = healthSummary?.totalWorkingDays ?? ltcSummary?.totalWorkingDays ?? 0;

  let discSummaryText = '';
  let discFormula = '';
  const discBullets: string[] = [];
  const discTone: AnalysisTone =
    disciplineXp >= 15 ? 'excellent' : disciplineXp >= 8 ? 'good' : disciplineXp > 0 ? 'warning' : 'neutral';

  if (!hasSalesAccess || isPureTaskOrCollabTrack) {
    discSummaryText = `ดูแลบอร์ดสะอาดไร้การ์ดแดงสะสม ${cleanDays} วันทำงาน → ได้ ${fmt(disciplineXp)} / 20 XP`;
    discFormula = `สายงานภายใน (เพดาน 20 XP): (${cleanDays} วันสะอาด × 1.0) + (${graceDays} วันเกราะ × 0.5) = ${fmt(disciplineXp)} / 20 XP`;
    discBullets.push(
      `เพราะคุณดูแลสายงานภายใน (ไม่ได้ถือดีลขาย) ระบบจึงยกคะแนนหมวดนี้ให้วัดจาก "วันบอร์ดสะอาด" เต็มทั้ง 20 แต้มเลย (ได้วันละ +1 แต้ม)`
    );
    discBullets.push(
      `เดือนนี้ดูแลบอร์ดไร้การ์ดแดงตลอดวันทำงานได้ ${cleanDays} วัน${totalWorkDays > 0 ? ` จาก ${totalWorkDays} วันทำงาน` : ''}${graceDays > 0 ? ` และได้เกราะช่วยเซฟคนถือการ์ดเยอะ (≥${HEAVY_LOAD_SHIELD_MIN_ACTIVE_CARDS} ใบ) อีก ${graceDays} วัน` : ''}`
    );
  } else {
    discSummaryText = `ได้จาก วันบอร์ดสะอาด (${fmt(cleanBonusXp)}/10) + ทักลูกค้าเก่า LTC (${fmt(indivLtcXp)}/8) + ช่วยทีมเคลียร์ LTC (${fmt(teamZeroXp)}/2)`;
    discFormula = `Clean/Shield ${fmt(cleanBonusXp)}/10 + LTC รายบุคคล ${fmt(indivLtcXp)}/8 + LTC ทีม ${fmt(teamZeroXp)}/2 = ${fmt(disciplineXp)} / 20 XP`;
    discBullets.push(
      `1) ดูแลบอร์ดไร้การ์ดแดงตลอดวันทำงาน (ได้ ${fmt(cleanBonusXp)} จาก 10 แต้ม): เคลียร์การ์ดสีเหลืองให้ทันก่อน 08:00 น. วันทำงานถัดไป จะได้วันละ +0.5 แต้ม — เดือนนี้ทำได้ ${cleanDays} วัน${
        graceDays > 0
          ? ` และได้เกราะช่วยเซฟคนถือการ์ดเยอะ (≥${HEAVY_LOAD_SHIELD_MIN_ACTIVE_CARDS} ใบ) อีก ${graceDays} วัน (+${fmt(graceDays * 0.25)} แต้ม)`
          : ` (ถ้าถือการ์ด ${HEAVY_LOAD_SHIELD_MIN_ACTIVE_CARDS} ใบขึ้นไป แล้วหลุดแดงแค่ 1 ใบ ยังได้แต้มช่วยเซฟ +0.25 แต้ม/วัน)`
      }`
    );
    discBullets.push(
      `2) ทักดูแลลูกค้าเก่าจากปุ่ม LTC (ได้ ${fmt(indivLtcXp)} จาก 8 แต้ม): ดึงรายชื่อลูกค้าที่ห่างหายไปนานมาดูแล ได้สูงสุดใบละ +2 แต้ม (ทักไปคุยจริงครั้งแรกได้ +1 แต้ม และพอนัดหมายคุยต่อโดยไม่ปล่อยแดง ได้อีก +1 แต้ม) — เดือนนี้ดูแลแล้ว ${indivLtcCards} ราย`
    );
    discBullets.push(
      `3) ช่วยทีมเคลียร์ปุ่ม LTC ให้หมดก่อนเลิกงาน (ได้ ${fmt(teamZeroXp)} จาก 2 แต้ม): วันไหนที่ทีมช่วยกันดึงคิว LTC จนเหลือ 0 รายก่อน 17:00 น. ทุกคนในแผนกจะได้โบนัสคนละ +0.1 แต้ม — เดือนนี้ทำสำเร็จแล้ว ${cleanLtcDays}${totalWorkDays > 0 ? ` จาก ${totalWorkDays}` : ''} วัน`
    );
  }

  // 3. Velocity & Teamwork (Max 25 XP — v2.3 Full-Month Rolling Consistency)
  const velProgXp = b?.velocityProgressXp ?? 0;
  const velVolXp = b?.velocityVolumeXp ?? 0;
  const velCovXp = b?.velocityCoverageXp ?? 0;
  const elapsedDays = b?.elapsedWorkingDays ?? (totalWorkDays > 0 ? totalWorkDays : 20);
  const effProgDays = b?.effectiveProgressDays ?? b?.progressWorkdaysCount ?? b?.progressCardsCount ?? 0;
  const targetProgDays = Math.max(1, roundTo1(elapsedDays * 0.75));
  const progCards = b?.progressCardsCount ?? 0;
  const multiStepCards = b?.multiStepProgressCardsCount ?? 0;
  const eligCards = b?.eligibleProgressCardsCount ?? 0;
  const covPct = b?.progressCoveragePct ?? 0;
  const assistsCount = b?.teammate27hAssistsCount ?? 0;
  const assistDays = b?.teammateAssistWorkdaysCount ?? assistsCount;
  const targetAssistDays = Math.max(1, roundTo1(elapsedDays * 0.3));
  const velTeamXp = b?.velocityTeamworkXp ?? 0;
  const workedCards = b?.workedActiveCardsCount ?? 0;
  const avgCleanCards = b?.avgDailyCleanCards ?? workedCards;
  const velLoadXp = b?.velocityWorkloadXp ?? 0;
  const velExecXp = b?.velocityExecutionXp ?? 0;
  const dueFulfilled = b?.onTimeDueFulfillmentsCount ?? 0;
  const todosDone = b?.completedTodosCount ?? 0;
  const fastReplies = b?.fastRepliesCount ?? 0;
  const missedDue = b?.missedOrStalledDueCount ?? 0;
  const onTimeExecPct = b?.onTimeExecutionRatePct ?? 0;

  const velTone: AnalysisTone =
    velocityXp >= 18 ? 'excellent' : velocityXp >= 10 ? 'good' : velocityXp > 0 ? 'warning' : 'neutral';
  const velSummaryText = `วัดความสม่ำเสมอตลอดทั้งเดือน (${elapsedDays} วันทำงาน): ขยับงานทุกวัน (${fmt(velProgXp)}/12) + ช่วยเพื่อนต่อเนื่อง (${fmt(velTeamXp)}/6) + ดูแลการ์ดสะอาด (${fmt(velLoadXp)}/3) + ตรงตามนัด (${fmt(velExecXp)}/4)`;
  const velFormula = `ความคืบหน้า ${fmt(velProgXp)}/12 + ช่วยทีมต่อเนื่อง ${fmt(velTeamXp)}/6 + การ์ดสะอาดรายวัน ${fmt(velLoadXp)}/3 + ตรงเวลา ${fmt(velExecXp)}/4 = ${fmt(velocityXp)} / 25 XP`;

  const velBullets: string[] = [
    `1) ขยับงานของตัวเองสม่ำเสมอ & ทั่วถึง (ได้ ${fmt(velProgXp)} จาก 12 แต้ม): แบ่งเป็นความสม่ำเสมอรายวัน +${fmt(velVolXp)}/7 แต้ม (ทำได้ ${fmt(effProgDays)} จากเป้า ${fmt(targetProgDays)} วันทำงาน — ต้องรักษาความสม่ำเสมอ ≥75% ของวันทำงานทั้งเดือน ถ้าหยุดทำกลางเดือนแต้มจะค่อยๆ ลดลง) + ดูแลการ์ดทั่วถึง +${fmt(velCovXp)}/5 แต้ม (ขยับคืบหน้าแล้ว ${progCards}/${eligCards} ใบ หรือ ${covPct}%${
      multiStepCards > 0 ? ` • ต่อเนื่องหลายรอบ ${multiStepCards} ใบ` : ''
    })`,
    `2) ช่วยงานเพื่อนร่วมทีมอย่างต่อเนื่อง (ได้ ${fmt(velTeamXp)} จาก 6 แต้ม): วัดจากจำนวนวันทำงานที่เข้าไปช่วยพิมพ์อัปเดตจริง (+27h) หรือทำเช็กลิสต์ To-Do ≥2 ข้อในการ์ดเพื่อน — เดือนนี้ช่วยเพื่อน ${assistDays} วัน (${assistsCount} ใบ) จากเป้าหมาย ${fmt(targetAssistDays)} วันทำงาน (~2 วัน/สัปดาห์ ได้เต็ม 6 แต้ม)`,
    `3) ดูแลภาระงานให้สะอาดทุกวัน (ได้ ${fmt(velLoadXp)} จาก 3 แต้ม): คิดจากค่าเฉลี่ยการ์ดสีเขียวที่ดูแลไม่ให้ขึ้นแดงในแต่ละวันทำงาน (ใบละ +0.2 แต้ม) — เดือนนี้เฉลี่ย ${fmt(avgCleanCards)} ใบ/วัน (ถ้าปล่อยการ์ดแดงช่วงท้ายเดือน ค่าเฉลี่ยจะลดลง)`,
    `4) ทำตามนัด Due Date ตรงเวลา (ได้ ${fmt(velExecXp)} จาก 4 แต้ม): อัปเดตทันภายในวันนัดก่อนตัดแดง 08:00 น. วันถัดไป (${dueFulfilled} ครั้ง), ทำ To-Do เสร็จ (${todosDone} ข้อ), รับงานด่วน (${fastReplies} ครั้ง)${
      missedDue > 0
        ? ` • มีเลื่อนนัดซ้ำหรือเลยกำหนด ${missedDue} ครั้ง (ตรงเวลา ${onTimeExecPct}%) แนะนำให้อัปเดตตรงตามนัดครั้งถัดๆ ไปเพื่อดึงแต้มกลับขึ้นมา`
        : ' • ไม่มีการผิดนัดเลย!'
    }`,
  ];

  // 4. Dynamic Portfolio Outcome (Max 25 XP — v2.3 Active Contributor Rule)
  const totalDealsWon = b?.dealsWon ?? 0;
  const completedTasks = b?.completedInternalTasks ?? 0;
  const wonSalesCount = b?.wonSalesDealsCount ?? Math.max(0, totalDealsWon - completedTasks);
  const revenue = b?.revenue ?? 0;
  const deptRev = b?.departmentTotalRevenue ?? 0;
  const salesRaw = b?.salesOutcomeRaw ?? 0;
  const taskRaw = b?.taskOutcomeRaw ?? 0;
  const onTimeTasks = b?.onTimeInternalTasks ?? 0;
  const healthyProjects = b?.healthyActiveProjectTasksCount ?? 0;
  const overdueOpenTasks = b?.overdueOpenInternalTasksCount ?? 0;
  const openMilestones = b?.openTaskMilestoneCreditsCount ?? 0;
  const collabWon = b?.collaboratorWonDealsCount ?? 0;
  const collabWinXp = b?.collaboratorAssistWinXp ?? Math.min(ownedSales + ownedTasks === 0 ? 10 : 8, collabWon * 2);

  const revMilestonePts = revenue / 100_000;
  const revSharePts = deptRev > 0 ? (revenue / deptRev) * 10 : 0;
  const revPts = Math.min(10, Math.max(revMilestonePts, revSharePts));

  const outTone: AnalysisTone =
    outcomeXp >= 18 ? 'excellent' : outcomeXp >= 8 ? 'good' : outcomeXp > 0 ? 'warning' : 'neutral';

  let outSummaryText = '';
  let outFormula = '';
  const outBullets: string[] = [];

  if (ownedSales + ownedTasks === 0) {
    if (collabWon > 0) {
      outSummaryText = `ผู้ช่วยทีมตัวจริง: เข้าไปช่วยอัปเดตงานจริง (+27h) จนปิดดีลร่วมกับเพื่อนสำเร็จ ${collabWon} ใบ → ได้ ${fmt(outcomeXp)} / 25 XP`;
      outFormula = `โบนัสช่วยเพื่อนปิดงานสำเร็จ: ${collabWon} ใบ × 2.0 (เพดานผู้ช่วยล้วน 10 XP) = ${fmt(outcomeXp)} / 25 XP`;
      outBullets.push(
        `กติกาใหม่ที่ยุติธรรม: การมีชื่ออยู่ใน Team Members เฉยๆ จะไม่ได้คะแนนฟรี แต่คุณเข้าไปพิมพ์อัปเดตช่วยงานจริง (+27h หรือทำ To-Do ≥2 ข้อ) จนการ์ดปิดสำเร็จ จึงได้รับใบละ +2 แต้ม`
      );
    } else {
      outSummaryText = `ยังไม่มีดีล/งานในชื่อตัวเองที่ปิดสำเร็จ และยังไม่ได้เข้าไปคอมเมนต์ช่วยปิดดีลเพื่อน → ได้ 0 / 25 XP`;
      outFormula = `เจ้าของการ์ด 0 ใบ + ช่วยคอมเมนต์ปิดงาน 0 ใบ (มีแค่ชื่อใน Team Members ได้ 0 แต้ม) → 0 / 25 XP`;
      outBullets.push(
        `หมายเหตุสำคัญ: การถูกดึงชื่อเข้าการ์ดเพื่อให้มองเห็นงานเฉยๆ จะไม่นับเป็นผลงาน — ต้องเป็นเจ้าของการ์ดที่ปิดงานสำเร็จ หรือเข้าไปพิมพ์คอมเมนต์ช่วยงานจริง (+27h) จนการ์ดปิด Won เท่านั้นจึงจะได้คะแนนครับ`
      );
    }
  } else if (salesPct === 100) {
    outSummaryText = `วัดจากผลงานขายของคุณโดยตรง: ปิดดีลสำเร็จ ${wonSalesCount} ดีล + ยอดขายสะสม ${fmtBaht(revenue)}${
      collabWon > 0 ? ` + ช่วยเพื่อนปิดงานจริง ${collabWon} ดีล` : ''
    } → ได้ ${fmt(outcomeXp)} / 25 XP`;
    outFormula =
      collabWon > 0
        ? `ขาย 100% (${wonSalesCount} Won × 5 + ยอดขาย ${fmt(revPts)}/10) + โบนัสช่วยเพื่อนปิด ${fmt(collabWinXp)} = ${fmt(outcomeXp)} / 25 XP`
        : `พอร์ตขาย 100%: (ปิดดีล Won ${wonSalesCount} × 5) + คะแนนยอดขาย ${fmt(revPts)}/10 = ${fmt(outcomeXp)} / 25 XP`;
    outBullets.push(
      `1) จำนวนดีลที่ปิดขายสำเร็จ (ได้ ${Math.min(15, wonSalesCount * 5)} จาก 15 แต้ม): ปิดการขาย (Won) ได้ดีลละ +5 แต้ม — เดือนนี้ปิดสำเร็จแล้ว ${wonSalesCount} ดีล (การเข้าไปช่วยงานเพื่อนจะไม่ทำให้สัดส่วนคะแนนขายของคุณลดลงอีกต่อไป!)`
    );
    outBullets.push(
      `2) มูลค่ายอดขายสะสม (ได้ ${fmt(revPts)} จาก 10 แต้ม): เดือนนี้มียอดขายรวม ${fmtBaht(revenue)} (คิดจากทุกยอดขาย ฿100,000 ได้ 1 แต้ม หรือเทียบสัดส่วนยอดขายของแผนก ระบบเลือกค่าที่ได้เยอะกว่าให้อัตโนมัติ)`
    );
    if (collabWon > 0) {
      outBullets.push(
        `3) โบนัสช่วยเพื่อนปิดดีลจริง (+${fmt(collabWinXp)} แต้ม): คุณเข้าไปคอมเมนต์ช่วยงานจริง (+27h) ในการ์ดเพื่อนจนปิดการขายได้ ${collabWon} ดีล ได้โบนัสเสริมดีลละ +2 แต้ม`
      );
    }
  } else if (taskPct === 100) {
    const effOnTime = onTimeTasks + healthyProjects;
    const totalEval = completedTasks + overdueOpenTasks + healthyProjects;
    outSummaryText = `วัดจากงานภายในของคุณ: ส่งมอบงานไม่ล่าช้า + ปริมาณงานสำเร็จ${
      collabWon > 0 ? ` + ช่วยเพื่อนปิดงาน ${collabWon} ใบ` : ''
    } → ได้ ${fmt(outcomeXp)} / 25 XP`;
    outFormula = `งานภายใน 100% (${fmt(taskRaw)}/25)${
      collabWon > 0 ? ` + โบนัสช่วยปิดงาน ${fmt(collabWinXp)}` : ''
    } = ${fmt(outcomeXp)} / 25 XP`;
    outBullets.push(
      `1) ดูแลงานไม่ให้ล่าช้า (เต็ม 15 แต้ม): ส่งงานเสร็จทันกำหนดและดูแลโปรเจกต์ที่เปิดอยู่ไม่ให้ค้างแดงทำได้ ${effOnTime}/${totalEval} งาน`
    );
    outBullets.push(
      `2) ปริมาณงานที่ส่งมอบสำเร็จ (เต็ม 10 แต้ม): ปิดงานภายในเสร็จ ${completedTasks} งาน (ใบละ +2.5 แต้ม) และทำโปรเจกต์ระยะยาวคืบหน้า ${openMilestones} ครั้ง (+${fmt(openMilestones)} แต้ม)${
        collabWon > 0 ? ` พร้อมโบนัสช่วยเพื่อนปิดงานจริงอีก +${fmt(collabWinXp)} แต้ม` : ''
      }`
    );
  } else {
    const effOnTime = onTimeTasks + healthyProjects;
    const totalEval = completedTasks + overdueOpenTasks + healthyProjects;
    outSummaryText = `คิดตามสัดส่วนการ์ดที่คุณเป็นเจ้าของจริง (งานขาย ${salesPct}% + งานภายใน ${taskPct}%) → ได้ ${fmt(outcomeXp)} / 25 XP`;
    outFormula = `ถ่วงน้ำหนักพอร์ต: (${salesPct}% × ขาย ${fmt(salesRaw)}) + (${taskPct}% × งานภายใน ${fmt(taskRaw)})${
      collabWon > 0 ? ` + ช่วยปิดงาน ${fmt(collabWinXp)}` : ''
    } = ${fmt(outcomeXp)} / 25 XP`;
    outBullets.push(
      `เนื่องจากคุณเป็นเจ้าของการ์ดขาย (${ownedSales} ใบ) และงานภายใน (${ownedTasks} ใบ) ระบบจึงแบ่งสัดส่วนเป็น งานขาย ${salesPct}% และงานภายใน ${taskPct}% (ไม่นับการ์ดที่มีแค่ชื่อติดเฉยๆ)`
    );
    outBullets.push(
      `ผลงานฝั่งงานขาย (${fmt(salesRaw)} / 25): ปิดดีลสำเร็จ ${wonSalesCount} ดีล (+${Math.min(15, wonSalesCount * 5)} แต้ม) และทำยอดขายรวม ${fmtBaht(revenue)} (+${fmt(revPts)} แต้ม)`
    );
    outBullets.push(
      `ผลงานฝั่งงานภายใน (${fmt(taskRaw)} / 25): ดูแลงานไม่ติดแดง ${effOnTime}/${totalEval} งาน, ปิดงานเสร็จ ${completedTasks} งาน${
        collabWon > 0 ? ` และได้โบนัสคอมเมนต์ช่วยเพื่อนปิดงานสำเร็จอีก +${fmt(collabWinXp)} แต้ม` : ''
      }`
    );
  }

  const categories: CategoryMathBreakdownTh[] = [
    {
      id: 'card_health',
      titleTh: '1. สุขภาพการ์ด — ไม่ปล่อยงานค้างแดง (Card Health)',
      earnedXp: cardHealthXp,
      maxXp: 30,
      tone: healthTone,
      summaryTextTh: healthSummaryText,
      formulaText: healthFormula,
      bulletsTh: healthBullets,
    },
    {
      id: 'discipline_ltc',
      titleTh: '2. วินัยรายวัน & ดูแลลูกค้าเก่า LTC (Discipline)',
      earnedXp: disciplineXp,
      maxXp: 20,
      tone: discTone,
      summaryTextTh: discSummaryText,
      formulaText: discFormula,
      bulletsTh: discBullets,
    },
    {
      id: 'velocity_teamwork',
      titleTh: '3. งานคืบหน้า ช่วยเพื่อน & ความขยัน (Velocity)',
      earnedXp: velocityXp,
      maxXp: 25,
      tone: velTone,
      summaryTextTh: velSummaryText,
      formulaText: velFormula,
      bulletsTh: velBullets,
    },
    {
      id: 'outcome',
      titleTh: '4. ผลลัพธ์ความสำเร็จของงาน (Outcome)',
      earnedXp: outcomeXp,
      maxXp: 25,
      tone: outTone,
      summaryTextTh: outSummaryText,
      formulaText: outFormula,
      bulletsTh: outBullets,
    },
  ];

  // ============================================================================
  // SECTION C: PRIORITIZED QUICK WINS (คำแนะนำเก็บแต้มเพิ่มทันที)
  // ============================================================================
  const quickWins: ActionableQuickWinTh[] = [];

  if (isCurrentPeriod && redCardsNow > 0) {
    quickWins.push({
      id: 'clear_red_cards',
      potentialXpLabel: `หยุดชั่วโมงแดงทันที`,
      titleTh: `รีบอัปเดตเคลียร์การ์ดสีแดง ${redCardsNow} ใบเพื่อหยุดชั่วโมงสีแดงสะสม`,
      detailTh:
        activeCardsNow >= HEAVY_LOAD_SHIELD_MIN_ACTIVE_CARDS && redCardsNow > 1
          ? `เข้าไปพิมพ์อัปเดตงานหรือลงวันนัดหมาย (Due Date) ทันทีเพื่อหยุดนาฬิกาสีแดง (08:00–17:00 น.) และเคลียร์การ์ดสีเหลืองใบอื่นก่อน 08:00 น. พรุ่งนี้เพื่อรับแต้มวินัยวันถัดไป`
          : `เข้าไปพิมพ์อัปเดตติดตามงาน หรือลงวันนัดหมาย (Due Date) ทันทีเพื่อหยุดชั่วโมงสีแดงไม่ให้วิ่งเพิ่ม และเคลียร์การ์ดสีเหลืองให้ทันก่อน 08:00 น. วันทำงานถัดไป`,
    });
  }

  if (hasSalesAccess && !isPureTaskOrCollabTrack && indivLtcXp < 8) {
    const remainingLtcXp = roundTo1(8 - indivLtcXp);
    const cardsNeeded = Math.ceil(remainingLtcXp / 2);
    quickWins.push({
      id: 'ltc_care',
      potentialXpLabel: `เก็บเพิ่มได้อีก +${fmt(remainingLtcXp)} XP`,
      titleTh: `กดดึงลูกค้าเก่าจากปุ่ม LTC มาทักดูแลอีก ${cardsNeeded} ราย (รายละ +2 XP)`,
      detailTh: `ส่งข้อความทักติดตามจริงครั้งแรกได้ +1 XP และพอลูกค้าตอบกลับหรือลงวันนัดคุยต่อโดยไม่ปล่อยแดง ได้เพิ่มอีก +1 XP`,
    });
  }

  if (velTeamXp < 6) {
    const remainingTeamXp = roundTo1(6 - velTeamXp);
    const daysNeeded = Math.max(1, Math.ceil(targetAssistDays - assistDays));
    quickWins.push({
      id: 'teamwork_assist',
      potentialXpLabel: `เก็บเพิ่มได้อีก +${fmt(remainingTeamXp)} XP`,
      titleTh: `เข้าไปช่วยอัปเดตงานในการ์ดเพื่อนเพิ่มอีก ${daysNeeded} วันทำงาน (~2 วัน/สัปดาห์)`,
      detailTh: `พิมพ์คอมเมนต์อัปเดตงานจริง (+27h) หรือทำเช็กลิสต์ To-Do ≥2 ข้อในการ์ดเพื่อนอย่างสม่ำเสมอ เพื่อรับแต้ม Teamwork เต็ม 6 XP และถ้าการ์ดนั้นปิด Won ได้โบนัสเพิ่มอีก +2 XP`,
    });
  }

  if (velProgXp < 12) {
    const remainingProgXp = roundTo1(12 - velProgXp);
    const targetCardsFor75 = Math.ceil(Math.max(3, eligCards) * 0.75);
    const moreFor75 = Math.max(1, targetCardsFor75 - progCards);
    quickWins.push({
      id: 'card_progress',
      potentialXpLabel: `เก็บเพิ่มได้อีก +${fmt(remainingProgXp)} XP`,
      titleTh:
        velCovXp < 5 && eligCards > 0
          ? `ขยับงานในการ์ดให้คืบหน้าสม่ำเสมอทุกวัน (ดูแลเพิ่มอีก ${moreFor75} ใบให้ครบ 75%)`
          : `รักษาวินัยขยับงานในการ์ดตัวเองอย่างสม่ำเสมอทุกวัน (≥75% ของวันทำงาน)`,
      detailTh: `ระบบคิดคะแนนความสม่ำเสมอตลอดทั้งเดือน — ยิ่งขยับงานให้ได้ป้ายดาว ★ หรือส่งข้อความติดตามจริง (+27h) ทุกวัน คะแนนจะยิ่งสูงและไม่ลดลงช่วงท้ายเดือน`,
    });
  }

  if (velExecXp < 4) {
    const remainingExecXp = roundTo1(4 - velExecXp);
    quickWins.push({
      id: 'ontime_execution',
      potentialXpLabel: `เก็บเพิ่มได้อีก +${fmt(remainingExecXp)} XP`,
      titleTh: `อัปเดตงานให้ทันภายในวันนัด Due Date (Yellow Card) และเคลียร์เช็กลิสต์ To-Do อย่างสม่ำเสมอ`,
      detailTh:
        missedDue > 0
          ? `เดือนนี้มีการเลื่อนนัดซ้ำหรืออัปเดตเลยกำหนด ${missedDue} ครั้ง — เพียงอัปเดตงานภายในวันนัดก่อนตัดแดง 08:00 น. วันถัดไป สัดส่วนความตรงเวลาจะดีดกลับขึ้นทันที`
          : `ทำได้ง่ายๆ จากการอัปเดตงานภายในวันนัด Due Date, ติ๊กเสร็จเช็กลิสต์ To-Do, หรือกดรับงานด่วนในแต่ละวันทำงาน`,
    });
  }

  const executiveSummaryTh = `${item.name} อยู่อันดับที่ #${item.rank} ด้วยคะแนนรวม ${fmt(totalXp)} / 100 XP (Health ${fmt(cardHealthXp)} + Discipline ${fmt(disciplineXp)} + Velocity ${fmt(velocityXp)} + Outcome ${fmt(outcomeXp)})`;

  return {
    userId: item.userId,
    userName: item.name,
    rank: item.rank,
    totalXp,
    maxTotalXp: 100,
    periodLabelTh,
    isCurrentPeriod,
    portfolioSummaryTh,
    executiveSummaryTh,
    todaySnapshot: {
      dateLabelTh,
      tone: todayTone,
      statusBadgeTh: todayBadgeTh,
      headlineTh: todayHeadlineTh,
      detailsTh: todayDetailsTh,
      redCardsToday,
    },
    categories,
    quickWins: quickWins.slice(0, 4),
  };
}

function roundTo1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Pure RBAC helper:
 * - Managers (`MANAGEMENT` / `ADMIN`, `canAnalyseAll === true`) can inspect `Analyse` for EVERY rep in the department.
 * - General users (`GENERAL`, `canAnalyseAll === false`) can ONLY inspect `Analyse` for themselves (`item.isCurrentUser === true`).
 */
export function canUserInspectAnalyseTarget(
  item: Pick<LeaderboardItem, 'isCurrentUser'> | null | undefined,
  canAnalyseAll?: boolean
): boolean {
  if (!item) return false;
  if (canAnalyseAll) return true;
  return Boolean(item.isCurrentUser);
}

export interface DepartmentMemberMatrixRowTh {
  userId: string;
  name: string;
  image?: string | null;
  rank: number;
  isCurrentUser?: boolean;
  activeCardsToday: number;
  redCardsToday: number;
  accuRedRate: number;
  healthXp: number;
  disciplineXp: number;
  velocityXp: number;
  outcomeXp: number;
  totalXp: number;
  statusTone: AnalysisTone;
  statusShortTh: string;
}

export interface DepartmentManagerAlertTh {
  id: string;
  tone: AnalysisTone;
  userId?: string;
  userName?: string;
  badgeTh: string;
  titleTh: string;
  detailTh: string;
}

export interface DepartmentTeamAnalysisTh {
  departmentName: string;
  periodLabelTh: string;
  isCurrentPeriod: boolean;
  memberCount: number;
  avgTotalXp: number;
  totalActiveCardsToday: number;
  totalRedCardsToday: number;
  todayBoardRedPct: number;
  pendingLtcCount: number;
  cleanLtcDaysCount: number;
  totalLtcWorkingDays: number;
  hasSalesAccess: boolean;
  totalWonSalesDeals: number;
  totalDepartmentRevenue: number;
  totalCompletedTasks: number;
  boardTone: AnalysisTone;
  headlineTh: string;
  summaryBulletsTh: string[];
  managerAlerts: DepartmentManagerAlertTh[];
  memberRows: DepartmentMemberMatrixRowTh[];
}

/**
 * Pure deterministic Department Team Summary builder (`0ms` latency, 0 API tokens)
 * exclusively for `MANAGEMENT` and `ADMIN` roles to oversee everyone in the department at once.
 */
export function buildThaiDepartmentAnalysis(
  items: LeaderboardItem[],
  options: BuildAnalysisOptions & { hasSalesAccess?: boolean }
): DepartmentTeamAnalysisTh {
  const monthNameTh = THAI_MONTHS_FULL[options.month - 1] || `${options.month}`;
  const isCurrentPeriod =
    options.currentMonth !== undefined && options.currentYear !== undefined
      ? options.month === options.currentMonth && options.year === options.currentYear
      : true;
  const periodLabelTh = `${monthNameTh} ${options.year}`;
  const departmentName = options.departmentName || 'แผนก';

  let sumXp = 0;
  let totalActiveCardsToday = 0;
  let totalRedCardsToday = 0;
  let totalWonSalesDeals = 0;
  let totalCompletedTasks = 0;
  let maxDeptRevenueSeen = 0;
  let sumIndividualRevenue = 0;

  const firstLtc = items.find((i) => i.dailyLtcSummary)?.dailyLtcSummary;
  const pendingLtcCount = firstLtc?.currentLtcCount ?? 0;
  const cleanLtcDaysCount = firstLtc?.cleanLtcDaysCount ?? 0;
  const totalLtcWorkingDays = firstLtc?.totalWorkingDays ?? 0;
  const hasSalesAccess =
    options.hasSalesAccess ?? items.some((i) => i.breakdown?.hasSalesAccess !== false);

  const memberRows: DepartmentMemberMatrixRowTh[] = items.map((item) => {
    const b = item.breakdown;
    const hs = item.dailyHealthSummary;
    const latestDay = getLatestDailyRecord(hs?.dailyRecords);

    const activeToday = latestDay?.activeCardsCount ?? hs?.currentActiveCards ?? b?.activeCards ?? 0;
    const redToday = latestDay?.redCardsCount ?? hs?.currentRedCards ?? b?.redCards ?? 0;
    const accuRedRate = b?.redRate ?? hs?.avgMonthlyRedRate ?? 0;

    const healthXp = b?.cardHealthTotalXp ?? 0;
    const disciplineXp = b?.disciplineTotalXp ?? (b ? b.cleanBonusXp + (b.ltcXp ?? 0) : 0);
    const velocityXp = b?.velocityXp ?? 0;
    const outcomeXp = b?.outcomeXp ?? 0;
    const totalXp = b?.totalXp ?? item.score ?? 0;

    const completedTasks = b?.completedInternalTasks ?? 0;
    const wonSales = Math.max(0, (b?.dealsWon ?? 0) - completedTasks);
    const rev = b?.revenue ?? 0;

    sumXp += totalXp;
    totalActiveCardsToday += activeToday;
    totalRedCardsToday += redToday;
    totalWonSalesDeals += wonSales;
    totalCompletedTasks += completedTasks;
    sumIndividualRevenue += rev;
    if ((b?.departmentTotalRevenue ?? 0) > maxDeptRevenueSeen) {
      maxDeptRevenueSeen = b!.departmentTotalRevenue!;
    }

    let statusTone: AnalysisTone = 'neutral';
    let statusShortTh = '0/0 ใบ';
    if (latestDay?.isOffDay) {
      statusTone = 'neutral';
      statusShortTh = latestDay.offDayReason === 'Leave' ? 'ลาหยุด' : 'วันหยุด';
    } else if (activeToday > 0) {
      if (redToday === 0) {
        statusTone = 'excellent';
        statusShortTh = `สะอาด 0/${activeToday}`;
      } else if (activeToday >= HEAVY_LOAD_SHIELD_MIN_ACTIVE_CARDS && redToday === 1) {
        statusTone = 'shield';
        statusShortTh = `เกราะ 1/${activeToday}`;
      } else {
        statusTone = redToday >= 3 ? 'danger' : 'warning';
        statusShortTh = `แดง ${redToday}/${activeToday}`;
      }
    } else if (b?.isCollaboratorCardHealth) {
      statusTone = 'good';
      statusShortTh = `ช่วยทีม ${b.teammate27hAssistsCount ?? 0}C`;
    }

    return {
      userId: item.userId,
      name: item.name,
      image: item.image,
      rank: item.rank,
      isCurrentUser: item.isCurrentUser,
      activeCardsToday: activeToday,
      redCardsToday: redToday,
      accuRedRate,
      healthXp,
      disciplineXp,
      velocityXp,
      outcomeXp,
      totalXp,
      statusTone,
      statusShortTh,
    };
  });

  const memberCount = items.length;
  const avgTotalXp = memberCount > 0 ? roundTo1(sumXp / memberCount) : 0;
  const todayBoardRedPct =
    totalActiveCardsToday > 0
      ? roundTo1((totalRedCardsToday / totalActiveCardsToday) * 100)
      : 0;
  const totalDepartmentRevenue = Math.max(maxDeptRevenueSeen, sumIndividualRevenue);

  const boardTone: AnalysisTone =
    totalActiveCardsToday === 0
      ? 'neutral'
      : totalRedCardsToday === 0
      ? 'excellent'
      : todayBoardRedPct <= 5
      ? 'good'
      : todayBoardRedPct < 15
      ? 'warning'
      : 'danger';

  const headlineTh =
    totalRedCardsToday === 0
      ? `บอร์ดรวมของ ${departmentName} วันนี้สะอาด 100% (ถือการ์ดรวม ${totalActiveCardsToday} ใบ ไร้การ์ดแดง!)`
      : `บอร์ดรวมของ ${departmentName} วันนี้มีการ์ดแดงค้าง ${totalRedCardsToday} ใบ จากการ์ดที่เปิดอยู่ทั้งหมด ${totalActiveCardsToday} ใบ (${fmt(todayBoardRedPct)}%)`;

  const summaryBulletsTh: string[] = [
    `คะแนนเฉลี่ยของสมาชิกทั้ง ${memberCount} คนในเดือนนี้อยู่ที่ ${fmt(avgTotalXp)} / 100 XP`,
  ];

  if (hasSalesAccess) {
    summaryBulletsTh.push(
      `ผลงานขายรวมของแผนก: ปิดดีล Won สะสม ${totalWonSalesDeals} ดีล มูลค่ารวม ${fmtBaht(totalDepartmentRevenue)}${
        totalCompletedTasks > 0 ? ` และปิดงานภายในสำเร็จ ${totalCompletedTasks} งาน` : ''
      }`
    );
    if (totalLtcWorkingDays > 0) {
      summaryBulletsTh.push(
        `สถานะลูกค้าห่างหาย (LTC): วันนี้ค้างอยู่ ${pendingLtcCount} ราย • เคลียร์เป็น 0 ตอน 17:00 น. สำเร็จแล้ว ${cleanLtcDaysCount}/${totalLtcWorkingDays} วันทำงาน`
      );
    }
  } else {
    summaryBulletsTh.push(
      `ผลงานงานภายในของแผนก: ปิดงานสำเร็จสะสม ${totalCompletedTasks} งาน`
    );
  }

  // Build prioritized Manager Coaching Alerts
  const managerAlerts: DepartmentManagerAlertTh[] = [];

  const membersWithRed = [...memberRows]
    .filter((r) => r.redCardsToday > 0)
    .sort((a, b) => b.redCardsToday - a.redCardsToday);

  for (const m of membersWithRed) {
    const srcItem = items.find((i) => i.userId === m.userId);
    const latestRec = getLatestDailyRecord(srcItem?.dailyHealthSummary?.dailyRecords);
    const sampleTopics = (latestRec?.redCardDetails || [])
      .slice(0, 2)
      .map((d) => d.topic)
      .join(', ');

    managerAlerts.push({
      id: `red-${m.userId}`,
      tone: m.statusTone === 'shield' ? 'shield' : m.redCardsToday >= 3 ? 'danger' : 'warning',
      userId: m.userId,
      userName: m.name,
      badgeTh: `แดง ${m.redCardsToday}/${m.activeCardsToday} ใบ`,
      titleTh: `${m.name} มีการ์ดแดงค้างวันนี้ ${m.redCardsToday} ใบ (Accu ${fmt(m.accuRedRate)}%)`,
      detailTh: sampleTopics
        ? `การ์ดที่ต้องเร่งเคลียร์เพื่อหยุดชั่วโมงสีแดง: ${sampleTopics}${
            m.redCardsToday > 2 ? ` และอีก ${m.redCardsToday - 2} ใบ` : ''
          }`
        : `แนะนำให้เข้าไปช่วยตรวจสอบและเคลียร์อัปเดตเพื่อหยุดชั่วโมงสีแดงสะสมทันที`,
    });
  }

  if (isCurrentPeriod && hasSalesAccess && pendingLtcCount > 0) {
    managerAlerts.push({
      id: 'team-ltc-pending',
      tone: 'warning',
      badgeTh: `ค้าง ${pendingLtcCount} LTC`,
      titleTh: `คิวปุ่ม LTC ของแผนกยังมีลูกค้าห่างหายค้างอยู่ ${pendingLtcCount} ราย`,
      detailTh: `มอบหมายสมาชิกดึงการ์ด LTC-* ไปทักติดตามจริง (ผู้รับผิดชอบได้รายบุคคลใบละ +2.0 XP และหากเคลียร์หมดก่อน 17:00 น. ทั้งทีมได้ +0.1 XP)`,
    });
  }

  const idleMembers = memberRows.filter((r) => {
    const src = items.find((i) => i.userId === r.userId)?.breakdown;
    return (
      r.activeCardsToday === 0 &&
      r.healthXp === 0 &&
      r.velocityXp === 0 &&
      r.outcomeXp === 0 &&
      (src?.ownedSalesDeals ?? 0) === 0 &&
      (src?.ownedInternalTasks ?? 0) === 0 &&
      (src?.collaboratorDeals ?? 0) === 0
    );
  });
  if (idleMembers.length > 0) {
    managerAlerts.push({
      id: 'idle-members',
      tone: 'neutral',
      userId: idleMembers[0].userId,
      userName: idleMembers[0].name,
      badgeTh: `${idleMembers.length} คน (0 การ์ด)`,
      titleTh: `สมาชิกที่ยังไม่มีการ์ดถือครองหรือกิจกรรมในเดือนนี้: ${idleMembers
        .map((m) => m.name)
        .join(', ')}`,
      detailTh: `สามารถมอบหมายการ์ดงานใหม่ หรือเพิ่มเป็น Team Member เข้าไปช่วยงานในการ์ดที่โหลดสูงของเพื่อนร่วมทีมเพื่อรับแต้ม Teamwork (+1.5 XP/ใบ)`,
    });
  }

  return {
    departmentName,
    periodLabelTh,
    isCurrentPeriod,
    memberCount,
    avgTotalXp,
    totalActiveCardsToday,
    totalRedCardsToday,
    todayBoardRedPct,
    pendingLtcCount,
    cleanLtcDaysCount,
    totalLtcWorkingDays,
    hasSalesAccess,
    totalWonSalesDeals,
    totalDepartmentRevenue,
    totalCompletedTasks,
    boardTone,
    headlineTh,
    summaryBulletsTh,
    managerAlerts,
    memberRows,
  };
}


