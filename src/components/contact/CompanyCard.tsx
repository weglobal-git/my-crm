"use client";

import { Building2, Users, Briefcase, Globe, Star } from "lucide-react";
import { CompanyMasterItem } from "@/lib/actions/contact";

export function CompanyCard({
  company,
  isSelected,
  onClick,
  onPointerEnter,
}: {
  company: CompanyMasterItem;
  isSelected: boolean;
  onClick: () => void;
  onPointerEnter?: () => void;
}) {
  const contactCount = company._count?.contacts || (company as { contacts?: unknown[] }).contacts?.length || 0;
  const oppCount = company._count?.opportunities || 0;
  const starRating = company.starRating || 0;

  return (
    <div
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      className={`p-2.5 px-3 rounded-2xl transition-all cursor-pointer select-none border-0 shadow-none ${
        isSelected
          ? "bg-[#C7F33C] text-black shadow-none"
          : "bg-[#2E3033] hover:bg-[#474849] text-slate-200"
      }`}
    >
      <div className="flex items-center justify-between gap-2.5">
        {/* Left: Building Icon + Name + Star Rating */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
              isSelected
                ? "bg-black/15 text-black"
                : "bg-[#252728] text-slate-300"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <span
              className={`font-semibold text-xs sm:text-sm truncate leading-snug ${
                isSelected ? "text-black" : "text-slate-100"
              }`}
              title={company.name}
            >
              {company.displayName || company.name}
            </span>
            {company.displayName && company.displayName !== company.name && (
              <span
                className={`text-[10px] truncate leading-tight ${
                  isSelected ? "text-black/70 font-medium" : "text-slate-400"
                }`}
                title={company.name}
              >
                {company.name}
              </span>
            )}

            {/* Star Rating Display */}
            <div className="flex items-center gap-0.5 mt-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-2.5 h-2.5 ${
                    s <= starRating
                      ? isSelected
                        ? "fill-black text-black"
                        : "fill-amber-400 text-amber-400"
                      : isSelected
                      ? "text-black/25 fill-transparent"
                      : "text-slate-600/70 fill-transparent"
                  }`}
                />
              ))}
              {starRating > 0 && (
                <span
                  className={`text-[10px] ml-1 font-bold ${
                    isSelected ? "text-black/80" : "text-amber-400"
                  }`}
                >
                  {starRating}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Country Badge + Compact (Person count & Deal count) Underneath */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          {company.country ? (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1 font-semibold ${
                isSelected
                  ? "bg-black/15 text-black"
                  : "bg-[#252728] text-slate-400"
              }`}
            >
              <Globe className="w-2.5 h-2.5" />
              <span className="truncate max-w-[70px]">{company.country}</span>
            </span>
          ) : (
            <div className="h-4" />
          )}

          {/* Compact Symbols: Person Count & Deal Count */}
          <div className="flex items-center gap-2 pr-0.5">
            <span
              className={`flex items-center gap-1 text-[10px] font-semibold ${
                isSelected ? "text-black/80" : "text-slate-400"
              }`}
              title={`${contactCount} ${contactCount === 1 ? "Person" : "Persons"}`}
            >
              <Users
                className={`w-3 h-3 ${
                  isSelected ? "text-black" : "text-slate-500"
                }`}
              />
              <span>{contactCount}</span>
            </span>

            {oppCount > 0 && (
              <span
                className={`flex items-center gap-1 text-[10px] font-bold ${
                  isSelected ? "text-black" : "text-[#C7F33C]"
                }`}
                title={`${oppCount} Deals`}
              >
                <Briefcase
                  className={`w-3 h-3 ${
                    isSelected ? "text-black" : "text-[#C7F33C]"
                  }`}
                />
                <span>{oppCount}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
