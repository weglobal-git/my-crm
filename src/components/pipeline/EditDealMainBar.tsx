"use client";

import { useState } from "react";
import { Building2, Menu, X } from "lucide-react";
import { DealTypeIcon } from "./DealTypeBadge";
import { OpportunityType } from "@prisma/client";

export interface EditDealMainBarProps {
  dealType: OpportunityType;
  topic: string;
  onTopicSave: (newTopic: string) => Promise<void>;
  canEditTopic: boolean;
  companyName?: string | null;
  companyDisplayName?: string | null;
  hasActions?: boolean;
  onOpenActions: () => void;
  onClose: () => void;
}

export function EditDealMainBar({
  dealType,
  topic,
  onTopicSave,
  canEditTopic,
  companyName,
  companyDisplayName,
  hasActions = true,
  onOpenActions,
  onClose,
}: EditDealMainBarProps) {
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [topicValue, setTopicValue] = useState(topic);
  const [isSavingTopic, setIsSavingTopic] = useState(false);

  // Sync external topic changes during render (avoid cascading renders)
  const [prevTopic, setPrevTopic] = useState(topic);
  if (topic !== prevTopic) {
    setPrevTopic(topic);
    setTopicValue(topic);
  }

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
              <span className="text-xs text-slate-500 truncate">({companyName})</span>
            )}
          </div>
        )}
      </div>

      {/* Right: Hamburger Menu Button & Close Button */}
      <div className="flex items-center gap-1.5 shrink-0 relative">
        {/* Hamburger Action Menu Button (opens standard DealActionsDrawer) */}
        {hasActions && (
          <button
            type="button"
            onClick={onOpenActions}
            className="p-2 rounded-full transition-colors cursor-pointer text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C]"
            title="Card actions"
            aria-label="Card actions menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

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
