"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Headphones, Settings, LayoutDashboard } from "lucide-react";
import { usePermissions } from "@/providers/PermissionProvider";
import { IconMap } from "@/lib/menu-registry";

export function Sidebar() {
  const pathname = usePathname();
  const { visibleMainMenus, visibleSubMenus, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex h-screen w-20 flex-col items-center bg-white py-8 shrink-0 z-20 rounded-r-3xl relative animate-pulse">
         <div className="mb-12 h-12 w-12 rounded-xl bg-slate-200" />
      </div>
    );
  }

  const isMainMenuActive = (mainKey: string) => {
    const subs = visibleSubMenus(mainKey);
    return subs.some(sub => sub.href && (pathname === sub.href || (sub.href !== '/' && pathname.startsWith(`${sub.href}/`))));
  };

  const topMainMenus = visibleMainMenus.filter(m => m.key !== 'system' && visibleSubMenus(m.key).length > 0);
  const bottomMainMenus = visibleMainMenus.filter(m => m.key === 'system' && visibleSubMenus(m.key).length > 0);

  const renderMenuItem = (item: typeof visibleMainMenus[0]) => {
    const Icon = item.iconName ? IconMap[item.iconName] : Settings;
    const isActive = isMainMenuActive(item.key);
    const subs = visibleSubMenus(item.key);
    
    return (
      <div key={item.key} className="relative group flex items-center justify-center w-full">
        {/* Icon Container */}
        <Link
          href={subs.length > 0 && subs[0].href ? subs[0].href : "#"}
          className={`
            flex h-16 w-16 items-center justify-center rounded-full transition-all duration-200 cursor-pointer
            ${isActive 
              ? "bg-[#111111] text-white" 
              : "hover:bg-slate-50 border-transparent hover:border-slate-100"}
          `}
        >
          <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
        </Link>

        {/* Hover Drawer for Sub-Menus */}
        {subs.length > 0 && (
          <div className="fixed left-20 top-0 h-screen w-80 bg-white border-r border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-40 flex flex-col pt-8 pb-8 shadow-[4px_0_24px_rgba(0,0,0,0.02)] cursor-default">
            {/* Header */}
            <div className="px-6 pb-6 border-b border-slate-100/50 mb-4 flex items-center gap-3">
              <button className="p-1.5 text-slate-400 hover:text-slate-800 transition-colors bg-slate-50 hover:bg-slate-100 rounded-lg">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-lg font-semibold text-slate-900">{item.label}</h2>
            </div>

            <div className="px-6 mb-4">
               <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{item.label} Features</span>
            </div>

            {/* Sub-menu List */}
            <div className="flex-1 overflow-y-auto px-4 space-y-1">
              {subs.map((sub) => {
                const SubIcon = sub.iconName ? IconMap[sub.iconName] : LayoutDashboard;
                const isSubActive = sub.href && (pathname === sub.href || (sub.href !== '/' && pathname.startsWith(`${sub.href}/`)));
                
                return (
                  <Link
                    key={sub.key}
                    href={sub.href || "#"}
                    className={`
                      flex items-start gap-4 p-4 rounded-xl transition-all border border-transparent group/item
                      ${isSubActive 
                        ? "bg-[#d4ff3a] border-slate-100" 
                        : "hover:bg-slate-50 border-transparent hover:border-slate-100"}
                    `}
                  >
                    <div className={`mt-0.5 p-1.5 rounded-lg transition-colors ${isSubActive ? 'bg-black text-white' : 'text-slate-400 bg-slate-50 group-hover/item:bg-white group-hover/item:text-slate-700'}`}>
                       <SubIcon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                       <span className="font-semibold text-slate-800 leading-tight">{sub.label}</span>
                       <span className="text-xs text-slate-500 mt-1 leading-snug">{sub.description || `Access and manage ${sub.label.toLowerCase()} configurations.`}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen w-20 flex-col items-center bg-white py-8 shrink-0 z-50 rounded-r-3xl relative border-r border-slate-100">
      {/* Logo */}
      <div className="mb-12 flex h-12 w-12 items-center justify-center rounded-xl bg-black text-white">
        <div className="grid grid-cols-2 gap-1 w-5 h-5">
          <div className="bg-white rounded-full"></div>
          <div className="bg-white rounded-full"></div>
          <div className="bg-white rounded-full"></div>
          <div className="bg-white rounded-full"></div>
        </div>
      </div>
      
      {/* Main Nav */}
      <nav className="flex flex-1 flex-col items-center gap-2 w-full">
        {topMainMenus.map(renderMenuItem)}
      </nav>

      {/* Bottom Nav */}
      <div className="flex flex-col items-center gap-6 w-full mt-auto">
        {bottomMainMenus.map(renderMenuItem)}
        
        <button
          title="Support"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#888888] hover:bg-[#F4F5F7] hover:text-[#111111] transition-colors"
        >
          <Headphones className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
