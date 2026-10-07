"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { getUserVisibleMenuKeys, getDbMenus } from "@/lib/actions/permission";
import { MenuDefinition, MENU_REGISTRY } from "@/lib/menu-registry";

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

const PERMISSION_STORAGE_PREFIX = "crm_perm_v2_";

interface StoredPermissionData {
  menus: MenuDefinition[];
  keys: string[];
}

function getStoredPermissions(userId?: string | null): StoredPermissionData | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = sessionStorage.getItem(`${PERMISSION_STORAGE_PREFIX}${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.menus) && Array.isArray(parsed?.keys)) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

function saveStoredPermissions(userId: string, menus: MenuDefinition[], keys: string[]) {
  if (typeof window === "undefined" || !userId) return;
  try {
    sessionStorage.setItem(
      `${PERMISSION_STORAGE_PREFIX}${userId}`,
      JSON.stringify({ menus, keys })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const isAdmin = session?.user?.role === "ADMIN";

  // 1. Instant Cache Hydration: initialize immediately from sessionStorage (0ms Sidebar Paint)
  const initialCache = useMemo(() => getStoredPermissions(userId), [userId]);

  const [dbMenus, setDbMenus] = useState<MenuDefinition[]>(() => {
    if (initialCache?.menus?.length) return initialCache.menus;
    return MENU_REGISTRY;
  });

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => {
    if (initialCache?.keys) return new Set(initialCache.keys);
    if (isAdmin) return new Set(MENU_REGISTRY.map((m) => m.key));
    return new Set<string>();
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (initialCache?.menus?.length && initialCache?.keys?.length) return false;
    return status === "loading";
  });

  const [activeMainMenu, setActiveMainMenu] = useState<string | null>(null);

  // 2. Background Revalidation: sync latest DB menus and permissions seamlessly
  useEffect(() => {
    if (status === "loading") return;

    if (status === "authenticated" && session?.user?.id) {
      const currentUserId = session.user.id;
      let cancelled = false;

      Promise.all([
        getDbMenus(),
        isAdmin ? Promise.resolve(null) : getUserVisibleMenuKeys(currentUserId),
      ])
        .then(([menus, keys]) => {
          if (cancelled) return;
          const mappedMenus: MenuDefinition[] = menus.map((m: { key: string; label: string; level: number; parentKey: string | null; icon: string | null; href: string | null; sortOrder: number }) => ({
            key: m.key,
            label: m.label,
            level: m.level as 1 | 2 | 3,
            parentKey: m.parentKey || undefined,
            iconName: m.icon || undefined,
            href: m.href || undefined,
            sortOrder: m.sortOrder,
          }));

          const resolvedKeys = isAdmin
            ? mappedMenus.map((m) => m.key)
            : keys || [];

          setDbMenus(mappedMenus);
          setVisibleKeys(new Set(resolvedKeys));
          setIsLoading(false);
          saveStoredPermissions(currentUserId, mappedMenus, resolvedKeys);
        })
        .catch((err) => {
          console.error("[PermissionProvider] Error syncing permissions:", err);
          if (!cancelled) setIsLoading(false);
        });

      return () => {
        cancelled = true;
      };
    } else {
      setDbMenus([]);
      setVisibleKeys(new Set());
      setIsLoading(false);
    }
  }, [session, status, isAdmin]);

  const canSee = useCallback((menuKey: string) => visibleKeys.has(menuKey), [visibleKeys]);

  const visibleMainMenus = useMemo(() => {
    return dbMenus
      .filter(m => m.level === 1 && (isAdmin || dbMenus.some(sub => sub.level === 2 && sub.parentKey === m.key && canSee(sub.key))))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [dbMenus, isAdmin, canSee]);

  const visibleSubMenus = useCallback((mainMenuKey?: string) => {
    const keyToUse = mainMenuKey || activeMainMenu;
    // We only show sub-menus that are allowed AND belong to the active (or specified) main menu
    return dbMenus
      .filter(m => m.level === 2 && canSee(m.key) && m.parentKey === keyToUse)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [dbMenus, canSee, activeMainMenu]);

  const visibleRightMenus = useCallback((subKey: string) => {
    return dbMenus
      .filter(m => m.level === 3 && m.parentKey === subKey && canSee(m.key))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [dbMenus, canSee]);

  const contextValue = useMemo(() => ({ 
    canSee, 
    visibleMainMenus, 
    visibleSubMenus, 
    visibleRightMenus, 
    isAdmin, 
    isLoading,
    activeMainMenu,
    setActiveMainMenu
  }), [canSee, visibleMainMenus, visibleSubMenus, visibleRightMenus, isAdmin, isLoading, activeMainMenu]);

  return (
    <PermissionContext.Provider value={contextValue}>
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
