"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Headphones, Settings, LayoutDashboard } from "lucide-react";
import { usePermissions } from "@/providers/PermissionProvider";
import { IconMap } from "@/lib/menu-registry";
import { useState, useRef } from "react";

export function Sidebar() {
  const pathname = usePathname();
  const { visibleMainMenus, visibleSubMenus, isLoading } = usePermissions();

  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (key: string) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHoveredMenu(key);
  };

  const handleMouseLeave = () => {
    hoverTimeout.current = setTimeout(() => {
      setHoveredMenu(null);
    }, 150);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-20 flex-col items-center bg-[#252728] py-8 shrink-0 z-20 relative animate-pulse border-r border-[#1C1C1D]">
         <div className="mb-12 h-12 w-12 rounded-xl bg-[#3A3B3C]" />
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
      <div 
        key={item.key} 
        className="relative flex items-center justify-center w-full"
        onMouseEnter={() => handleMouseEnter(item.key)}
        onMouseLeave={handleMouseLeave}
      >
        {/* Icon Container */}
        <Link
          href={subs.length > 0 && subs[0].href ? subs[0].href : "#"}
          className={`
            flex h-16 w-16 items-center justify-center rounded-full transition-all duration-200 cursor-pointer
            ${isActive 
              ? "bg-[#C7F33C] text-black" 
              : "text-slate-400 hover:bg-[#3A3B3C] hover:text-slate-100 border-transparent hover:border-[#1C1C1D]"}
          `}
        >
          <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
        </Link>

        {/* Hover Drawer for Sub-Menus */}
        {subs.length > 0 && (
          <div className={`fixed left-20 top-0 h-screen w-80 bg-[#252728] border-r border-[#1C1C1D] transition-all duration-200 z-40 flex flex-col pt-8 pb-8 shadow-[4px_0_24px_rgba(0,0,0,0.2)] cursor-default ${hoveredMenu === item.key ? 'opacity-100 pointer-events-auto visible' : 'opacity-0 pointer-events-none invisible'}`}>
            {/* Header */}
            <div className="px-6 pb-6 border-b border-[#1C1C1D] mb-4 flex items-center gap-3">
              <button className="p-1.5 text-slate-400 hover:text-slate-100 transition-colors bg-[#3A3B3C] hover:bg-slate-600 rounded-lg">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-lg font-semibold text-slate-100">{item.label}</h2>
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
                        ? "bg-[#C7F33C] border-transparent" 
                        : "hover:bg-[#3A3B3C] border-transparent hover:border-[#1C1C1D]"}
                    `}
                    onClick={() => setHoveredMenu(null)}
                  >
                    <div className={`mt-0.5 p-1.5 rounded-lg transition-colors ${isSubActive ? 'bg-black text-[#C7F33C]' : 'text-slate-400 bg-[#1C1C1D] group-hover/item:bg-[#252728] group-hover/item:text-slate-200'}`}>
                       <SubIcon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                       <span className={`font-semibold leading-tight ${isSubActive ? 'text-black' : 'text-slate-200'}`}>{sub.label}</span>
                       <span className={`text-xs mt-1 leading-snug ${isSubActive ? 'text-slate-800' : 'text-slate-500'}`}>{sub.description || `Access and manage ${sub.label.toLowerCase()} configurations.`}</span>
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
    <div className="flex h-screen w-20 flex-col items-center bg-[#252728] py-8 shrink-0 z-50 relative border-r border-[#1C1C1D]">
      {/* Logo */}
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-black text-white">
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
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:bg-[#3A3B3C] hover:text-slate-100 transition-colors"
        >
          <Headphones className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
