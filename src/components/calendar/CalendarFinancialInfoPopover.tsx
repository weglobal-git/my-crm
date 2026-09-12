"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { createPortal } from 'react-dom';
import { Archive, Save, X } from 'lucide-react';
import { getCalendarFinancialInfoAction, updateCalendarSaleDealAction } from '@/lib/actions/calendar';
import { useCalendarDialog } from '@/lib/calendar/use-calendar-dialog';
import { CalendarSelect } from './CalendarSelect';
import { CalendarDatePicker } from '@/components/ui/CalendarDatePicker';

interface Props { opportunityId: string; anchorRect?: DOMRect; triggerRef?: React.RefObject<HTMLElement | null>; presentation?: 'popover' | 'sheet'; onClose: () => void }
function localDate(value: string | null) { if (!value) return ''; const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

export function CalendarFinancialInfoPopover({ opportunityId, anchorRect, triggerRef, presentation = 'popover', onClose }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({ left: 12, top: 12, width: 420 });
  useCalendarDialog(true, panelRef, onClose);
  const key = useMemo(() => ['calendar-financial-info', opportunityId] as const, [opportunityId]);
  const { data, isLoading, mutate } = useSWR(key, async () => { const response = await getCalendarFinancialInfoAction(opportunityId); if (!response.success || !response.data) throw new Error(response.error || 'Unable to load'); return response.data; }, { revalidateOnFocus: false, dedupingInterval: 30_000 });
  const [draft, setDraft] = useState({ totalValue: '', currency: 'THB', reserveId: '', invoiceNumber: '', goodsReadyDate: '', goodsLoadingDate: '' });
  const [prevData, setPrevData] = useState(data);

  if (data && data !== prevData) {
    setPrevData(data);
    setDraft({
      totalValue: data.totalValue == null ? '' : String(data.totalValue),
      currency: data.currency || 'THB',
      reserveId: data.reserveId || '',
      invoiceNumber: data.invoiceNumber || '',
      goodsReadyDate: localDate(data.goodsReadyDate),
      goodsLoadingDate: localDate(data.goodsLoadingDate),
    });
  }
  useEffect(() => { const outside = (event: MouseEvent | TouchEvent) => { const target = event.target as Node; if (panelRef.current?.contains(target) || triggerRef?.current?.contains(target)) return; onClose(); }; document.addEventListener('mousedown', outside); document.addEventListener('touchstart', outside); return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('touchstart', outside); }; }, [onClose, triggerRef]);
  useLayoutEffect(() => {
    if (presentation !== 'popover' || !anchorRect) return;
    const place = () => {
      const width = Math.min(420, window.innerWidth - 24);
      const height = Math.min(panelRef.current?.offsetHeight || 520, window.innerHeight - 24);
      const left = Math.min(Math.max(12, anchorRect.left), window.innerWidth - width - 12);
      const below = anchorRect.bottom + 8;
      const preferredTop = below + height <= window.innerHeight - 12 ? below : anchorRect.top - height - 8;
      const top = Math.min(Math.max(12, preferredTop), window.innerHeight - height - 12);
      setPopoverStyle({ left, top, width, maxHeight: window.innerHeight - 24 });
    };
    place(); const frame = requestAnimationFrame(place);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchorRect, data, presentation]);
  if (typeof document === 'undefined') return null;
  const fieldClass = 'mt-1 w-full rounded-xl border border-[#4E4F50] bg-[#252728] px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-[#C7F33C] disabled:cursor-not-allowed disabled:opacity-60';
  const set = (field: keyof typeof draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const save = async () => {
    if (!data?.canEdit || isSaving) return;
    setIsSaving(true); setError(null);
    const previous = data;
    const optimistic = { ...data, totalValue: draft.totalValue === '' ? null : Number(draft.totalValue), currency: draft.currency, reserveId: draft.reserveId || null, invoiceNumber: draft.invoiceNumber || null, goodsReadyDate: draft.goodsReadyDate ? new Date(`${draft.goodsReadyDate}T00:00:00`).toISOString() : null, goodsLoadingDate: draft.goodsLoadingDate ? new Date(`${draft.goodsLoadingDate}T00:00:00`).toISOString() : null };
    await mutate(optimistic, false);
    const response = await updateCalendarSaleDealAction({ opportunityId, totalValue: optimistic.totalValue, currency: draft.currency, reserveId: draft.reserveId || null, invoiceNumber: draft.invoiceNumber || null, goodsReadyDate: draft.goodsReadyDate || null, goodsLoadingDate: draft.goodsLoadingDate || null, expectedRevision: data.revision, mutationId: crypto.randomUUID() });
    if (!response.success) { await mutate(previous, false); setError(response.error === 'CONFLICT' ? 'This Sale Deal was updated elsewhere. Reload and try again.' : response.error || 'Unable to save'); setIsSaving(false); return; }
    await mutate((current) => current ? { ...current, revision: response.revision ?? current.revision } : current, false);
    setIsSaving(false);
  };

  return createPortal(<>
    {presentation === 'sheet' && <button className="fixed inset-0 z-[349] bg-black/60" aria-label="Close Sale Deal" onClick={onClose} />}
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Sale Deal" tabIndex={-1} style={presentation === 'popover' ? popoverStyle : undefined} onClick={(event) => event.stopPropagation()} className={`calendar-dialog fixed z-[350] max-h-[calc(100dvh-24px)] overflow-y-auto border border-[#4E4F50] bg-[#3A3B3C] p-4 ${presentation === 'sheet' ? 'inset-x-0 bottom-0 rounded-t-[2rem]' : 'animate-fade-in-up rounded-2xl'}`}>
      <header className="mb-4 flex items-start justify-between gap-3 border-b border-[#4E4F50] pb-3"><div><h2 className="text-base font-semibold text-slate-100">Sale Deal</h2><p className="mt-0.5 text-xs text-slate-400">{data?.accountName || 'Account unavailable'} · {data?.topicName || 'Loading…'}</p></div><button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-[#4E4F50] hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button></header>
      {isLoading || !data ? <div className="py-8 text-center text-sm text-slate-400">Loading Sale Deal…</div> : <div className="space-y-4">
        {!data.canEdit && <div className="flex gap-2 rounded-xl border border-amber-700/40 bg-amber-950/30 p-3 text-xs text-amber-200"><Archive className="h-4 w-4 shrink-0" /><span>This project is archived. Its details and milestone dates are read-only.</span></div>}
        {error && <div className="rounded-xl border border-red-900/50 bg-red-900/30 p-3 text-xs text-red-300">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs text-slate-400">Total Value<input className={fieldClass} type="number" min="0" step="0.01" value={draft.totalValue} onChange={set('totalValue')} disabled={!data.canEdit} /></label>
          <label className="text-xs text-slate-400">Currency<div className="mt-1"><CalendarSelect ariaLabel="Currency" value={draft.currency} onChange={(currency) => setDraft((current) => ({ ...current, currency }))} disabled={!data.canEdit} options={['THB','USD','EUR','CNY'].map((value) => ({ value, label: value }))} /></div></label>
          <label className="text-xs text-slate-400">Reserve ID<input className={fieldClass} value={draft.reserveId} onChange={set('reserveId')} disabled={!data.canEdit} /></label>
          <label className="text-xs text-slate-400">Goods Ready<div className="mt-1"><CalendarDatePicker ariaLabel="Goods Ready" value={draft.goodsReadyDate} onChange={(goodsReadyDate) => setDraft((current) => ({ ...current, goodsReadyDate }))} disabled={!data.canEdit} /></div></label>
          <label className="text-xs text-slate-400">Goods Loading<div className="mt-1"><CalendarDatePicker ariaLabel="Goods Loading" value={draft.goodsLoadingDate} onChange={(goodsLoadingDate) => setDraft((current) => ({ ...current, goodsLoadingDate }))} disabled={!data.canEdit} /></div></label>
          <label className="col-span-2 text-xs text-slate-400">Invoice Number<input className={fieldClass} value={draft.invoiceNumber} onChange={set('invoiceNumber')} disabled={!data.canEdit} /></label>
        </div>
        {data.canEdit && <button type="button" onClick={save} disabled={isSaving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C7F33C] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#b0d635] disabled:opacity-60"><Save className="h-4 w-4" />{isSaving ? 'Saving…' : 'Save changes'}</button>}
      </div>}
    </div>
  </>, document.body);
}
