import React from 'react';

export function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row gap-10 items-start w-full">
      {children}
    </div>
  );
}

export function SettingsSidebar({ children, title, searchInput }: { children: React.ReactNode, title?: string, searchInput?: React.ReactNode }) {
  return (
    <div className="w-full md:w-64 lg:w-72 shrink-0 flex flex-col gap-4">
      {title && <h2 className="text-2xl font-bold text-slate-900 px-2">{title}</h2>}
      {searchInput && <div className="px-2">{searchInput}</div>}
      <div className="flex flex-col gap-1">
        {children}
      </div>
    </div>
  );
}

export function SettingsSidebarItem({ 
  icon, 
  label, 
  isActive, 
  onClick, 
}: { 
  icon: React.ReactNode, 
  label: string, 
  isActive: boolean, 
  onClick: () => void,
  iconBgColor?: string
}) {
  return (
    <button 
      onClick={onClick}
      className={`group/item w-full flex items-center gap-3 px-3 py-2 text-left transition-colors rounded-xl ${
        isActive 
          ? "bg-[#d4ff3a] text-black border-slate-100" 
          : "hover:bg-[#f4f5f7] border-transparent hover:border-slate-100 text-slate-900"
      }`}
    >
      <div className={`mt-0.5 p-1.5 rounded-lg transition-colors shrink-0 flex items-center justify-center ${isActive ? 'bg-black text-white' : 'text-slate-400 bg-slate-50 group-hover/item:bg-white group-hover/item:text-slate-700'}`}>
        <div className="flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">
          {icon}
        </div>
      </div>
      <span className="font-medium text-[15px] truncate">{label}</span>
    </button>
  );
}

export function SettingsContent({ children, title, action }: { children: React.ReactNode, title?: string, action?: React.ReactNode }) {
  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      {(title || action) && (
        <div className="flex items-end justify-between pb-4">
          {title && <h3 className="text-2xl font-bold text-slate-900 px-2">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="flex flex-col gap-8">
        {children}
      </div>
    </div>
  );
}

export function SettingsGroup({ children, label }: { children: React.ReactNode, label?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <h4 className="text-xs font-semibold text-slate-500 px-4 uppercase tracking-wider">{label}</h4>}
      <div className="bg-white rounded-[14px] border border-slate-200 overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  );
}

export function SettingsRow({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`flex items-center justify-between p-4 border-b border-slate-100 last:border-b-0 ${className}`}>
      {children}
    </div>
  );
}
