"use client";

import { CalendarDays, PackageCheck, Plus, RotateCcw, Truck } from 'lucide-react';
import type { CalendarFilters } from '@/lib/calendar/calendar-filters';
import { EMPTY_CALENDAR_FILTERS, calendarFilterCount } from '@/lib/calendar/calendar-filters';

type Option = { id: string; label: string; color?: string };
export function CalendarMobileFilterContent({ filters, owners, departments, tags, onChange, onNewEvent, onToday }: { filters: CalendarFilters; owners: Option[]; departments: Option[]; tags: Option[]; onChange: (filters: CalendarFilters) => void; onNewEvent: () => void; onToday: () => void }) {
  const toggle = (key: 'sources' | 'ownerIds' | 'departmentIds' | 'tagIds', id: string) => { const values = filters[key]; onChange({ ...filters, [key]: values.includes(id as never) ? values.filter((value) => value !== id) : [...values, id] } as CalendarFilters); };
  const section = (title: string, key: 'ownerIds' | 'departmentIds' | 'tagIds', options: Option[]) => options.length > 0 && <fieldset className="space-y-2"><legend className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</legend><div className="grid grid-cols-2 gap-2">{options.map((option) => { const active = filters[key].includes(option.id); return <button key={option.id} type="button" onClick={() => toggle(key, option.id)} className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors ${active ? 'border-[#C7F33C] bg-[#C7F33C]/10 text-slate-100' : 'border-[#3A3B3C] bg-[#1E1F20] text-slate-300 hover:border-[#4E4F50]'}`}><span className="h-3 w-3 shrink-0 rounded-full border border-[#4E4F50]" style={{ backgroundColor: option.color || (active ? '#C7F33C' : '#4E4F50') }} /><span className="truncate">{option.label}</span></button>; })}</div></fieldset>;
  const sources = [
    { id: 'EVENT' as const, label: 'Events', Icon: CalendarDays },
    { id: 'DEAL_GOODS_READY' as const, label: 'Goods Ready', Icon: PackageCheck },
    { id: 'DEAL_GOODS_LOADING' as const, label: 'Goods Loading', Icon: Truck },
  ];
  return <div className="space-y-7 pb-6">
    <button type="button" onClick={onNewEvent} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#C7F33C] px-4 py-3 text-sm font-semibold text-black hover:bg-[#b0d635]"><Plus className="h-4 w-4" />New event</button>
    <section className="space-y-2"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Calendar</h3><button type="button" onClick={onToday} className="w-full rounded-xl border border-[#3A3B3C] bg-[#1E1F20] px-4 py-3 text-sm font-medium text-slate-100 hover:border-[#4E4F50]">Go to today</button></section>
    <fieldset className="space-y-2"><legend className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Show items</legend><div className="grid grid-cols-3 rounded-xl bg-[#1C1C1D] p-1">{sources.map(({ id, label, Icon }) => { const active = filters.sources.includes(id); return <button key={id} type="button" onClick={() => toggle('sources', id)} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors ${active ? 'bg-[#3A3B3C] text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}><Icon className={`h-4 w-4 ${active ? 'text-[#C7F33C]' : ''}`} /><span>{label}</span></button>; })}</div></fieldset>
    {section('Owner', 'ownerIds', owners)}
    {section('Department', 'departmentIds', departments)}
    {section('Tags', 'tagIds', tags)}
    <div className="border-t border-[#3A3B3C] pt-4"><button type="button" disabled={calendarFilterCount(filters) === 0} onClick={() => onChange(EMPTY_CALENDAR_FILTERS)} className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white disabled:opacity-40"><RotateCcw className="h-4 w-4" />Clear filters</button></div>
  </div>;
}
