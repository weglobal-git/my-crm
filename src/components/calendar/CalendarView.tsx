"use client";

import React, { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import useSWR, { useSWRConfig } from 'swr';
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout';
import { CalendarToolbar } from './CalendarToolbar';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { CalendarMobileAgenda } from './CalendarMobileAgenda';
import { useSidebar } from '@/components/layout/SidebarContext';
import { indexCalendarItemsByLocalDate } from '@/lib/calendar/calendar-presentation';
import { CalendarMobileFilterContent } from './CalendarMobileFilterContent';
import { calendarMonthKey } from '@/lib/calendar/calendar-cache';
import { getMonthSnapshotAction } from '@/lib/actions/calendar';
import type { CalendarMonthItemDTO, CalendarMonthSnapshotDTO } from '@/lib/calendar/calendar-dto';
import { getGridRangeForMonth, getOccurrenceStartFromItemId } from '@/lib/calendar/calendar-recurrence';
import { acquireChannelWhenConnected } from '@/lib/pusher-subscription-manager';
import { getPusherClient } from '@/lib/pusher';
import { broadcastEventAcrossTabs, CALENDAR_REALTIME_BRIDGE_EVENT, CALENDAR_RECOVERY_EVENT } from '@/lib/pusher-connection-manager';
import { CALENDAR_CHANNEL_EVENT, calendarEventIntersectsRange, decideCalendarRealtimeEvent, isCalendarRealtimeEvent, type CalendarRealtimeEvent } from '@/lib/calendar/calendar-realtime';
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { moveCalendarItemAction } from '@/lib/actions/calendar';
import { CALENDAR_EDGE_HOVER_COOLDOWN_MS, CALENDAR_EDGE_HOVER_DELAY_MS, getAdjacentCalendarMonth, getCalendarEdgeDirection, isRecurringCalendarOccurrence, moveCalendarItemToDate } from '@/lib/calendar/calendar-move';
import { useDialog } from '@/providers/DialogProvider';
import { calendarFilterCount, EMPTY_CALENDAR_FILTERS, filterCalendarItems, parseCalendarFilters, writeCalendarFilters, type CalendarFilters } from '@/lib/calendar/calendar-filters';
import type { CalendarSearchResultDTO } from '@/lib/calendar/calendar-dto';

const CalendarEventPanel = dynamic(() => import('./CalendarEventPanel').then((module) => module.CalendarEventPanel), { ssr: false });
const CalendarFiltersPanel = dynamic(() => import('./CalendarFiltersPanel').then((module) => module.CalendarFiltersPanel), { ssr: false });
const CalendarSearchPanel = dynamic(() => import('./CalendarSearchPanel').then((module) => module.CalendarSearchPanel), { ssr: false });

interface CalendarViewProps {
  userId: string;
  role: string;
  initialSnapshot: CalendarMonthSnapshotDTO;
  initialYear: number;
  initialMonth: number;
  initialEventId?: string | null;
  initialOccurrenceStartAt?: string | null;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  userId,
  initialSnapshot,
  initialYear,
  initialMonth,
  initialEventId,
  initialOccurrenceStartAt,
}) => {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [selectedMobileDate, setSelectedMobileDate] = useState(() => new Date(initialYear, initialMonth - 1, new Date().getMonth() === initialMonth - 1 && new Date().getFullYear() === initialYear ? new Date().getDate() : 1));
  const [isMobileViewport, setIsMobileViewport] = useState<boolean | null>(null);

  // Drawer state
  const [isPanelOpen, setIsPanelOpen] = useState(Boolean(initialEventId));
  const [editingItemId, setEditingItemId] = useState<string | null>(initialEventId || null);
  const [editingOccurrence, setEditingOccurrence] = useState<{ itemId: string; startAt: string } | null>(
    initialEventId && initialOccurrenceStartAt
      ? { itemId: `event:${initialEventId}:${initialOccurrenceStartAt}`, startAt: initialOccurrenceStartAt }
      : null
  );
  const [panelDefaultDate, setPanelDefaultDate] = useState<Date | null>(null);
  const [detailRefreshToken, setDetailRefreshToken] = useState(0);
  const [filters, setFilters] = useState<CalendarFilters>(EMPTY_CALENDAR_FILTERS);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [activeDragItem, setActiveDragItem] = useState<CalendarMonthItemDTO | null>(null);
  const [activeDragWidth, setActiveDragWidth] = useState<number | null>(null);
  const [pendingMove, setPendingMove] = useState<{ item: CalendarMonthItemDTO; startAt: string; endAt: string } | null>(null);
  const seenRealtimeIds = useRef(new Set<string>());
  const latestRealtimeRevisions = useRef(new Map<string, number>());
  const ownMutationIds = useRef(new Set<string>());
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeDirection = useRef<-1 | 1 | null>(null);
  const viewMonth = useRef({ year: initialYear, month: initialMonth });
  const lastDragEndedAt = useRef(0);
  const pendingMoveIds = useRef(new Set<string>());
  const eventPanelTrigger = useRef<HTMLElement | null>(null);
  const latestMovedItems = useRef(new Map<string, Pick<CalendarMonthItemDTO, 'startAt' | 'endAt' | 'revision'>>());
  const { toast } = useDialog();
  const { setPageSearchConfig, setPageManageContent, setHasActiveFilters, setColumnNavConfig, setIsManageModalOpen } = useSidebar();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    viewMonth.current = { year, month };
  }, [month, year]);

  useLayoutEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobileViewport(query.matches);
    sync(); query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const syncUrlState = () => {
      const params = new URLSearchParams(window.location.search);
      setFilters(parseCalendarFilters(params));
      const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(params.get('month') || '');
      if (match) {
        const target = { year: Number(match[1]), month: Number(match[2]) };
        viewMonth.current = target; setYear(target.year); setMonth(target.month);
      }
    };
    syncUrlState();
    window.addEventListener('popstate', syncUrlState);
    return () => window.removeEventListener('popstate', syncUrlState);
  }, []);

  const { mutate } = useSWRConfig();
  const currentKey = useMemo(() => calendarMonthKey(userId, year, month), [userId, year, month]);

  // Synchronize URL query parameter ?month=YYYY-MM without triggering full page re-render
  useEffect(() => {
    const formattedMonth = String(month).padStart(2, '0');
    const params = new URLSearchParams(window.location.search);
    params.set('month', `${year}-${formattedMonth}`);
    const nextSearch = `?${params.toString()}`;
    if (window.location.search !== nextSearch) window.history.replaceState(null, '', `/calendar${nextSearch}`);
  }, [year, month]);

  // SWR for month snapshot data
  const isInitial = year === initialYear && month === initialMonth;
  const { data: snapshotData, isLoading } = useSWR(
    currentKey,
    async () => {
      const res = await getMonthSnapshotAction(year, month);
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Failed to load month');
      }
      return res.data;
    },
    {
      fallbackData: isInitial ? initialSnapshot : undefined,
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    }
  );

  const activeSnapshot = useMemo<CalendarMonthSnapshotDTO>(() => {
    if (snapshotData) return snapshotData;
    if (isInitial) return initialSnapshot;

    const pendingRange = getGridRangeForMonth(year, month - 1);
    return {
      rangeStart: pendingRange.rangeStart.toISOString(),
      rangeEnd: pendingRange.rangeEnd.toISOString(),
      year,
      month,
      items: [],
      generatedAt: new Date().toISOString(),
    };
  }, [initialSnapshot, isInitial, month, snapshotData, year]);
  const filteredItems = useMemo(() => filterCalendarItems(activeSnapshot.items, filters), [activeSnapshot.items, filters]);
  const mobileItemsByDate = useMemo(() => indexCalendarItemsByLocalDate(filteredItems), [filteredItems]);
  const selectedMobileDateKey = `${selectedMobileDate.getFullYear()}-${selectedMobileDate.getMonth()}-${selectedMobileDate.getDate()}`;
  const selectedMobileItems = mobileItemsByDate.get(selectedMobileDateKey) ?? [];
  const filterOptions = useMemo(() => {
    const owners = new Map<string, string>();
    const departments = new Map<string, string>();
    const tags = new Map<string, { label: string; color?: string }>();
    for (const item of activeSnapshot.items) {
      owners.set(item.owner.id, item.owner.name || 'Unknown');
      if (item.departmentId) departments.set(item.departmentId, item.departmentName || 'Department');
      for (const tag of item.tags || []) tags.set(tag.id, { label: tag.name, color: tag.color });
    }
    return {
      owners: [...owners].map(([id, label]) => ({ id, label })),
      departments: [...departments].map(([id, label]) => ({ id, label })),
      tags: [...tags].map(([id, value]) => ({ id, ...value })),
    };
  }, [activeSnapshot.items]);

  const updateFilters = useCallback((next: CalendarFilters) => {
    setFilters(next);
    const params = writeCalendarFilters(new URLSearchParams(window.location.search), next);
    window.history.pushState(null, '', `/calendar?${params.toString()}`);
  }, []);

  const handleSearchSelect = useCallback((item: CalendarSearchResultDTO) => {
    const date = new Date(item.startAt);
    viewMonth.current = { year: date.getFullYear(), month: date.getMonth() + 1 };
    setYear(date.getFullYear()); setMonth(date.getMonth() + 1);
    setHighlightedItemId(item.id); setIsSearchOpen(false);
    if (filterCalendarItems([item], filters).length === 0) {
      setFilters(EMPTY_CALENDAR_FILTERS);
      const params = writeCalendarFilters(new URLSearchParams(window.location.search), EMPTY_CALENDAR_FILTERS);
      window.history.replaceState(null, '', `/calendar?${params.toString()}`);
    }
    if (item.sourceType === 'EVENT') {
      setEditingItemId(item.sourceId);
      const occurrenceStart = getOccurrenceStartFromItemId(item.id, item.sourceId);
      setEditingOccurrence(occurrenceStart ? { itemId: item.id, startAt: occurrenceStart } : null);
      setIsPanelOpen(true);
    }
    window.setTimeout(() => setHighlightedItemId((current) => current === item.id ? null : current), 2500);
  }, [filters]);

  const scheduleReconcile = useCallback(() => {
    if (reconcileTimer.current) return;
    reconcileTimer.current = setTimeout(() => {
      reconcileTimer.current = null;
      void mutate(currentKey);
    }, 100);
  }, [currentKey, mutate]);

  const consumeRealtimeEvent = useCallback((raw: unknown) => {
    if (!isCalendarRealtimeEvent(raw)) return;
    const event = raw as CalendarRealtimeEvent;
    if (!calendarEventIntersectsRange(event, activeSnapshot.rangeStart, activeSnapshot.rangeEnd)) return;
    const decision = decideCalendarRealtimeEvent(event, seenRealtimeIds.current, latestRealtimeRevisions.current, ownMutationIds.current);
    if (decision === 'IGNORE') return;

    if (editingItemId === event.itemId) {
      if (decision === 'REMOVE') setIsPanelOpen(false);
      else setDetailRefreshToken((value) => value + 1);
    }
    if (decision === 'REMOVE') {
      void mutate(currentKey, (current: CalendarMonthSnapshotDTO | undefined) => current ? {
        ...current,
        items: current.items.filter((item) => !(item.sourceType === 'EVENT' && item.sourceId === event.itemId)),
      } : current, false);
      return;
    }
    scheduleReconcile();
  }, [activeSnapshot.rangeEnd, activeSnapshot.rangeStart, currentKey, editingItemId, mutate, scheduleReconcile]);

  useEffect(() => {
    const channelName = `private-calendar-${userId}`;
    let subscriptionReady = false;
    let lastSafetyReconcileAt = Date.now();
    const release = acquireChannelWhenConnected(channelName, (channel) => {
      const onUpdate = (event: unknown) => {
        consumeRealtimeEvent(event);
        broadcastEventAcrossTabs(channelName, CALENDAR_CHANNEL_EVENT, event);
      };
      const onSubscribed = () => {
        subscriptionReady = true;
        lastSafetyReconcileAt = Date.now();
        scheduleReconcile();
      };
      const onSubscriptionError = () => {
        subscriptionReady = false;
        scheduleReconcile();
      };
      channel.bind(CALENDAR_CHANNEL_EVENT, onUpdate);
      channel.bind('pusher:subscription_succeeded', onSubscribed);
      channel.bind('pusher:subscription_error', onSubscriptionError);
      return () => {
        channel.unbind(CALENDAR_CHANNEL_EVENT, onUpdate);
        channel.unbind('pusher:subscription_succeeded', onSubscribed);
        channel.unbind('pusher:subscription_error', onSubscriptionError);
      };
    });
    const onBridge = (event: Event) => consumeRealtimeEvent((event as CustomEvent).detail);
    const onRecovery = () => scheduleReconcile();
    window.addEventListener(CALENDAR_REALTIME_BRIDGE_EVENT, onBridge);
    window.addEventListener(CALENDAR_RECOVERY_EVENT, onRecovery);
    const fallbackInterval = window.setInterval(() => {
      const client = getPusherClient();
      const isTransportUnavailable = !subscriptionReady || client?.connection.state !== 'connected';
      const isSafetyReconcileDue = Date.now() - lastSafetyReconcileAt >= 300_000;
      if (document.visibilityState === 'visible' && (isTransportUnavailable || isSafetyReconcileDue)) {
        lastSafetyReconcileAt = Date.now();
        scheduleReconcile();
      }
    }, 60_000);
    return () => {
      release();
      window.removeEventListener(CALENDAR_REALTIME_BRIDGE_EVENT, onBridge);
      window.removeEventListener(CALENDAR_RECOVERY_EVENT, onRecovery);
      window.clearInterval(fallbackInterval);
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
      reconcileTimer.current = null;
    };
  }, [consumeRealtimeEvent, scheduleReconcile, userId]);

  const handlePrevMonth = useCallback(() => {
    const target = getAdjacentCalendarMonth(viewMonth.current.year, viewMonth.current.month, -1);
    const params = new URLSearchParams(window.location.search); params.set('month', `${target.year}-${String(target.month).padStart(2, '0')}`);
    window.history.pushState(null, '', `/calendar?${params.toString()}`);
    viewMonth.current = target; setYear(target.year); setMonth(target.month);
  }, []);

  const handleNextMonth = useCallback(() => {
    const target = getAdjacentCalendarMonth(viewMonth.current.year, viewMonth.current.month, 1);
    const params = new URLSearchParams(window.location.search); params.set('month', `${target.year}-${String(target.month).padStart(2, '0')}`);
    window.history.pushState(null, '', `/calendar?${params.toString()}`);
    viewMonth.current = target; setYear(target.year); setMonth(target.month);
  }, []);

  const handleToday = useCallback(() => {
    const now = new Date();
    const target = { year: now.getFullYear(), month: now.getMonth() + 1 };
    const params = new URLSearchParams(window.location.search); params.set('month', `${target.year}-${String(target.month).padStart(2, '0')}`);
    window.history.pushState(null, '', `/calendar?${params.toString()}`);
    viewMonth.current = target; setYear(target.year); setMonth(target.month);
    setSelectedMobileDate(now);
  }, []);

  const handleNewEventClick = useCallback(() => {
    eventPanelTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingItemId(null);
    setEditingOccurrence(null);
    setPanelDefaultDate(new Date());
    setIsPanelOpen(true);
  }, []);

  const [prevYearMonth, setPrevYearMonth] = useState({ year, month });
  if (prevYearMonth.year !== year || prevYearMonth.month !== month) {
    setPrevYearMonth({ year, month });
    if (selectedMobileDate.getFullYear() !== year || selectedMobileDate.getMonth() !== month - 1) {
      setSelectedMobileDate(new Date(year, month - 1, 1));
    }
  }

  const closeManageAndCreateEvent = useCallback(() => { setIsManageModalOpen(false); handleNewEventClick(); }, [handleNewEventClick, setIsManageModalOpen]);
  const closeManageAndGoToday = useCallback(() => { handleToday(); setIsManageModalOpen(false); }, [handleToday, setIsManageModalOpen]);
  const mobileManageContent = useMemo(() => <CalendarMobileFilterContent
    filters={filters}
    owners={filterOptions.owners}
    departments={filterOptions.departments}
    tags={filterOptions.tags}
    onChange={updateFilters}
    onNewEvent={closeManageAndCreateEvent}
    onToday={closeManageAndGoToday}
  />, [closeManageAndCreateEvent, closeManageAndGoToday, filterOptions.departments, filterOptions.owners, filterOptions.tags, filters, updateFilters]);

  const toggleSearchPanel = useCallback(() => {
    setIsSearchOpen((current) => !current);
  }, []);
  const ignoreSidebarSearch = useCallback(() => undefined, []);
  const calendarColumnNavConfig = useMemo(() => ({
    hasPrev: true,
    hasNext: true,
    onPrev: handlePrevMonth,
    onNext: handleNextMonth,
    currentTitle: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)),
    hideCount: true,
  }), [handleNextMonth, handlePrevMonth, month, year]);
  const calendarSearchConfig = useMemo(() => ({
    query: '',
    onSearch: ignoreSidebarSearch,
    placeholder: 'Search calendar',
    isOpen: isSearchOpen,
    onOpen: toggleSearchPanel,
  }), [ignoreSidebarSearch, isSearchOpen, toggleSearchPanel]);
  const hasCalendarFilters = calendarFilterCount(filters) > 0;

  useEffect(() => {
    setColumnNavConfig(calendarColumnNavConfig);
  }, [calendarColumnNavConfig, setColumnNavConfig]);

  useEffect(() => {
    setPageSearchConfig(calendarSearchConfig);
  }, [calendarSearchConfig, setPageSearchConfig]);

  useEffect(() => {
    setHasActiveFilters(hasCalendarFilters);
  }, [hasCalendarFilters, setHasActiveFilters]);

  useEffect(() => {
    setPageManageContent(mobileManageContent);
  }, [mobileManageContent, setPageManageContent]);

  useEffect(() => () => {
    setColumnNavConfig(null);
    setPageSearchConfig(null);
    setPageManageContent(null);
    setHasActiveFilters(false);
  }, [setColumnNavConfig, setHasActiveFilters, setPageManageContent, setPageSearchConfig]);

  const handleDayClick = useCallback((date: Date) => {
    eventPanelTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingItemId(null);
    setEditingOccurrence(null);
    setPanelDefaultDate(date);
    setIsPanelOpen(true);
  }, []);

  const handleItemClick = useCallback((item: CalendarMonthItemDTO) => {
    if (Date.now() - lastDragEndedAt.current < 250) return;
    if (item.sourceType === 'EVENT') {
      eventPanelTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setEditingItemId(item.sourceId);
      const occurrenceStart = getOccurrenceStartFromItemId(item.id, item.sourceId);
      setEditingOccurrence(occurrenceStart ? { itemId: item.id, startAt: occurrenceStart } : null);
      setIsPanelOpen(true);
    }
  }, []);

  const closeEventPanel = useCallback(() => {
    setIsPanelOpen(false);
    requestAnimationFrame(() => eventPanelTrigger.current?.focus());
  }, []);

  const navigateDuringDrag = useCallback(async (offset: -1 | 1) => {
    const target = getAdjacentCalendarMonth(viewMonth.current.year, viewMonth.current.month, offset);
    const key = calendarMonthKey(userId, target.year, target.month);
    const response = await getMonthSnapshotAction(target.year, target.month);
    if (response.success && response.data) await mutate(key, response.data, false);
    if (edgeDirection.current !== offset) return;
    viewMonth.current = target;
    setYear(target.year);
    setMonth(target.month);
  }, [mutate, userId]);

  const clearEdgeHover = useCallback(() => {
    if (edgeHoverTimer.current) clearTimeout(edgeHoverTimer.current);
    edgeHoverTimer.current = null;
    edgeDirection.current = null;
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const item = event.active.data.current?.item as CalendarMonthItemDTO | undefined;
    if (item?.canEdit && !pendingMoveIds.current.has(item.id)) {
      const latest = latestMovedItems.current.get(item.id);
      setActiveDragItem(latest ? { ...item, ...latest } : item);
      setActiveDragWidth(event.active.rect.current.initial?.width ?? null);
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = String(event.over?.id || '');
    const offset = getCalendarEdgeDirection(overId, Date.now(), 0);
    if (offset === null) {
      clearEdgeHover();
      return;
    }
    if (edgeDirection.current === offset && edgeHoverTimer.current) return;
    clearEdgeHover();
    edgeDirection.current = offset;
    const scheduleAdvance = (delay: number) => {
      edgeHoverTimer.current = setTimeout(async () => {
        edgeHoverTimer.current = null;
        if (edgeDirection.current !== offset) return;
        await navigateDuringDrag(offset);
        if (edgeDirection.current === offset) scheduleAdvance(CALENDAR_EDGE_HOVER_COOLDOWN_MS);
      }, delay);
    };
    scheduleAdvance(CALENDAR_EDGE_HOVER_DELAY_MS);
  }, [clearEdgeHover, navigateDuringDrag]);

  const patchMovedItem = useCallback((item: CalendarMonthItemDTO, moved: { startAt: string; endAt: string }, revision = item.revision) => {
    const next = { ...item, ...moved, revision };
    void mutate(
      (key) => Array.isArray(key) && key[0] === 'calendar-month' && key[1] === userId,
      (current: CalendarMonthSnapshotDTO | undefined) => {
        if (!current) return current;
        const without = current.items.filter((candidate) => candidate.id !== item.id);
        const intersects = Date.parse(next.startAt) <= Date.parse(current.rangeEnd) && Date.parse(next.endAt) >= Date.parse(current.rangeStart);
        return { ...current, items: intersects ? [...without, next] : without };
      },
      false,
    );
    if (item.sourceType !== 'EVENT') {
      const field = item.sourceType === 'DEAL_GOODS_READY' ? 'goodsReadyDate' : 'goodsLoadingDate';
      void mutate((key) => Array.isArray(key) && key[0] === 'pipeline-deals',
        (deals: Array<Record<string, unknown>> | undefined) => deals?.map((deal) => deal.id === item.sourceId ? { ...deal, [field]: moved.startAt, updatedAt: new Date(revision).toISOString() } : deal), false);
    }
    return next;
  }, [mutate, userId]);

  const executeMove = useCallback(async (
    move: { item: CalendarMonthItemDTO; startAt: string; endAt: string },
    recurrenceScope?: 'THIS_OCCURRENCE' | 'ENTIRE_SERIES',
  ) => {
    const latest = latestMovedItems.current.get(move.item.id);
    const baseItem = latest ? { ...move.item, ...latest } : move.item;
    const mutationId = `cal-move-${crypto.randomUUID()}`;
    ownMutationIds.current.add(mutationId);
    pendingMoveIds.current.add(move.item.id);
    patchMovedItem(baseItem, move);
    try {
      const response = await moveCalendarItemAction({
        sourceType: move.item.sourceType, sourceId: move.item.sourceId, itemId: move.item.id,
        startAt: move.startAt, endAt: move.endAt, previousStartAt: baseItem.startAt, previousEndAt: baseItem.endAt,
        expectedRevision: baseItem.revision, mutationId, recurrenceScope,
      });
      if (!response.success || response.revision === undefined) throw new Error(response.error || 'Move failed');
      const confirmed = { startAt: response.startAt || move.startAt, endAt: response.endAt || move.endAt, revision: response.revision };
      latestMovedItems.current.set(move.item.id, confirmed);
      patchMovedItem(baseItem, confirmed, response.revision);
      if (recurrenceScope === 'ENTIRE_SERIES') void mutate((key) => Array.isArray(key) && key[0] === 'calendar-month' && key[1] === userId);
      if (move.item.sourceType !== 'EVENT') void mutate((key) => Array.isArray(key) && key[0] === 'pipeline-deals');
    } catch (caught) {
      patchMovedItem({ ...baseItem, startAt: move.startAt, endAt: move.endAt }, { startAt: baseItem.startAt, endAt: baseItem.endAt });
      void mutate((key) => Array.isArray(key) && key[0] === 'calendar-month' && key[1] === userId);
      toast({ title: 'Could not move item', description: caught instanceof Error ? caught.message : 'Please try again.', type: 'error' });
    } finally {
      pendingMoveIds.current.delete(move.item.id);
    }
  }, [mutate, patchMovedItem, toast, userId]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    clearEdgeHover();
    lastDragEndedAt.current = Date.now();
    const item = activeDragItem ?? (event.active.data.current?.item as CalendarMonthItemDTO | undefined);
    setActiveDragItem(null);
    setActiveDragWidth(null);
    const targetIso = event.over?.data.current?.date as string | undefined;
    if (!item || !targetIso || pendingMoveIds.current.has(item.id)) return;
    const moved = moveCalendarItemToDate(item, new Date(targetIso));
    if (moved.startAt === item.startAt && moved.endAt === item.endAt) return;
    const pending = { item, ...moved };
    if (isRecurringCalendarOccurrence(item)) {
      setPendingMove(pending);
      return;
    }
    void executeMove(pending);
  }, [activeDragItem, clearEdgeHover, executeMove]);

  const handleDragCancel = useCallback(() => {
    clearEdgeHover();
    lastDragEndedAt.current = Date.now();
    setActiveDragItem(null);
    setActiveDragWidth(null);
  }, [clearEdgeHover]);

  // Optimistic updates on save success
  const handleSaveSuccess = useCallback(
    (savedItem: CalendarMonthItemDTO, recurring: boolean, optimisticId?: string) => {
      void mutate(
        currentKey,
        (current: CalendarMonthSnapshotDTO | undefined) => {
          if (!current) return current;

          const withoutTemporary = optimisticId?.startsWith('optimistic:')
            ? current.items.filter((item) => item.id !== optimisticId)
            : current.items;
          const existingIndex = withoutTemporary.findIndex(
            (i) => i.id === savedItem.id || (i.sourceType === 'EVENT' && i.sourceId === savedItem.sourceId)
          );

          let updatedItems: CalendarMonthItemDTO[];
          if (existingIndex >= 0) {
            updatedItems = withoutTemporary.map((i, idx) =>
              idx === existingIndex ? savedItem : i
            );
          } else {
            updatedItems = [...withoutTemporary, savedItem];
          }

          // Stable sort
          updatedItems.sort((a, b) => {
            if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
            const diff = new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
            if (diff !== 0) return diff;
            return a.id.localeCompare(b.id);
          });

          return {
            ...current,
            items: updatedItems,
          };
        },
        false // Do not immediately re-fetch over the optimistic value
      ).then(() => recurring ? mutate(currentKey) : undefined);
    },
    [currentKey, mutate]
  );

  const handleOptimisticSave = useCallback((optimisticItem: CalendarMonthItemDTO, mutationId: string) => {
    ownMutationIds.current.add(mutationId);
    const previous = activeSnapshot.items.find((item) => item.id === optimisticItem.id);
    void mutate(currentKey, (current: CalendarMonthSnapshotDTO | undefined) => {
      if (!current) return current;
      const exists = current.items.some((item) => item.id === optimisticItem.id);
      return {
        ...current,
        items: exists
          ? current.items.map((item) => item.id === optimisticItem.id ? { ...item, ...optimisticItem, owner: item.owner, color: item.color } : item)
          : [...current.items, optimisticItem],
      };
    }, false);

    return () => {
      void mutate(currentKey, (current: CalendarMonthSnapshotDTO | undefined) => {
        if (!current) return current;
        const currentItem = current.items.find((item) => item.id === optimisticItem.id);
        const stillOwnOptimisticValue = currentItem && currentItem.title === optimisticItem.title &&
          currentItem.startAt === optimisticItem.startAt && currentItem.endAt === optimisticItem.endAt;
        if (previous && !stillOwnOptimisticValue) return current;
        return {
          ...current,
          items: previous
            ? current.items.map((item) => item.id === optimisticItem.id ? previous : item)
            : current.items.filter((item) => item.id !== optimisticItem.id),
        };
      }, false);
    };
  }, [activeSnapshot.items, currentKey, mutate]);

  const handleOptimisticDelete = useCallback((eventId: string, mutationId: string) => {
    ownMutationIds.current.add(mutationId);
    const removed = activeSnapshot.items.filter((item) => item.sourceType === 'EVENT' && item.sourceId === eventId);
    void mutate(currentKey, (current: CalendarMonthSnapshotDTO | undefined) => current ? {
      ...current,
      items: current.items.filter((item) => !(item.sourceType === 'EVENT' && item.sourceId === eventId)),
    } : current, false);
    return () => {
      void mutate(currentKey, (current: CalendarMonthSnapshotDTO | undefined) => current ? {
        ...current,
        items: [...current.items, ...removed.filter((oldItem) => !current.items.some((item) => item.id === oldItem.id))],
      } : current, false);
    };
  }, [activeSnapshot.items, currentKey, mutate]);

  // Optimistic update on delete success
  const handleDeleteSuccess = useCallback(
    (deletedId: string) => {
      mutate(
        currentKey,
        (current: CalendarMonthSnapshotDTO | undefined) => {
          if (!current) return current;
          return {
            ...current,
            items: current.items.filter(
              (i) => i.id !== deletedId && !(i.sourceType === 'EVENT' && i.sourceId === deletedId)
            ),
          };
        },
        false
      );
    },
    [currentKey, mutate]
  );

  return (
    <WorkspaceLayout scrollMode="hidden">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        autoScroll={false}
        accessibility={{ screenReaderInstructions: { draggable: 'Press space to pick up a calendar item. Use arrow keys to choose a date, space to drop, or Escape to cancel.' } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
      <div className="calendar-surface flex-1 flex flex-col min-h-0 gap-3">
        <CalendarToolbar
          currentYear={year}
          currentMonth={month}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onToday={handleToday}
          onNewEventClick={handleNewEventClick}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenFilters={() => setIsFiltersOpen(true)}
          activeFilterCount={calendarFilterCount(filters)}
          isDragging={Boolean(activeDragItem)}
        />

        {isMobileViewport !== true && <div className="hidden flex-1 min-h-0 flex-col relative md:flex">
          {isLoading && !snapshotData && (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-2xl">
              <div className="px-4 py-2 rounded-xl bg-[#3A3B3C] border border-[#4E4F50] text-xs text-slate-300 font-medium">
                Loading month...
              </div>
            </div>
          )}

          <CalendarMonthGrid
            rangeStart={new Date(activeSnapshot.rangeStart)}
            rangeEnd={new Date(activeSnapshot.rangeEnd)}
            currentYear={year}
            currentMonth={month}
            items={filteredItems}
            onItemClick={handleItemClick}
            onDayClick={handleDayClick}
            highlightedItemId={highlightedItemId}
          />
        </div>}
        {isMobileViewport === true && <div className="flex min-h-0 flex-1 flex-col gap-3 md:hidden">
          <CalendarMonthGrid rangeStart={new Date(activeSnapshot.rangeStart)} rangeEnd={new Date(activeSnapshot.rangeEnd)} currentYear={year} currentMonth={month} items={filteredItems} compact selectedDateKey={selectedMobileDateKey} onDayClick={setSelectedMobileDate} />
          <CalendarMobileAgenda date={selectedMobileDate} items={selectedMobileItems} onEventClick={handleItemClick} />
        </div>}
      </div>
      {typeof document !== 'undefined' && createPortal(
        <DragOverlay dropAnimation={null} zIndex={300}>
          {activeDragItem ? (
            <div
              style={activeDragWidth ? { width: activeDragWidth } : undefined}
              className="rounded-md border-2 border-[#C7F33C] bg-[#252728] px-2 py-1 text-xs font-semibold text-slate-100"
            >
              <div className="truncate">{activeDragItem.title}</div>
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
      </DndContext>

      {/* Slide-over Event Editor Drawer */}
      <CalendarEventPanel
        isOpen={isPanelOpen}
        onClose={closeEventPanel}
        editingItemId={editingItemId}
        editingOccurrence={editingOccurrence}
        defaultDate={panelDefaultDate}
        onSaveSuccess={handleSaveSuccess}
        onOptimisticSave={handleOptimisticSave}
        onOptimisticDelete={handleOptimisticDelete}
        onDeleteSuccess={handleDeleteSuccess}
        currentUserId={userId}
        refreshToken={detailRefreshToken}
      />
      <CalendarFiltersPanel isOpen={isFiltersOpen} filters={filters} owners={filterOptions.owners} departments={filterOptions.departments} tags={filterOptions.tags} onChange={updateFilters} onClose={() => setIsFiltersOpen(false)} />
      <CalendarSearchPanel isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} onSelect={handleSearchSelect} />
      {pendingMove && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Confirm calendar move">
          <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Cancel move" onClick={() => setPendingMove(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[#3A3B3C] bg-[#252728] p-6">
            <h2 className="text-base font-bold text-slate-100">Move repeating event</h2>
            <p className="mt-1 text-xs text-slate-400">Choose whether this move applies once or to the complete series.</p>
            <div className="mt-5 grid gap-3">
              <button onClick={() => { const move = pendingMove; setPendingMove(null); void executeMove(move, 'THIS_OCCURRENCE'); }} className="rounded-xl border border-[#4E4F50] bg-[#3A3B3C] px-4 py-3 text-left text-sm font-semibold text-slate-100 hover:border-[#C7F33C]">This occurrence</button>
              <button onClick={() => { const move = pendingMove; setPendingMove(null); void executeMove(move, 'ENTIRE_SERIES'); }} className="rounded-xl border border-[#4E4F50] bg-[#3A3B3C] px-4 py-3 text-left text-sm font-semibold text-slate-100 hover:border-[#C7F33C]">Entire series</button>
              <button onClick={() => setPendingMove(null)} className="px-4 py-2 text-xs font-semibold text-slate-400">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </WorkspaceLayout>
  );
};
