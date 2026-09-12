import { NextResponse } from 'next/server';
import { runCalendarReminderWorker } from '@/lib/calendar/calendar-reminders';
import { isCalendarReminderCronAuthorized } from '@/lib/calendar/calendar-reminder-policy';

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!isCalendarReminderCronAuthorized(request.headers.get('authorization'), configuredSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runCalendarReminderWorker();
    console.info('[CALENDAR-REMINDERS] Worker completed', result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[CALENDAR-REMINDERS] Worker failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
