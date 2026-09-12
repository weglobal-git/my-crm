"use client";

import { useRef } from 'react';
import { X } from 'lucide-react';
import type { CalendarItemType } from '@/lib/calendar/calendar-dto';
import { EMPTY_CALENDAR_FILTERS, type CalendarFilters } from '@/lib/calendar/calendar-filters';
import { useCalendarDialog } from '@/lib/calendar/use-calendar-dialog';
import { calendarPanelBackdropClass, calendarPanelMotionClass, useCalendarPanelTransition } from '@/lib/calendar/use-calendar-panel-transition';

interface Option { id: string; label: string; color?: string }
interface Props {
  isOpen: boolean;
  filters: CalendarFilters;
  owners: Option[];
  departments: Option[];
  tags: Option[];
  onChange: (filters: CalendarFilters) => void;
  onClose: () => void;
}

const sources: Array<{ id: CalendarItemType; label: string }> = [
  { id: 'EVENT', label: 'Events' }, { id: 'DEAL_GOODS_READY', label: 'Goods Ready' }, { id: 'DEAL_GOODS_LOADING', label: 'Goods Loading' },
];

export function CalendarFiltersPanel({ isOpen, filters, owners, departments, tags, onChange, onClose }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  useCalendarDialog(isOpen, panelRef, onClose);
  const { shouldRender, isVisible } = useCalendarPanelTransition(isOpen);
  if (!shouldRender) return null;
  const toggle = (key: keyof CalendarFilters, value: string) => {
    const current = filters[key] as string[];
    onChange({ ...filters, [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
  };
  const section = (title: string, key: keyof CalendarFilters, options: Option[]) => options.length > 0 && (
    <fieldset className="border-b border-[#3A3B3C] p-4">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = (filters[key] as string[]).includes(option.id);
          return <button key={option.id} type="button" onClick={() => toggle(key, option.id)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'border-[#C7F33C] bg-[#C7F33C] text-black' : 'border-[#4E4F50] bg-[#3A3B3C] text-slate-300 hover:border-slate-400'}`}>{option.color && <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: option.color }} />}{option.label}</button>;
        })}
      </div>
    </fieldset>
  );
  return <div className="fixed inset-0 z-[220]">
    <button type="button" className={`absolute inset-0 ${calendarPanelBackdropClass(isVisible)}`} aria-label="Close filters" onClick={onClose} />
    <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="calendar-filters-title" tabIndex={-1} className={`${calendarPanelMotionClass(isVisible)} absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#4E4F50] bg-[#252728] md:inset-y-4 md:right-4 md:w-[520px] md:rounded-2xl md:border`}>
      <header className="flex items-center justify-between border-b border-[#3A3B3C] px-5 py-4"><div><h2 id="calendar-filters-title" className="font-semibold text-slate-100">Filters</h2><p className="text-xs text-slate-400">Results update instantly</p></div><button type="button" onClick={onClose} aria-label="Close filters" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-[#4E4F50] hover:text-white"><X className="h-4 w-4" /></button></header>
      <div className="flex-1 overflow-y-auto">
        {section('Source', 'sources', sources)}
        {section('Tags', 'tagIds', tags)}
        {section('Owner', 'ownerIds', owners)}
        {section('Department', 'departmentIds', departments)}
      </div>
      <footer className="flex justify-between border-t border-[#3A3B3C] p-4"><button type="button" onClick={() => onChange(EMPTY_CALENDAR_FILTERS)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 hover:bg-[#3A3B3C]">Clear all</button><button type="button" onClick={onClose} className="rounded-xl bg-[#C7F33C] px-5 py-2 text-sm font-semibold text-black hover:bg-[#b0d635]">Done</button></footer>
    </aside>
  </div>;
}
