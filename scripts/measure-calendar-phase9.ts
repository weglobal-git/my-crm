import prisma from '../src/lib/prisma';
import { getGridRangeForMonth } from '../src/lib/calendar/calendar-recurrence';

const now = new Date();
const year = Number(process.argv[2] || now.getFullYear());
const month = Number(process.argv[3] || now.getMonth() + 1);
const { rangeStart, rangeEnd } = getGridRangeForMonth(year, month - 1);

async function measure() {
  const started = performance.now();
  const [opportunities, events] = await Promise.all([
    prisma.opportunity.findMany({
      where: { OR: [
        { goodsReadyDate: { gte: rangeStart, lte: rangeEnd } },
        { goodsLoadingDate: { gte: rangeStart, lte: rangeEnd } },
      ] },
      select: {
        id: true, topic: true, goodsReadyDate: true, goodsLoadingDate: true, type: true, ownerId: true, updatedAt: true,
        owner: { select: { id: true, name: true, image: true, departments: { select: { id: true, name: true } } } },
        teamMembers: { select: { id: true, departments: { select: { name: true } } } },
        company: { select: { name: true, displayName: true } },
      },
    }),
    prisma.calendarEvent.findMany({
      where: { OR: [
        { repeatFrequency: 'NONE', startAt: { lte: rangeEnd }, endAt: { gte: rangeStart } },
        { repeatFrequency: { not: 'NONE' }, startAt: { lte: rangeEnd }, OR: [{ repeatUntil: null }, { repeatUntil: { gte: rangeStart } }] },
      ] },
      select: {
        id: true, name: true, departmentId: true, ownerId: true, allDay: true, startAt: true, endAt: true,
        timezone: true, repeatFrequency: true, repeatUntil: true, revision: true,
        department: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, image: true } },
        tags: { select: { tagId: true, tag: { select: { id: true, name: true, color: true } } } },
        recipients: { select: { userId: true, reminderEnabled: true, reminderOffsetMins: true } },
        exceptions: { select: { occurrenceStartAt: true, overrideStartAt: true, overrideEndAt: true, isCancelled: true } },
      },
    }),
  ]);
  const payloadBytes = Buffer.byteLength(JSON.stringify({ opportunities, events }));
  return { durationMs: Number((performance.now() - started).toFixed(1)), opportunityRows: opportunities.length, eventRows: events.length, payloadBytes };
}

async function main() {
  try {
    const cold = await measure();
    const warm = await measure();
    console.log(JSON.stringify({ measuredAt: new Date().toISOString(), year, month, rangeStart, rangeEnd, cold, warm }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main();
