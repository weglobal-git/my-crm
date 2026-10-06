"use client";

import { useState } from "react";
import { LtcAccountItem } from "./ltc-types";
import { LtcSalesHistory } from "./LtcSalesHistory";
import { 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  User, 
  Plus, 
  Ban, 
  Loader2 
} from "lucide-react";

interface LtcAccountRowProps {
  item: LtcAccountItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUnqualify: (companyId: string) => Promise<void>;
  onMakeCard: (companyId: string) => Promise<void>;
}

export function LtcAccountRow({
  item,
  isExpanded,
  onToggleExpand,
  onUnqualify,
  onMakeCard,
}: LtcAccountRowProps) {
  const [isUnqualifying, setIsUnqualifying] = useState(false);
  const [isMakingCard, setIsMakingCard] = useState(false);

  const handleUnqualify = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUnqualifying || isMakingCard) return;
    setIsUnqualifying(true);
    try {
      await onUnqualify(item.id);
    } finally {
      setIsUnqualifying(false);
    }
  };

  const handleMakeCard = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUnqualifying || isMakingCard) return;
    setIsMakingCard(true);
    try {
      await onMakeCard(item.id);
    } finally {
      setIsMakingCard(false);
    }
  };

  const primaryContact = item.contacts.find((c) => c.isActive) || item.contacts[0];

  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        isExpanded
          ? "bg-[#222426] border-[#4E4F50] shadow-md"
          : "bg-[#1C1C1D]/80 hover:bg-[#222426] border-[#3A3B3C]/70 hover:border-[#4E4F50]"
      }`}
    >
      {/* Compact Single-Line Row */}
      <div
        onClick={onToggleExpand}
        className="px-3 py-2 flex items-center justify-between gap-2 cursor-pointer select-none"
      >
        {/* Left: Account Name & Minimal Badges on Single Line */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="font-semibold text-xs text-slate-100 truncate hover:text-[#C7F33C] transition-colors"
            title={
              item.displayName && item.displayName !== item.name
                ? `${item.displayName} (${item.name})`
                : item.name
            }
          >
            {item.displayName || item.name}
          </span>

          {item.tier === "TIER_1" && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#C7F33C]/10 text-[#C7F33C] border border-[#C7F33C]/30 shrink-0"
              title="VIP"
            >
              VIP
            </span>
          )}

          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#252728] text-slate-300 border border-[#3A3B3C] shrink-0 tabular-nums"
            title={`Inactive: ${item.daysSinceLastContact} days`}
          >
            {item.formattedDuration}
          </span>
        </div>

        {/* Right: Icon-Only Action Buttons (No chevron arrow) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Action: Unqualify */}
          <button
            type="button"
            onClick={handleUnqualify}
            disabled={isUnqualifying || isMakingCard}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#252728] border border-[#3A3B3C] text-slate-400 hover:text-white hover:bg-[#3A3B3C] hover:border-slate-500 transition-all cursor-pointer disabled:opacity-50"
            title="Unqualify"
            aria-label="Unqualify account"
          >
            {isUnqualifying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Ban className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Action: Make a Card */}
          <button
            type="button"
            onClick={handleMakeCard}
            disabled={isUnqualifying || isMakingCard}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#C7F33C] text-black hover:bg-[#b0d932] transition-all cursor-pointer shadow-sm disabled:opacity-50 font-bold"
            title="Make a Card"
            aria-label="Make a Card"
          >
            {isMakingCard ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
            ) : (
              <Plus className="w-4 h-4 stroke-[2.5]" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Accordion Details */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-[#3A3B3C]/50 space-y-3 text-xs animate-in fade-in duration-150">
          {/* 1. Account & Contact Details */}
          <div className="rounded-lg bg-[#18191A] p-2.5 border border-[#3A3B3C]/50 space-y-2.5">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5 border-b border-[#2D2E30] pb-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#C7F33C]" />
              <span>Account & Contact</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-slate-300">
              {/* Account General */}
              <div className="space-y-1">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">
                  Company
                </div>
                {item.phone && (
                  <div className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{item.phone}</span>
                  </div>
                )}
                {item.email && (
                  <div className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{item.email}</span>
                  </div>
                )}
                {item.address && (
                  <div className="flex items-start gap-1.5 text-slate-300 text-[11px]">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{item.address}</span>
                  </div>
                )}
                {!item.phone && !item.email && !item.address && (
                  <div className="text-slate-500 italic text-[11px]">No company phone or address</div>
                )}
              </div>

              {/* Primary Contact Person */}
              <div className="space-y-1">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">
                  Primary Contact
                </div>
                {primaryContact ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-200 font-medium text-[11px]">
                      <User className="w-3 h-3 text-[#C7F33C] shrink-0" />
                      <span>{primaryContact.name}</span>
                      {primaryContact.role && (
                        <span className="text-slate-400 text-[10px]">({primaryContact.role})</span>
                      )}
                    </div>
                    {primaryContact.phone && (
                      <div className="flex items-center gap-1.5 text-slate-300 pl-4 text-[11px]">
                        <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{primaryContact.phone}</span>
                      </div>
                    )}
                    {primaryContact.email && (
                      <div className="flex items-center gap-1.5 text-slate-300 pl-4 text-[11px]">
                        <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{primaryContact.email}</span>
                      </div>
                    )}
                    {primaryContact.contactDepartment && (
                      <div className="text-slate-400 text-[10px] pl-4">
                        Dept: {primaryContact.contactDepartment}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-slate-500 italic text-[11px]">No primary contact person</div>
                )}
              </div>
            </div>
          </div>

          {/* 2. Historical Sales Breakdown */}
          <div className="rounded-lg bg-[#18191A] p-2.5 border border-[#3A3B3C]/50">
            <LtcSalesHistory 
              salesHistory={item.salesHistory} 
              totalWonAmount={item.totalWonAmount} 
              purchaseCount={item.purchaseCount} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
