"use client";

import { useState, useRef, useEffect } from "react";
import { Building2, ChevronDown, Check, Briefcase, Wrench } from "lucide-react";
import type { DepartmentInfo } from "@/lib/dashboard/leaderboard-types";

interface DepartmentSelectorProps {
  departments: DepartmentInfo[];
  selectedDepartmentId: string;
  onSelectDepartment: (deptId: string) => void;
  disabled?: boolean;
}

export function DepartmentSelector({
  departments,
  selectedDepartmentId,
  onSelectDepartment,
  disabled = false,
}: DepartmentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDept =
    departments.find((d) => d.id === selectedDepartmentId) || departments[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  if (!selectedDept) return null;

  const canSwitch = departments.length > 1 && !disabled;

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        disabled={!canSwitch}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
          canSwitch
            ? "bg-[#3A3B3C] border-[#4E4F50] text-slate-100 hover:border-[#C7F33C]"
            : "bg-[#3A3B3C]/80 border-[#4E4F50]/60 text-slate-300 cursor-default"
        }`}
        title={canSwitch ? "Click to switch department" : "Current Department"}
      >
        <Building2 className="w-3.5 h-3.5 text-[#C7F33C]" />
        <span className="max-w-[160px] truncate">{selectedDept.name}</span>

        {/* Badge indicating Sales Focus vs Operations Focus */}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
            selectedDept.hasSalesAccess
              ? "bg-[#C7F33C]/20 border border-[#C7F33C]/40 text-[#C7F33C]"
              : "bg-sky-500/20 border border-sky-400/40 text-sky-300"
          }`}
        >
          {selectedDept.hasSalesAccess ? (
            <>
              <Briefcase className="w-2.5 h-2.5" />
              <span>Sales</span>
            </>
          ) : (
            <>
              <Wrench className="w-2.5 h-2.5" />
              <span>Operations</span>
            </>
          )}
        </span>

        {canSwitch && (
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        )}
      </button>

      {isOpen && canSwitch && (
        <div className="absolute left-0 mt-2 w-64 rounded-2xl bg-[#3A3B3C] border border-[#4E4F50] p-1.5 z-30 flex flex-col gap-1">
          <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#4E4F50]">
            Switch Department
          </div>
          <div className="max-h-60 overflow-y-auto hide-scrollbar flex flex-col gap-1 pt-1">
            {departments.map((dept) => {
              const isSelected = dept.id === selectedDept.id;
              return (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => {
                    onSelectDepartment(dept.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-[#4E4F50] text-[#C7F33C] font-bold"
                      : "text-slate-200 hover:bg-[#4E4F50]/60 hover:text-white"
                  }`}
                >
                  <div className="flex flex-col gap-0.5 truncate pr-2">
                    <span className="truncate">{dept.name}</span>
                    <span className="text-[10px] text-slate-400">
                      {dept.userCount} {dept.userCount === 1 ? "member" : "members"} •{" "}
                      {dept.hasSalesAccess ? "Sales focus" : "Operations focus"}
                    </span>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-[#C7F33C] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
