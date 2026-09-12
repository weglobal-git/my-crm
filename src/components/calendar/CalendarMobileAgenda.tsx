"use client";

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Calendar, PackageCheck, Truck } from 'lucide-react';
import type { CalendarMonthItemDTO } from '@/lib/calendar/calendar-dto';
import { getCalendarSourceLabel } from '@/lib/calendar/calendar-presentation';

const SaleDealPanel = dynamic(() => import('./CalendarFinancialInfoPopover').then((module) => module.CalendarFinancialInfoPopover), { ssr: false });

export function CalendarMobileAgenda({ date, items, onEventClick }: { date: Date; items: CalendarMonthItemDTO[]; onEventClick: (item: CalendarMonthItemDTO) => void }) {
  const [dealId, setDealId] = useState<string | null>(null);
  return <section className="min-h-0 flex-1 overflow-y-auto border-t border-[#3A3B3C] pt-3" aria-label="Selected day items">
    <h2 className="sticky top-0 z-10 bg-[#252728] pb-2 text-sm font-semibold text-slate-100">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date)}</h2>
    {items.length === 0 ? <p className="rounded-2xl border border-[#3A3B3C] p-5 text-center text-sm text-slate-500">No items for this day</p> : <div className="divide-y divide-[#3A3B3C]">
      {items.map((item) => { const ready = item.sourceType === 'DEAL_GOODS_READY'; const loading = item.sourceType === 'DEAL_GOODS_LOADING'; const Icon = ready ? PackageCheck : loading ? Truck : Calendar; const color = ready ? 'text-emerald-400' : loading ? 'text-sky-400' : 'text-[#C7F33C]'; return <button key={item.id} type="button" onClick={() => item.sourceType === 'EVENT' ? onEventClick(item) : setDealId(item.sourceId)} className="flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-[#3A3B3C]/60 focus-visible:outline-2 focus-visible:outline-[#C7F33C]">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#4E4F50] ${color}`}><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-100">{item.title}</span><span className="block truncate text-xs text-slate-400">{getCalendarSourceLabel(item.sourceType)}{item.accountName ? ` · ${item.accountName}` : ''}</span></span>
        <span className="text-xs text-slate-400">{item.allDay ? 'All day' : new Date(item.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </button>; })}
    </div>}
    {dealId && <SaleDealPanel opportunityId={dealId} presentation="sheet" onClose={() => setDealId(null)} />}
  </section>;
}
