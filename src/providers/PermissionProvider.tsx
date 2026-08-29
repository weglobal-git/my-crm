"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getUserVisibleMenuKeys, getDbMenus } from "@/lib/actions/permission";
import { MenuDefinition } from "@/lib/menu-registry";

interface PermissionContextType {
  canSee: (menuKey: string) => boolean;
  visibleMainMenus: MenuDefinition[];
  visibleSubMenus: (mainMenuKey?: string) => MenuDefinition[];
  visibleRightMenus: (subKey: string) => MenuDefinition[];
  isAdmin: boolean;
  isLoading: boolean;
  activeMainMenu: string | null;
  setActiveMainMenu: (key: string) => void;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [dbMenus, setDbMenus] = useState<MenuDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMainMenu, setActiveMainMenu] = useState<string | null>(null);

  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    if (status === "loading") return;
    
    if (status === "authenticated" && session.user?.id) {
      Promise.all([
        getDbMenus(),
        isAdmin ? Promise.resolve(null) : getUserVisibleMenuKeys(session.user.id)
      ]).then(([menus, keys]) => {
        const mappedMenus: MenuDefinition[] = menus.map(m => ({
          key: m.key,
          label: m.label,
          level: m.level as 1 | 2 | 3,
          parentKey: m.parentKey || undefined,
          iconName: m.icon || undefined,
          href: m.href || undefined,
          sortOrder: m.sortOrder,
        }));
        
        setDbMenus(mappedMenus);
        
        if (isAdmin) {
          setVisibleKeys(new Set(mappedMenus.map(m => m.key)));
        } else {
          setVisibleKeys(new Set(keys || []));
        }
        setIsLoading(false);
      }).catch(console.error);
    } else {
      setTimeout(() => {
        setDbMenus([]);
        setVisibleKeys(new Set());
        setIsLoading(false);
      }, 0);
    }
  }, [session, status, isAdmin]);

  const canSee = useCallback((menuKey: string) => visibleKeys.has(menuKey), [visibleKeys]);

  const visibleMainMenus = dbMenus
    .filter(m => m.level === 1 && (isAdmin || dbMenus.some(sub => sub.level === 2 && sub.parentKey === m.key && canSee(sub.key))))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const visibleSubMenus = (mainMenuKey?: string) => {
    const keyToUse = mainMenuKey || activeMainMenu;
    // We only show sub-menus that are allowed AND belong to the active (or specified) main menu
    return dbMenus
      .filter(m => m.level === 2 && canSee(m.key) && m.parentKey === keyToUse)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const visibleRightMenus = (subKey: string) => {
    return dbMenus
      .filter(m => m.level === 3 && m.parentKey === subKey && canSee(m.key))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  };

  return (
    <PermissionContext.Provider 
      value={{ 
        canSee, 
        visibleMainMenus, 
        visibleSubMenus, 
        visibleRightMenus, 
        isAdmin, 
        isLoading,
        activeMainMenu,
        setActiveMainMenu
      }}
    >
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error("usePermissions must be used within a PermissionProvider");
  }
  return context;
}
