"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bell, PanelLeft } from "lucide-react";
import { NotificationDrawer } from "./NotificationDrawer";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";

import { usePermissions } from "@/providers/PermissionProvider";
import { MenuDefinition } from "@/lib/menu-registry";
import { useSidebar } from "./SidebarContext";

import { getActiveUsers, pingAndGetActiveUsers } from "@/lib/actions/users";
import { dismissNotification, getMyNotifications, respondToNotification, type NotificationItem } from "@/lib/actions/notification";
import { getPusherClient, PUSHER_CONNECTION_ACTIVE_EVENT } from "@/lib/pusher";
import type PusherClient from "pusher-js";
import {
  broadcastEventAcrossTabs,
  NOTIFICATIONS_CHANGED_EVENT,
} from "@/lib/pusher-connection-manager";

type ActiveUser = Awaited<ReturnType<typeof getActiveUsers>>[number];

export function Header() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { visibleMainMenus, visibleSubMenus } = usePermissions();
  const { toggleTabletSidebar, columnNavConfig } = useSidebar();

  let currentMainMenu: MenuDefinition | null = null;
  let subMenus: MenuDefinition[] = [];

  for (const main of visibleMainMenus) {
    const subs = visibleSubMenus(main.key);
    if (subs.some(sub => sub.href && (pathname === sub.href || (sub.href !== '/' && pathname.startsWith(`${sub.href}/`))))) {
      currentMainMenu = main;
      subMenus = subs;
      break;
    }
  }

  const currentSubMenu = subMenus.find(sub => sub.href && (pathname === sub.href || (sub.href !== '/' && pathname.startsWith(`${sub.href}/`))));
  
  const [activeUsers, setActiveUsers] = useState<Awaited<ReturnType<typeof getActiveUsers>>>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const notificationMutationVersionRef = useRef(0);
  const notificationSyncRequestRef = useRef(0);


  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const syncNotifications = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const mutationVersion = notificationMutationVersionRef.current;
    const requestId = ++notificationSyncRequestRef.current;
    void getMyNotifications().then(res => {
      if (!res.success) {
        console.warn("[Header] Failed to sync notifications:", res.error);
        setNotificationError(res.error || "Failed to load notifications");
        return;
      }
      setNotificationError(null);
      if (
        requestId === notificationSyncRequestRef.current &&
        mutationVersion === notificationMutationVersionRef.current
      ) {
        setNotifications(res.data);
      }
    });
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      // 1. Initial self active user so list is never empty
      const currentUserData = {
        id: session.user.id,
        name: session.user.name || "User",
        email: session.user.email || "",
        image: session.user.image || null,
        role: ((session.user as Record<string, unknown>)?.role as string) || "USER",
        departments: Array.isArray((session.user as Record<string, unknown>)?.departments)
          ? ((session.user as Record<string, unknown>)?.departments as string[]).map((d: string) => ({ name: d }))
          : [],
        lastActive: new Date(),
      };
      queueMicrotask(() => {
        setActiveUsers([currentUserData as unknown as ActiveUser]);
      });

      // 2. Initial fetches & ping (single unified server round-trip)
      pingAndGetActiveUsers().then(users => {
        if (users && users.length > 0) {
          setActiveUsers(users);
        }
      });

      let isNotificationSubscribed = false;
      let isPresenceSubscribed = false;
      let realtimeClient: PusherClient | null = null;
      let hasSetupRealtime = false;
      let handleStateChange: ((states: { previous: string; current: string }) => void) | null = null;
      let handleConnError: ((err: unknown) => void) | null = null;


      syncNotifications();
      window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, syncNotifications);

      // Heartbeat fallback ping every 90s (active only when Pusher presence is not connected/subscribed)
      const pingInterval = setInterval(() => {
        if (!isPresenceSubscribed) {
          pingAndGetActiveUsers().then(users => {
            if (users && users.length > 0) {
              setActiveUsers(users);
            }
          });
        }
      }, 90000);

      // Fallback polling for notifications when private channel subscription is not active
      const notificationFallbackInterval = setInterval(() => {
        if (!isNotificationSubscribed || realtimeClient?.connection.state !== "connected") {
          syncNotifications();
        }
      }, 60000);

      // The connection manager is the only code allowed to create/connect the client.
      // A hidden initial load therefore registers this callback without touching the Proxy.
      const setupRealtimeSubscriptions = () => {
        if (hasSetupRealtime) return;
        const connectedClient = getPusherClient();
        if (!connectedClient || connectedClient.connection.state !== "connected") return;

        hasSetupRealtime = true;
        realtimeClient = connectedClient;

        // 3. Setup Pusher Presence Channel
        try {
          const presenceChannel = connectedClient.subscribe('presence-global');

          presenceChannel.bind('pusher:subscription_succeeded', (members: { each: (cb: (member: { id: string; info: Record<string, unknown> }) => void) => void }) => {
            isPresenceSubscribed = true;
            const users: ActiveUser[] = [];
            members.each((member) => {
              users.push({ id: member.id, ...member.info } as ActiveUser);
            });
            if (users.length > 0) setActiveUsers(users);
          });

          presenceChannel.bind('pusher:subscription_error', () => {
            isPresenceSubscribed = false;
          });

          presenceChannel.bind('pusher:member_added', (member: { id: string; info: Record<string, unknown> }) => {
            setActiveUsers((prev: ActiveUser[]) => {
              if (prev.find((u: ActiveUser) => u.id === member.id)) return prev;
              return [...prev, { id: member.id, ...member.info } as ActiveUser];
            });
          });

          presenceChannel.bind('pusher:member_removed', (member: { id: string }) => {
            setActiveUsers((prev: ActiveUser[]) => prev.filter((u: ActiveUser) => u.id !== member.id));
          });
        } catch (err) {
          console.warn("[Header] Pusher presence error:", err);
        }

        // 4. Setup Pusher Private Channel for Notifications
        try {
          const userChannelName = `private-user-${session.user.id}`;
          console.log(`[HEADER-PUSHER] Subscribing to: ${userChannelName} for user: "${session.user.name}" (${session.user.email})`);

          handleStateChange = (states: { previous: string; current: string }) => {
            console.log(`[PUSHER-CONNECTION] State changed: ${states.previous} -> ${states.current}`);
            if (states.current === "connected") {
              syncNotifications();
            } else {
              isNotificationSubscribed = false;
              isPresenceSubscribed = false;
            }
          };
          handleConnError = (err: unknown) => {
            const e = err as { type?: string; error?: { data?: { code?: number; message?: string } } };
            const code = e?.error?.data?.code;
            const msg = e?.error?.data?.message;
            if (code === 4004) {
              console.warn(`[PUSHER-CONNECTION] Pusher quota exceeded (code 4004: Account over quota). Fallback polling active.`);
            } else {
              console.warn(`[PUSHER-CONNECTION] Connection issue${code ? ` (${code})` : ''}:`, msg || err);
            }
            isNotificationSubscribed = false;
          };

          connectedClient.connection.bind('state_change', handleStateChange);
          connectedClient.connection.bind('error', handleConnError);

          const privateChannel = connectedClient.subscribe(userChannelName);

          privateChannel.bind('pusher:subscription_succeeded', () => {
            console.log(`[HEADER-PUSHER] Subscribed successfully to: ${userChannelName}`);
            isNotificationSubscribed = true;
            // Reconcile notifications missed during reconnect / subscription handshake window
            syncNotifications();
          });
          privateChannel.bind('pusher:subscription_error', (subscriptionStatus: unknown) => {
            console.warn(`[HEADER-PUSHER] Subscription status for ${userChannelName}:`, subscriptionStatus);
            isNotificationSubscribed = false;
          });

          privateChannel.bind('new-notification', (newNotif: NotificationItem) => {
            console.log(`[HEADER-PUSHER] Received 'new-notification':`, newNotif);
            broadcastEventAcrossTabs(userChannelName, 'new-notification', newNotif);
            if (!newNotif?.id) return;
            notificationMutationVersionRef.current += 1;
            setNotifications((prev: NotificationItem[]) => {
              if (prev.some(n => n?.id === newNotif.id)) return prev;
              return [newNotif, ...prev];
            });
          });

          privateChannel.bind('notification-resolved', (data: { id?: string }) => {
            if (!data?.id) return;
            notificationMutationVersionRef.current += 1;
            setNotifications((prev: NotificationItem[]) => prev.filter(n => n.id !== data.id));
          });

        } catch (err) {
          console.warn("[Header] Pusher notification error:", err);
        }
      };

      window.addEventListener(PUSHER_CONNECTION_ACTIVE_EVENT, setupRealtimeSubscriptions);
      setupRealtimeSubscriptions();

      return () => {
        clearInterval(pingInterval);
        clearInterval(notificationFallbackInterval);
        window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, syncNotifications);
        window.removeEventListener(PUSHER_CONNECTION_ACTIVE_EVENT, setupRealtimeSubscriptions);
        try {
          if (handleStateChange) realtimeClient?.connection.unbind('state_change', handleStateChange);
          if (handleConnError) realtimeClient?.connection.unbind('error', handleConnError);
          realtimeClient?.unsubscribe('presence-global');
          realtimeClient?.unsubscribe(`private-user-${session.user.id}`);
        } catch {}
      };
    }
  }, [status, session, syncNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const uniqueActiveUsers = useMemo(() => {
    const seen = new Set<string>();
    const unique: ActiveUser[] = [];
    for (const user of activeUsers) {
      if (!user?.id) continue;
      if (seen.has(user.id)) continue;
      seen.add(user.id);
      unique.push(user);
    }
    return unique;
  }, [activeUsers]);

  const uniqueNotifications = useMemo(() => {
    const seen = new Set<string>();
    const unique: NotificationItem[] = [];
    for (const notif of notifications) {
      if (!notif?.id) continue;
      if (seen.has(notif.id)) continue;
      seen.add(notif.id);
      unique.push(notif);
    }
    return unique;
  }, [notifications]);

  const displayUsers = uniqueActiveUsers.slice(0, 3);
  const remainingCount = Math.max(0, uniqueActiveUsers.length - 3);

  const handleRespond = async (id: string, accept: boolean) => {
    try {
      await respondToNotification(id, accept);
      notificationMutationVersionRef.current += 1;
      setNotifications((prev: NotificationItem[]) => prev.filter((n: NotificationItem) => n.id !== id));
      if (session?.user?.id) {
        broadcastEventAcrossTabs(`private-user-${session.user.id}`, 'notification-resolved', { id });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDismiss = async (id: string) => {
    await dismissNotification(id);
    notificationMutationVersionRef.current += 1;
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
    if (session?.user?.id) {
      broadcastEventAcrossTabs(`private-user-${session.user.id}`, 'notification-resolved', { id });
    }
  };


  return (
    <header className="flex w-full items-center justify-between py-1 px-2 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
      
      {/* Left: Tablet/Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleTabletSidebar}
          className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#3A3B3C] transition-colors focus:outline-none lg:hidden"
          title="Toggle Navigation"
          aria-label="Toggle Navigation"
        >
          <PanelLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          {currentMainMenu && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#3A3B3C] text-slate-400 hidden sm:inline-block">
              {currentMainMenu.label}
            </span>
          )}
          <span className="font-semibold text-base text-slate-100">
            {currentSubMenu?.label || currentMainMenu?.label || "Overview"}
          </span>
        </div>
      </div>
      
      {/* Center: Mobile Active Column Pill (Floating at Navbar on Mobile) */}
      {columnNavConfig?.currentTitle ? (
        <div className="md:hidden flex items-center justify-center">
          <button
            type="button"
            onClick={() => {
              if (columnNavConfig.hasNext) {
                columnNavConfig.onNext();
              } else if (columnNavConfig.hasPrev) {
                columnNavConfig.onPrev();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1C1C1D] border border-[#3A3B3C] text-xs font-semibold text-slate-200 active:scale-95 transition-all cursor-pointer select-none"
            title="Switch column"
          >
            <span className="max-w-[110px] truncate">{columnNavConfig.currentTitle}</span>
            {!columnNavConfig.hideCount && <span className="text-slate-500 font-normal">|</span>}
            {!columnNavConfig.hideCount && (columnNavConfig.currentRedCount !== undefined ? (
              <span className="tabular-nums">
                <span className={columnNavConfig.currentRedCount > 0 ? "text-[#C7F33C] font-bold" : "text-slate-400"}>
                  {columnNavConfig.currentRedCount}
                </span>
                <span className="text-slate-500 font-normal mx-0.5">/</span>
                <span className="text-slate-300">{columnNavConfig.currentCount ?? 0}</span>
              </span>
            ) : (
              <span className="text-[#C7F33C] font-bold">{columnNavConfig.currentCount ?? 0}</span>
            ))}
          </button>
        </div>
      ) : null}

      {/* Right: Team Avatars & User Profile */}
      <div className="flex items-center gap-1">

        {/* Team Avatars */}
        <div className="hidden md:flex items-center relative" ref={dropdownRef}>
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center hover:opacity-80 transition-opacity focus:outline-none"
            title="View Online Users"
          >
            <div className="flex -space-x-3">
              {displayUsers.map((user: ActiveUser, index: number) => (
                <div 
                  key={user.id} 
                  className={`w-10 h-10 rounded-full border-2 border-[#252728] bg-[#3A3B3C] flex items-center justify-center overflow-hidden z-${30 - index * 10} relative`}
                  style={{ zIndex: 30 - index * 10 }}
                >
                  {user.image ? (
                    <Image src={user.image} alt={user.name || "User"} width={40} height={40} unoptimized className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-slate-700">
                      {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "?"}
                    </span>
                  )}
                </div>
              ))}
              {remainingCount > 0 && (
                <div className="w-10 h-10 rounded-full border-2 border-[#252728] bg-[#C7F33C] text-black flex items-center justify-center text-xs font-bold z-0 relative">
                  +{remainingCount}
                </div>
              )}
              {uniqueActiveUsers.length === 0 && (
                <div className="text-xs font-medium text-slate-400 mr-2 z-10">No users online</div>
              )}
            </div>
          </button>

          {/* Active Users Dropdown */}
          {showDropdown && (
            <div className="absolute top-full right-0 mt-3 w-72 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] z-50 animate-fade-in-up">
              <div className="p-4 border-b border-[#4E4F50] flex justify-between items-center">
                <h3 className="font-semibold text-slate-100">Online Team</h3>
                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {uniqueActiveUsers.length} active
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {uniqueActiveUsers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">No one is online right now.</div>
                ) : (
                  uniqueActiveUsers.map((user: ActiveUser) => (
                    <div key={user.id} className="flex items-center gap-3 p-2 hover:bg-[#4E4F50] rounded-xl transition-colors">
                      <div className="w-10 h-10 rounded-full bg-[#252728] overflow-hidden relative shrink-0">
                        {user.image ? (
                          <Image src={user.image} alt={user.name || "User"} width={40} height={40} unoptimized className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-300">
                            {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "?"}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {user.name || "Unknown"} {session?.user?.id === user.id && "(You)"}
                        </div>
                        <div className="text-xs text-slate-300 truncate">
                          {user.departments?.[0]?.name || user.role}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block"></div>

        {/* Notifications & Profile */}
        <div className="flex items-center gap-1">
          
          <button 
            type="button"
            onClick={() => setIsNotificationDrawerOpen(true)}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[#3A3B3C] hover:bg-[#4E4F50] transition-all relative cursor-pointer"
            aria-label="Open notifications"
          >
            <Bell className="w-5 h-5 text-slate-300" />
            {uniqueNotifications.length > 0 && (
              <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-[#252728]"></span>
            )}
          </button>

          <NotificationDrawer
            isOpen={isNotificationDrawerOpen}
            onClose={() => setIsNotificationDrawerOpen(false)}
            notifications={uniqueNotifications}
            error={notificationError}
            onRetry={syncNotifications}
            onRespond={handleRespond}
            onDismiss={handleDismiss}
          />


          {status === "loading" ? (
            <div className="w-11 h-11 rounded-full bg-[#3A3B3C] animate-pulse"></div>
          ) : session?.user ? (
            <div className="relative" ref={profileDropdownRef}>
              <button 
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                title="Profile Menu"
                className="relative w-11 h-11 rounded-full border-2 border-transparent overflow-hidden bg-[#3A3B3C] hover:border-[#C7F33C] transition-colors block"
              >
                {session.user.image ? (
                  <Image 
                    src={session.user.image} 
                    alt="Profile" 
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[#111111] text-white font-bold text-xs hover:text-[#d4ff3a] transition-colors">
                    {session.user.name?.charAt(0).toUpperCase() || session.user.email?.charAt(0).toUpperCase() || "U"}
                  </div>
                )}
              </button>

              {showProfileDropdown && (
                <div className="absolute top-full right-0 mt-3 w-60 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] z-50 animate-fade-in-up py-2">
                  <div className="px-4 py-2 border-b border-[#4E4F50] mb-2">
                    <p className="text-xs font-bold text-white truncate">{session.user.name}</p>
                    <p className="text-xs text-slate-400 truncate">{session.user.email}</p>
                  </div>
                  <Link
                    href="/profile"
                    prefetch={false}
                    onClick={() => setShowProfileDropdown(false)}
                    className="block px-4 py-2 text-xs text-slate-200 hover:bg-[#4E4F50] transition-colors"
                  >
                    My Profile
                  </Link>
                  <button
                    onClick={() => {
                      setShowProfileDropdown(false);
                      signOut({ callbackUrl: "/" });
                    }}
                    className="w-full text-left block px-4 py-2 text-xs text-red-400 hover:bg-[#4E4F50] hover:text-red-300 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
