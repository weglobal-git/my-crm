"use client";

import React from "react";

export interface WorkspaceLayoutProps {
  children: React.ReactNode;
  /**
   * "hidden": default for Kanban boards and 2-column Master-Detail (inner columns handle scrolling)
   * "auto": for standard pages where the page body scrolls vertically
   */
  scrollMode?: "hidden" | "auto";
  /**
   * Additional CSS classes for the inner max-w-[1400px] container
   */
  className?: string;
  /**
   * Additional CSS classes for the outer wrapper
   */
  wrapperClassName?: string;
}

/**
 * Standard Workspace Layout component adhering to the CRM unified layout rules:
 * - Full width & height background bg-[#252728]
 * - Standard padding p-6 with hide-scrollbar
 * - Centered max-w-[1400px] content width for horizontal symmetry across all CRM pages
 */
export function WorkspaceLayout({
  children,
  scrollMode = "hidden",
  className = "",
  wrapperClassName = "",
}: WorkspaceLayoutProps) {
  return (
    <div className={`flex flex-col w-full h-full bg-[#252728] ${wrapperClassName}`}>
      <main
        className={`flex-1 ${
          scrollMode === "auto" ? "overflow-y-auto" : "overflow-hidden"
        } hide-scrollbar p-6 flex flex-col`}
      >
        <div
          className={`max-w-[1400px] mx-auto w-full flex flex-col h-full gap-4 min-h-0 ${className}`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
