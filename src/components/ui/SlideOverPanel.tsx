"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { IconMap } from "@/lib/menu-registry";

export interface SlideOverTab {
  key: string;
  label: string;
  icon?: React.ElementType | string;
}

export interface SlideOverPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerRight?: React.ReactNode;
  tabs?: SlideOverTab[];
  activeTab?: string;
  onTabChange?: (tabKey: string) => void;
  widthClass?: string; // default "w-[750px]"
  children: React.ReactNode;
}

export function SlideOverPanel({
  isOpen,
  onClose,
  title,
  subtitle,
  headerRight,
  tabs,
  activeTab,
  onTabChange,
  widthClass = "w-[750px]",
  children,
}: SlideOverPanelProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      queueMicrotask(() => setMounted(true));
      const timer = setTimeout(() => setInternalIsOpen(true), 10);
      return () => clearTimeout(timer);
    } else {
      queueMicrotask(() => setInternalIsOpen(false));
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen && !mounted) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] transition-opacity duration-300 ${
          internalIsOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Slide-over Container */}
      <div
        className={`fixed inset-y-4 right-4 z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] origin-right ${
          internalIsOpen
            ? "opacity-100 translate-x-0 scale-100"
            : "opacity-0 translate-x-8 scale-[0.97] pointer-events-none"
        }`}
      >
        <div className="flex h-full rounded-2xl overflow-hidden border border-[#3A3B3C] bg-[#252728]">
          {/* Left Tab Rail (if tabs are provided) */}
          {tabs && tabs.length > 0 && (
            <div className="w-16 bg-[#252728] border-r border-[#1C1C1D] flex flex-col items-center py-4 gap-3 shrink-0 z-10">
              {tabs.map((tab) => {
                let IconComponent: React.ElementType | null = null;
                if (typeof tab.icon === "string") {
                  IconComponent = IconMap[tab.icon] || null;
                } else if (tab.icon) {
                  IconComponent = tab.icon;
                }

                const isActive = activeTab === tab.key;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => onTabChange?.(tab.key)}
                    title={tab.label}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 cursor-pointer ${
                      isActive
                        ? "bg-[#3A3B3C] text-white"
                        : "text-slate-400 hover:bg-[#C7F33C] hover:text-[#111111]"
                    }`}
                  >
                    {IconComponent && (
                      <IconComponent
                        className="h-5 w-5"
                        strokeWidth={isActive ? 2.5 : 2}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Main Panel Content */}
          <div className={`${widthClass} max-w-[90vw] bg-[#252728] flex flex-col h-full min-w-0`}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1C1C1D] shrink-0">
              <div className="flex flex-col flex-1 pr-4 min-w-0">
                {title && (
                  <div className="text-lg font-bold text-slate-100 truncate">
                    {title}
                  </div>
                )}
                {subtitle && (
                  <div className="text-xs text-slate-400 truncate mt-0.5">
                    {subtitle}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {headerRight}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-[#3A3B3C] rounded-lg transition-colors"
                  aria-label="Close panel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto hide-scrollbar p-6">
              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
