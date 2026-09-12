"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Bell, Check, ChevronDown, Loader2, Search, UserPlus, Users, X } from "lucide-react";
import { getCalendarRecipientsAction } from "@/lib/actions/calendar";
import { CalendarSelect } from "./CalendarSelect";

export interface RecipientState {
  userId: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  reminderEnabled: boolean;
  reminderOffsetMins: number;
}

interface CalendarRecipientPickerProps {
  departmentId: string;
  departmentName?: string;
  recipients: RecipientState[];
  reminderEnabled: boolean;
  reminderOffsetMins: number;
  onChange: (recipients: RecipientState[]) => void;
  onReminderChange: (enabled: boolean, offsetMins: number) => void;
  disabled?: boolean;
}

type RecipientUser = { id: string; name: string | null; email: string | null; image: string | null; role: string };

const REMINDER_OFFSET_OPTIONS = [
  { label: "At event time", value: "0" },
  { label: "5 mins before", value: "5" },
  { label: "15 mins before", value: "15" },
  { label: "30 mins before", value: "30" },
  { label: "1 hour before", value: "60" },
  { label: "1 day before", value: "1440" },
];

const EMPTY_USERS: RecipientUser[] = [];

export function CalendarRecipientPicker({ departmentId, departmentName, recipients, reminderEnabled, reminderOffsetMins, onChange, onReminderChange, disabled = false }: CalendarRecipientPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prevIsOpen, setPrevIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  if (isOpen && !prevIsOpen) {
    setPrevIsOpen(true);
    setSelectedIds(recipients.map((recipient) => recipient.userId));
    setSearch("");
  } else if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false);
  }

  const shouldFetch = isOpen && Boolean(departmentId);
  const { data: fetchedUsers, isLoading } = useSWR<RecipientUser[]>(
    shouldFetch ? ["calendar-recipients", departmentId] : null,
    async () => {
      const result = await getCalendarRecipientsAction(departmentId);
      if (!result.success) throw new Error(result.error || "Failed to load recipients");
      return result.users ?? [];
    },
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  const availableUsers = fetchedUsers ?? EMPTY_USERS;

  useEffect(() => {
    if (isOpen) {
      const frame = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setIsOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const usersById = useMemo(() => {
    const map = new Map<string, RecipientUser>();
    for (const user of availableUsers) map.set(user.id, user);
    for (const recipient of recipients) if (!map.has(recipient.userId)) map.set(recipient.userId, { id: recipient.userId, name: recipient.name ?? null, email: recipient.email ?? null, image: recipient.image ?? null, role: "GENERAL" });
    return map;
  }, [availableUsers, recipients]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return availableUsers;
    return availableUsers.filter((user) => user.name?.toLocaleLowerCase().includes(query) || user.email?.toLocaleLowerCase().includes(query) || departmentName?.toLocaleLowerCase().includes(query));
  }, [availableUsers, departmentName, search]);

  const removeRecipient = (userId: string) => onChange(recipients.filter((recipient) => recipient.userId !== userId));
  const confirmSelection = () => {
    onChange(selectedIds.map((userId) => {
      const existing = recipients.find((recipient) => recipient.userId === userId);
      const user = usersById.get(userId);
      return { userId, name: user?.name ?? existing?.name, email: user?.email ?? existing?.email, image: user?.image ?? existing?.image, reminderEnabled, reminderOffsetMins };
    }));
    setIsOpen(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between pl-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400"><Users className="h-3.5 w-3.5" /> Recipients</span>
          {recipients.length > 0 && <span className="text-xs text-slate-400">{recipients.length} selected</span>}
        </div>
        <div className="flex min-h-[50px] flex-wrap items-center gap-2 rounded-xl border border-[#3A3B3C] bg-[#1E1F20] p-3">
          {recipients.map((recipient) => {
            const name = recipient.name || recipient.email || "User";
            return <span key={recipient.userId} className="inline-flex items-center gap-1.5 rounded-full border border-[#4E4F50] bg-[#252728] py-1 pl-1 pr-2 text-xs text-slate-200">
              <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-[#4E4F50]">{recipient.image ? <Image src={recipient.image} alt="" fill sizes="20px" className="object-cover" /> : <span className="flex h-full items-center justify-center text-[10px] font-bold">{name[0]?.toUpperCase()}</span>}</span>
              <span className="max-w-[120px] truncate font-medium">{name}</span>
              {!disabled && <button type="button" onClick={() => removeRecipient(recipient.userId)} className="rounded-full p-0.5 text-slate-400 transition-colors hover:text-rose-400" aria-label={`Remove ${name}`}><X className="h-3.5 w-3.5" /></button>}
            </span>;
          })}
          {!disabled && <button type="button" onClick={() => departmentId && setIsOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#4E4F50] px-3 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:border-[#C7F33C] hover:bg-[#C7F33C]/5 hover:text-[#C7F33C]"><UserPlus className="h-3.5 w-3.5" /> {recipients.length ? "Add more" : "Add recipients"}</button>}
          {disabled && recipients.length === 0 && <span className="text-xs text-slate-500">No recipients</span>}
        </div>
      </div>

      <div className="rounded-xl border border-[#3A3B3C] bg-[#1E1F20] p-3">
        <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold text-slate-300"><Bell className="h-4 w-4 text-[#C7F33C]" /> Event reminder</span><button type="button" role="switch" aria-checked={reminderEnabled} disabled={disabled || recipients.length === 0} onClick={() => onReminderChange(!reminderEnabled, reminderOffsetMins)} className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-40 ${reminderEnabled ? "bg-[#C7F33C]" : "bg-[#4E4F50]"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${reminderEnabled ? "translate-x-6" : "translate-x-1"}`} /></button></div>
        <p className="mt-1 text-xs text-slate-500">The same reminder time applies to every recipient.</p>
        {reminderEnabled && recipients.length > 0 && <div className="mt-3"><CalendarSelect ariaLabel="Event reminder time" value={String(reminderOffsetMins)} onChange={(value) => onReminderChange(true, Number(value))} disabled={disabled} options={REMINDER_OFFSET_OPTIONS} /></div>}
      </div>

      {isOpen && typeof document !== "undefined" && createPortal(<>
        <div className="fixed inset-0 z-[140] bg-black/50 backdrop-blur-sm" onMouseDown={() => setIsOpen(false)} />
        <div className="fixed inset-0 z-[141] flex md:inset-y-4 md:left-auto md:right-4 md:w-[450px] md:max-w-[calc(100vw-32px)]">
          <div className="flex h-full w-full flex-col overflow-hidden bg-[#252728] md:rounded-2xl md:border md:border-[#3A3B3C]">
            <div className="flex items-center justify-between border-b border-[#1C1C1D] p-5"><div><h2 className="text-xl font-bold text-slate-100">Add Recipients</h2><p className="mt-0.5 text-xs text-slate-400">Select members who can see this event</p></div><button type="button" onClick={() => setIsOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-[#3A3B3C] hover:text-slate-200" aria-label="Close recipient drawer"><X className="h-5 w-5" /></button></div>
            <div className="border-b border-[#3A3B3C] p-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search member or department..." className="w-full rounded-xl border border-[#4E4F50] bg-[#3A3B3C] py-2.5 pl-9 pr-9 text-base text-slate-100 outline-none placeholder:text-slate-400 focus:border-[#C7F33C] md:text-sm" />{search && <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"><X className="h-4 w-4" /></button>}</div><div className="mt-2 flex items-center justify-between px-1 text-xs text-slate-400"><span>Selected <strong className="text-[#C7F33C]">{selectedIds.length}</strong> / {availableUsers.length}</span><div className="flex gap-3"><button type="button" onClick={() => setSelectedIds(availableUsers.map((user) => user.id))} className="hover:text-[#C7F33C]">Select all</button><button type="button" onClick={() => setSelectedIds([])} className="hover:text-rose-400">Clear</button></div></div></div>
            <div className="flex-1 overflow-y-auto p-3">{isLoading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Loading members...</div> : <section className="overflow-hidden rounded-xl border border-[#3A3B3C] bg-[#2A2B2D]"><header className="flex items-center justify-between border-b border-[#3A3B3C] bg-[#313335] p-3"><span className="text-xs font-bold uppercase tracking-wider text-slate-200">{departmentName || "Department"}</span><span className="flex items-center gap-1 text-xs text-slate-400">{filteredUsers.length}<ChevronDown className="h-3.5 w-3.5" /></span></header><div className="divide-y divide-[#3A3B3C]/60">{filteredUsers.map((user) => { const selected = selectedIds.includes(user.id); const name = user.name || user.email || "Unknown"; return <button key={user.id} type="button" onClick={() => setSelectedIds((current) => selected ? current.filter((id) => id !== user.id) : [...current, user.id])} className={`flex w-full items-center gap-3 p-3 text-left transition-colors ${selected ? "bg-[#3A3B3C]" : "hover:bg-[#323436]"}`}><span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-[#C7F33C] bg-[#C7F33C] text-black" : "border-slate-500"}`}>{selected && <Check className="h-2.5 w-2.5 stroke-[3]" />}</span><span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[#4E4F50]">{user.image ? <Image src={user.image} alt="" fill sizes="32px" className="object-cover" /> : <span className="flex h-full items-center justify-center text-xs font-bold">{name[0]?.toUpperCase()}</span>}</span><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-200">{name}</span>{user.email && <span className="block truncate text-xs text-slate-400">{user.email}</span>}</span></button>; })}{!filteredUsers.length && <p className="py-10 text-center text-sm text-slate-500">No members found</p>}</div></section>}</div>
            <div className="flex items-center justify-between gap-3 border-t border-[#3A3B3C] p-4"><button type="button" onClick={() => setIsOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-400 hover:bg-[#3A3B3C] hover:text-slate-200">Cancel</button><button type="button" onClick={confirmSelection} className="inline-flex items-center gap-2 rounded-xl bg-[#C7F33C] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#b0d635]"><Check className="h-4 w-4" /> Add recipients ({selectedIds.length})</button></div>
          </div>
        </div>
      </>, document.body)}
    </div>
  );
}
