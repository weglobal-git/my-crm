"use client";

import { useState, useRef, useEffect } from "react";
import { Building2, Menu, X, Trophy, XCircle, Briefcase, Trash2 } from "lucide-react";
import { DealTypeIcon } from "./DealTypeBadge";
import { OpportunityType } from "@prisma/client";

export interface EditDealMainBarProps {
  dealType: OpportunityType;
  topic: string;
  onTopicSave: (newTopic: string) => Promise<void>;
  canEditTopic: boolean;
  companyName?: string | null;
  companyDisplayName?: string | null;
  canCloseDeal: boolean;
  onCloseAsWon: () => void;
  onCloseAsLost: () => void;
  canConvert?: boolean;
  isConverting?: boolean;
  onConvert?: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
  onClose: () => void;
}

export function EditDealMainBar({
  dealType,
  topic,
  onTopicSave,
  canEditTopic,
  companyName,
  companyDisplayName,
  canCloseDeal,
  onCloseAsWon,
  onCloseAsLost,
  canConvert = false,
  isConverting = false,
  onConvert,
  canDelete = false,
  onDelete,
  onClose,
}: EditDealMainBarProps) {
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [topicValue, setTopicValue] = useState(topic);
  const [isSavingTopic, setIsSavingTopic] = useState(false);
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);
  const hamburgerMenuRef = useRef<HTMLDivElement>(null);

  // Sync external topic changes
  useEffect(() => {
    setTopicValue(topic);
  }, [topic]);

  // Click outside to close hamburger menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (hamburgerMenuRef.current && !hamburgerMenuRef.current.contains(event.target as Node)) {
        setShowHamburgerMenu(false);
      }
    }
    if (showHamburgerMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showHamburgerMenu]);

  const handleCommitTopic = async () => {
    const trimmed = topicValue.trim();
    if (!trimmed || trimmed === topic) {
      setTopicValue(topic);
      setIsEditingTopic(false);
      return;
    }
    setIsSavingTopic(true);
    try {
      await onTopicSave(trimmed);
    } catch {
      setTopicValue(topic);
    } finally {
      setIsSavingTopic(false);
      setIsEditingTopic(false);
    }
  };

  const hasAnyActions = canCloseDeal || canConvert || canDelete;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[#1C1C1D] shrink-0 min-h-[56px] relative bg-[#252728]">
      {/* Left: Project Title & Account */}
      <div className="flex flex-col flex-1 pr-3 min-w-0">
        <div className="flex items-center gap-2">
          <div title={dealType === "SALES_DEAL" ? "Sales Deal" : "Internal Task"} className="shrink-0">
            <DealTypeIcon type={dealType} size="sm" />
          </div>

          {isEditingTopic ? (
            <div className="relative flex-1 min-w-0">
              <input
                autoFocus
                type="text"
                value={topicValue}
                onChange={(e) => setTopicValue(e.target.value)}
                onBlur={handleCommitTopic}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setTopicValue(topic);
                    setIsEditingTopic(false);
                  }
                }}
                disabled={isSavingTopic}
                className="w-full bg-[#1C1C1D] border border-[#4E4F50] rounded-md px-2 py-0.5 text-xs font-semibold text-slate-100 focus:outline-none focus:border-[#C7F33C]"
              />
            </div>
          ) : (
            <h2
              className={`text-xs font-semibold text-slate-100 line-clamp-1 flex-1 min-w-0 ${
                canEditTopic ? "cursor-text hover:text-white" : ""
              }`}
              onClick={() => canEditTopic && setIsEditingTopic(true)}
              title={canEditTopic ? "Click to edit title" : undefined}
            >
              {topic}
            </h2>
          )}
        </div>

        {/* Customer / Company Row */}
        {(companyDisplayName || companyName) && (
          <div
            className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 font-medium pl-0.5"
            title={companyName || undefined}
          >
            <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="truncate">{companyDisplayName || companyName}</span>
            {companyDisplayName && companyDisplayName !== companyName && (
              <span className="text-[10px] text-slate-500 truncate">({companyName})</span>
            )}
          </div>
        )}
      </div>

      {/* Right: Hamburger Menu & Close */}
      <div className="flex items-center gap-1.5 shrink-0 relative">
        {/* Hamburger Action Menu */}
        <div className="relative" ref={hamburgerMenuRef}>
          <button
            type="button"
            onClick={() => setShowHamburgerMenu((prev) => !prev)}
            className={`p-2 rounded-full transition-colors cursor-pointer ${
              showHamburgerMenu
                ? "text-white bg-[#3A3B3C]"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C]"
            }`}
            title="Card actions"
            aria-label="Card actions menu"
          >
            <Menu className="w-4 h-4" />
          </button>

          {showHamburgerMenu && (
            <div className="absolute right-0 top-full mt-1.5 min-w-[200px] bg-[#252728] border border-[#3A3B3C] rounded-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
              {/* Close as Won / Close as Lost (card owner or admin only) */}
              {canCloseDeal && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerMenu(false);
                      onCloseAsWon();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-colors text-left cursor-pointer"
                  >
                    <Trophy className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Close as Won</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerMenu(false);
                      onCloseAsLost();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 rounded-lg transition-colors text-left cursor-pointer"
                  >
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Close as Lost</span>
                  </button>
                </>
              )}

              {/* Convert to Sale Deal */}
              {canConvert && onConvert && (
                <>
                  {canCloseDeal && <div className="my-1 border-t border-[#3A3B3C]" />}
                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerMenu(false);
                      onConvert();
                    }}
                    disabled={isConverting}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#3A3B3C] hover:text-white rounded-lg transition-colors text-left cursor-pointer disabled:opacity-50"
                  >
                    <Briefcase className="w-4 h-4 text-[#C7F33C] shrink-0" />
                    <span>{isConverting ? "Converting..." : "Convert to Sale Deal"}</span>
                  </button>
                </>
              )}

              {/* Delete Deal (card owner or admin only) */}
              {canDelete && onDelete && (
                <>
                  {(canCloseDeal || canConvert) && <div className="my-1 border-t border-[#3A3B3C]" />}
                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerMenu(false);
                      onDelete();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 rounded-lg transition-colors text-left cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Delete Deal</span>
                  </button>
                </>
              )}

              {!hasAnyActions && (
                <div className="px-3 py-2 text-xs text-slate-500 text-center">
                  No actions available
                </div>
              )}
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          aria-label="Close card panel"
          className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
