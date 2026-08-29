"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bell, LayoutDashboard, Briefcase, FileText, Users } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";

import { pingActiveStatus, getActiveUsers } from "@/lib/actions/users";
import { getMyNotifications, respondToNotification } from "@/lib/actions/notification";
import { Check, X as XIcon } from "lucide-react";

const tabs = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Pipeline", href: "/pipeline", icon: Briefcase },
  { name: "Quotations", href: "/quotations", icon: FileText },
  { name: "Customers", href: "/customers", icon: Users },
];

export function Header() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  
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
    <header className="flex w-full items-center justify-between pt-8 pb-4 px-10">
      
      {/* Left: Floating Pill Navigation */}
      <div className="flex items-center gap-2 p-1.5 bg-white rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={`
                flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200
                ${isActive 
                  ? "bg-[#111111] text-white" 
                  : "bg-transparent text-[#888888] hover:bg-slate-50 hover:text-black"}
              `}
            >
              <tab.icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 2} />
              {tab.name}
            </Link>
          );
        })}
      </div>
      
      {/* Right: Team Avatars & User Profile */}
      <div className="flex items-center gap-4">
        
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
                    <Image src={user.image} alt={user.name || "User"} width={40} height={40} className="w-full h-full object-cover" />
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
            <div className="absolute top-full right-0 mt-3 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 animate-fade-in-up">
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
                          <Image src={user.image} alt={user.name || "User"} width={40} height={40} className="w-full h-full object-cover" />
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
                          {user.department?.name || user.role}
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
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white shadow-sm hover:shadow-md transition-all relative"
            >
              <Bell className="w-5 h-5 text-slate-500" />
              {notifications.length > 0 && (
                <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
              )}
            </button>
            
            {showNotifDropdown && (
              <div className="absolute top-full right-0 mt-3 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 animate-fade-in-up">
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
            <div className="w-11 h-11 rounded-full bg-white animate-pulse shadow-sm"></div>
          ) : session?.user ? (
            <button 
              onClick={() => signOut()}
              title="Click to sign out"
              className="relative w-11 h-11 rounded-full border-2 border-white shadow-md overflow-hidden bg-white"
            >
              {session.user.image ? (
                <Image 
                  src={session.user.image} 
                  alt="Profile" 
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#111111] text-white font-bold text-sm">
                  {session.user.name?.charAt(0).toUpperCase() || session.user.email?.charAt(0).toUpperCase() || "U"}
                </div>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
