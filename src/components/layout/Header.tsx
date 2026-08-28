"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart2, Activity, Database, Share, Bell } from "lucide-react";

export function Header() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const tabs = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Analytics", href: "/analytics", icon: BarChart2 },
    { name: "Pulse", href: "/pulse", icon: Activity },
    { name: "Data", href: "/data", icon: Database },
  ];

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
        <div className="hidden md:flex items-center">
          <div className="flex -space-x-3 mr-4">
            <div className="w-10 h-10 rounded-full border-2 border-[#F4F5F7] bg-blue-100 z-30"></div>
            <div className="w-10 h-10 rounded-full border-2 border-[#F4F5F7] bg-green-100 z-20"></div>
            <div className="w-10 h-10 rounded-full border-2 border-[#F4F5F7] bg-yellow-100 z-10"></div>
            <div className="w-10 h-10 rounded-full border-2 border-[#F4F5F7] bg-[#111111] text-white flex items-center justify-center text-xs font-bold z-0">
              +6
            </div>
          </div>
          
          <button className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-full shadow-sm text-sm font-semibold hover:shadow-md transition-all">
            <Share className="w-4 h-4 text-slate-500" />
            Shared
          </button>
        </div>

        <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block"></div>

        {/* Notifications & Profile */}
        <div className="flex items-center gap-3">
          <button className="w-11 h-11 flex items-center justify-center rounded-full bg-white shadow-sm hover:shadow-md transition-all">
            <Bell className="w-5 h-5 text-slate-500" />
          </button>

          {status === "loading" ? (
            <div className="w-11 h-11 rounded-full bg-white animate-pulse shadow-sm"></div>
          ) : session?.user ? (
            <button 
              onClick={() => signOut()}
              title="Click to sign out"
              className="relative w-11 h-11 rounded-full border-2 border-white shadow-md overflow-hidden bg-white"
            >
              {session.user.image ? (
                <img src={session.user.image} alt={session.user.name || "User"} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold">
                  {session.user.name?.charAt(0) || "U"}
                </div>
              )}
            </button>
          ) : (
            <button
              onClick={() => signIn()}
              className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-md"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
