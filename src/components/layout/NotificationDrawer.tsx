"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X, Check, X as XIcon, Loader2 } from "lucide-react";
import { getMyNotifications } from "@/lib/actions/notification";

export type NotificationItem = Awaited<ReturnType<typeof getMyNotifications>>[number];

export interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onRespond?: (id: string, accept: boolean) => Promise<void> | void;
}

export function NotificationDrawer({
  isOpen,
  onClose,
  notifications,
  onRespond,
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
          className="w-full bg-[#252728] border-0 md:border border-[#3A3B3C] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 sm:p-6 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#3A3B3C] border border-[#4E4F50] flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-[#C7F33C]" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-100">
                  Notifications
                </h2>
                {notifications.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#C7F33C] text-black text-[11px] font-bold">
                    {notifications.length} New
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
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3">
            {notifications.length === 0 ? (
              <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#1C1C1D] border border-[#3A3B3C] flex items-center justify-center text-slate-500">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">No new notifications</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-[260px]">
                    You&apos;re all caught up! Transfers and invitations will appear here.
                  </p>
                </div>
              </div>
            ) : (
              notifications.map((notif) => {
                const isResponding = respondingId === notif.id;
                const isRequestType = ["DEAL_TRANSFER_REQUEST", "TEAM_INVITE_REQUEST"].includes(notif.type);

                return (
                  <div
                    key={notif.id}
                    className="bg-[#1E1F20] border border-[#3A3B3C] hover:border-[#4E4F50] rounded-xl p-4 transition-all flex flex-col gap-3"
                  >
                    <div className="flex items-start gap-3">
                      {/* Sender Avatar */}
                      <div className="w-9 h-9 rounded-full bg-[#252728] border border-[#3A3B3C] overflow-hidden shrink-0">
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
                          <span className="text-xs font-semibold text-slate-100 truncate">
                            {notif.sender?.name || "Team Member"}
                          </span>
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {formatRelativeTime(notif.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          {notif.message}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons for Transfer & Invite Requests */}
                    {isRequestType && (
                      <div className="flex items-center gap-2 pt-2 border-t border-[#2A2B2D]">
                        <button
                          type="button"
                          disabled={isResponding}
                          onClick={() => handleAction(notif.id, true)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-[#C7F33C] text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#b8e332] transition-colors cursor-pointer disabled:opacity-50"
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
                          className="flex-1 flex items-center justify-center gap-1.5 bg-[#2E3032] border border-[#4E4F50] text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#3A3B3C] transition-colors cursor-pointer disabled:opacity-50"
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
