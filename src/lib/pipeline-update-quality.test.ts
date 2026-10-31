import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeDueDateTimeline,
  classifyUpdateQuality,
  computeCommentBubbleBadges,
  computeTextSimilarity,
  encodeTierPrefix,
  getCommentGrantMs,
  hasVerifiableProofSignal,
  parseTierPrefix,
  resolveEditedCommentGrade,
  DUPLICATE_SIMILARITY_THRESHOLD,
} from './pipeline-update-quality';
import { parseLogContent } from './pipeline-activity-cache';
import { WORK_MS_PER_DAY, RED_CARD_WORKING_MS_THRESHOLD } from './business-days';

test('classifyUpdateQuality: empty or short filler comments receive NOTE_0H (+0h)', () => {
  const shortRes = classifyUpdateQuality('okครับ');
  assert.equal(shortRes.tier, '0H');
  assert.equal(shortRes.grade, 'NOTE_0H');
  assert.equal(shortRes.grantedHours, 0);
  assert.equal(shortRes.isCardProgress, false);
  assert.equal(shortRes.requiresAiGrading, false);
  assert.equal(shortRes.reason, 'TOO_SHORT');
  assert.match(shortRes.liveHint, /\+0h/);
});

test('classifyUpdateQuality: attachment-only update without text caption stays NOTE_0H (+0h)', () => {
  const imageOnly = classifyUpdateQuality('', {
    hasPendingAttachments: true,
  });
  assert.equal(imageOnly.tier, '0H');
  assert.equal(imageOnly.grade, 'NOTE_0H');
  assert.equal(imageOnly.reason, 'TOO_SHORT');
  assert.match(imageOnly.liveHint, /Summarize attached file in text/);

  const tagOnly = classifyUpdateQuality(
    '[ATTACHMENT:https://res.cloudinary.com/demo/image/upload/chat.webp|chat.webp|image/webp]'
  );
  assert.equal(tagOnly.tier, '0H');
  assert.equal(tagOnly.grade, 'NOTE_0H');
  assert.equal(tagOnly.reason, 'TOO_SHORT');
});

test('classifyUpdateQuality: Thai, English, mixed filler, and short pings ("ทักคุณฝนอีกครั้ง") receive NOTE_0H', () => {
  const shortPing = classifyUpdateQuality('ทักคุณฝนอีกครั้ง');
  assert.equal(shortPing.tier, '0H');
  assert.equal(shortPing.grade, 'NOTE_0H');
  assert.equal(shortPing.reason, 'BOILERPLATE');

  const thaiBoilerplate = classifyUpdateQuality('ติดตามลูกค้าครับ รอลูกค้าตอบกลับ กำลังดำเนินการครับ');
  assert.equal(thaiBoilerplate.tier, '0H');
  assert.equal(thaiBoilerplate.reason, 'BOILERPLATE');

  const mixedBoilerplate = classifyUpdateQuality('ยังไม่มีการ Update ค่ะ จะติดตามลูกค้าอีกครั้งนะคะ');
  assert.equal(mixedBoilerplate.tier, '0H');
  assert.equal(mixedBoilerplate.reason, 'BOILERPLATE');

  const engBoilerplate = classifyUpdateQuality('followed up with client waiting for reply noted thanks');
  assert.equal(engBoilerplate.tier, '0H');
  assert.equal(engBoilerplate.reason, 'BOILERPLATE');
});

test('classifyUpdateQuality: real-world JNV Trading 5-comment timeline auto-grades accurately without buttons', () => {
  // 1. Bare 1-line ping -> NOTE_0H (+0h, 0 Progress)
  const c1 = classifyUpdateQuality('ทักคุณฝนอีกครั้ง');
  assert.equal(c1.grade, 'NOTE_0H');
  assert.equal(c1.grantedHours, 0);
  assert.equal(c1.isCardProgress, false);

  // 2. Verbatim outbound chat sent to silent customer -> OUTREACH_27H (+27h full timer, 0 Card Progress!)
  const c2 = classifyUpdateQuality(
    '09:01 Light สวัสดีครับคุณฝน\n09:01 Light เป็นอย่างไรบ้างครับ มีได้ลองใช้สินค้าของแคร์บิวดูบ้างมั้ยครับ 😊😊'
  );
  assert.equal(c2.tier, '27H');
  assert.equal(c2.grade, 'OUTREACH_27H');
  assert.equal(c2.grantedHours, 27);
  assert.equal(c2.isCardProgress, false);
  assert.equal(c2.requiresAiGrading, true);

  // 3. Two-way contact where deal is waiting on external sample shipment -> OUTREACH_27H (+27h, 0 Card Progress)
  const c3 = classifyUpdateQuality(
    'ทักไปหาคุณฝน สอบถามว่าเป็นอย่างไรบ้างครับ เดือนนี้มีตู้ออกมั้ยครับ\nคุณฝนแจ้งว่า ของตัวอย่างพึ่งขึ้นตู้ไปต้นเดือน July'
  );
  assert.equal(c3.tier, '27H');
  assert.equal(c3.grade, 'OUTREACH_27H');
  assert.equal(c3.grantedHours, 27);
  assert.equal(c3.isCardProgress, false);

  // 4. Substantive outbound message asking for product group feedback -> OUTREACH_27H (+27h, 0 Card Progress)
  const c4 = classifyUpdateQuality(
    'ทักไปหาคุณฝนอีกครั้ง\nสวัสดีครับคุณฝน ไม่ทราบลูกค้ามี feedback บ้างมั้ยครับ หรือว่าเขาอยากได้สินค้ากลุ่มไหนเป็นพิเศษมั้ยครับ ☺️'
  );
  assert.equal(c4.tier, '27H');
  assert.equal(c4.grade, 'OUTREACH_27H');
  assert.equal(c4.grantedHours, 27);
  assert.equal(c4.isCardProgress, false);

  // 5. Concrete forward milestone (customer accepted & scheduled Friday 13:00 meeting) -> PROGRESS_27H (+27h + Card Progress!)
  const c5 = classifyUpdateQuality(
    '- ทีมงาน SB INTERLAB ติดต่อลูกค้าคุณฝน (JNV Trading) เพื่อนำเสนอสินค้าใหม่\n- ลูกค้าคุณฝนตอบรับและนัดหมายให้ทีมงาน SB INTERLAB เข้าพบในวันศุกร์ เวลาประมาณบ่ายโมง'
  );
  assert.equal(c5.tier, '27H');
  assert.equal(c5.grade, 'PROGRESS_27H');
  assert.equal(c5.grantedHours, 27);
  assert.equal(c5.isCardProgress, true);
});

test('classifyUpdateQuality: missed calls and brief checks without proof receive BRIEF_9H (+9h)', () => {
  const missedCall = classifyUpdateQuality('Called Khun Somchai at 14:20, line busy; will retry tomorrow.');
  assert.equal(missedCall.tier, '9H');
  assert.equal(missedCall.grade, 'BRIEF_9H');
  assert.equal(missedCall.grantedHours, 9);
  assert.equal(missedCall.isCardProgress, false);
  assert.equal(missedCall.requiresAiGrading, true);

  const briefCheck = classifyUpdateQuality('Spoke to buyer briefly');
  assert.equal(briefCheck.tier, '9H');
  assert.equal(briefCheck.grade, 'BRIEF_9H');
  assert.equal(briefCheck.grantedHours, 9);
  assert.equal(briefCheck.isCardProgress, false);
});

test('classifyUpdateQuality: 10-comment / 14-day smart duplicate filter catches A-B-C-D rotation while protecting revisions', () => {
  const prior = 'Sent quotation #QT-2026-881 for 500 units at 120 THB/unit to buyer';
  const verbatimRepeat = 'Sent quotation #QT-2026-881 for 500 units at 120 THB/unit to buyer!';

  assert.ok(computeTextSimilarity(prior, verbatimRepeat) >= DUPLICATE_SIMILARITY_THRESHOLD);

  // Even if rotated behind 5 other comments within 14 days, 10-comment lookback catches it!
  const fillerHistory = Array.from({ length: 5 }, (_, idx) => ({
    content: `Different update #${idx + 1} discussing logistics container schedule ${idx + 10}`,
    createdAt: '2026-10-26T10:00:00+07:00',
  }));
  const dupRes = classifyUpdateQuality(verbatimRepeat, {
    previousCommentsWithMeta: [
      ...fillerHistory,
      { content: prior, createdAt: '2026-10-20T10:00:00+07:00' },
    ],
    evalDate: '2026-10-27T10:00:00+07:00',
  });
  assert.equal(dupRes.tier, '0H');
  assert.equal(dupRes.reason, 'DUPLICATE');

  // 1. New quotation/revision number (#QT-2026-882) is protected (NOT flagged as duplicate)
  const revisedQuote = 'Sent quotation #QT-2026-882 for 500 units at 120 THB/unit to buyer';
  const revRes = classifyUpdateQuality(revisedQuote, {
    previousCommentsWithMeta: [{ content: prior, createdAt: '2026-10-25T10:00:00+07:00' }],
    evalDate: '2026-10-27T10:00:00+07:00',
  });
  assert.equal(revRes.tier, '27H');
  assert.equal(revRes.grade, 'PROGRESS_27H');
  assert.equal(revRes.isCardProgress, true);

  // 2. Monthly recurring update (> 14 days apart) is protected even with identical text
  const monthlyRes = classifyUpdateQuality(prior, {
    previousCommentsWithMeta: [{ content: prior, createdAt: '2026-09-25T10:00:00+07:00' }],
    evalDate: '2026-10-25T10:00:00+07:00',
  });
  assert.equal(monthlyRes.tier, '27H');

  // 3. Long shared URLs / network paths are stripped before similarity check
  const linkMsgA =
    'อัปเดตสเปคกลิ่นใหม่ในตารางเรียบร้อย https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit#gid=0';
  const linkMsgB =
    'ส่งผลทดสอบความคงตัวให้ลูกค้าตรวจแล้ว https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit#gid=0';
  assert.ok(computeTextSimilarity(linkMsgB, linkMsgA) < 0.5);
});

test('hasVerifiableProofSignal detects quotes, greetings, numbers, links, @mentions, and attachments', () => {
  assert.equal(hasVerifiableProofSignal('ลูกค้าตอบว่า "ขอเลื่อนโหลดเป็นสัปดาห์หน้า"'), true);
  assert.equal(hasVerifiableProofSignal('สวัสดีครับคุณฝน มีได้ลองใช้สินค้าดูบ้างมั้ยครับ'), true);
  assert.equal(hasVerifiableProofSignal('Confirmed PI #8812 for 50 cartons'), true);
  assert.equal(hasVerifiableProofSignal('ประสานงาน @Mild ตรวจเอกสารเรียบร้อย'), true);
  assert.equal(hasVerifiableProofSignal('Uploaded spec to H:\\Shared\\OEM\\Spec.xlsx'), true);
  assert.equal(hasVerifiableProofSignal('คุยรายละเอียดแนวทางแพ็กเกจจิ้งเบื้องต้นกับทีมขายแล้ว', false), false);
  assert.equal(hasVerifiableProofSignal('คุยรายละเอียดแนวทางแพ็กเกจจิ้งเบื้องต้นกับทีมขายแล้ว', true), true);
});

test('analyzeDueDateTimeline distinguishes stalling postponements, fulfilled schedules, and AI-audited Due Date reasons', () => {
  const logs = [
    {
      id: 'd1',
      content: '[DUE DATE: 05 Oct 2026]\nReason: รอบดึงใบเสร็จรายเดือน ต.ค.',
      createdAt: '2026-09-25T10:00:00+07:00',
      userId: 'u-admin',
    },
    {
      id: 'd2',
      content: '[DUE DATE: 05 Nov 2026]\nReason: ดึงใบเสร็จรอบ 05 Oct ส่งบัญชีครบแล้ว นัดรอบถัดไป พ.ย.',
      createdAt: '2026-10-05T11:00:00+07:00',
      userId: 'u-admin',
    },
    {
      id: 'd3',
      content: '[DUE DATE: 10 Nov 2026]\nReason: เลื่อนวันนัด',
      createdAt: '2026-10-20T10:00:00+07:00',
      userId: 'u-admin',
    },
    // AI-flagged hollow long reason ([STALLING_ONLY]) must NOT grant Progress AND increments Postponed streak!
    {
      id: 'd4',
      content:
        '[DUE DATE: 15 Nov 2026]\nReason: [STALLING_ONLY] ขอเลื่อนวันติดตามลูกค้าออกไปก่อนเพื่อรอพูดคุยรายละเอียดในสัปดาห์ถัดไป',
      createdAt: '2026-10-22T10:00:00+07:00',
      userId: 'u-admin',
    },
    // AI-verified customer outreach hold ([OUTREACH_ONLY]) resets stalling streak to 1, while withholding Progress XP
    {
      id: 'd5',
      content:
        '[DUE DATE: 01 Dec 2026]\nReason: [OUTREACH_ONLY] ทักหาคุณฝนแล้ว คุณฝนแจ้งว่าของตัวอย่างเพิ่งขึ้นตู้ ขอนัดคุยต้นเดือนธันวาคม',
      createdAt: '2026-10-25T10:00:00+07:00',
      userId: 'u-admin',
    },
  ];

  const analysis = analyzeDueDateTimeline(logs);
  assert.equal(analysis.postponedCountByLogId.get('d1'), 1);
  assert.equal(analysis.postponedCountByLogId.get('d2'), 1, 'Fulfilled monthly schedule must reset streak to 1');
  assert.equal(analysis.verifiedProgressDueLogIds.has('d2'), true, 'Detailed Due Date reason credits +27h progress');
  assert.equal(analysis.onTimeFulfilledEvents.length, 1);
  assert.equal(analysis.onTimeFulfilledEvents[0].logId, 'd2');
  assert.equal(analysis.postponedCountByLogId.get('d3'), 2, 'Short unfulfilled push becomes Postponed x2');
  assert.equal(analysis.verifiedProgressDueLogIds.has('d4'), false, '[STALLING_ONLY] Due Date reason must NOT count as Progress');
  assert.equal(analysis.postponedCountByLogId.get('d4'), 3, '[STALLING_ONLY] push increments streak to Postponed x3');
  assert.equal(analysis.verifiedProgressDueLogIds.has('d5'), false, '[OUTREACH_ONLY] Due Date reason must NOT count as Progress');
  assert.equal(analysis.postponedCountByLogId.get('d5'), 1, '[OUTREACH_ONLY] genuine customer hold resets stalling streak to 1');
  assert.equal(analysis.lateOrStalledEvents.length, 2, 'd3 and d4 Postponed x2+ pushes must be captured as POSTPONED_STALL');
  assert.equal(analysis.lateOrStalledEvents[0].logId, 'd3');
  assert.equal(analysis.lateOrStalledEvents[0].reason, 'POSTPONED_STALL');
  assert.equal(analysis.lateOrStalledEvents[1].logId, 'd4');
  assert.equal(analysis.lateOrStalledEvents[1].reason, 'POSTPONED_STALL');
});

test('classifyUpdateQuality: threaded replies always stay NOTE_0H without resetting timer', () => {
  const res = classifyUpdateQuality(
    'Confirmed shipping schedule with warehouse team for Monday morning delivery.',
    { isReply: true }
  );
  assert.equal(res.tier, '0H');
  assert.equal(res.grade, 'NOTE_0H');
  assert.equal(res.reason, 'REPLY');
});

test('encodeTierPrefix, parseTierPrefix, parseLogContent, and getCommentGrantMs round-trip all 4 v2.2 grades cleanly', () => {
  // 1. BRIEF_9H with preserved ceiling
  const encoded9hPreserved = encodeTierPrefix('Checked warehouse stock level for SKU-99.', 'BRIEF_9H', 22);
  assert.equal(encoded9hPreserved, '[TIER:9H:22] Checked warehouse stock level for SKU-99.');
  const parsed9h = parseTierPrefix(encoded9hPreserved);
  assert.equal(parsed9h.tier, '9H');
  assert.equal(parsed9h.grade, 'BRIEF_9H');
  assert.equal(parsed9h.isCardProgress, false);
  assert.equal(parsed9h.effectiveHours, 22);
  assert.equal(getCommentGrantMs(encoded9hPreserved), 22 * 3600 * 1000);

  // 2. OUTREACH_27H (+27h timer, 0 Card Progress)
  const encodedOutreach = encodeTierPrefix('09:01 Sent sample follow-up message on LINE.', 'OUTREACH_27H');
  assert.equal(encodedOutreach, '[TIER:27H:OUTREACH] 09:01 Sent sample follow-up message on LINE.');
  const parsedOutreach = parseTierPrefix(encodedOutreach);
  assert.equal(parsedOutreach.tier, '27H');
  assert.equal(parsedOutreach.grade, 'OUTREACH_27H');
  assert.equal(parsedOutreach.isVerified27h, true);
  assert.equal(parsedOutreach.isCardProgress, false);
  assert.equal(getCommentGrantMs(encodedOutreach), RED_CARD_WORKING_MS_THRESHOLD);

  // 3. PROGRESS_27H (+27h timer + Card Progress)
  const encodedProgress = encodeTierPrefix('Customer confirmed PO #4412 and Friday meeting.', 'PROGRESS_27H');
  assert.equal(encodedProgress, '[TIER:27H:PROGRESS] Customer confirmed PO #4412 and Friday meeting.');
  const parsedProgress = parseTierPrefix(encodedProgress);
  assert.equal(parsedProgress.tier, '27H');
  assert.equal(parsedProgress.grade, 'PROGRESS_27H');
  assert.equal(parsedProgress.isVerified27h, true);
  assert.equal(parsedProgress.isCardProgress, true);

  // 4. Backwards compatibility with v2.1 `[TIER:27H]` and legacy unprefixed logs
  const parsedV21 = parseTierPrefix('[TIER:27H] Sent quotation #101 to buyer.');
  assert.equal(parsedV21.grade, 'PROGRESS_27H');
  assert.equal(parsedV21.isCardProgress, true);

  const parsedLog = parseLogContent(encodedOutreach);
  assert.equal(parsedLog.cleanText, '09:01 Sent sample follow-up message on LINE.');
  assert.equal(parsedLog.updateTier, '27H');
  assert.equal(parsedLog.updateGrade, 'OUTREACH_27H');
  assert.equal(parsedLog.isCardProgress, false);

  assert.equal(getCommentGrantMs('Legacy comment before v2'), RED_CARD_WORKING_MS_THRESHOLD);
  assert.equal(getCommentGrantMs('[TIER:9H] Standard follow-up'), WORK_MS_PER_DAY);
  assert.equal(getCommentGrantMs('[TIER:0H] ok'), 0);
});

test('resolveEditedCommentGrade allows same-day upgrades while locking cross-day backdating upgrades', () => {
  // 1. Same Bangkok calendar day: editing a 0H note into a full milestone upgrades to PROGRESS_27H + AI regrade
  const sameDayUpgrade = resolveEditedCommentGrade({
    originalContent: '[TIER:0H] ทักคุณฝนอีกครั้ง',
    originalCreatedAt: '2026-10-31T10:00:00+07:00',
    editedCleanText:
      'ส่งใบเสนอราคา #QT-2026-991 ให้คุณฝนเรียบร้อย ลูกค้านัดประชุมสรุปวันศุกร์บ่ายโมงครับ',
    editedAt: '2026-10-31T14:30:00+07:00',
  });
  assert.equal(sameDayUpgrade.isSameDayEdit, true);
  assert.equal(sameDayUpgrade.canUpgradeGrade, true);
  assert.equal(sameDayUpgrade.allowAiRegrade, true);
  assert.equal(sameDayUpgrade.previousGrade, 'NOTE_0H');
  assert.equal(sameDayUpgrade.finalGrade, 'PROGRESS_27H');
  assert.equal(sameDayUpgrade.tierCrossedZeroBoundary, true);
  assert.match(sameDayUpgrade.authoritativeContent, /^\[TIER:27H:PROGRESS\] /);

  // 2. Cross-day edit on a 0H note: text updates cleanly, but grade stays locked at NOTE_0H (anti-backdating)
  const crossDayFrom0h = resolveEditedCommentGrade({
    originalContent: '[TIER:0H] ทักคุณฝนอีกครั้ง',
    originalCreatedAt: '2026-10-28T10:00:00+07:00',
    editedCleanText:
      'ส่งใบเสนอราคา #QT-2026-991 ให้คุณฝนเรียบร้อย ลูกค้านัดประชุมสรุปวันศุกร์บ่ายโมงครับ',
    editedAt: '2026-10-31T14:30:00+07:00',
  });
  assert.equal(crossDayFrom0h.isSameDayEdit, false);
  assert.equal(crossDayFrom0h.canUpgradeGrade, false);
  assert.equal(crossDayFrom0h.allowAiRegrade, false);
  assert.equal(crossDayFrom0h.finalGrade, 'NOTE_0H');
  assert.equal(crossDayFrom0h.tierCrossedZeroBoundary, false);
  assert.match(crossDayFrom0h.authoritativeContent, /^\[TIER:0H\] /);

  // 3. Cross-day edit on a 9H follow-up with preserved 22h ceiling: locks at BRIEF_9H and keeps :22
  const crossDayFrom9h = resolveEditedCommentGrade({
    originalContent: '[TIER:9H:22] Called buyer at 14:20, line busy.',
    originalCreatedAt: '2026-10-28T14:20:00+07:00',
    editedCleanText:
      '09:01 Light สวัสดีครับคุณฝน เป็นอย่างไรบ้างครับ มีได้ลองใช้สินค้าของแคร์บิวดูบ้างมั้ยครับ',
    editedAt: '2026-10-31T14:30:00+07:00',
  });
  assert.equal(crossDayFrom9h.finalGrade, 'BRIEF_9H');
  assert.equal(crossDayFrom9h.preservedHours, 22);
  assert.match(crossDayFrom9h.authoritativeContent, /^\[TIER:9H:22\] /);

  // 4. Cross-day edit on OUTREACH_27H: cannot retroactively self-upgrade into PROGRESS_27H
  const crossDayFromOutreach = resolveEditedCommentGrade({
    originalContent:
      '[TIER:27H:OUTREACH] 09:01 Light สวัสดีครับคุณฝน เป็นอย่างไรบ้างครับ มีได้ลองใช้สินค้าดูบ้างมั้ยครับ',
    originalCreatedAt: '2026-10-28T09:05:00+07:00',
    editedCleanText:
      'ส่งใบเสนอราคา #QT-2026-991 ให้คุณฝนเรียบร้อย ลูกค้านัดประชุมสรุปวันศุกร์บ่ายโมงครับ',
    editedAt: '2026-10-31T14:30:00+07:00',
  });
  assert.equal(crossDayFromOutreach.finalGrade, 'OUTREACH_27H');
  assert.match(crossDayFromOutreach.authoritativeContent, /^\[TIER:27H:OUTREACH\] /);

  // 5. Cross-day typo fix on AI-graded PROGRESS_27H (without deterministic milestone regex): preserves PROGRESS_27H!
  const crossDayTypoOnAiProgress = resolveEditedCommentGrade({
    originalContent:
      '[TIER:27H:PROGRESS] สวัสดีครับคุณฝน ลูกค้าชอบกลิ่นแชมพูตัวที่ 2 มาก ขอให้ปรับความเข้มข้นเพิ่มอีกนิดครับ',
    originalCreatedAt: '2026-10-28T11:00:00+07:00',
    editedCleanText:
      'สวัสดีครับคุณฝน ลูกค้าชอบกลิ่นแชมพูสูตรที่ 2 มาก ขอให้ปรับความเข้มข้นเพิ่มอีกนิดครับ',
    editedAt: '2026-10-31T14:30:00+07:00',
  });
  assert.equal(crossDayTypoOnAiProgress.finalGrade, 'PROGRESS_27H');
  assert.match(crossDayTypoOnAiProgress.authoritativeContent, /^\[TIER:27H:PROGRESS\] /);

  // 6. Cross-day gutting of PROGRESS_27H down to short filler still downgrades to NOTE_0H
  const crossDayGutted = resolveEditedCommentGrade({
    originalContent:
      '[TIER:27H:PROGRESS] ส่งใบเสนอราคา #QT-2026-991 ให้คุณฝนเรียบร้อย ลูกค้านัดประชุมสรุปวันศุกร์บ่ายโมงครับ',
    originalCreatedAt: '2026-10-28T11:00:00+07:00',
    editedCleanText: 'okครับ',
    editedAt: '2026-10-31T14:30:00+07:00',
  });
  assert.equal(crossDayGutted.finalGrade, 'NOTE_0H');
  assert.equal(crossDayGutted.tierCrossedZeroBoundary, true);
});

test('computeCommentBubbleBadges renders accurate chronological +XP and timer example badges', () => {
  const salesBadges = computeCommentBubbleBadges(
    [
      {
        id: 'b1',
        content: 'ทักคุณฝนอีกครั้ง', // Legacy untagged short ping -> Note • +0h (0 XP)
        createdAt: '2026-10-02T09:00:00+07:00',
        userId: 'u-yui',
      },
      {
        id: 'b2',
        content: '[TIER:9H] Called Khun Fon at 11:00, line busy.',
        createdAt: '2026-10-03T11:00:00+07:00',
        userId: 'u-yui',
      },
      {
        id: 'b3',
        content:
          '09:01 Light สวัสดีครับคุณฝน\n09:01 Light เป็นอย่างไรบ้างครับ มีได้ลองใช้สินค้าของแคร์บิวดูบ้างมั้ยครับ',
        createdAt: '2026-10-04T09:05:00+07:00',
        userId: 'u-yui',
      },
      {
        id: 'b4',
        content:
          '[TIER:27H:OUTREACH] สวัสดีครับคุณฝน ไม่ทราบลูกค้ามี feedback บ้างมั้ยครับ หรืออยากได้สินค้ากลุ่มไหนเป็นพิเศษมั้ยครับ',
        createdAt: '2026-10-06T13:07:00+07:00',
        userId: 'u-boy', // Teammate!
      },
      {
        id: 'b5',
        content:
          '[TIER:27H:PROGRESS] ส่งใบเสนอราคา #QT-101 ให้คุณฝนแล้ว ลูกค้านัดประชุมวันศุกร์บ่ายโมง',
        createdAt: '2026-10-08T10:00:00+07:00',
        userId: 'u-yui',
      },
      {
        id: 'b6',
        content:
          '[TIER:27H:PROGRESS] ส่งเอกสารสเปคเพิ่มเติม #SP-202 ให้คุณฝนตรวจทานก่อนประชุมพรุ่งนี้',
        createdAt: '2026-10-10T10:00:00+07:00', // Only 2 days after b5 (< 5 days) -> monthly progress cap!
        userId: 'u-yui',
      },
      {
        id: 'b7',
        content:
          '[TIER:27H:PROGRESS] ประชุมสรุปสูตรเสร็จแล้ว ลูกค้ายืนยันสั่งผลิตล็อตแรก PO #8812',
        createdAt: '2026-10-15T15:00:00+07:00', // 7 days after b5 (>= 5 days) -> +0.5 XP multi-step!
        userId: 'u-yui',
      },
    ],
    { dealOwnerId: 'u-yui', dealTopic: 'ทักทายหลัง Visit (JNV)' }
  );

  assert.equal(salesBadges.get('b1')?.label, 'Note • +0h (0 XP)');
  assert.equal(salesBadges.get('b1')?.isInferredLegacy, true);
  assert.equal(salesBadges.get('b2')?.label, 'Follow-up • +9h (0 XP)');
  assert.equal(salesBadges.get('b3')?.label, 'Outreach • +27h (0 XP)');
  assert.equal(salesBadges.get('b4')?.label, 'Team Assist • +27h (+1.5 XP)');
  assert.equal(salesBadges.get('b5')?.label, 'Progress ★ • +27h (+1 XP)');
  assert.equal(salesBadges.get('b6')?.label, 'Progress ★ • +27h (Quota Full)');
  assert.equal(salesBadges.get('b7')?.label, 'Progress ★ • +27h (+0.5 XP)');

  // LTC card 2-step badge verification
  const ltcBadges = computeCommentBubbleBadges(
    [
      {
        id: 'ltc1',
        content:
          '[TIER:27H:OUTREACH] สวัสดีครับคุณสมชาย ทักมาอัปเดตโปรโมชั่นวัตถุดิบประจำไตรมาส 4 ครับ',
        createdAt: '2026-10-05T10:00:00+07:00',
        userId: 'u-mild',
      },
      {
        id: 'ltc2',
        content:
          '[TIER:27H:PROGRESS] คุณสมชายตอบกลับและขอใบเสนอราคา #QT-552 สำหรับรอบผลิตเดือนหน้า',
        createdAt: '2026-10-07T14:00:00+07:00',
        userId: 'u-mild',
      },
    ],
    { dealOwnerId: 'u-mild', dealTopic: 'LTC-311026' }
  );

  assert.equal(ltcBadges.get('ltc1')?.label, 'LTC Outreach • +27h (+1 XP)');
  assert.equal(ltcBadges.get('ltc2')?.label, 'Progress ★ • +27h (+1 XP • +1 LTC)');
});
