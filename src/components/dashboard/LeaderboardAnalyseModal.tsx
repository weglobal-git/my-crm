"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Sparkles,
  ChevronDown,
  ShieldCheck,
  Zap,
  Trophy,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Layers,
  Users,
  User,
} from "lucide-react";
import type { LeaderboardItem } from "@/lib/dashboard/leaderboard-types";
import {
  buildThaiDepartmentAnalysis,
  buildThaiLeaderboardAnalysis,
  type AnalysisTone,
} from "@/lib/dashboard/leaderboard-score-analysis";

export type AnalyseViewMode = "individual" | "team";

interface LeaderboardAnalyseModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: LeaderboardItem[];
  initialUserId?: string | null;
  initialMode?: AnalyseViewMode;
  canAnalyseAll?: boolean;
  hasSalesAccess?: boolean;
  month: number;
  year: number;
  currentMonth?: number;
  currentYear?: number;
  departmentName?: string;
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function fmtXp(val: number): string {
  const n = Math.round(val * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function getToneClasses(tone: AnalysisTone): {
  badge: string;
  boxBorder: string;
  accentText: string;
} {
  switch (tone) {
    case "excellent":
      return {
        badge: "bg-[#C7F33C]/15 text-[#C7F33C] border-[#C7F33C]/40",
        boxBorder: "border-[#C7F33C]/40 bg-[#1C1C1D]",
        accentText: "text-[#C7F33C]",
      };
    case "good":
      return {
        badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
        boxBorder: "border-emerald-500/35 bg-[#1C1C1D]",
        accentText: "text-emerald-300",
      };
    case "shield":
      return {
        badge: "bg-sky-500/15 text-sky-300 border-sky-500/35",
        boxBorder: "border-sky-500/40 bg-[#1C1C1D]",
        accentText: "text-sky-300",
      };
    case "warning":
      return {
        badge: "bg-amber-500/15 text-amber-300 border-amber-500/35",
        boxBorder: "border-amber-500/35 bg-[#1C1C1D]",
        accentText: "text-amber-300",
      };
    case "danger":
      return {
        badge: "bg-rose-500/15 text-rose-300 border-rose-500/35",
        boxBorder: "border-rose-500/40 bg-[#1C1C1D]",
        accentText: "text-rose-400",
      };
    default:
      return {
        badge: "bg-[#252728] text-slate-300 border-[#4E4F50]",
        boxBorder: "border-[#3A3B3C] bg-[#1C1C1D]",
        accentText: "text-slate-300",
      };
  }
}

export function LeaderboardAnalyseModal({
  isOpen,
  onClose,
  items,
  initialUserId,
  initialMode = "individual",
  canAnalyseAll = false,
  hasSalesAccess,
  month,
  year,
  currentMonth,
  currentYear,
  departmentName,
}: LeaderboardAnalyseModalProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<AnalyseViewMode>("individual");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Sync mode & selected user whenever modal opens, strictly enforcing `canAnalyseAll`
  useEffect(() => {
    if (!isOpen) {
      setIsUserMenuOpen(false);
      return;
    }

    if (!canAnalyseAll) {
      setViewMode("individual");
      const selfItem = items.find((i) => i.isCurrentUser);
      setSelectedUserId(selfItem?.userId ?? null);
      return;
    }

    setViewMode(initialMode);
    if (initialUserId && items.some((i) => i.userId === initialUserId)) {
      setSelectedUserId(initialUserId);
      return;
    }
    const selfItem = items.find((i) => i.isCurrentUser);
    setSelectedUserId(selfItem?.userId ?? items[0]?.userId ?? null);
  }, [isOpen, initialUserId, initialMode, canAnalyseAll, items]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isUserMenuOpen) {
          setIsUserMenuOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isUserMenuOpen, onClose]);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isUserMenuOpen]);

  // Strict RBAC guard: GENERAL users can ONLY resolve their own `isCurrentUser` item
  const activeItem = useMemo(() => {
    if (items.length === 0) return null;
    if (!canAnalyseAll) {
      return items.find((i) => i.isCurrentUser) ?? null;
    }
    return (
      items.find((i) => i.userId === selectedUserId) ||
      items.find((i) => i.isCurrentUser) ||
      items[0]
    );
  }, [items, selectedUserId, canAnalyseAll]);

  const analysis = useMemo(() => {
    if (!activeItem) return null;
    return buildThaiLeaderboardAnalysis(activeItem, {
      month,
      year,
      currentMonth,
      currentYear,
      departmentName,
    });
  }, [activeItem, month, year, currentMonth, currentYear, departmentName]);

  const teamAnalysis = useMemo(() => {
    if (!canAnalyseAll || items.length === 0) return null;
    return buildThaiDepartmentAnalysis(items, {
      month,
      year,
      currentMonth,
      currentYear,
      departmentName,
      hasSalesAccess,
    });
  }, [canAnalyseAll, items, month, year, currentMonth, currentYear, departmentName, hasSalesAccess]);

  if (!isOpen) return null;
  if (!canAnalyseAll && !activeItem) return null;
  if (canAnalyseAll && items.length === 0) return null;

  const effectiveMode: AnalyseViewMode = canAnalyseAll ? viewMode : "individual";
  const periodLabelTh =
    teamAnalysis?.periodLabelTh || analysis?.periodLabelTh || `${month}/${year}`;

  const getCategoryIcon = (id: string) => {
    switch (id) {
      case "card_health":
        return <ShieldCheck className="w-4 h-4 text-[#C7F33C] shrink-0" />;
      case "discipline_ltc":
        return <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />;
      case "velocity_teamwork":
        return <Zap className="w-4 h-4 text-amber-400 shrink-0" />;
      default:
        return <Trophy className="w-4 h-4 text-sky-400 shrink-0" />;
    }
  };

  const handleSelectMemberFromTeam = (userId: string) => {
    setSelectedUserId(userId);
    setViewMode("individual");
  };

  return (
    <>
      {/* Dark Overlay over parent drawer */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[110] transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Right Side Diagnostic Drawer (Flat UI - zero shadows) */}
      <div className="fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[500px] md:max-w-[calc(100vw-32px)] z-[111] flex">
        <div
          ref={drawerRef}
          className="w-full bg-[#252728] border-0 md:border border-[#4E4F50] flex flex-col h-full rounded-none md:rounded-2xl overflow-hidden"
        >
          {/* Header with Back Navigation */}
          <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 border-b border-[#1C1C1D] shrink-0 bg-[#252728]">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3A3B3C] border border-[#4E4F50] text-slate-200 hover:bg-[#C7F33C] hover:text-black hover:border-[#C7F33C] text-xs font-bold transition-colors cursor-pointer shrink-0"
                title="ย้อนกลับหน้าก่อนหน้า"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <div className="w-9 h-9 rounded-xl bg-[#C7F33C]/15 border border-[#C7F33C]/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-[#C7F33C]" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold text-slate-100">
                    Score Analysis
                  </h2>

                  {/* Manager User Switcher Dropdown (only when canAnalyseAll && Individual mode) */}
                  {canAnalyseAll && effectiveMode === "individual" && activeItem ? (
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsUserMenuOpen((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#1C1C1D] text-[#C7F33C] border border-[#4E4F50] hover:border-[#C7F33C] transition-colors cursor-pointer"
                        title="Switch department member"
                      >
                        <span className="max-w-[150px] truncate">
                          #{activeItem.rank} {activeItem.name}
                          {activeItem.isCurrentUser ? " (You)" : ""}
                        </span>
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>

                      {isUserMenuOpen && items.length > 1 && (
                        <div className="absolute top-full left-0 mt-1.5 w-64 max-h-64 overflow-y-auto custom-scrollbar rounded-xl bg-[#1C1C1D] border border-[#4E4F50] py-1 z-50">
                          {items.map((rep) => {
                            const isSelected = rep.userId === activeItem.userId;
                            return (
                              <button
                                key={rep.userId}
                                type="button"
                                onClick={() => {
                                  setSelectedUserId(rep.userId);
                                  setIsUserMenuOpen(false);
                                }}
                                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                  isSelected
                                    ? "bg-[#C7F33C]/15 text-[#C7F33C] font-bold"
                                    : "text-slate-200 hover:bg-[#3A3B3C]"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono text-[10px] text-slate-400 w-5 shrink-0">
                                    #{rep.rank}
                                  </span>
                                  <span className="truncate">
                                    {rep.name}
                                    {rep.isCurrentUser ? " (You)" : ""}
                                  </span>
                                </div>
                                <span className="font-mono text-[11px] shrink-0 text-slate-300">
                                  {fmtXp(rep.score)} XP
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : !canAnalyseAll && activeItem ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#1C1C1D] text-[#C7F33C] border border-[#3A3B3C]">
                      #{activeItem.rank} {activeItem.name} (You)
                    </span>
                  ) : canAnalyseAll && effectiveMode === "team" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#1C1C1D] text-[#C7F33C] border border-[#3A3B3C]">
                      <Users className="w-3 h-3" />
                      <span>All {items.length} Members</span>
                    </span>
                  ) : null}
                </div>

                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {departmentName ? `${departmentName} • ` : ""}
                  {periodLabelTh}
                </p>
              </div>
            </div>
          </div>

          {/* Manager Mode Switcher Bar: Team Summary vs Individual */}
          {canAnalyseAll && (
            <div className="px-5 pt-3 pb-1 shrink-0 bg-[#252728]">
              <div className="flex bg-[#1C1C1D] p-1 rounded-xl border border-[#3A3B3C] gap-1">
                <button
                  type="button"
                  onClick={() => setViewMode("team")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    effectiveMode === "team"
                      ? "bg-[#3A3B3C] text-[#C7F33C] font-bold border border-[#4E4F50]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Team Summary</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("individual")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    effectiveMode === "individual"
                      ? "bg-[#3A3B3C] text-[#C7F33C] font-bold border border-[#4E4F50]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Individual ({activeItem?.name || "Member"})</span>
                </button>
              </div>
            </div>
          )}

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4 text-xs">
            {effectiveMode === "team" && teamAnalysis ? (
              <>
                {/* TEAM MODE SECTION 1: Department Board Snapshot */}
                {(() => {
                  const boardStyle = getToneClasses(teamAnalysis.boardTone);
                  return (
                    <div className={`rounded-2xl border p-4 space-y-3 ${boardStyle.boxBorder}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 font-bold text-slate-100 text-xs">
                          <Users className="w-4 h-4 text-[#C7F33C] shrink-0" />
                          <span>สรุปภาพรวมทั้งแผนก ({teamAnalysis.departmentName})</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${boardStyle.badge}`}
                        >
                          การ์ดแดงวันนี้ {teamAnalysis.totalRedCardsToday}/
                          {teamAnalysis.totalActiveCardsToday} ใบ
                        </span>
                      </div>

                      <p className={`text-xs font-semibold leading-relaxed ${boardStyle.accentText}`}>
                        {teamAnalysis.headlineTh}
                      </p>

                      {/* 3 KPI Stat Boxes */}
                      <div className="grid grid-cols-3 gap-2 font-mono">
                        <div className="rounded-xl bg-[#252728] border border-[#3A3B3C] p-2.5 text-center">
                          <div className="text-[10px] font-sans text-slate-400">คะแนนเฉลี่ยทีม</div>
                          <div className="text-base font-black text-[#C7F33C] mt-0.5">
                            {fmtXp(teamAnalysis.avgTotalXp)}
                            <span className="text-[10px] text-slate-500 font-normal">/100</span>
                          </div>
                        </div>
                        <div className="rounded-xl bg-[#252728] border border-[#3A3B3C] p-2.5 text-center">
                          <div className="text-[10px] font-sans text-slate-400">การ์ดเปิดวันนี้</div>
                          <div className="text-base font-black text-slate-100 mt-0.5">
                            {teamAnalysis.totalActiveCardsToday}
                            <span className="text-[10px] text-slate-400 font-sans font-normal">
                              {" "}
                              ใบ
                            </span>
                          </div>
                        </div>
                        <div className="rounded-xl bg-[#252728] border border-[#3A3B3C] p-2.5 text-center">
                          <div className="text-[10px] font-sans text-slate-400">
                            {teamAnalysis.hasSalesAccess ? "คิวค้าง LTC" : "งานภายในเสร็จ"}
                          </div>
                          <div
                            className={`text-base font-black mt-0.5 ${
                              teamAnalysis.hasSalesAccess
                                ? teamAnalysis.pendingLtcCount === 0
                                  ? "text-emerald-400"
                                  : "text-amber-300"
                                : "text-sky-300"
                            }`}
                          >
                            {teamAnalysis.hasSalesAccess
                              ? `${teamAnalysis.pendingLtcCount} ราย`
                              : `${teamAnalysis.totalCompletedTasks} งาน`}
                          </div>
                        </div>
                      </div>

                      <ul className="space-y-1 text-[11.5px] text-slate-300 leading-relaxed pl-4 list-disc">
                        {teamAnalysis.summaryBulletsTh.map((bText, idx) => (
                          <li key={idx}>{bText}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                {/* TEAM MODE SECTION 2: Urgent Manager Coaching Alerts */}
                {teamAnalysis.managerAlerts.length > 0 && (
                  <div className="rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] p-4 space-y-2.5">
                    <div className="flex items-center gap-2 font-bold text-slate-100 text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>จุดที่หัวหน้าแผนกควรติดตามวันนี้ ({teamAnalysis.managerAlerts.length} รายการ)</span>
                    </div>

                    <div className="space-y-2">
                      {teamAnalysis.managerAlerts.map((alert) => {
                        const aStyle = getToneClasses(alert.tone);
                        return (
                          <div
                            key={alert.id}
                            className="rounded-xl bg-[#252728] border border-[#3A3B3C] p-2.5 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-100 text-[11.5px]">
                                {alert.titleTh}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${aStyle.badge}`}
                              >
                                {alert.badgeTh}
                              </span>
                            </div>
                            <div className="flex items-end justify-between gap-2">
                              <p className="text-[11px] text-slate-400 leading-relaxed">
                                {alert.detailTh}
                              </p>
                              {alert.userId && (
                                <button
                                  type="button"
                                  onClick={() => handleSelectMemberFromTeam(alert.userId!)}
                                  className="px-2.5 py-1 rounded-lg bg-[#1C1C1D] border border-[#4E4F50] text-[#C7F33C] hover:bg-[#C7F33C] hover:text-black text-[10.5px] font-bold shrink-0 transition-colors cursor-pointer"
                                >
                                  Analyse {alert.userName}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TEAM MODE SECTION 3: Full Department 4-Category Matrix (Click any member to drill down) */}
                <div className="rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-slate-100 text-xs">
                      <Layers className="w-4 h-4 text-[#C7F33C] shrink-0" />
                      <span>ตารางเปรียบเทียบคะแนนสมาชิกทั้งแผนก ({teamAnalysis.memberCount} คน)</span>
                    </div>
                    <span className="text-[10.5px] text-slate-400">คลิกชื่อเพื่อดูวิเคราะห์รายคน</span>
                  </div>

                  <div className="space-y-1.5">
                    {teamAnalysis.memberRows.map((row) => {
                      const rowStyle = getToneClasses(row.statusTone);
                      return (
                        <button
                          key={row.userId}
                          type="button"
                          onClick={() => handleSelectMemberFromTeam(row.userId)}
                          className="w-full text-left rounded-xl bg-[#252728] hover:bg-[#3A3B3C]/80 border border-[#3A3B3C] hover:border-[#C7F33C]/50 p-2.5 transition-colors cursor-pointer space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-[#1C1C1D] border border-[#4E4F50] text-[10px] font-mono font-bold text-slate-300 flex items-center justify-center shrink-0">
                                {row.rank}
                              </span>
                              <div className="w-6 h-6 rounded-full bg-[#1C1C1D] border border-[#4E4F50] overflow-hidden flex items-center justify-center shrink-0">
                                {row.image ? (
                                  <img
                                    src={row.image}
                                    alt={row.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className="text-[9px] font-bold text-slate-200">
                                    {getInitials(row.name)}
                                  </span>
                                )}
                              </div>
                              <span className="font-bold text-slate-100 text-xs truncate">
                                {row.name}
                                {row.isCurrentUser ? (
                                  <span className="text-[10px] text-slate-400 font-normal ml-1">
                                    (You)
                                  </span>
                                ) : null}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${rowStyle.badge}`}
                              >
                                {row.statusShortTh}
                              </span>
                              <span className="font-mono font-black text-xs text-[#C7F33C] min-w-[52px] text-right">
                                {fmtXp(row.totalXp)} XP
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-1 font-mono text-[10px] text-slate-400 pt-1 border-t border-[#3A3B3C]/60">
                            <div>
                              Health:{" "}
                              <span className="text-slate-200 font-bold">
                                {fmtXp(row.healthXp)}
                              </span>
                              /30
                            </div>
                            <div>
                              Disc:{" "}
                              <span className="text-slate-200 font-bold">
                                {fmtXp(row.disciplineXp)}
                              </span>
                              /20
                            </div>
                            <div>
                              Vel:{" "}
                              <span className="text-slate-200 font-bold">
                                {fmtXp(row.velocityXp)}
                              </span>
                              /25
                            </div>
                            <div>
                              Out:{" "}
                              <span className="text-slate-200 font-bold">
                                {fmtXp(row.outcomeXp)}
                              </span>
                              /25
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : activeItem && analysis ? (
              <>
                {/* INDIVIDUAL MODE: Top Summary Card */}
                <div className="rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-full bg-[#252728] border-2 border-[#C7F33C] overflow-hidden flex items-center justify-center shrink-0">
                        {activeItem.image ? (
                          <img
                            src={activeItem.image}
                            alt={activeItem.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-black text-[#C7F33C]">
                            {getInitials(activeItem.name)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-slate-100 truncate">
                            {activeItem.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#C7F33C] text-black shrink-0">
                            อันดับ #{activeItem.rank}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                          <Layers className="w-3.5 h-3.5 text-[#C7F33C] shrink-0" />
                          <span className="truncate">{analysis.portfolioSummaryTh}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-2xl font-black font-mono text-[#C7F33C] leading-none">
                        {fmtXp(analysis.totalXp)}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-1">
                        จากเต็ม 100 XP
                      </div>
                    </div>
                  </div>

                  {/* 4-Pillar Mini Progress Pills */}
                  <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-[#3A3B3C]/60 font-mono text-[11px]">
                    {analysis.categories.map((cat) => {
                      const shortLabel =
                        cat.id === "card_health"
                          ? "Health"
                          : cat.id === "discipline_ltc"
                          ? "Disc/LTC"
                          : cat.id === "velocity_teamwork"
                          ? "Velocity"
                          : "Outcome";
                      return (
                        <div
                          key={cat.id}
                          className="rounded-lg bg-[#252728] border border-[#3A3B3C] px-2 py-1.5 text-center"
                        >
                          <div className="text-[10px] text-slate-400 font-sans">
                            {shortLabel}
                          </div>
                          <div className="font-bold text-slate-100 mt-0.5">
                            {fmtXp(cat.earnedXp)}
                            <span className="text-slate-500 font-normal">/{cat.maxXp}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Section 1: Today's Live Snapshot */}
                {(() => {
                  const todayStyle = getToneClasses(analysis.todaySnapshot.tone);
                  return (
                    <div className={`rounded-2xl border p-4 space-y-2.5 ${todayStyle.boxBorder}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 font-bold text-slate-100 text-xs">
                          <Clock className="w-4 h-4 text-[#C7F33C] shrink-0" />
                          <span>{analysis.todaySnapshot.dateLabelTh}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${todayStyle.badge}`}
                        >
                          {analysis.todaySnapshot.statusBadgeTh}
                        </span>
                      </div>

                      <p className={`text-xs font-semibold leading-relaxed ${todayStyle.accentText}`}>
                        {analysis.todaySnapshot.headlineTh}
                      </p>

                      <ul className="space-y-1.5 text-[11.5px] text-slate-300 leading-relaxed pl-4 list-disc">
                        {analysis.todaySnapshot.detailsTh.map((detail, idx) => (
                          <li key={idx}>{detail}</li>
                        ))}
                      </ul>

                      {analysis.todaySnapshot.redCardsToday.length > 0 && (
                        <div className="pt-2 border-t border-[#3A3B3C]/70 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-300">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span>
                              รายชื่อการ์ดแดงที่ค้างอยู่ ({analysis.todaySnapshot.redCardsToday.length}{" "}
                              ใบ):
                            </span>
                          </div>
                          <div className="space-y-1">
                            {analysis.todaySnapshot.redCardsToday.slice(0, 5).map((rc) => (
                              <div
                                key={rc.dealId}
                                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#252728] border border-rose-500/30 text-[11px]"
                              >
                                <div className="min-w-0 truncate text-slate-200 font-medium">
                                  {rc.topic}
                                  {rc.companyName ? (
                                    <span className="text-slate-400 font-normal">
                                      {" "}
                                      ({rc.companyName})
                                    </span>
                                  ) : null}
                                </div>
                                <span className="font-mono text-[10px] text-rose-300 shrink-0">
                                  ค้าง +{fmtXp(rc.overdueWorkingHours)}h
                                </span>
                              </div>
                            ))}
                            {analysis.todaySnapshot.redCardsToday.length > 5 && (
                              <div className="text-[10.5px] text-slate-400 pl-1">
                                และอีก {analysis.todaySnapshot.redCardsToday.length - 5} ใบ
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Section 2: Quick Wins */}
                {analysis.quickWins.length > 0 && (
                  <div className="rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] p-4 space-y-2.5">
                    <div className="flex items-center gap-2 font-bold text-slate-100 text-xs">
                      <ArrowUpRight className="w-4 h-4 text-[#C7F33C] shrink-0" />
                      <span>วิธีเก็บคะแนนเพิ่มที่คุ้มค่าที่สุดตอนนี้</span>
                    </div>

                    <div className="space-y-2">
                      {analysis.quickWins.map((win) => (
                        <div
                          key={win.id}
                          className="rounded-xl bg-[#252728] border border-[#3A3B3C] p-2.5 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-100 text-[11.5px]">
                              {win.titleTh}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#C7F33C]/15 text-[#C7F33C] border border-[#C7F33C]/30 shrink-0">
                              {win.potentialXpLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            {win.detailTh}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 3: Easy-to-Understand 4-Category Breakdown */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1 font-bold text-slate-200 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-[#C7F33C] shrink-0" />
                    <span>
                      สรุปที่มาของคะแนนทั้ง 4 หมวดแบบเข้าใจง่าย (รวม {fmtXp(analysis.totalXp)} / 100
                      XP)
                    </span>
                  </div>

                  {analysis.categories.map((cat) => {
                    const style = getToneClasses(cat.tone);
                    return (
                      <div
                        key={cat.id}
                        className="rounded-2xl bg-[#1C1C1D] border border-[#3A3B3C] p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-bold text-slate-100 text-xs">
                            {getCategoryIcon(cat.id)}
                            <span>{cat.titleTh}</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md font-mono font-bold text-xs border shrink-0 ${style.badge}`}
                          >
                            {fmtXp(cat.earnedXp)} / {cat.maxXp} XP
                          </span>
                        </div>

                        <div className="px-3 py-2 rounded-xl bg-[#252728] border border-[#3A3B3C] text-[11.5px] font-semibold text-[#C7F33C] leading-relaxed">
                          {cat.summaryTextTh}
                        </div>

                        <ul className="space-y-1.5 text-[11.5px] text-slate-300 leading-relaxed pl-4 list-disc">
                          {cat.bulletsTh.map((bullet, idx) => (
                            <li key={idx}>{bullet}</li>
                          ))}
                        </ul>

                        <details className="group pt-0.5">
                          <summary className="text-[10.5px] text-slate-400 hover:text-slate-200 cursor-pointer select-none inline-flex items-center gap-1">
                            <span>ดูวิธีคิดตัวเลขละเอียด</span>
                            <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-[#252728] border border-[#3A3B3C] font-mono text-[10.5px] text-slate-300">
                            {cat.formulaText}
                          </div>
                        </details>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 border-t border-[#1C1C1D] bg-[#252728] flex items-center justify-between shrink-0">
            <span className="text-[11px] text-slate-400">
              สรุปผลคะแนนอัตโนมัติแบบเรียลไทม์
            </span>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#3A3B3C] border border-[#4E4F50] text-slate-200 hover:text-black hover:bg-[#C7F33C] hover:border-[#C7F33C] text-xs font-bold transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
