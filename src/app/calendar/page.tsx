import { redirect } from 'next/navigation';
import { requireCalendarActor } from '@/lib/calendar/calendar-access';
import { getCalendarMonthSnapshot } from '@/lib/calendar/calendar-queries';
import { CalendarView } from '@/components/calendar/CalendarView';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const actor = await requireCalendarActor().catch((error) => {
    if (error instanceof Error && ['Unauthorized', 'Forbidden'].includes(error.message)) {
      redirect('/');
    }
    throw error;
  });

  const resolvedSearchParams = await searchParams;
  const monthParam = typeof resolvedSearchParams?.month === 'string' ? resolvedSearchParams.month : '';
  const eventParam = typeof resolvedSearchParams?.event === 'string' ? resolvedSearchParams.event : null;
  const occurrenceParam = typeof resolvedSearchParams?.occurrence === 'string' && Number.isFinite(Date.parse(resolvedSearchParams.occurrence))
    ? new Date(resolvedSearchParams.occurrence).toISOString()
    : null;

  // Default to current year & month in local calendar
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // 1-12

  // Parse ?month=YYYY-MM
  if (monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) {
    const [yStr, mStr] = monthParam.split('-');
    const parsedYear = parseInt(yStr, 10);
    const parsedMonth = parseInt(mStr, 10);
    if (!isNaN(parsedYear) && !isNaN(parsedMonth)) {
      year = parsedYear;
      month = parsedMonth;
    }
  }

  // Fetch initial snapshot on the server
  const initialSnapshot = await getCalendarMonthSnapshot(year, month, actor);

  return (
    <CalendarView
      userId={actor.id}
      role={actor.role}
      initialSnapshot={initialSnapshot}
      initialYear={year}
      initialMonth={month}
      initialEventId={eventParam}
      initialOccurrenceStartAt={occurrenceParam}
    />
  );
}
