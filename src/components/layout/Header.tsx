"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { usePermissions } from "@/providers/PermissionProvider";
import { MenuDefinition } from "@/lib/menu-registry";

import { pingActiveStatus, getActiveUsers } from "@/lib/actions/users";
import { getMyNotifications, respondToNotification } from "@/lib/actions/notification";
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

  useEffect(() => {
    if (status === "authenticated") {
      pingActiveStatus();
      getActiveUsers().then(setActiveUsers);
      getMyNotifications().then(setNotifications);

      const pingInterval = setInterval(() => {
        pingActiveStatus();
      }, 30 * 1000);

      const fetchInterval = setInterval(() => {
        getActiveUsers().then(setActiveUsers);
      }, 15 * 1000);

      const notifInterval = setInterval(() => {
        getMyNotifications().then(setNotifications);
      }, 15 * 1000);

      return () => {
        clearInterval(pingInterval);
        clearInterval(fetchInterval);
        clearInterval(notifInterval);
      };
    }
  }, [status]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target as Node)) {
        setShowNotifDropdown(false);
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
    <header className="flex w-full items-center justify-between px-6 py-1 border-b border-slate-200 shrink-0">
      
      {/* Left: Quick Nav Pills */}
      <div className="flex items-center gap-4">
        {currentMainMenu && (
          <>
            <span className="font-semibold text-slate-800">{currentMainMenu.label}</span>
            {subMenus.length > 0 && <span className="text-slate-300">|</span>}
            <div className="flex items-center gap-2">
              {subMenus.map(sub => {
                const isActive = sub.href && (pathname === sub.href || (sub.href !== '/' && pathname.startsWith(`${sub.href}/`)));
                return (
                  <Link 
                    key={sub.key}
                    href={sub.href || "#"} 
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isActive 
                        ? "bg-black text-white" 
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
        
        {/* Global Search Box */}
        <div className="hidden lg:flex items-center w-64 xl:w-80 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 pl-4 border border-slate-200 focus-within:border-[#007aff] focus-within:bg-white transition-all">
          <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
          <input 
            type="text" 
            placeholder="Search CRM..." 
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-slate-400"
          />
        </div>

        <div className="h-6 w-px bg-slate-200 hidden lg:block"></div>

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
                  className={`w-10 h-10 rounded-full border-2 border-[#F4F5F7] bg-white flex items-center justify-center overflow-hidden z-${30 - index * 10} relative`}
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
                <div className="w-10 h-10 rounded-full border-2 border-[#F4F5F7] bg-[#111111] text-white flex items-center justify-center text-xs font-bold z-0 relative">
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
            <div className="absolute top-full right-0 mt-3 w-72 bg-white rounded-2xl  border border-slate-100 z-50 animate-fade-in-up">
              <div className="p-4 border-b border-slate-50 flex justify-between items-center">
                <h3 className="font-semibold text-slate-900">Online Team</h3>
                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {activeUsers.length} active
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {activeUsers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">No one is online right now.</div>
                ) : (
                  activeUsers.map(user => (
                    <div key={user.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl transition-colors">
                      <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden relative shrink-0">
                        {user.image ? (
                          <Image src={user.image} alt={user.name || "User"} width={40} height={40} unoptimized className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-700">
                            {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "?"}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {user.name || "Unknown"} {session?.user?.id === user.id && "(You)"}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
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
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white   transition-all relative"
            >
              <Bell className="w-5 h-5 text-slate-500" />
              {notifications.length > 0 && (
                <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
              )}
            </button>
            
            {showNotifDropdown && (
              <div className="absolute top-full right-0 mt-3 w-80 bg-white rounded-2xl  border border-slate-100 z-50 animate-fade-in-up">
                <div className="p-4 border-b border-slate-50 flex justify-between items-center">
                  <h3 className="font-semibold text-slate-900">Notifications</h3>
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
                      <div key={notif.id} className="flex flex-col gap-2 p-3 hover:bg-slate-50 rounded-xl transition-colors">
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden shrink-0">
                                  <img src={notif.sender?.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${notif.sender?.name || notif.senderId}`} alt="Avatar" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 text-sm text-slate-700">
                            <span className="font-bold text-slate-900">{notif.sender?.name || 'User'}</span> {notif.message}
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
                              className="flex-1 flex items-center justify-center gap-1 bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
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
            <div className="w-11 h-11 rounded-full bg-white animate-pulse "></div>
          ) : session?.user ? (
            <Link 
              href="/profile"
              title="Go to Profile"
              className="relative w-11 h-11 rounded-full border-2 border-white overflow-hidden bg-white hover:border-[#d4ff3a] transition-colors block"
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
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
