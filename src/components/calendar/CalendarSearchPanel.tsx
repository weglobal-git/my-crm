"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Search, X } from 'lucide-react';
import { searchCalendarAction } from '@/lib/actions/calendar';
import type { CalendarSearchResultDTO } from '@/lib/calendar/calendar-dto';
import { groupCalendarSearchResults, localDateKey } from '@/lib/calendar/calendar-filters';
import { useCalendarDialog } from '@/lib/calendar/use-calendar-dialog';
import { calendarPanelBackdropClass, calendarPanelMotionClass, useCalendarPanelTransition } from '@/lib/calendar/use-calendar-panel-transition';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: CalendarSearchResultDTO) => void;
}

export function CalendarSearchPanel({ isOpen, onClose, onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const requestId = useRef(0);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CalendarSearchResultDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCalendarDialog(isOpen, panelRef, onClose, inputRef);
  const { shouldRender, isVisible } = useCalendarPanelTransition(isOpen);

  if (query.trim().length < 2 && (items.length > 0 || nextCursor !== null || loading || error !== null)) {
    setItems([]);
    setNextCursor(null);
    setLoading(false);
    setError(null);
  }

  useEffect(() => { if (isOpen) requestAnimationFrame(() => inputRef.current?.focus()); }, [isOpen]);
  useEffect(() => {
    if (!isOpen || query.trim().length < 2) return;
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await searchCalendarAction({ query, limit: 30 });
        if (currentRequest !== requestId.current) return;
        setLoading(false);
        if (!response.success) { setError(response.error || 'Search failed'); return; }
        setItems(response.items || []); setNextCursor(response.nextCursor ?? null);
      } catch {
        if (currentRequest === requestId.current) { setLoading(false); setError('Search is unavailable. Please try again.'); }
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [isOpen, query]);
  const groups = useMemo(() => groupCalendarSearchResults(items), [items]);
  const todayKey = localDateKey(new Date());
  const firstCurrentOrFutureGroup = groups.findIndex((group) => group.dateKey >= todayKey);
  if (!shouldRender) return null;

  const loadMore = async () => {
    if (nextCursor == null || loading) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const response = await searchCalendarAction({ query, cursor: nextCursor, limit: 30 });
      if (currentRequest !== requestId.current) return;
      setLoading(false);
      if (!response.success) { setError(response.error || 'Search failed'); return; }
      setItems((current) => [...current, ...(response.items || [])]); setNextCursor(response.nextCursor ?? null);
    } catch {
      if (currentRequest === requestId.current) { setLoading(false); setError('Search is unavailable. Please try again.'); }
    }
  };

  return <div className="fixed inset-0 z-[220]">
    <button type="button" className={`absolute inset-0 ${calendarPanelBackdropClass(isVisible)}`} aria-label="Close search" onClick={onClose} />
    <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="calendar-search-title" tabIndex={-1} className={`${calendarPanelMotionClass(isVisible)} absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#4E4F50] bg-[#252728] md:inset-y-4 md:right-4 md:w-[520px] md:rounded-2xl md:border`}>
      <header className="border-b border-[#3A3B3C] p-4">
        <h2 id="calendar-search-title" className="sr-only">Search calendar</h2>
        <div className="flex items-center gap-2 rounded-2xl border border-transparent bg-[#3A3B3C] px-3 focus-within:border-[#C7F33C]">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events, topics, accounts or tags" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
          {query && <button type="button" onClick={() => setQuery('')} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4E4F50] text-slate-300" aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
          <button type="button" onClick={onClose} className="ml-1 text-xs font-semibold text-slate-400 hover:text-white">Close</button>
        </div>
      </header>
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {query.trim().length < 2 && <div className="p-8 text-center text-sm text-slate-500">Enter at least 2 characters to search.</div>}
        {error && <div className="m-4 rounded-xl border border-red-900/50 bg-red-900/30 p-3 text-sm text-red-400">{error}</div>}
        {!loading && !error && query.trim().length >= 2 && items.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No matching calendar items.</div>}
        {groups.map((group, index) => <section key={group.dateKey}>
          {index === firstCurrentOrFutureGroup && <div className="border-y border-[#3A3B3C] px-5 py-2 text-xs font-bold text-[#C7F33C]">TODAY</div>}
          <h3 className="border-b border-[#3A3B3C] px-5 py-2.5 text-xs font-semibold tracking-wide text-slate-400">{group.label}</h3>
          <div className="p-2">{group.items.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[#3A3B3C]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#4E4F50] bg-[#3A3B3C]"><CalendarDays className="h-4 w-4 text-[#C7F33C]" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-100">{item.title}</span><span className="block truncate text-xs text-slate-400">{item.accountName || item.matchContext || item.departmentName || 'Event'}</span></span>
            <span className="shrink-0 text-xs text-slate-400">{item.allDay ? 'all-day' : new Date(item.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </button>)}</div>
        </section>)}
        {groups.length > 0 && firstCurrentOrFutureGroup === -1 && <div className="border-y border-[#3A3B3C] px-5 py-2 text-xs font-bold text-[#C7F33C]">TODAY</div>}
        {loading && <div className="p-5 text-center text-xs text-slate-400">Searching…</div>}
        {nextCursor != null && !loading && <div className="p-4 text-center"><button type="button" onClick={loadMore} className="rounded-xl border border-[#4E4F50] bg-[#3A3B3C] px-4 py-2 text-xs font-semibold text-slate-200 hover:border-[#C7F33C]">Load more</button></div>}
        {items.some((item) => item.id.startsWith('event:')) && <p className="px-5 pb-4 text-center text-[11px] text-slate-500">Recurring search results are bounded to one year back and two years ahead.</p>}
      </div>
    </aside>
  </div>;
}
