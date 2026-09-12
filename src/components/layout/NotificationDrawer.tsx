"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X, Check, X as XIcon, Loader2, AlertCircle, RefreshCw, CalendarDays } from "lucide-react";
import Link from "next/link";
import type { NotificationItem } from "@/lib/actions/notification";

export type { NotificationItem };

export interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  error?: string | null;
  onRetry?: () => void;
  onRespond?: (id: string, accept: boolean) => Promise<void> | void;
  onDismiss?: (id: string) => Promise<void> | void;
}

export function NotificationDrawer({
  isOpen,
  onClose,
  notifications,
  error,
  onRetry,
  onRespond,
  onDismiss,
}: NotificationDrawerProps) {

  const drawerRef = useRef<HTMLDivElement>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respondingAction, setRespondingAction] = useState<"accept" | "reject" | null>(null);

  // Pure relative time calculation with state updated every 30 seconds
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const formatRelativeTime = (dateInput?: Date | string | null) => {
    if (!dateInput) return "";
    const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    const diffMs = currentTime - date.getTime();
    if (diffMs < 0) return "Just now";
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (respondingId) return;
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !respondingId) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, respondingId]);

  const handleAction = async (id: string, accept: boolean) => {
    if (!onRespond) return;
    setRespondingId(id);
    setRespondingAction(accept ? "accept" : "reject");
    try {
      await onRespond(id, accept);
    } finally {
      setRespondingId(null);
      setRespondingAction(null);
    }
  };

  const handleDismiss = async (id: string) => {
    if (!onDismiss) return;
    setRespondingId(id);
    try {
      await onDismiss(id);
    } finally {
      setRespondingId(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => {
          if (!respondingId) onClose();
        }}
      />

      {/* Floating Drawer Card */}
      <div
        className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[450px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${
          isOpen
            ? "opacity-100 translate-y-0 md:translate-x-0 scale-100"
            : "opacity-0 translate-y-4 md:translate-x-8 scale-[0.97] pointer-events-none"
        }`}
      >
        <div
          ref={drawerRef}
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5">
              <Bell className="w-4 h-4 text-[#C7F33C] shrink-0" />
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100">
                  Notifications
                </h2>
                {notifications.length > 0 && (
                  <span className="text-xs font-medium text-slate-400">
                    {notifications.length} new
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={Boolean(respondingId)}
              className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 cursor-pointer disabled:opacity-50"
              aria-label="Close notifications"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Notifications Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-3">
            {error && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2.5 text-xs text-amber-300">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate">{error}</span>
                </div>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            )}

            {notifications.length === 0 ? (
              <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#1C1C1D] border border-[#3A3B3C] flex items-center justify-center text-slate-500">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">
                    {error ? "Unable to load notifications" : "No new notifications"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-[260px]">
                    {error
                      ? "A database or network issue occurred. Please click retry to sync."
                      : "You're all caught up! Transfers and invitations will appear here."}
                  </p>
                </div>
              </div>
            ) : (

              notifications.map((notif) => {
                const isResponding = respondingId === notif.id;
                const isRequestType = ["DEAL_TRANSFER_REQUEST", "TEAM_INVITE_REQUEST"].includes(notif.type);
                const isCalendarReminder = notif.type === 'CALENDAR_REMINDER';
                const [calendarEventId, occurrenceStartAt] = isCalendarReminder ? (notif.referenceId || '').split('|') : ['', ''];
                const calendarMonth = occurrenceStartAt && !Number.isNaN(new Date(occurrenceStartAt).getTime())
                  ? new Date(occurrenceStartAt).toISOString().slice(0, 7)
                  : '';

                return (
                  <div
                    key={notif.id}
                    className="border-b border-[#3A3B3C] px-2 py-4 transition-colors hover:bg-[#2A2C2D] flex flex-col gap-3"
                  >
                    <div className="flex items-start gap-3">
                      {/* Sender Avatar */}
                      <div className="w-9 h-9 rounded-full bg-[#252728] overflow-hidden shrink-0">
                        <img
                          src={
                            notif.sender?.image ||
                            `https://api.dicebear.com/7.x/notionists/svg?seed=${
                              encodeURIComponent(notif.sender?.name || notif.senderId || "user")
                            }`
                          }
                          alt={notif.sender?.name || "Sender"}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-200 truncate">
                            {isCalendarReminder ? notif.title : (notif.sender?.name || "Team Member")}
                          </span>
                          <span className="text-xs text-slate-500 shrink-0">
                            {formatRelativeTime(notif.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                          {notif.message}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons for Transfer & Invite Requests */}
                    {isRequestType && (
                      <div className="flex items-center justify-end gap-2 pl-12">
                        <button
                          type="button"
                          disabled={isResponding}
                          onClick={() => handleAction(notif.id, true)}
                          className="flex items-center justify-center gap-1.5 bg-[#C7F33C] text-slate-950 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b8e332] transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isResponding && respondingAction === "accept" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Accept</span>
                        </button>
                        <button
                          type="button"
                          disabled={isResponding}
                          onClick={() => handleAction(notif.id, false)}
                          className="flex items-center justify-center gap-1.5 border border-[#4E4F50] text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#3A3B3C] transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isResponding && respondingAction === "reject" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <XIcon className="w-3.5 h-3.5" />
                          )}
                          <span>Reject</span>
                        </button>
                      </div>
                    )}
                    {isCalendarReminder && (
                      <div className="flex items-center justify-end gap-2 pl-12">
                        <Link
                          href={`/calendar?month=${calendarMonth}&event=${encodeURIComponent(calendarEventId)}&occurrence=${encodeURIComponent(occurrenceStartAt)}`}
                          onClick={() => { void handleDismiss(notif.id); onClose(); }}
                          className="flex items-center justify-center gap-1.5 bg-[#C7F33C] text-slate-950 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b8e332] transition-colors"
                        >
                          <CalendarDays className="w-3.5 h-3.5" />
                          View calendar
                        </Link>
                        <button
                          type="button"
                          disabled={isResponding}
                          onClick={() => handleDismiss(notif.id)}
                          className="px-3 py-1.5 rounded-lg border border-[#4E4F50] text-slate-300 text-xs font-semibold hover:bg-[#3A3B3C] disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
