"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export interface PageSearchConfig {
  query: string;
  onSearch: (term: string) => void;
  placeholder?: string;
}

export interface ColumnNavConfig {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  currentTitle?: string;
  currentIndex?: number;
  totalColumns?: number;
}

interface SidebarContextType {
  isTabletSidebarOpen: boolean;
  setIsTabletSidebarOpen: (open: boolean) => void;
  toggleTabletSidebar: () => void;
  isSearchModalOpen: boolean;
  setIsSearchModalOpen: (open: boolean) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  pageManageContent: React.ReactNode | null;
  setPageManageContent: (content: React.ReactNode | null) => void;
  isManageModalOpen: boolean;
  setIsManageModalOpen: (open: boolean) => void;
  hasActiveFilters: boolean;
  setHasActiveFilters: (has: boolean) => void;
  pageSearchConfig: PageSearchConfig | null;
  setPageSearchConfig: (config: PageSearchConfig | null) => void;
  columnNavConfig: ColumnNavConfig | null;
  setColumnNavConfig: (config: ColumnNavConfig | null) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prevPathnameRef = useRef(pathname);
  const [isTabletSidebarOpen, setIsTabletSidebarOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pageManageContent, setPageManageContent] = useState<React.ReactNode | null>(null);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [pageSearchConfig, setPageSearchConfig] = useState<PageSearchConfig | null>(null);
  const [columnNavConfig, setColumnNavConfig] = useState<ColumnNavConfig | null>(null);

  const toggleTabletSidebar = useCallback(() => {
    setIsTabletSidebarOpen((prev) => !prev);
  }, []);

  // Close all overlays on route change and reset page manage content
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setIsTabletSidebarOpen(false);
      setIsSearchModalOpen(false);
      setIsMobileMenuOpen(false);
      setIsManageModalOpen(false);
      setPageManageContent(null);
      setHasActiveFilters(false);
      setPageSearchConfig(null);
      setColumnNavConfig(null);
    }
  }, [pathname]);

  // Handle Escape key to close open overlays
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isManageModalOpen) setIsManageModalOpen(false);
        else if (isSearchModalOpen) setIsSearchModalOpen(false);
        else if (isMobileMenuOpen) setIsMobileMenuOpen(false);
        else if (isTabletSidebarOpen) setIsTabletSidebarOpen(false);
      }
      // Global shortcut: Press 'F' or Cmd+K / Ctrl+K when not typing in an input to open search
      if (
        (e.key === "f" || e.key === "F" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) &&
        !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        setIsSearchModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchModalOpen, isMobileMenuOpen, isTabletSidebarOpen, isManageModalOpen]);

  return (
    <SidebarContext.Provider
      value={{
        isTabletSidebarOpen,
        setIsTabletSidebarOpen,
        toggleTabletSidebar,
        isSearchModalOpen,
        setIsSearchModalOpen,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        pageManageContent,
        setPageManageContent,
        isManageModalOpen,
        setIsManageModalOpen,
        hasActiveFilters,
        setHasActiveFilters,
        pageSearchConfig,
        setPageSearchConfig,
        columnNavConfig,
        setColumnNavConfig,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
