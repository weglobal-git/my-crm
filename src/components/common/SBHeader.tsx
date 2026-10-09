"use client";

import React from "react";

export interface SBHeaderProps {
  /** Optional document title e.g. "Commercial Product Catalog", "Quotation", "Proforma Invoice" */
  documentTitle?: string;
  /** Optional document category badge or tag */
  documentBadge?: string;
  /** Optional subtitle or description */
  subtitle?: React.ReactNode;
  /** Date string or boolean (if true, formats current date as DD MMM YYYY) */
  date?: string | boolean;
  /** Page info string e.g. "Page 1 of 3" */
  pageInfo?: string;
  /** Item count or secondary metadata e.g. "24 Items" */
  metaInfo?: React.ReactNode;
  /** Company Name override (defaults to official name) */
  companyName?: string;
  /** Company Address override (defaults to official address) */
  companyAddress?: string;
  /** Company Tel override (defaults to official telephone) */
  companyTel?: string;
  /** Custom logo source path (defaults to /sbinterlab%20logo.svg) */
  logoSrc?: string;
  /** Height class for the logo (defaults to "h-6 sm:h-7") */
  logoHeightClass?: string;
  /** Whether to show the bottom divider line (defaults to true) */
  showDivider?: boolean;
  /** Force even more compact mode if needed */
  compact?: boolean;
  /** Additional container classes */
  className?: string;
  /** Custom slot for extending content */
  children?: React.ReactNode;
}

export const SB_COMPANY_DEFAULTS = {
  name: "SB INTERLAB COMPANY LIMITED",
  address: "9/1 Moo 6 Buengthonglang Lamlookka Pathumtanee 12150",
  tel: "Tel 080-0517505",
  logo: "/sbinterlab%20logo.svg",
};

/**
 * Standard World-Class Compact Enterprise Corporate Header: "SB Header"
 *
 * Left: Official SB Interlab Vector Logo + Optional Document Title tag
 * Right: Official Company Name, Address & Contact Details (Ultra-Compact)
 */
export function SBHeader({
  documentTitle,
  documentBadge,
  subtitle,
  date,
  pageInfo,
  metaInfo,
  companyName = SB_COMPANY_DEFAULTS.name,
  companyAddress = SB_COMPANY_DEFAULTS.address,
  companyTel = SB_COMPANY_DEFAULTS.tel,
  logoSrc = SB_COMPANY_DEFAULTS.logo,
  logoHeightClass = "h-6 sm:h-7",
  showDivider = true,
  compact = false,
  className = "",
  children,
}: SBHeaderProps) {
  // Format date if boolean true was passed
  const formattedDate =
    typeof date === "boolean"
      ? date
        ? new Date().toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : undefined
      : date;

  return (
    <header
      className={`sb-header w-full text-slate-900 select-none print:select-text ${
        showDivider
          ? "pb-2 mb-2 sm:pb-2.5 sm:mb-2.5 border-b border-slate-200/80 print:border-slate-300"
          : ""
      } ${className}`}
    >
      {/* ===================== Compact Corporate Identity Bar ===================== */}
      <div className="flex items-start justify-between gap-4">
        {/* Left: Official Vector Logo & Optional Document Title */}
        <div className="flex flex-col items-start justify-center shrink-0">
          <img
            src={logoSrc}
            alt={companyName}
            className={`${logoHeightClass} w-auto object-contain max-h-[28px] print:block`}
            loading="eager"
          />
          {documentTitle && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[9px] sm:text-[9.5px] font-bold text-slate-700 uppercase tracking-widest leading-none">
                {documentTitle}
              </span>
              {documentBadge && (
                <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
                  {documentBadge}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Official Enterprise Information (Ultra-Compact) */}
        <div className="text-right shrink-0">
          <div
            className={`font-bold tracking-[0.04em] text-slate-900 uppercase font-sans leading-tight ${
              compact ? "text-[10px] sm:text-[10.5px]" : "text-[10.5px] sm:text-[11.5px]"
            }`}
          >
            {companyName}
          </div>
          <div
            className={`text-slate-500 font-normal leading-tight mt-0.5 ${
              compact ? "text-[8px] sm:text-[8.5px]" : "text-[8.5px] sm:text-[9px]"
            }`}
          >
            {companyAddress}
          </div>
          <div
            className={`text-slate-500 font-medium leading-tight mt-0.5 ${
              compact ? "text-[8px] sm:text-[8.5px]" : "text-[8.5px] sm:text-[9px]"
            }`}
          >
            {companyTel}
          </div>
          {(formattedDate || pageInfo || metaInfo) && (
            <div className="text-[8px] text-slate-400 mt-0.5 leading-tight">
              {formattedDate && <span>Date: {formattedDate}</span>}
              {formattedDate && (pageInfo || metaInfo) && <span className="mx-1">·</span>}
              {pageInfo && <span>{pageInfo}</span>}
              {pageInfo && metaInfo && <span className="mx-1">·</span>}
              {metaInfo && <span>{metaInfo}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Optional Subtitle (if explicitly passed and needed) */}
      {subtitle && (
        <div className="text-[9px] text-slate-500 mt-1 pt-1 border-t border-slate-100">
          {subtitle}
        </div>
      )}

      {/* Custom Children Slot */}
      {children}
    </header>
  );
}

export default SBHeader;
