import {
  WORK_HOURS_PER_DAY,
  RED_CARD_WORKING_HOURS_THRESHOLD,
  WORK_DAY_END_HOUR,
  WORK_DAY_END_MINUTE,
  createBangkokDate,
  isDueDateFulfilled,
  isSameBangkokCalendarDay,
  parseDueDateString,
  toBangkokDateParts,
} from './business-days';

/** Legacy compatibility type (manual intent buttons removed in v2.2 Zero-Button AI Grading) */
export type UpdateIntent = 'AUTO' | 'FOLLOWUP' | 'PROGRESS';
export type UpdateTier = '0H' | '9H' | '27H';

/**
 * 4-Level Semantic Update Grade (v2.2 Zero-Button Auto-Grading):
 * - `NOTE_0H`: Shallow note, image without caption, boilerplate, duplicate, or reply -> +0h, 0 Progress XP
 * - `BRIEF_9H`: Missed call / unanswered retry / vague unproven claim -> +9h (1 workday), 0 Progress XP
 * - `OUTREACH_27H`: Real verbatim outreach message sent OR two-way contact while blocked -> +27h (3 workdays), 0 Progress XP
 * - `PROGRESS_27H`: Concrete forward deal/task milestone -> +27h (3 workdays), counts as Genuine Card Progress!
 */
export type UpdateGrade = 'NOTE_0H' | 'BRIEF_9H' | 'OUTREACH_27H' | 'PROGRESS_27H';

export type UpdateQualityReason =
  | 'IDLE'
  | 'REPLY'
  | 'TOO_SHORT'
  | 'BOILERPLATE'
  | 'DUPLICATE'
  | 'BRIEF_CHECK'
  | 'ACTIVE_OUTREACH'
  | 'VERIFIED_PROGRESS';

export interface UpdateQualityEvaluation {
  tier: UpdateTier;
  grade: UpdateGrade;
  grantedHours: number;
  isCardProgress: boolean;
  requiresAiGrading: boolean;
  meaningfulLength: number;
  minRequiredFor9h: number;
  minRequiredFor27h: number;
  similarityScore: number;
  hasProofSignal: boolean;
  reason: UpdateQualityReason;
  /** Concise English coaching text for the 0ms live input meter */
  liveHint: string;
}

export interface ParsedTierMetadata {
  hasExplicitTier: boolean;
  tier: UpdateTier;
  grade: UpdateGrade;
  /** True only when the update represents forward Card Progress (PROGRESS_27H) */
  isCardProgress: boolean;
  /** True when the update passed +27h verification (either OUTREACH_27H or PROGRESS_27H) */
  isVerified27h: boolean;
  /** Effective working hours ceiling from this comment timestamp (preserves higher prior ceiling) */
  effectiveHours: number;
  cleanContent: string;
}

export interface PreviousCommentRef {
  content: string;
  createdAt?: Date | string | null;
}

export const MIN_CHARS_FOR_9H = 12;
export const MIN_CHARS_FOR_27H = 22;
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.92;
export const DUPLICATE_RECENCY_WINDOW_DAYS = 14;
export const DUPLICATE_LOOKBACK_LIMIT = 10;

const TIER_PREFIX_REGEX =
  /^\[TIER:(0H|9H|27H)(?::(OUTREACH|PROGRESS|\d+(?:\.\d+)?))?(?::(\d+(?:\.\d+)?))?\]\s*/i;
const ATTACHMENT_TAG_REGEX = /\[ATTACHMENT:([^\]]+)\]/gi;
const MENTION_REGEX = /@[^\s<]+/g;
const URL_REGEX = /https?:\/\/\S+/gi;
const WINDOWS_PATH_REGEX = /[a-zA-Z]:\\[^\n\r]+/g;

const POLITE_AND_FILLER_REGEX =
  /(?:ครับ|ค่ะ|คะ|นะคะ|นะคับ|คับ|นะ|จ้า|จ้ะ|อยู่|เลย|แล้ว|ตอนนี้|วันนี้|เบื้องต้น|เพิ่มเติม|อีกครั้ง|อีกรอบ|มา|ให้|กับ|ทาง|เรื่อง|การ|please|pls|thanks|thankyou|krub|ka|kub)/gi;

const BOILERPLATE_PHRASES = [
  // Mixed Thai-English & real-world generic filler stems (longest first)
  'ยังไม่มีการอัพเดทเพิ่มเติม',
  'ยังไม่มีการอัปเดตเพิ่มเติม',
  'ยังไม่มีอัพเดทเพิ่มเติม',
  'ยังไม่มีอัปเดตเพิ่มเติม',
  'ยังไม่มีการupdate',
  'ยังไม่มีการupdet',
  'ยังไม่มีupdate',
  'ยังไม่มีupdet',
  'ลูกค้ายังไม่มีอัพเดท',
  'ลูกค้ายังไม่มีอัปเดต',
  'ลูกค้ายังไม่ตอบกลับ',
  'ลูกค้าไม่ตอบกลับ',
  'จะติดตามลูกค้าอีกครั้ง',
  'จะตามลูกค้าให้อีกครั้ง',
  'จะตามลูกค้าอีกครั้ง',
  'ติดตามอัพเดทอีกครั้ง',
  'ติดตามอัปเดตอีกครั้ง',
  'ติดตามลูกค้าอีกครั้ง',
  'ติดตามสถานะอีกครั้ง',
  'สอบถามลูกค้าอีกครั้ง',
  'เช็คสถานะอีกครั้ง',
  'เช็คสถานะล่าสุด',
  'updetรอลูกค้าตอบกลับ',
  'updateรอลูกค้าตอบกลับ',
  'updetรอลูกค้า',
  'updateรอลูกค้า',
  // Thai generic filler stems
  'ทักไปหาลูกค้า',
  'ทักหาลูกค้า',
  'ทักลูกค้า',
  'กำลังติดตามลูกค้า',
  'ติดตามลูกค้า',
  'ติดตามงาน',
  'ตามลูกค้า',
  'ตามงาน',
  'ตามเรื่อง',
  'ตามเอกสาร',
  'กำลังตามงาน',
  'กำลังตามเอกสาร',
  'รอลูกค้าตอบกลับ',
  'รอลูกค้าคอนเฟิร์ม',
  'รอลูกค้าตัดสินใจ',
  'รอลูกค้าแจ้ง',
  'รอลูกค้าตอบ',
  'รอลูกค้าcf',
  'รอลูกค้า',
  'รอคำตอบลูกค้า',
  'รอคำตอบ',
  'รอผล',
  'รอคอนเฟิร์ม',
  'ยังไม่ได้คำตอบ',
  'ยังไม่คืบหน้า',
  'ยังไม่มีความคืบหน้า',
  'ยังไม่มีการอัพเดท',
  'ยังไม่มีการอัปเดต',
  'ยังไม่มีอัพเดท',
  'ยังไม่มีอัปเดต',
  'กำลังดำเนินการ',
  'อยู่ระหว่างดำเนินการ',
  'กำลังประสานงาน',
  'ประสานงานต่อ',
  'สรุปอีกครั้ง',
  'อัปเดตงาน',
  'อัปเดตสถานะ',
  'อัปเดต',
  'อัพเดทงาน',
  'อัพเดทสถานะ',
  'อัพเดท',
  'โทรแล้วไม่รับสาย',
  'โทรแล้วไม่รับ',
  'โทรไปไม่รับ',
  'ลูกค้าไม่รับสาย',
  'ไม่รับสาย',
  'ติดต่อไม่ได้',
  'รับทราบ',
  'เรียบร้อย',
  'โอเค',
  // English generic filler stems
  'followingupwithcustomer',
  'followingupwithclient',
  'followupwithcustomer',
  'followupwithclient',
  'followedupwithcustomer',
  'followedupwithclient',
  'followingup',
  'followedup',
  'followup',
  'waitingforcustomerreply',
  'waitingforclientreply',
  'waitingforcustomer',
  'waitingforclient',
  'waitingforfeedback',
  'waitingforconfirmation',
  'waitingforresponse',
  'waitingforreply',
  'stillwaiting',
  'waitingonclient',
  'waitingoncustomer',
  'waiting',
  'workinprogress',
  'inprogress',
  'workingonit',
  'workingonthis',
  'stillworking',
  'checkingwithclient',
  'checkingwithcustomer',
  'checkingstatus',
  'checking',
  'statusupdate',
  'updatingstatus',
  'justupdating',
  'updated',
  'update',
  'updet',
  'callednoanswer',
  'noanswer',
  'noresponseyet',
  'noresponse',
  'noupdateyet',
  'noupdate',
  'pending',
  'noted',
  'okay',
  'done',
  'ok',
];

const DISTINCT_PERIOD_TOKEN_REGEX =
  /\d+|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?/gi;

const MISSED_CALL_OR_UNANSWERED_REGEX =
  /(?:ไม่รับสาย|สายไม่ว่าง|ติดต่อไม่ได้|โทรไม่ติด|ฝากข้อความไว้|พรุ่งนี้โทรใหม่|จะโทรตามใหม่|no\s*answer|line\s*busy|unreachable|voicemail)/i;

const CONCRETE_PROGRESS_MILESTONE_REGEX =
  /(?:นัดหมาย|เข้าพบ|ตอบรับ|ยืนยัน|คอนเฟิร์ม|ตกลง|สรุปสเปก|สรุปราคา|สรุปสูตร|ออกใบเสนอราคา|ส่งใบเสนอราคา|ส่งตัวอย่าง|ได้รับตัวอย่าง|สั่งซื้อ|เปิดบิล|มัดจำ|โอนเงิน|ชำระเงิน|ออก\s*invoice|ออก\s*pi\b|ออก\s*po\b|ยื่นคำขอ|ยื่นจด|เสร็จเรียบร้อย|จัดส่งแล้ว|โหลดตู้|บุ๊คตู้|booking|confirmed|approved|agreed|scheduled\s+a?\s*meeting|sent\s+quotation|quotation\s+sent|invoice\s+issued|sample\s+sent|completed\s+step)/i;

const ONE_WAY_OUTBOUND_ONLY_REGEX =
  /(?:ทักไปหา|ทักหา|ทักไลน์ไป|ส่งข้อความไปสอบถาม|สอบถามไปว่า|ไม่ทราบลูกค้ามี|มีได้ลองใช้สินค้า|เป็นอย่างไรบ้างครับ|เป็นอย่างไรบ้างคะ|รอลูกค้าตอบ|รอตอบกลับ|may\s+i\s+ask\s+you|following\s+up\s+on\s+our|checking\s+in\s+to\s+see\s+if)/i;

/**
 * Strips `[TIER:...]` prefix if present and returns parsed metadata + clean content.
 * Legacy comments without `[TIER:...]` default to 27h timer for historical safety, and
 * infer `isCardProgress` deterministically from content.
 */
export function parseTierPrefix(rawContent: string | null | undefined): ParsedTierMetadata {
  const raw = rawContent || '';
  const match = raw.match(TIER_PREFIX_REGEX);
  if (!match) {
    const clean = raw;
    const inferredProgress =
      !clean.startsWith('[DUE DATE:') &&
      !clean.startsWith('[URGENT_') &&
      clean.replace(/\s+/g, '').length >= MIN_CHARS_FOR_27H &&
      CONCRETE_PROGRESS_MILESTONE_REGEX.test(clean);
    return {
      hasExplicitTier: false,
      tier: '27H',
      grade: inferredProgress ? 'PROGRESS_27H' : 'OUTREACH_27H',
      isCardProgress: inferredProgress,
      isVerified27h: true,
      effectiveHours: RED_CARD_WORKING_HOURS_THRESHOLD,
      cleanContent: clean,
    };
  }

  const tier = match[1].toUpperCase() as UpdateTier;
  const subTag = match[2] ? match[2].toUpperCase() : undefined;
  const thirdNum = match[3] !== undefined ? Number.parseFloat(match[3]) : NaN;
  const secondNum =
    subTag && subTag !== 'OUTREACH' && subTag !== 'PROGRESS'
      ? Number.parseFloat(subTag)
      : NaN;
  const parsedOverride = Number.isFinite(secondNum) ? secondNum : thirdNum;

  const baseHours =
    tier === '0H'
      ? 0
      : tier === '9H'
      ? WORK_HOURS_PER_DAY
      : RED_CARD_WORKING_HOURS_THRESHOLD;

  const effectiveHours =
    tier === '0H'
      ? 0
      : Number.isFinite(parsedOverride) && parsedOverride >= baseHours
      ? Math.min(RED_CARD_WORKING_HOURS_THRESHOLD, parsedOverride)
      : baseHours;

  let grade: UpdateGrade;
  if (tier === '0H') {
    grade = 'NOTE_0H';
  } else if (tier === '9H') {
    grade = 'BRIEF_9H';
  } else if (subTag === 'OUTREACH') {
    grade = 'OUTREACH_27H';
  } else {
    // Both `[TIER:27H]` and `[TIER:27H:PROGRESS]` represent verified forward progress
    grade = 'PROGRESS_27H';
  }

  return {
    hasExplicitTier: true,
    tier,
    grade,
    isCardProgress: grade === 'PROGRESS_27H',
    isVerified27h: tier === '27H',
    effectiveHours,
    cleanContent: raw.slice(match[0].length),
  };
}

/**
 * Returns the working milliseconds ceiling granted by a comment's tier metadata.
 */
export function getCommentGrantMs(rawContent: string | null | undefined): number {
  const parsed = parseTierPrefix(rawContent);
  return Math.round(parsed.effectiveHours * 3600 * 1000);
}

/**
 * Prepends `[TIER:...]` metadata prefix to clean comment content.
 */
export function encodeTierPrefix(
  content: string,
  tierOrGrade: UpdateTier | UpdateGrade,
  effectiveHours?: number
): string {
  const stripped = parseTierPrefix(content).cleanContent.trim();

  if (tierOrGrade === '0H' || tierOrGrade === 'NOTE_0H') {
    return `[TIER:0H] ${stripped}`;
  }

  if (tierOrGrade === '9H' || tierOrGrade === 'BRIEF_9H') {
    if (
      effectiveHours !== undefined &&
      Number.isFinite(effectiveHours) &&
      effectiveHours > WORK_HOURS_PER_DAY + 0.05
    ) {
      const clamped = Math.min(
        RED_CARD_WORKING_HOURS_THRESHOLD,
        Math.round(effectiveHours * 10) / 10
      );
      return `[TIER:9H:${clamped}] ${stripped}`;
    }
    return `[TIER:9H] ${stripped}`;
  }

  if (tierOrGrade === 'OUTREACH_27H') {
    return `[TIER:27H:OUTREACH] ${stripped}`;
  }

  // `'27H'` or `'PROGRESS_27H'`
  return `[TIER:27H:PROGRESS] ${stripped}`;
}

function stripTagsAndMentions(input: string): { textWithoutMeta: string; attachmentCount: number } {
  let attachmentCount = 0;
  const withoutTier = parseTierPrefix(input).cleanContent;
  const withoutAttachments = withoutTier.replace(ATTACHMENT_TAG_REGEX, () => {
    attachmentCount += 1;
    return ' ';
  });
  const withoutMentions = withoutAttachments.replace(MENTION_REGEX, ' ');
  return { textWithoutMeta: withoutMentions, attachmentCount };
}

function stripLinksAndPaths(input: string): string {
  return input.replace(URL_REGEX, ' ').replace(WINDOWS_PATH_REGEX, ' ');
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function extractDistinctPeriodTokens(text: string): Set<string> {
  const cleaned = stripLinksAndPaths(stripTagsAndMentions(text).textWithoutMeta).toLowerCase();
  const matches = cleaned.match(DISTINCT_PERIOD_TOKEN_REGEX);
  return new Set(matches ?? []);
}

/**
 * Checks whether an update includes at least 1 concrete Proof-of-Action signal:
 * 1. Attached file/image (`[ATTACHMENT:...]` or pending file)
 * 2. Verbatim quoted message/email (`"..."`, `Dear ...`, `Hello ...`, `เรียน ...`, `สวัสดี...`) or `@mention`
 * 3. External link or shared drive path (`https://...`, `H:\...`)
 * 4. Specific numbers, reference IDs, formula codes, quantities, or amounts (`2+` digits)
 */
export function hasVerifiableProofSignal(
  rawText: string | null | undefined,
  hasPendingAttachments = false
): boolean {
  const raw = parseTierPrefix(rawText || '').cleanContent;
  if (hasPendingAttachments || /\[ATTACHMENT:/i.test(raw)) return true;
  if (/https?:\/\/\S+|[a-zA-Z]:\\/i.test(raw)) return true;
  if (/@[^\s<]{2,}/.test(raw)) return true;
  if (
    /["“”][^"“”\n]{6,}["“”]|(?:\bDear\s|\bHello\b|\bHi\s|\bGood\s+(?:morning|afternoon|day)\b|เรียน\s|สวัสดีค่ะ|สวัสดีครับ)/i.test(
      raw
    )
  ) {
    return true;
  }
  const withoutLinks = stripLinksAndPaths(stripTagsAndMentions(raw).textWithoutMeta);
  const digitCount = (withoutLinks.match(/\d/g) || []).length;
  return digitCount >= 2;
}

/**
 * Fast O(N) Sørensen–Dice character-bigram similarity in [0, 1], with smart exclusions for:
 * - Shared URLs / network drive paths (stripped before comparison)
 * - Changed dates / months / quantities / R&D formula codes (new period/revision token)
 * - Multi-line spec checklists (>= 100 chars) where >= 15 net bigrams changed
 */
export function computeTextSimilarity(a: string, b: string): number {
  const strippedA = stripLinksAndPaths(stripTagsAndMentions(a).textWithoutMeta);
  const strippedB = stripLinksAndPaths(stripTagsAndMentions(b).textWithoutMeta);
  const normA = normalizeForComparison(strippedA);
  const normB = normalizeForComparison(strippedB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  if (normA.length < 2 || normB.length < 2) return 0;

  const minLen = Math.min(normA.length, normB.length);
  const maxLen = Math.max(normA.length, normB.length);
  if ((2 * minLen) / (minLen + maxLen) < 0.5) {
    return 0;
  }

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < normA.length - 1; i++) {
    const bg = normA.slice(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < normB.length - 1; i++) {
    const bg = normB.slice(i, i + 2);
    const count = bigramsA.get(bg) || 0;
    if (count > 0) {
      bigramsA.set(bg, count - 1);
      intersection += 1;
    }
  }

  const rawSimilarity = (2 * intersection) / (normA.length - 1 + (normB.length - 1));

  if (rawSimilarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
    const tokensA = extractDistinctPeriodTokens(a);
    const tokensB = extractDistinctPeriodTokens(b);
    for (const tok of tokensA) {
      if (!tokensB.has(tok)) {
        return Math.min(rawSimilarity, 0.72);
      }
    }

    const unsharedInA = normA.length - 1 - intersection;
    if (normA.length >= 100 && unsharedInA >= 15) {
      return Math.min(rawSimilarity, 0.8);
    }
  }

  return rawSimilarity;
}

function isBoilerplateOnly(rawCleanText: string): boolean {
  const compact = normalizeForComparison(rawCleanText);
  if (!compact) return true;

  // Short ping like "ทักคุณฝนอีกครั้ง" (no digits, no message content, starts with ทักคุณ/ทักพี่/ตามคุณ)
  if (
    compact.length < 18 &&
    !/\d/.test(compact) &&
    /^(?:ทัก|ตาม)(?:คุณ|พี่|น้อง|ลูกค้า|หา)?[^\s]{1,10}(?:อีกครั้ง|อีกรอบ|ซ้ำ)?$/i.test(compact)
  ) {
    return true;
  }

  const digitCount = (compact.match(/\d/g) || []).length;
  if (digitCount >= 2 && compact.length >= MIN_CHARS_FOR_9H) {
    return false;
  }

  let residual = compact;
  for (const phrase of BOILERPLATE_PHRASES) {
    if (residual.includes(phrase)) {
      residual = residual.split(phrase).join('');
    }
  }
  residual = residual.replace(POLITE_AND_FILLER_REGEX, '');

  return residual.length < 6 && digitCount < 2;
}

/**
 * Deterministic sub-millisecond heuristic that assigns an initial grade before async AI runs
 * (and serves as a resilient fallback when no Gemini API key is configured).
 */
export function estimateDeterministicGrade(
  textWithoutMeta: string,
  meaningfulLength: number,
  hasProof: boolean
): Exclude<UpdateGrade, 'NOTE_0H'> {
  // 1. Missed call / line busy / retry tomorrow -> +9h
  if (MISSED_CALL_OR_UNANSWERED_REGEX.test(textWithoutMeta) && !CONCRETE_PROGRESS_MILESTONE_REGEX.test(textWithoutMeta)) {
    return 'BRIEF_9H';
  }

  // 2. Short or vague follow-up without verbatim proof or milestone -> +9h
  if (meaningfulLength < MIN_CHARS_FOR_27H && !hasProof) {
    return 'BRIEF_9H';
  }

  // 3. Explicit concrete milestone (meeting scheduled, quote/invoice/sample sent, order confirmed)
  // without being purely a one-way question -> PROGRESS_27H
  if (
    meaningfulLength >= MIN_CHARS_FOR_27H &&
    CONCRETE_PROGRESS_MILESTONE_REGEX.test(textWithoutMeta) &&
    !(ONE_WAY_OUTBOUND_ONLY_REGEX.test(textWithoutMeta) && /[?？]|มั้ย|ไหม|หรือยัง/.test(textWithoutMeta))
  ) {
    return 'PROGRESS_27H';
  }

  // 4. Verbatim message sent to customer OR two-way contact status check (>= 22 chars or with proof) -> OUTREACH_27H
  if (meaningfulLength >= MIN_CHARS_FOR_27H || hasProof) {
    return 'OUTREACH_27H';
  }

  return 'BRIEF_9H';
}

/**
 * Evaluates a draft or submitted comment in <0.05ms on client or server (Zero-Button v2.2).
 */
export function classifyUpdateQuality(
  rawText: string,
  options?: {
    intent?: UpdateIntent;
    isReply?: boolean;
    hasPendingAttachments?: boolean;
    previousComments?: string[];
    previousCommentsWithMeta?: PreviousCommentRef[];
    evalDate?: Date | string;
  }
): UpdateQualityEvaluation {
  const isReply = Boolean(options?.isReply);

  if (isReply) {
    return {
      tier: '0H',
      grade: 'NOTE_0H',
      grantedHours: 0,
      isCardProgress: false,
      requiresAiGrading: false,
      meaningfulLength: 0,
      minRequiredFor9h: MIN_CHARS_FOR_9H,
      minRequiredFor27h: MIN_CHARS_FOR_27H,
      similarityScore: 0,
      hasProofSignal: false,
      reason: 'REPLY',
      liveHint: 'Thread reply (+0h — replies do not reset card timer)',
    };
  }

  const { textWithoutMeta, attachmentCount } = stripTagsAndMentions(rawText || '');
  const hasAttachments = Boolean(options?.hasPendingAttachments) || attachmentCount > 0;
  const compactText = textWithoutMeta.replace(/[\s\p{P}]+/gu, '');
  const meaningfulLength = compactText.length + (hasAttachments && compactText.length >= 6 ? 4 : 0);
  const hasProof = hasVerifiableProofSignal(rawText, Boolean(options?.hasPendingAttachments));

  if (compactText.length === 0 && !hasAttachments) {
    return {
      tier: '0H',
      grade: 'NOTE_0H',
      grantedHours: 0,
      isCardProgress: false,
      requiresAiGrading: false,
      meaningfulLength: 0,
      minRequiredFor9h: MIN_CHARS_FOR_9H,
      minRequiredFor27h: MIN_CHARS_FOR_27H,
      similarityScore: 0,
      hasProofSignal: false,
      reason: 'IDLE',
      liveHint: 'Type update details — AI auto-grades +9h or +27h',
    };
  }

  if (meaningfulLength < MIN_CHARS_FOR_9H) {
    return {
      tier: '0H',
      grade: 'NOTE_0H',
      grantedHours: 0,
      isCardProgress: false,
      requiresAiGrading: false,
      meaningfulLength,
      minRequiredFor9h: MIN_CHARS_FOR_9H,
      minRequiredFor27h: MIN_CHARS_FOR_27H,
      similarityScore: 0,
      hasProofSignal: hasProof,
      reason: 'TOO_SHORT',
      liveHint: hasAttachments
        ? compactText.length === 0
          ? 'Summarize attached file in text (+0h without caption)'
          : `Add file summary ${meaningfulLength}/${MIN_CHARS_FOR_9H} (+0h without caption)`
        : `Quick note ${meaningfulLength}/${MIN_CHARS_FOR_9H} (+0h — add action & result)`,
    };
  }

  if (isBoilerplateOnly(textWithoutMeta)) {
    return {
      tier: '0H',
      grade: 'NOTE_0H',
      grantedHours: 0,
      isCardProgress: false,
      requiresAiGrading: false,
      meaningfulLength,
      minRequiredFor9h: MIN_CHARS_FOR_9H,
      minRequiredFor27h: MIN_CHARS_FOR_27H,
      similarityScore: 0,
      hasProofSignal: hasProof,
      reason: 'BOILERPLATE',
      liveHint: 'Too generic (+0h — paste message sent or state outcome)',
    };
  }

  let maxSimilarity = 0;
  const evalMs = options?.evalDate ? new Date(options.evalDate).getTime() : Date.now();
  const recencyWindowMs = DUPLICATE_RECENCY_WINDOW_DAYS * 86_400_000;

  if (options?.previousCommentsWithMeta && options.previousCommentsWithMeta.length > 0) {
    const limit = Math.min(DUPLICATE_LOOKBACK_LIMIT, options.previousCommentsWithMeta.length);
    for (let i = 0; i < limit; i++) {
      const prevObj = options.previousCommentsWithMeta[i];
      const prev = prevObj?.content;
      if (!prev || prev.startsWith('[DUE DATE:') || prev.startsWith('[URGENT_')) continue;
      if (prevObj.createdAt) {
        const prevMs = new Date(prevObj.createdAt).getTime();
        if (Number.isFinite(prevMs) && evalMs - prevMs > recencyWindowMs) {
          continue;
        }
      }
      const sim = computeTextSimilarity(textWithoutMeta, prev);
      if (sim > maxSimilarity) maxSimilarity = sim;
    }
  } else if (options?.previousComments && options.previousComments.length > 0) {
    const limit = Math.min(DUPLICATE_LOOKBACK_LIMIT, options.previousComments.length);
    for (let i = 0; i < limit; i++) {
      const prev = options.previousComments[i];
      if (!prev || prev.startsWith('[DUE DATE:') || prev.startsWith('[URGENT_')) continue;
      const sim = computeTextSimilarity(textWithoutMeta, prev);
      if (sim > maxSimilarity) maxSimilarity = sim;
    }
  }

  if (maxSimilarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
    return {
      tier: '0H',
      grade: 'NOTE_0H',
      grantedHours: 0,
      isCardProgress: false,
      requiresAiGrading: false,
      meaningfulLength,
      minRequiredFor9h: MIN_CHARS_FOR_9H,
      minRequiredFor27h: MIN_CHARS_FOR_27H,
      similarityScore: Math.round(maxSimilarity * 100) / 100,
      hasProofSignal: hasProof,
      reason: 'DUPLICATE',
      liveHint: 'Duplicate of recent update (+0h — add new progress)',
    };
  }

  const estimatedGrade = estimateDeterministicGrade(textWithoutMeta, meaningfulLength, hasProof);

  if (estimatedGrade === 'BRIEF_9H') {
    return {
      tier: '9H',
      grade: 'BRIEF_9H',
      grantedHours: WORK_HOURS_PER_DAY,
      isCardProgress: false,
      requiresAiGrading: true,
      meaningfulLength,
      minRequiredFor9h: MIN_CHARS_FOR_9H,
      minRequiredFor27h: MIN_CHARS_FOR_27H,
      similarityScore: maxSimilarity,
      hasProofSignal: hasProof,
      reason: 'BRIEF_CHECK',
      liveHint: 'AI Auto-Grade • Brief check (+9h) — add message/outcome for +27h',
    };
  }

  if (estimatedGrade === 'PROGRESS_27H') {
    return {
      tier: '27H',
      grade: 'PROGRESS_27H',
      grantedHours: RED_CARD_WORKING_HOURS_THRESHOLD,
      isCardProgress: true,
      requiresAiGrading: true,
      meaningfulLength,
      minRequiredFor9h: MIN_CHARS_FOR_9H,
      minRequiredFor27h: MIN_CHARS_FOR_27H,
      similarityScore: maxSimilarity,
      hasProofSignal: hasProof,
      reason: 'VERIFIED_PROGRESS',
      liveHint: 'AI Auto-Grade • Ready (+27h • Verifying milestone on send)',
    };
  }

  return {
    tier: '27H',
    grade: 'OUTREACH_27H',
    grantedHours: RED_CARD_WORKING_HOURS_THRESHOLD,
    isCardProgress: false,
    requiresAiGrading: true,
    meaningfulLength,
    minRequiredFor9h: MIN_CHARS_FOR_9H,
    minRequiredFor27h: MIN_CHARS_FOR_27H,
    similarityScore: maxSimilarity,
    hasProofSignal: hasProof,
    reason: 'ACTIVE_OUTREACH',
    liveHint: 'AI Auto-Grade • Ready (+27h Outreach / Progress verified on send)',
  };
}

export interface DueDateLogInput {
  id: string;
  content: string;
  createdAt: Date | string;
  userId?: string;
}

export interface DueDateTimelineAnalysis {
  postponedCountByLogId: Map<string, number>;
  /** `[DUE DATE: ...]` log IDs whose `Reason:` contains a verified `PROGRESS_27H` milestone */
  verifiedProgressDueLogIds: Set<string>;
  /** `[DUE DATE: ...]` or comment log IDs that fulfilled a prior scheduled Due Date on time (before 17:00 of due day) */
  onTimeFulfilledEvents: Array<{
    logId: string;
    userId?: string;
    fulfilledAt: Date;
    scheduledDueDate: Date;
  }>;
  /** Missed (after 17:00 of due day) or repeatedly postponed (`Postponed x2+` without verified progress) Due Date events */
  lateOrStalledEvents: Array<{
    logId: string;
    userId?: string;
    eventAt: Date;
    reason: 'LATE_FULFILLMENT' | 'POSTPONED_STALL';
  }>;
}

/**
 * Analyzes chronological top-level comments on a card to distinguish:
 * 1. Genuine consecutive Due Date stalling (`Postponed x2+`)
 * 2. Fulfilled recurring monthly/milestone schedules (resets to `x1`)
 * 3. Single-step Due Date + verified progress report inside `Reason:` (resets to `x1` + credits `PROGRESS_27H` unless AI flagged `[UNVERIFIED_PROGRESS]`)
 */
export function analyzeDueDateTimeline(
  chronologicalTopLevelLogs: DueDateLogInput[]
): DueDateTimelineAnalysis {
  const postponedCountByLogId = new Map<string, number>();
  const verifiedProgressDueLogIds = new Set<string>();
  const onTimeFulfilledEvents: DueDateTimelineAnalysis['onTimeFulfilledEvents'] = [];
  const lateOrStalledEvents: DueDateTimelineAnalysis['lateOrStalledEvents'] = [];

  let consecutiveDueSets = 0;
  let activeDueDate: Date | null = null;
  let activeDueScheduledAtMs = 0;
  const priorRealComments: PreviousCommentRef[] = [];

  const isBeforeOrOnDueWorkEnd = (dueDate: Date, eventDate: Date): boolean => {
    const dp = toBangkokDateParts(dueDate);
    const dueWorkEnd = createBangkokDate(dp.year, dp.month, dp.date, WORK_DAY_END_HOUR, WORK_DAY_END_MINUTE, 59);
    return eventDate.getTime() <= dueWorkEnd.getTime();
  };

  for (const item of chronologicalTopLevelLogs) {
    const content = item.content || '';
    if (content.startsWith('[URGENT_')) continue;
    const itemDate = new Date(item.createdAt);

    if (content.startsWith('[DUE DATE:')) {
      if (content.startsWith('[DUE DATE: Removed]')) {
        consecutiveDueSets = 0;
        activeDueDate = null;
        activeDueScheduledAtMs = 0;
        continue;
      }

      const match = content.match(/^\[DUE DATE:\s*([^\]\n]+)\](?:\s*\nReason:\s*([\s\S]*))?/i);
      const nextDueDate = match ? parseDueDateString(match[1]) : null;
      const reasonRawWithFlags = (match?.[2] || '').trim();
      const isAiFlaggedStalling = /^\[STALLING_ONLY\]/i.test(reasonRawWithFlags);
      const isAiFlaggedOutreachOnly = /^\[OUTREACH_ONLY\]/i.test(reasonRawWithFlags);
      const isAiConfirmedProgress = /^\[PROGRESS_VERIFIED\]/i.test(reasonRawWithFlags);
      const reasonRaw = reasonRawWithFlags
        .replace(/^\[(?:STALLING_ONLY|OUTREACH_ONLY|PROGRESS_VERIFIED)\]\s*/i, '')
        .trim();

      const prevRecent = priorRealComments.slice(-DUPLICATE_LOOKBACK_LIMIT).reverse();
      const reasonEval = classifyUpdateQuality(reasonRaw, {
        previousCommentsWithMeta: prevRecent,
        evalDate: itemDate,
      });

      const fulfilledPriorSchedule =
        activeDueDate !== null &&
        isDueDateFulfilled(activeDueDate, itemDate) &&
        reasonEval.tier !== '0H' &&
        !isAiFlaggedStalling;

      const hasSingleStepVerifiedProgress =
        !isAiFlaggedStalling &&
        !isAiFlaggedOutreachOnly &&
        reasonEval.tier === '27H' &&
        (isAiConfirmedProgress || reasonEval.isCardProgress || reasonEval.meaningfulLength >= 25);

      if (fulfilledPriorSchedule && activeDueDate) {
        if (isBeforeOrOnDueWorkEnd(activeDueDate, itemDate)) {
          if (itemDate.getTime() - activeDueScheduledAtMs >= 12 * 3600 * 1000) {
            onTimeFulfilledEvents.push({
              logId: item.id,
              userId: item.userId,
              fulfilledAt: itemDate,
              scheduledDueDate: activeDueDate,
            });
          }
        } else {
          lateOrStalledEvents.push({
            logId: item.id,
            userId: item.userId,
            eventAt: itemDate,
            reason: 'LATE_FULFILLMENT',
          });
        }
      }

      if (fulfilledPriorSchedule || (!isAiFlaggedStalling && reasonEval.tier === '27H')) {
        consecutiveDueSets = 1;
      } else {
        consecutiveDueSets += 1;
        if (consecutiveDueSets >= 2) {
          lateOrStalledEvents.push({
            logId: item.id,
            userId: item.userId,
            eventAt: itemDate,
            reason: 'POSTPONED_STALL',
          });
        }
      }

      postponedCountByLogId.set(item.id, consecutiveDueSets);

      if (hasSingleStepVerifiedProgress) {
        verifiedProgressDueLogIds.add(item.id);
        priorRealComments.push({ content: reasonRaw, createdAt: item.createdAt });
      } else if (fulfilledPriorSchedule && reasonRaw) {
        priorRealComments.push({ content: reasonRaw, createdAt: item.createdAt });
      }

      activeDueDate = nextDueDate;
      activeDueScheduledAtMs = itemDate.getTime();
      continue;
    }

    const parsed = parseTierPrefix(content);
    let effectiveTier: UpdateTier = parsed.tier;
    if (!parsed.hasExplicitTier) {
      const prevRecent = priorRealComments.slice(-DUPLICATE_LOOKBACK_LIMIT).reverse();
      effectiveTier = classifyUpdateQuality(parsed.cleanContent, {
        previousCommentsWithMeta: prevRecent,
        evalDate: itemDate,
      }).tier;
    }

    if (effectiveTier !== '0H') {
      consecutiveDueSets = 0;
      if (activeDueDate && isDueDateFulfilled(activeDueDate, itemDate)) {
        if (isBeforeOrOnDueWorkEnd(activeDueDate, itemDate)) {
          if (itemDate.getTime() - activeDueScheduledAtMs >= 12 * 3600 * 1000) {
            onTimeFulfilledEvents.push({
              logId: item.id,
              userId: item.userId,
              fulfilledAt: itemDate,
              scheduledDueDate: activeDueDate,
            });
          }
        } else {
          lateOrStalledEvents.push({
            logId: item.id,
            userId: item.userId,
            eventAt: itemDate,
            reason: 'LATE_FULFILLMENT',
          });
        }
        activeDueDate = null;
        activeDueScheduledAtMs = 0;
      }
      priorRealComments.push({ content: parsed.cleanContent, createdAt: item.createdAt });
    }
  }

  return {
    postponedCountByLogId,
    verifiedProgressDueLogIds,
    onTimeFulfilledEvents,
    lateOrStalledEvents,
  };
}

function getUpdateGradeRank(grade: UpdateGrade): number {
  switch (grade) {
    case 'NOTE_0H':
      return 0;
    case 'BRIEF_9H':
      return 1;
    case 'OUTREACH_27H':
      return 2;
    case 'PROGRESS_27H':
      return 3;
  }
}

export interface ResolveEditedCommentGradeParams {
  originalContent: string;
  originalCreatedAt: Date | string;
  editedCleanText: string;
  editedAt?: Date | string;
  previousCommentsWithMeta?: PreviousCommentRef[];
}

export interface ResolvedEditedCommentGrade {
  isSameDayEdit: boolean;
  canUpgradeGrade: boolean;
  allowAiRegrade: boolean;
  previousGrade: UpdateGrade;
  previousTier: UpdateTier;
  finalGrade: UpdateGrade;
  finalTier: UpdateTier;
  preservedHours?: number;
  tierCrossedZeroBoundary: boolean;
  authoritativeContent: string;
}

/**
 * Authoritative policy for editing an existing top-level comment:
 * - **Same Bangkok calendar day (`isSameDayEdit === true`)**: Employee can improve a low-grade comment
 *   immediately and receive a full grade/timer/XP upgrade (including async Gemini AI re-grading).
 * - **Cross-day edit (`isSameDayEdit === false`)**: Text edits (typos/clarifications) are saved,
 *   but the grade/timer CANNOT upgrade beyond the original day's grade (closes the retroactive
 *   backdating loophole where editing an old comment could erase past red-card hours). Gutting an
 *   old comment down to boilerplate/empty still downgrades its grade.
 */
export function resolveEditedCommentGrade(
  params: ResolveEditedCommentGradeParams
): ResolvedEditedCommentGrade {
  const editedAtDate = params.editedAt ? new Date(params.editedAt) : new Date();
  const isSameDayEdit = isSameBangkokCalendarDay(params.originalCreatedAt, editedAtDate);

  const prevParsed = parseTierPrefix(params.originalContent);
  const previousGrade: UpdateGrade = prevParsed.hasExplicitTier
    ? prevParsed.grade
    : classifyUpdateQuality(prevParsed.cleanContent, {
        isReply: false,
        previousCommentsWithMeta: params.previousCommentsWithMeta,
        evalDate: params.originalCreatedAt,
      }).grade;

  const previousTier: UpdateTier =
    previousGrade === 'NOTE_0H' ? '0H' : previousGrade === 'BRIEF_9H' ? '9H' : '27H';

  const editQuality = classifyUpdateQuality(params.editedCleanText, {
    isReply: false,
    previousCommentsWithMeta: params.previousCommentsWithMeta,
    evalDate: params.originalCreatedAt,
  });

  let finalGrade: UpdateGrade;
  let allowAiRegrade = false;

  if (isSameDayEdit) {
    finalGrade = editQuality.grade;
    allowAiRegrade = editQuality.requiresAiGrading;
  } else {
    allowAiRegrade = false;
    if (previousGrade === 'PROGRESS_27H' && editQuality.tier === '27H') {
      // Preserve AI-graded PROGRESS_27H when fixing a typo on a past day as long as +27h substance remains
      finalGrade = 'PROGRESS_27H';
    } else if (getUpdateGradeRank(editQuality.grade) > getUpdateGradeRank(previousGrade)) {
      // Lock against cross-day retroactive grade/timer upgrades
      finalGrade = previousGrade;
    } else {
      finalGrade = editQuality.grade;
    }
  }

  const finalTier: UpdateTier =
    finalGrade === 'NOTE_0H' ? '0H' : finalGrade === 'BRIEF_9H' ? '9H' : '27H';

  const preservedHours =
    finalGrade === 'BRIEF_9H' && prevParsed.hasExplicitTier && prevParsed.tier === '9H'
      ? prevParsed.effectiveHours
      : undefined;

  const authoritativeContent = encodeTierPrefix(
    params.editedCleanText,
    finalGrade,
    preservedHours
  );
  const tierCrossedZeroBoundary = (previousTier === '0H') !== (finalTier === '0H');

  return {
    isSameDayEdit,
    canUpgradeGrade: isSameDayEdit,
    allowAiRegrade,
    previousGrade,
    previousTier,
    finalGrade,
    finalTier,
    preservedHours,
    tierCrossedZeroBoundary,
    authoritativeContent,
  };
}

export type CommentBubbleBadgeTone = 'progress' | 'outreach' | 'followup' | 'note';

export interface CommentBubbleScoreBadge {
  grade: UpdateGrade;
  tone: CommentBubbleBadgeTone;
  label: string;
  tooltip: string;
  isInferredLegacy: boolean;
}

export interface CommentBubbleLogInput {
  id: string;
  content: string;
  createdAt: Date | string;
  userId?: string | null;
}

export interface ComputeBubbleBadgesOptions {
  dealOwnerId?: string | null;
  dealTopic?: string | null;
}

interface MonthlyCardBadgeQuotaState {
  firstProgressMs: number | null;
  multiStepAwarded: boolean;
  assistedUserIds: Set<string>;
  ltcStepUnlocked: 0 | 1 | 2;
}

/**
 * Pure O(N) chronological pass (`<0.2ms`) that computes exact timer + XP example badges
 * for every top-level regular comment bubble on a deal card, matching `leaderboard-data.ts` rules.
 */
export function computeCommentBubbleBadges(
  chronologicalLogs: CommentBubbleLogInput[],
  options?: ComputeBubbleBadgesOptions
): Map<string, CommentBubbleScoreBadge> {
  const result = new Map<string, CommentBubbleScoreBadge>();
  const dealOwnerId = options?.dealOwnerId || '';
  const isLtcCard = Boolean(
    options?.dealTopic && options.dealTopic.trim().toUpperCase().startsWith('LTC-')
  );

  const priorRealComments: PreviousCommentRef[] = [];
  const monthStateMap = new Map<string, MonthlyCardBadgeQuotaState>();

  for (const item of chronologicalLogs) {
    const content = item.content || '';
    if (!content || content.startsWith('[DUE DATE:') || content.startsWith('[URGENT_')) {
      continue;
    }

    const itemDate = new Date(item.createdAt);
    const parsed = parseTierPrefix(content);
    let grade: UpdateGrade;
    const isInferredLegacy = !parsed.hasExplicitTier;

    if (parsed.hasExplicitTier) {
      grade = parsed.grade;
    } else {
      const prevRecent = priorRealComments.slice(-DUPLICATE_LOOKBACK_LIMIT).reverse();
      grade = classifyUpdateQuality(parsed.cleanContent, {
        previousCommentsWithMeta: prevRecent,
        evalDate: itemDate,
      }).grade;
    }

    if (grade !== 'NOTE_0H') {
      priorRealComments.push({ content: parsed.cleanContent, createdAt: item.createdAt });
    }

    const bkk = toBangkokDateParts(itemDate);
    const monthKey = `${bkk.year}-${String(bkk.month + 1).padStart(2, '0')}`;
    let state = monthStateMap.get(monthKey);
    if (!state) {
      state = {
        firstProgressMs: null,
        multiStepAwarded: false,
        assistedUserIds: new Set<string>(),
        ltcStepUnlocked: 0,
      };
      monthStateMap.set(monthKey, state);
    }

    const isTeammate = Boolean(dealOwnerId && item.userId && item.userId !== dealOwnerId);

    if (grade === 'NOTE_0H') {
      result.set(item.id, {
        grade,
        tone: 'note',
        label: 'Note • +0h (0 XP)',
        tooltip:
          'Short note or duplicate update: +0h timer and 0 XP. If posted today, click ••• > Edit to add details and upgrade immediately.',
        isInferredLegacy,
      });
      continue;
    }

    if (grade === 'BRIEF_9H') {
      result.set(item.id, {
        grade,
        tone: 'followup',
        label: 'Follow-up • +9h (0 XP)',
        tooltip:
          'Brief check-in or missed call: extends card timer by +9h (1 workday), 0 Progress XP.',
        isInferredLegacy,
      });
      continue;
    }

    if (grade === 'OUTREACH_27H') {
      if (isTeammate && !state.assistedUserIds.has(item.userId!)) {
        state.assistedUserIds.add(item.userId!);
        result.set(item.id, {
          grade,
          tone: 'outreach',
          label: 'Team Assist • +27h (+1.5 XP)',
          tooltip:
            "Substantive outreach on a teammate's card: extends card timer by +27h and earns +1.5 Teamwork XP.",
          isInferredLegacy,
        });
      } else if (!isTeammate && isLtcCard && state.ltcStepUnlocked === 0) {
        state.ltcStepUnlocked = 1;
        result.set(item.id, {
          grade,
          tone: 'outreach',
          label: 'LTC Outreach • +27h (+1 XP)',
          tooltip:
            'Genuine outreach on an LTC card: extends card timer by +27h and earns Step 1 LTC Care (+1.0 XP).',
          isInferredLegacy,
        });
      } else {
        result.set(item.id, {
          grade,
          tone: 'outreach',
          label: 'Outreach • +27h (0 XP)',
          tooltip:
            'Genuine customer outreach sent: extends card timer by full +27h (protects Card Health & Daily Discipline for 3 workdays).',
          isInferredLegacy,
        });
      }
      continue;
    }

    // `PROGRESS_27H`
    const logMs = itemDate.getTime();
    let earnedTeammateAssist = false;
    if (isTeammate && !state.assistedUserIds.has(item.userId!)) {
      state.assistedUserIds.add(item.userId!);
      earnedTeammateAssist = true;
    }

    let earnedCardProgressXp: 0 | 0.5 | 1 = 0;
    if (state.firstProgressMs === null) {
      state.firstProgressMs = logMs;
      earnedCardProgressXp = 1;
    } else if (!state.multiStepAwarded && logMs - state.firstProgressMs >= 5 * 86_400_000) {
      state.multiStepAwarded = true;
      earnedCardProgressXp = 0.5;
    }

    let earnedLtcXp = 0;
    if (!isTeammate && isLtcCard && state.ltcStepUnlocked < 2) {
      earnedLtcXp = state.ltcStepUnlocked === 0 ? 2 : 1;
      state.ltcStepUnlocked = 2;
    }

    let label: string;
    let tooltip: string;

    if (earnedTeammateAssist) {
      label = 'Progress ★ • +27h (+1.5 XP Assist)';
      tooltip =
        "Verified progress on a teammate's card: extends timer by +27h, earns +1.5 Teamwork XP for you, and unlocks progress on this card.";
    } else if (earnedCardProgressXp === 1) {
      label =
        earnedLtcXp > 0
          ? `Progress ★ • +27h (+1 XP • +${earnedLtcXp} LTC)`
          : 'Progress ★ • +27h (+1 XP)';
      tooltip =
        earnedLtcXp > 0
          ? `Verified progress on an LTC deal: +27h timer, +1.0 Progress XP, and +${earnedLtcXp}.0 LTC Care XP.`
          : 'Verified forward progress (decision, schedule, or quotation): +27h timer and +1.0 Progress XP (also counts toward All-Card Coverage).';
    } else if (earnedCardProgressXp === 0.5) {
      label =
        earnedLtcXp > 0
          ? `Progress ★ • +27h (+0.5 XP • +${earnedLtcXp} LTC)`
          : 'Progress ★ • +27h (+0.5 XP)';
      tooltip =
        'Multi-step progress in the same month (≥ 5 days after first milestone): +27h timer and +0.5 multi-step bonus XP.';
    } else {
      label =
        earnedLtcXp > 0
          ? `Progress ★ • +27h (+${earnedLtcXp} LTC)`
          : 'Progress ★ • +27h (Quota Full)';
      tooltip =
        'Verified forward progress: extends card timer by +27h (monthly Progress XP cap of +1.5 XP/card already reached for this card).';
    }

    result.set(item.id, {
      grade,
      tone: 'progress',
      label,
      tooltip,
      isInferredLegacy,
    });
  }

  return result;
}
