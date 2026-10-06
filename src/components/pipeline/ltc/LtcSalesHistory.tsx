"use client";

import { LtcMonthlySale } from "./ltc-types";
import { Calendar, ShoppingBag } from "lucide-react";

interface LtcSalesHistoryProps {
  salesHistory: LtcMonthlySale[];
  totalWonAmount: number;
  purchaseCount: number;
}

export function LtcSalesHistory({
  salesHistory,
  totalWonAmount,
  purchaseCount,
}: LtcSalesHistoryProps) {
  const formatBaht = (amount: number) => {
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: "THB",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs border-b border-[#3A3B3C] pb-1.5">
        <span className="font-semibold text-slate-300 flex items-center gap-1.5 text-[11px]">
          <ShoppingBag className="w-3.5 h-3.5 text-[#C7F33C]" />
          <span>Sales History</span>
        </span>
        <span className="text-slate-400 font-mono text-[10px]">
          Total: <span className="text-[#C7F33C] font-bold">{formatBaht(totalWonAmount)}</span> ({purchaseCount} orders)
        </span>
      </div>

      {salesHistory.length === 0 ? (
        <div className="py-2.5 px-3 text-center rounded-lg bg-[#1C1C1D] text-[11px] text-slate-400">
          No completed sales recorded
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {salesHistory.map((item) => (
            <div
              key={item.monthYear}
              className="flex items-center justify-between p-2 rounded-lg bg-[#1C1C1D] border border-[#3A3B3C]/60 hover:border-[#3A3B3C] transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#252728] border border-[#3A3B3C] flex items-center justify-center shrink-0">
                  <Calendar className="w-3 h-3 text-slate-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    {item.monthYear}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[120px]" title={item.dealTitles.join(", ")}>
                    {item.dealCount} deals
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono font-bold text-slate-100">
                  {formatBaht(item.amount)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
