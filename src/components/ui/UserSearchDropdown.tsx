import { useState, useRef, useEffect } from "react";

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
  department?: { name: string } | null;
}

interface UserSearchDropdownProps {
  users: User[];
  onSelect: (userId: string) => void;
  actionLabel: string;
  isLoading?: boolean;
  isOpen: boolean;
  onClose: () => void;
  excludeUserIds?: string[];
  align?: "left" | "right";
}

export function UserSearchDropdown({ 
  users, 
  onSelect, 
  actionLabel, 
  isLoading = false, 
  isOpen, 
  onClose, 
  excludeUserIds = [],
  align = "right"
}: UserSearchDropdownProps) {
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Reset search when opened
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => setSearch(""), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredUsers = users.filter(u => 
    !excludeUserIds.includes(u.id) &&
    u.role !== 'ADMIN' &&
    (u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  const alignmentClass = align === "left" ? "left-0" : "right-0";

  return (
    <div ref={dropdownRef} className={`absolute top-full ${alignmentClass} mt-2 w-80 bg-white rounded-xl  border border-slate-100 z-30 p-2 animate-fade-in-up`}>
      <div className="mb-2">
        <input 
          type="text" 
          placeholder="Search user..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-300"
        />
      </div>
      <div className="max-h-40 overflow-y-auto custom-scrollbar flex flex-col gap-1">
        {filteredUsers.map(u => (
          <div key={u.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
            <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
              <img src={u.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${u.name || u.email || u.id}`} alt="Avatar" className="w-8 h-8 rounded-full shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium text-slate-700 truncate">{u.name}</span>
                {u.department?.name && (
                  <span className="text-[10px] text-slate-400 font-semibold truncate uppercase tracking-wider">{u.department.name}</span>
                )}
              </div>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onSelect(u.id);
                onClose();
              }}
              disabled={isLoading}
              className="px-3 py-1 rounded-md text-[10px] font-bold bg-white border border-slate-200 text-slate-700 hover:border-black hover:text-black transition-colors disabled:opacity-50"
            >
              {actionLabel}
            </button>
          </div>
        ))}
        {filteredUsers.length === 0 && (
          <div className="p-2 text-center text-xs text-slate-400">No users found.</div>
        )}
      </div>
    </div>
  );
}
