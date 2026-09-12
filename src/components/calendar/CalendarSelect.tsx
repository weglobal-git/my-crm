"use client";

import { Check, ChevronDown, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface CalendarSelectOption { value: string; label: string }
export function CalendarSelect({ value, options, onChange, disabled = false, compact = false, ariaLabel }: { value: string; options: CalendarSelectOption[]; onChange: (value: string) => void; disabled?: boolean; compact?: boolean; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 240, maxHeight: 280 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect(); if (!rect) return;
      const isMobile = window.innerWidth < 768; setMobile(isMobile);
      if (isMobile) return;
      const menuHeight = Math.min(280, options.length * 41 + 8);
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const top = spaceBelow >= Math.min(menuHeight, 160) ? rect.bottom + 6 : Math.max(12, rect.top - menuHeight - 6);
      setPosition({ left: Math.min(Math.max(12, rect.left), window.innerWidth - Math.max(rect.width, 220) - 12), top, width: Math.max(rect.width, 220), maxHeight: Math.max(120, Math.min(menuHeight, window.innerHeight - top - 12)) });
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, options.length]);
  useEffect(() => { if (!open) return; const close = (event: PointerEvent) => { const target = event.target as Node; if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false); }; document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close); }, [open]);

  const menu = open && typeof document !== 'undefined' ? createPortal(<>
    {mobile && <button type="button" className="fixed inset-0 z-[419] bg-black/55" aria-label={`Close ${ariaLabel}`} onClick={() => setOpen(false)} />}
    <div ref={menuRef} role="listbox" aria-label={ariaLabel} style={mobile ? undefined : { left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }} className={`fixed z-[420] overflow-y-auto border border-[#4E4F50] bg-[#3A3B3C] p-1 ${mobile ? 'inset-x-3 bottom-20 max-h-[55dvh] rounded-2xl p-2' : 'rounded-xl'}`}>
      {mobile && <div className="mb-1 flex items-center justify-between border-b border-[#4E4F50] px-2 py-2"><span className="text-sm font-semibold text-slate-100">{ariaLabel}</span><button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-[#4E4F50]" aria-label="Close"><X className="h-4 w-4" /></button></div>}
      {options.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition-colors ${option.value === value ? 'bg-[#C7F33C] text-black' : 'text-slate-200 hover:bg-[#4E4F50]'}`}><span className="truncate">{option.label}</span>{option.value === value && <Check className="h-3.5 w-3.5" />}</button>)}
    </div>
  </>, document.body) : null;

  return <><button ref={buttonRef} type="button" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`flex w-full items-center justify-between gap-2 rounded-xl border border-[#4E4F50] bg-[#252728] text-left text-slate-100 transition-colors hover:bg-[#303233] focus-visible:border-[#C7F33C] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2.5 text-sm'}`}><span className="truncate">{selected?.label}</span><ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} /></button>{menu}</>;
}
