"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { X, Calendar as CalendarIcon, Trash2, Save, Loader2, AlertCircle } from "lucide-react";
import { format, addDays, addHours, startOfDay, subDays } from "date-fns";
import { CalendarTagPicker } from "./CalendarTagPicker";
import { CalendarRecipientPicker, type RecipientState } from "./CalendarRecipientPicker";
import {
  useCalendarDraft,
  type CalendarEventDraft,
} from "@/lib/calendar/calendar-draft-store";
import {
  createCalendarEventAction,
  updateCalendarEventAction,
  deleteCalendarEventAction,
  cancelCalendarEventOccurrenceAction,
  getCalendarEventDetailAction,
  getUserDepartmentsAction,
} from "@/lib/actions/calendar";
import type { CalendarRepeatFrequency } from "@prisma/client";
import type { CalendarMonthItemDTO } from "@/lib/calendar/calendar-dto";
import { useCalendarDialog } from "@/lib/calendar/use-calendar-dialog";
import { calendarPanelBackdropClass, calendarPanelMotionClass, useCalendarPanelTransition } from "@/lib/calendar/use-calendar-panel-transition";
import { CalendarSelect } from './CalendarSelect';
import { CalendarDatePicker } from '@/components/ui/CalendarDatePicker';
import { CalendarTimePicker } from './CalendarTimePicker';

export interface CalendarEventPanelProps {
  isOpen: boolean;
  onClose: () => void;
  editingItemId?: string | null;
  editingOccurrence?: { itemId: string; startAt: string } | null;
  defaultDate?: Date | null;
  onSaveSuccess?: (item: CalendarMonthItemDTO, recurring: boolean, optimisticId?: string) => void;
  onOptimisticSave?: (item: CalendarMonthItemDTO, mutationId: string) => () => void;
  onOptimisticDelete?: (eventId: string, mutationId: string) => () => void;
  onDeleteSuccess?: (deletedId: string) => void;
  currentUserId?: string;
  initialDepartments?: Array<{ id: string; name: string }>;
  refreshToken?: number;
}

export function CalendarEventPanel({
  isOpen,
  onClose,
  editingItemId,
  editingOccurrence,
  defaultDate,
  onSaveSuccess,
  onOptimisticSave,
  onOptimisticDelete,
  onDeleteSuccess,
  currentUserId,
  initialDepartments = [],
  refreshToken = 0,
}: CalendarEventPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const deleteMenuRef = useRef<HTMLDivElement>(null);
  const createRequestIdRef = useRef(`cal-${crypto.randomUUID()}`);
  const isEditMode = Boolean(editingItemId);
  const draftKey = editingItemId || "new";

  // Available departments for selector
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>(initialDepartments);

  // Detail / revision state for edit mode
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [expectedRevision, setExpectedRevision] = useState(1);
  const [canEdit, setCanEdit] = useState(true);
  const [selectedTagDetails, setSelectedTagDetails] = useState<Array<{ id: string; name: string; color: string; departmentId: string }>>([]);
  const [prevEditingItemId, setPrevEditingItemId] = useState<string | null>(null);

  // Mutation states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!showDeleteConfirm) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!deleteMenuRef.current?.contains(event.target as Node)) setShowDeleteConfirm(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowDeleteConfirm(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showDeleteConfirm]);

  if (!isOpen && showDeleteConfirm) {
    setShowDeleteConfirm(false);
  }

  if (isOpen && isEditMode && editingItemId && editingItemId !== prevEditingItemId) {
    setPrevEditingItemId(editingItemId);
    setIsLoadingDetail(true);
    setErrorMsg(null);
  } else if (!isOpen && prevEditingItemId !== null) {
    setPrevEditingItemId(null);
  }

  // Compute fallback dates
  const initialFallbackDraft = useMemo<CalendarEventDraft>(() => {
    const baseDate = defaultDate ? new Date(defaultDate) : new Date();
    const start = new Date(baseDate);
    start.setHours(9, 0, 0, 0);
    const end = addHours(start, 1);

    return {
      name: "",
      detail: "",
      departmentId: departments[0]?.id || "",
      allDay: false,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      repeatFrequency: "NONE",
      repeatUntil: null,
      tagIds: [],
      reminderEnabled: true,
      reminderOffsetMins: 0,
      recipients: [],
    };
  }, [defaultDate, departments]);

  // Draft store hook
  const { draft, updateDraft, clearCurrentDraft } = useCalendarDraft(
    currentUserId,
    draftKey,
    initialFallbackDraft
  );

  // Fetch departments if empty
  useEffect(() => {
    if (departments.length === 0 && isOpen) {
      getUserDepartmentsAction().then((res) => {
        if (res.success && res.departments && res.departments.length > 0) {
          setDepartments(res.departments);
          if (!draft.departmentId) {
            updateDraft({ departmentId: res.departments[0].id });
          }
        }
      });
    }
  }, [departments.length, isOpen, draft.departmentId, updateDraft]);

  // If in edit mode, fetch authoritative detail from server
  useEffect(() => {
    if (isOpen && isEditMode && editingItemId) {
      let isMounted = true;
      getCalendarEventDetailAction(editingItemId)
        .then((res) => {
          if (!isMounted) return;
          if (res.success && res.event) {
            const ev = res.event;
            setExpectedRevision(ev.revision);
            setCanEdit(ev.canEdit);
            setSelectedTagDetails(ev.tags.map((tag) => ({ ...tag, departmentId: ev.departmentId })));

            updateDraft({
              name: ev.name,
              detail: ev.detail || "",
              departmentId: ev.departmentId,
              allDay: ev.allDay,
              startAt: ev.startAt,
              endAt: ev.endAt,
              repeatFrequency: ev.repeatFrequency as CalendarRepeatFrequency,
              repeatUntil: ev.repeatUntil,
              tagIds: ev.tags.map((t: { id: string }) => t.id),
              reminderEnabled: ev.recipients.some((r: RecipientState) => r.reminderEnabled),
              reminderOffsetMins: ev.recipients.find((r: RecipientState) => r.reminderEnabled)?.reminderOffsetMins ?? 0,
              recipients: ev.recipients.map((r: RecipientState) => ({
                userId: r.userId,
                name: r.name,
                email: r.email,
                image: r.image,
                reminderEnabled: r.reminderEnabled,
                reminderOffsetMins: r.reminderOffsetMins,
              })),
            });
          } else {
            setErrorMsg(res.error || "Could not load event details");
          }
        })
        .catch((err) => {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load event");
        })
        .finally(() => {
          if (isMounted) setIsLoadingDetail(false);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, isEditMode, editingItemId, refreshToken, updateDraft]);

  useCalendarDialog(isOpen, panelRef, onClose, titleInputRef);

  // Date parsing helpers for input controls
  const startDateStr = draft.startAt ? format(new Date(draft.startAt), "yyyy-MM-dd") : "";
  const startTimeStr = draft.startAt ? format(new Date(draft.startAt), "HH:mm") : "09:00";
  const endDateStr = draft.endAt
    ? format(draft.allDay ? subDays(new Date(draft.endAt), 1) : new Date(draft.endAt), "yyyy-MM-dd")
    : "";
  const endTimeStr = draft.endAt ? format(new Date(draft.endAt), "HH:mm") : "10:00";
  const repeatUntilStr = draft.repeatUntil ? format(new Date(draft.repeatUntil), "yyyy-MM-dd") : "";

  const handleStartDateChange = (val: string) => {
    if (!val) return;
    const time = draft.allDay ? "00:00:00" : `${startTimeStr}:00`;
    const newStart = new Date(`${val}T${time}`);
    // If end is now before start, bump end
    const currentEnd = new Date(draft.endAt);
    let newEnd = currentEnd;
    if (newEnd < newStart) {
      newEnd = draft.allDay ? new Date(`${val}T23:59:59`) : addHours(newStart, 1);
    }
    updateDraft({
      startAt: newStart.toISOString(),
      endAt: newEnd.toISOString(),
      ...(draft.repeatUntil && new Date(draft.repeatUntil) < newStart ? { repeatUntil: null } : {}),
    });
  };

  const handleStartTimeChange = (val: string) => {
    if (!val) return;
    const newStart = new Date(`${startDateStr}T${val}:00`);
    const currentEnd = new Date(draft.endAt);
    let newEnd = currentEnd;
    if (newEnd <= newStart) {
      newEnd = addHours(newStart, 1);
    }
    updateDraft({
      startAt: newStart.toISOString(),
      endAt: newEnd.toISOString(),
    });
  };

  const handleEndDateChange = (val: string) => {
    if (!val) return;
    const newEnd = draft.allDay
      ? addDays(new Date(`${val}T00:00:00`), 1)
      : new Date(`${val}T${endTimeStr}:00`);
    updateDraft({ endAt: newEnd.toISOString() });
  };

  const handleEndTimeChange = (val: string) => {
    if (!val) return;
    const newEnd = new Date(`${endDateStr}T${val}:00`);
    updateDraft({ endAt: newEnd.toISOString() });
  };

  const handleAllDayToggle = (checked: boolean) => {
    if (checked) {
      const start = startOfDay(new Date(draft.startAt));
      const end = addDays(startOfDay(new Date(draft.endAt)), 1);
      updateDraft({
        allDay: true,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      });
    } else {
      const start = new Date(draft.startAt);
      start.setHours(9, 0, 0, 0);
      const end = addHours(start, 1);
      updateDraft({
        allDay: false,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      });
    }
  };

  // Submit handler (create or update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || isSubmitting || !canEdit) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    const mutationId = isEditMode ? `cal-${crypto.randomUUID()}` : createRequestIdRef.current;
    const requestId = isEditMode && editingItemId ? editingItemId : `optimistic:${createRequestIdRef.current}`;
    const rollback = draft.repeatFrequency === "NONE" ? onOptimisticSave?.({
      id: requestId,
      sourceType: "EVENT",
      sourceId: requestId,
      title: draft.name.trim(),
      startAt: draft.startAt,
      endAt: draft.endAt,
      allDay: draft.allDay,
      color: "#3B82F6",
      tagIds: draft.tagIds,
      owner: { id: currentUserId || "", name: null, image: null },
      departmentId: draft.departmentId,
      canEdit: true,
      revision: isEditMode ? expectedRevision : 0,
    }, mutationId) : undefined;

    try {
      if (isEditMode && editingItemId) {
        // Update action
        const res = await updateCalendarEventAction({
          id: editingItemId,
          expectedRevision,
          name: draft.name.trim(),
          detail: draft.detail.trim() || null,
          departmentId: draft.departmentId,
          allDay: draft.allDay,
          startAt: draft.startAt,
          endAt: draft.endAt,
          timezone: "Asia/Bangkok",
          repeatFrequency: draft.repeatFrequency,
          repeatUntil: draft.repeatUntil,
          tagIds: draft.tagIds,
          recipients: draft.recipients.map((r) => ({
            userId: r.userId,
            reminderEnabled: draft.reminderEnabled,
            reminderOffsetMins: draft.reminderOffsetMins,
          })),
          mutationId,
        });

        if (res.success && res.item) {
          clearCurrentDraft();
          onSaveSuccess?.(res.item, draft.repeatFrequency !== "NONE", requestId);
          onClose();
        } else if (res.error === "REVISION_CONFLICT") {
          rollback?.();
          setErrorMsg("Another user updated this event. Please close and re-open to review changes.");
        } else {
          rollback?.();
          setErrorMsg(res.error || "Failed to update event");
        }
      } else {
        // Create action with client-generated idempotency key
        const res = await createCalendarEventAction({
          name: draft.name.trim(),
          detail: draft.detail.trim() || null,
          departmentId: draft.departmentId,
          allDay: draft.allDay,
          startAt: draft.startAt,
          endAt: draft.endAt,
          timezone: "Asia/Bangkok",
          repeatFrequency: draft.repeatFrequency,
          repeatUntil: draft.repeatUntil,
          tagIds: draft.tagIds,
          recipients: draft.recipients.map((r) => ({
            userId: r.userId,
            reminderEnabled: draft.reminderEnabled,
            reminderOffsetMins: draft.reminderOffsetMins,
          })),
          idempotencyKey: createRequestIdRef.current,
        });

        if (res.success && res.item) {
          createRequestIdRef.current = `cal-${crypto.randomUUID()}`;
          clearCurrentDraft();
          onSaveSuccess?.(res.item, draft.repeatFrequency !== "NONE", requestId);
          onClose();
        } else {
          rollback?.();
          setErrorMsg(res.error || "Failed to create event");
        }
      }
    } catch (err: unknown) {
      rollback?.();
      setErrorMsg(err instanceof Error ? err.message : "Error saving event");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete handler
  const handleDelete = async (scope: 'OCCURRENCE' | 'SERIES' = 'SERIES') => {
    if (!editingItemId || isDeleting || !canEdit) return;

    setIsDeleting(true);
    setErrorMsg(null);
    const mutationId = `cal-${crypto.randomUUID()}`;
    const isOccurrenceCancel = scope === 'OCCURRENCE' && editingOccurrence && draft.repeatFrequency !== 'NONE';
    const rollback = isOccurrenceCancel ? undefined : onOptimisticDelete?.(editingItemId, mutationId);

    try {
      const res = isOccurrenceCancel
        ? await cancelCalendarEventOccurrenceAction({ eventId: editingItemId, occurrenceStartAt: editingOccurrence.startAt, expectedRevision, mutationId })
        : await deleteCalendarEventAction({ id: editingItemId, expectedRevision, mutationId });

      if (res.success) {
        clearCurrentDraft();
        onDeleteSuccess?.(isOccurrenceCancel ? editingOccurrence.itemId : editingItemId);
        onClose();
      } else if (res.error === "REVISION_CONFLICT") {
        rollback?.();
        setErrorMsg("Revision conflict: Event has been modified by someone else.");
      } else {
        rollback?.();
        setErrorMsg(res.error || "Failed to delete event");
      }
    } catch (err: unknown) {
      rollback?.();
      setErrorMsg(err instanceof Error ? err.message : "Error deleting event");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const { shouldRender, isVisible } = useCalendarPanelTransition(isOpen);
  if (!shouldRender) return null;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close event panel"
        className={`fixed inset-0 z-[100] ${calendarPanelBackdropClass(isVisible)}`}
        onClick={onClose}
      />

      {/* Slide-over Drawer (NO SHADOWS) */}
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="calendar-event-panel-title" tabIndex={-1} className={`${calendarPanelMotionClass(isVisible)} fixed inset-0 md:inset-y-3 md:right-3 md:left-auto md:mx-0 w-full md:w-[500px] md:max-w-[calc(100vw-24px)] z-[101] flex flex-col bg-[#252728] border-0 md:border border-[#3A3B3C] rounded-none md:rounded-2xl overflow-hidden`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3A3B3C] bg-[#252728] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#3A3B3C] border border-[#4E4F50] flex items-center justify-center text-[#C7F33C]">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 id="calendar-event-panel-title" className="text-sm font-semibold text-white">
                {isEditMode && editingOccurrence && draft.repeatFrequency !== 'NONE' ? "Edit Recurring Series" : isEditMode ? "Edit Event" : "New Event"}
              </h2>
              {isEditMode && (
                <p className="text-[11px] text-neutral-400">
                  Revision #{expectedRevision} {editingOccurrence && draft.repeatFrequency !== 'NONE' ? '• Recurring occurrence' : canEdit ? "• You have edit permissions" : "• Read only"}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isEditMode && canEdit && (
              <div ref={deleteMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm((current) => !current)}
                  disabled={isSubmitting || isDeleting}
                  aria-label="Delete event"
                  aria-expanded={showDeleteConfirm}
                  className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${showDeleteConfirm ? "bg-rose-500/10 text-rose-300" : "text-neutral-400 hover:bg-rose-500/10 hover:text-rose-400"}`}
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>

                {showDeleteConfirm && (
                  <div className="absolute right-0 top-full z-50 mt-1.5 w-60 rounded-xl border border-[#3A3B3C] bg-[#252728] p-1.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-2">
                      <p className="text-xs font-semibold text-slate-200">{editingOccurrence && draft.repeatFrequency !== "NONE" ? "Delete recurring event" : "Delete event?"}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-400">This action cannot be undone.</p>
                    </div>
                    {editingOccurrence && draft.repeatFrequency !== "NONE" ? (
                      <>
                        <button type="button" onClick={() => void handleDelete("OCCURRENCE")} disabled={isDeleting} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> This occurrence</button>
                        <button type="button" onClick={() => void handleDelete("SERIES")} disabled={isDeleting} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Entire series</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => void handleDelete("SERIES")} disabled={isDeleting} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Delete event</button>
                    )}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close event panel"
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-[#3A3B3C] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {isLoadingDetail ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#C7F33C]" />
              <span>Loading event details...</span>
            </div>
          ) : (
            <form id="calendar-event-form" onSubmit={handleSubmit} className="space-y-4">
              {editingOccurrence && draft.repeatFrequency !== 'NONE' && (
                <div className="rounded-xl border border-[#4E4F50] bg-[#3A3B3C] p-3 text-xs text-slate-300">
                  Form changes apply to the entire series. To move only this occurrence, drag it on the calendar.
                </div>
              )}
              {errorMsg && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Title input */}
              <div>
                <label className="block font-medium text-neutral-400 mb-1">Title *</label>
                <input
                  ref={titleInputRef}
                  type="text"
                  placeholder="Add title"
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  disabled={!canEdit}
                  required
                  autoFocus={!isEditMode}
                  className="w-full bg-[#1E1F20] border border-[#4E4F50] text-sm text-white px-3 py-2 rounded-lg focus:outline-none focus:border-[#C7F33C] disabled:opacity-50"
                />
              </div>

              {/* Detail textarea */}
              <div>
                <label className="block font-medium text-neutral-400 mb-1">Description</label>
                <textarea
                  placeholder="Add description, agenda or meeting link"
                  rows={4}
                  value={draft.detail}
                  onChange={(e) => updateDraft({ detail: e.target.value })}
                  disabled={!canEdit}
                  className="w-full bg-[#1E1F20] border border-[#4E4F50] text-xs text-white px-3 py-2 rounded-lg focus:outline-none focus:border-[#C7F33C] disabled:opacity-50 resize-y"
                />
              </div>

              {/* Department selector */}
              {departments.length > 1 && (
                <div>
                  <label className="block font-medium text-neutral-400 mb-1">Department *</label>
                  <CalendarSelect ariaLabel="Department" value={draft.departmentId} options={departments.map((dept) => ({ value: dept.id, label: dept.name }))}
                    onChange={(value) => {
                      setSelectedTagDetails([]);
                      updateDraft({ departmentId: value, tagIds: [], recipients: [] });
                    }}
                    disabled={!canEdit}
                  />
                </div>
              )}

              {/* Date & Time Row */}
              <div className="p-3 bg-[#1E1F20] border border-[#3A3B3C] rounded-xl space-y-3">
                {/* All-day toggle */}
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-300">All-day event</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.allDay}
                      onChange={(e) => handleAllDayToggle(e.target.checked)}
                      disabled={!canEdit}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#3A3B3C] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#C7F33C]"></div>
                  </label>
                </div>

                {/* Starts At */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Starts Date</label>
                    <CalendarDatePicker ariaLabel="Starts Date" value={startDateStr} onChange={handleStartDateChange} disabled={!canEdit} allowClear={false} />
                  </div>
                  {!draft.allDay && (
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">Starts Time</label>
                      <CalendarTimePicker ariaLabel="Starts Time" value={startTimeStr} onChange={handleStartTimeChange} disabled={!canEdit} />
                    </div>
                  )}
                </div>

                {/* Ends At */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Ends Date</label>
                    <CalendarDatePicker ariaLabel="Ends Date" value={endDateStr} onChange={handleEndDateChange} disabled={!canEdit} allowClear={false} />
                  </div>
                  {!draft.allDay && (
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">Ends Time</label>
                      <CalendarTimePicker ariaLabel="Ends Time" value={endTimeStr} onChange={handleEndTimeChange} disabled={!canEdit} />
                    </div>
                  )}
                </div>

                {/* Repeat Frequency */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Repeat</label>
                    <CalendarSelect ariaLabel="Repeat" value={draft.repeatFrequency} onChange={(value) => updateDraft({ repeatFrequency: value as CalendarRepeatFrequency })}
                      disabled={!canEdit}
                      options={[{ value: 'NONE', label: 'Does not repeat' }, { value: 'DAILY', label: 'Daily' }, { value: 'WEEKLY', label: 'Weekly' }, { value: 'MONTHLY', label: 'Monthly' }, { value: 'YEARLY', label: 'Yearly' }]}
                    />
                  </div>

                  {draft.repeatFrequency !== "NONE" && (
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">Repeat Until (Optional)</label>
                      <CalendarDatePicker ariaLabel="Repeat Until" value={repeatUntilStr} onChange={(value) => updateDraft({ repeatUntil: value ? new Date(`${value}T23:59:59`).toISOString() : null })} disabled={!canEdit} minDate={startDateStr} referenceDate={startDateStr} referenceLabel="Start date" />
                    </div>
                  )}
                </div>
              </div>

              {/* Tag Picker */}
              <CalendarTagPicker
                departmentId={draft.departmentId}
                selectedTagIds={draft.tagIds}
                onChange={(tagIds) => updateDraft({ tagIds })}
                disabled={!canEdit}
                initialTags={selectedTagDetails}
              />

              {/* Recipient Picker */}
              <CalendarRecipientPicker
                departmentId={draft.departmentId}
                departmentName={departments.find((department) => department.id === draft.departmentId)?.name}
                recipients={draft.recipients}
                reminderEnabled={draft.reminderEnabled}
                reminderOffsetMins={draft.reminderOffsetMins}
                onChange={(recipients) => updateDraft({ recipients })}
                onReminderChange={(reminderEnabled, reminderOffsetMins) => updateDraft((current) => ({
                  reminderEnabled,
                  reminderOffsetMins,
                  recipients: current.recipients.map((recipient) => ({ ...recipient, reminderEnabled, reminderOffsetMins })),
                }))}
                disabled={!canEdit}
              />

            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-3 border-t border-[#3A3B3C] bg-[#252728] shrink-0">
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="submit"
                form="calendar-event-form"
                disabled={isSubmitting || !draft.name.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#C7F33C] text-black text-xs font-semibold hover:bg-[#b8e432] disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>{isEditMode ? "Save changes" : "Create event"}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
