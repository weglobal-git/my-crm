"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { usePermissions } from "@/providers/PermissionProvider";
import { MenuDefinition } from "@/lib/menu-registry";

import { getActiveUsers } from "@/lib/actions/users";
import { getMyNotifications, respondToNotification } from "@/lib/actions/notification";
import { pusherClient } from "@/lib/pusher";
import { Check, X as XIcon } from "lucide-react";

export function Header() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { visibleMainMenus, visibleSubMenus } = usePermissions();

  let currentMainMenu = null;
  let subMenus: MenuDefinition[] = [];

  for (const main of visibleMainMenus) {
    const subs = visibleSubMenus(main.key);
    if (subs.some(sub => sub.href && (pathname === sub.href || (sub.href !== '/' && pathname.startsWith(`${sub.href}/`))))) {
      currentMainMenu = main;
      subMenus = subs;
      break;
    }
  }
  
  const [activeUsers, setActiveUsers] = useState<Awaited<ReturnType<typeof getActiveUsers>>>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<Awaited<ReturnType<typeof getMyNotifications>>>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      // 1. Initial fetches
      getMyNotifications().then(setNotifications);

      // 2. Setup Pusher Presence Channel
      const presenceChannel = pusherClient.subscribe('presence-global');
      
      presenceChannel.bind('pusher:subscription_succeeded', (members: { each: (cb: (member: { id: string; info: Record<string, unknown> }) => void) => void }) => {
        const users: Awaited<ReturnType<typeof getActiveUsers>> = [];
        members.each((member) => {
          users.push({ id: member.id, ...member.info } as Awaited<ReturnType<typeof getActiveUsers>>[number]);
        });
        setActiveUsers(users);
      });

      presenceChannel.bind('pusher:member_added', (member: { id: string; info: Record<string, unknown> }) => {
        setActiveUsers(prev => {
          if (prev.find(u => u.id === member.id)) return prev;
          return [...prev, { id: member.id, ...member.info } as Awaited<ReturnType<typeof getActiveUsers>>[number]];
        });
      });

      presenceChannel.bind('pusher:member_removed', (member: { id: string }) => {
        setActiveUsers(prev => prev.filter(u => u.id !== member.id));
      });

      // 3. Setup Pusher Private Channel for Notifications
      const privateChannel = pusherClient.subscribe(`private-user-${session.user.id}`);
      
      privateChannel.bind('new-notification', (newNotif: Awaited<ReturnType<typeof getMyNotifications>>[number]) => {
        setNotifications(prev => [newNotif, ...prev]);
      });

      return () => {
        pusherClient.unsubscribe('presence-global');
        pusherClient.unsubscribe(`private-user-${session.user.id}`);
      };
    }
  }, [status, session]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target as Node)) {
        setShowNotifDropdown(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayUsers = activeUsers.slice(0, 3);
  const remainingCount = Math.max(0, activeUsers.length - 3);

  const handleRespond = async (id: string, accept: boolean) => {
    try {
      await respondToNotification(id, accept);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <header className="flex w-full items-center justify-between px-6 py-1 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
      
      {/* Left: Quick Nav Pills */}
      <div className="flex items-center gap-4">
        {currentMainMenu && (
          <>
            <span className="font-semibold text-slate-100">{currentMainMenu.label}</span>
            {subMenus.length > 0 && <span className="text-slate-600">|</span>}
            <div className="flex items-center gap-2">
              {subMenus.map(sub => {
                const isActive = sub.href && (pathname === sub.href || (sub.href !== '/' && pathname.startsWith(`${sub.href}/`)));
                return (
                  <Link 
                    key={sub.key}
                    href={sub.href || "#"} 
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isActive 
                        ? "bg-[#C7F33C] text-black" 
                        : "bg-[#3A3B3C] text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    {sub.label}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
      
      {/* Right: Search, Team Avatars & User Profile */}
      <div className="flex items-center gap-4">
        
        <div className="hidden lg:flex items-center w-64 xl:w-80 bg-[#3A3B3C] hover:bg-[#4E4F50] rounded-full p-1.5 pl-4 border border-[#4E4F50] focus-within:border-[#C7F33C] focus-within:ring-1 focus-within:ring-[#C7F33C] focus-within:bg-[#252728] transition-all">
          <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
          <input 
            type="text" 
            placeholder="Search CRM..." 
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-slate-400 text-slate-100"
          />
        </div>

        <div className="h-6 w-px bg-slate-600 hidden lg:block"></div>

        {/* Team Avatars */}
        <div className="hidden md:flex items-center relative" ref={dropdownRef}>
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center hover:opacity-80 transition-opacity focus:outline-none"
            title="View Online Users"
          >
            <div className="flex -space-x-3 mr-4">
              {displayUsers.map((user, index) => (
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
              {activeUsers.length === 0 && (
                <div className="text-sm font-medium text-slate-400 mr-2 z-10">No users online</div>
              )}
            </div>
          </button>

          {/* Active Users Dropdown */}
          {showDropdown && (
            <div className="absolute top-full right-0 mt-3 w-72 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] z-50 animate-fade-in-up">
              <div className="p-4 border-b border-[#4E4F50] flex justify-between items-center">
                <h3 className="font-semibold text-slate-100">Online Team</h3>
                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {activeUsers.length} active
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {activeUsers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">No one is online right now.</div>
                ) : (
                  activeUsers.map(user => (
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
                        <div className="text-sm font-semibold text-slate-100 truncate">
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
        <div className="flex items-center gap-3">
          
          <div className="relative flex items-center" ref={notifDropdownRef}>
            <button 
              onClick={() => setShowNotifDropdown(!showNotifDropdown)}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-[#3A3B3C] hover:bg-[#4E4F50] transition-all relative"
            >
              <Bell className="w-5 h-5 text-slate-300" />
              {notifications.length > 0 && (
                <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-[#252728]"></span>
              )}
            </button>
            
            {showNotifDropdown && (
              <div className="absolute top-full right-0 mt-3 w-80 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] z-50 animate-fade-in-up">
                <div className="p-4 border-b border-[#4E4F50] flex justify-between items-center">
                  <h3 className="font-semibold text-slate-100">Notifications</h3>
                  {notifications.length > 0 && (
                    <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      {notifications.length} new
                    </span>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
                      <Bell className="w-8 h-8 text-slate-200" />
                      <p>No new notifications</p>
                    </div>
                  ) : (
                    notifications.map(notif => (
                      <div key={notif.id} className="flex flex-col gap-2 p-3 hover:bg-[#4E4F50] rounded-xl transition-colors">
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#252728] overflow-hidden shrink-0">
                                  <img src={notif.sender?.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${notif.sender?.name || notif.senderId}`} alt="Avatar" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 text-sm text-slate-300">
                            <span className="font-bold text-slate-100">{notif.sender?.name || 'User'}</span> {notif.message}
                          </div>
                        </div>
                        {['DEAL_TRANSFER_REQUEST', 'TEAM_INVITE_REQUEST'].includes(notif.type) && (
                          <div className="flex gap-2 mt-1 ml-11">
                            <button 
                              onClick={() => handleRespond(notif.id, true)}
                              className="flex-1 flex items-center justify-center gap-1 bg-black text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
                            >
                              <Check className="w-3 h-3" /> Accept
                            </button>
                            <button 
                              onClick={() => handleRespond(notif.id, false)}
                              className="flex-1 flex items-center justify-center gap-1 bg-[#3A3B3C] border border-[#4E4F50] text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#4E4F50] transition-colors"
                            >
                              <XIcon className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

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
                  <div className="w-full h-full flex items-center justify-center bg-[#111111] text-white font-bold text-sm hover:text-[#d4ff3a] transition-colors">
                    {session.user.name?.charAt(0).toUpperCase() || session.user.email?.charAt(0).toUpperCase() || "U"}
                  </div>
                )}
              </button>

              {showProfileDropdown && (
                <div className="absolute top-full right-0 mt-3 w-48 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] z-50 animate-fade-in-up py-2 shadow-lg">
                  <div className="px-4 py-2 border-b border-[#4E4F50] mb-2">
                    <p className="text-sm font-bold text-white truncate">{session.user.name}</p>
                    <p className="text-xs text-slate-400 truncate">{session.user.email}</p>
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setShowProfileDropdown(false)}
                    className="block px-4 py-2 text-sm text-slate-200 hover:bg-[#4E4F50] transition-colors"
                  >
                    My Profile
                  </Link>
                  <button
                    onClick={() => {
                      setShowProfileDropdown(false);
                      signOut({ callbackUrl: "/" });
                    }}
                    className="w-full text-left block px-4 py-2 text-sm text-red-400 hover:bg-[#4E4F50] hover:text-red-300 transition-colors"
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
