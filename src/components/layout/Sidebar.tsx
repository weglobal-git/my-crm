"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  ArrowLeft,
  MousePointer2,
  MessageSquare,
  FileText,
  Settings,
  Headphones,
  LayoutDashboard
} from "lucide-react";

const navigation = [

  { name: "Back", href: "#", icon: ArrowLeft },
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Pipeline", href: "/pipeline", icon: MousePointer2 },
  { name: "Quotations", href: "/quotations", icon: FileText },
  { name: "Customers", href: "/customers", icon: MessageSquare },
  { name: "System Settings", href: "/system", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-20 flex-col items-center bg-white py-8 shrink-0 shadow-[2px_0_10px_rgba(0,0,0,0.02)] z-20 rounded-r-3xl relative">
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
      <nav className="flex flex-1 flex-col items-center gap-6">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.name}
              href={item.href}
              title={item.name}
              className={`
                flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200
                ${isActive 
                  ? "bg-[#111111] text-white shadow-md" 
                  : "text-[#888888] hover:bg-[#F4F5F7] hover:text-[#111111]"}
              `}
            >
              <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
            </Link>
          );
        })}
      </nav>

      {/* Bottom Nav */}
      <div className="flex flex-col items-center gap-6 mt-auto">
        <Link
          href="/settings"
          title="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#888888] hover:bg-[#F4F5F7] hover:text-[#111111] transition-colors"
        >
          <Settings className="h-5 w-5" strokeWidth={2} />
        </Link>
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
