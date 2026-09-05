"use client";

import React, { useRef, useState } from "react";
import { batchUpdatePermissions, toggleMenuLock, syncMenuRegistry } from "@/lib/actions/permission";
import { Check, Loader2, ChevronLeft, ChevronRight, Save, Lock, Unlock, RefreshCw } from "lucide-react";
import { useDialog } from "@/providers/DialogProvider";

import { Department, MenuItem, DepartmentMenuPermission } from "@prisma/client";

interface PermissionMatrixProps {
  initialDepartments: (Department & { permissions: DepartmentMenuPermission[] })[];
  menus: MenuItem[];
}

export function PermissionMatrix({ initialDepartments, menus }: PermissionMatrixProps) {
  const { toast } = useDialog();
  const [menuList, setMenuList] = useState<MenuItem[]>(menus);
  const [localPermissions, setLocalPermissions] = useState<Record<string, Record<string, boolean>>>(() => {
    const map: Record<string, Record<string, boolean>> = {};
    initialDepartments.forEach(dept => {
      map[dept.id] = {};
      dept.permissions.forEach((p) => {
        map[dept.id][p.menuItemId] = p.visible;
      });

      // Synchronize locked side menus to follow their parent sub-menu
      menus.forEach(m => {
        if (m.level === 3 && m.isLocked && m.parentKey) {
          const parent = menus.find(p => p.key === m.parentKey);
          if (parent) {
            const isParentVisible = !!map[dept.id][parent.id];
            map[dept.id][m.id] = isParentVisible;
          }
        }
      });
    });
    return map;
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const mainMenus = menuList.filter(m => m.level === 1);
  const subMenus = menuList.filter(m => m.level === 2);
  const rightMenus = menuList.filter(m => m.level === 3);

  const getSubMenuRowSpan = (subMenuKey: string) => {
    const sideCount = rightMenus.filter(r => r.parentKey === subMenuKey).length;
    return 1 + sideCount; 
  };

  const getMainMenuRowSpan = (mainMenuKey: string) => {
    const subs = subMenus.filter(s => s.parentKey === mainMenuKey);
    let count = 0;
    for (const sub of subs) {
      count += getSubMenuRowSpan(sub.key);
    }
    return count > 0 ? count : 1;
  };

  const isChecked = (deptId: string, menuId: string) => {
    const menu = menus.find(m => m.id === menuId);
    if (menu && menu.level === 3 && menu.isLocked && menu.parentKey) {
      const parent = menus.find(p => p.key === menu.parentKey);
      if (parent) {
        return !!localPermissions[deptId]?.[parent.id];
      }
    }
    return !!localPermissions[deptId]?.[menuId];
  };

  const handleToggle = (deptId: string, menuId: string, currentState: boolean) => {
    const newValue = !currentState;
    setLocalPermissions(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if (!next[deptId]) next[deptId] = {};
      next[deptId][menuId] = newValue;
      
      const menu = menus.find(m => m.id === menuId);
      if (!menu) return next;

      if (newValue) {
        if (menu.parentKey) {
          const parent = menus.find(m => m.key === menu.parentKey);
          if (parent) next[deptId][parent.id] = true;
        }
        if (menu.level === 2) {
          const children = menus.filter(m => m.parentKey === menu.key);
          children.forEach(child => {
            next[deptId][child.id] = true;
          });
        }
      } else {
        if (menu.level === 2) {
          const children = menus.filter(m => m.parentKey === menu.key);
          children.forEach(child => {
            next[deptId][child.id] = false;
          });
        }
      }
      return next;
    });
    setHasChanges(true);
  };
  const handleLockToggle = async (menuId: string, currentIsLocked: boolean) => {
    setIsSaving(true);
    try {
      await toggleMenuLock(menuId, !currentIsLocked);
      setMenuList(prev => prev.map(m => m.id === menuId ? { ...m, isLocked: !currentIsLocked } : m));
      toast({ title: "Success", description: "Menu lock status updated", type: "success" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to update lock status", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Ensure all locked menus accurately reflect parent's state
      Object.keys(localPermissions).forEach(deptId => {
        rightMenus.forEach(r => {
          if (r.isLocked && r.parentKey) {
            const parent = subMenus.find(s => s.key === r.parentKey);
            if (parent) {
              localPermissions[deptId][r.id] = !!localPermissions[deptId]?.[parent.id];
            }
          }
        });
      });

      const updates: { deptId: string, menuId: string, visible: boolean }[] = [];
      Object.keys(localPermissions).forEach(deptId => {
        const deptChanges = localPermissions[deptId];
        Object.keys(deptChanges).forEach(menuId => {
          const originalDept = initialDepartments.find(d => d.id === deptId);
          const originalPerm = originalDept?.permissions.find((p) => p.menuItemId === menuId);
          const originalVisible = originalPerm ? originalPerm.visible : false;
          if (originalVisible !== deptChanges[menuId]) {
            updates.push({ deptId, menuId, visible: deptChanges[menuId] });
          }
        });
      });

      if (updates.length > 0) {
        await batchUpdatePermissions(updates);
      }
      toast({ title: "Success", description: "Permissions saved successfully", type: "success" });
      setHasChanges(false);
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to save permissions", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncRegistry = async () => {
    setIsSyncing(true);
    try {
      await syncMenuRegistry(true);
      toast({ title: "Success", description: "Menu registry synced with database", type: "success" });
    } catch {
      toast({ title: "Error", description: "Failed to sync menu registry", type: "error" });
    } finally {
      setIsSyncing(false);
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* 2. WORK SPACE */}
      <main className="flex-1 overflow-hidden p-6 flex flex-col min-h-0">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col flex-1 min-h-0">
          <div className="flex justify-end items-end mb-6 shrink-0">
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={handleSyncRegistry}
                disabled={isSyncing}
                title="Sync Menu Registry from Code to Database"
                className="flex items-center gap-2 px-4 py-2 bg-[#3A3B3C] hover:bg-[#4E4F50] text-slate-200 rounded-full text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer border border-[#4E4F50]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#C7F33C]' : 'text-slate-400'}`} />
                <span>{isSyncing ? "Syncing..." : "Sync Registry"}</span>
              </button>
              {hasChanges && (
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-2 bg-[#C7F33C] hover:bg-[#b5dc35] text-black rounded-full font-bold transition-all disabled:opacity-50 animate-in fade-in slide-in-from-right-2 cursor-pointer"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              )}
              <button 
                onClick={() => scroll('left')}
                className="p-2 bg-[#252728] border border-[#4E4F50] rounded-full text-slate-400 hover:text-[#C7F33C] hover:bg-[#3A3B3C] transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => scroll('right')}
                className="p-2 bg-[#252728] border border-[#4E4F50] rounded-full text-slate-400 hover:text-[#C7F33C] hover:bg-[#3A3B3C] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 bg-[#252728] rounded-[2rem] border border-[#4E4F50] overflow-hidden flex flex-col relative shadow-none">
            <div ref={scrollRef} className="flex-1 overflow-auto hide-scrollbar">
            <table className="w-full text-left border-collapse min-w-max">
            <thead className="sticky top-0 z-30 bg-[#252728]">
              <tr className="bg-[#252728] border-b-2 border-[#4E4F50]">
                <th className="p-5 font-semibold text-slate-400 text-sm tracking-wider uppercase w-48 sticky left-0 top-0 bg-[#252728] z-40 border-r border-[#4E4F50]">
                  Main Menu
                </th>
                <th className="p-5 font-semibold text-slate-400 text-sm tracking-wider uppercase w-48 sticky left-[192px] top-0 bg-[#252728] z-40 border-r border-[#4E4F50]">
                  Sub Menu
                </th>
                {initialDepartments.map(dept => (
                  <th key={dept.id} className="p-5 font-semibold text-slate-300 text-center min-w-[140px] uppercase text-sm tracking-wider border-r border-[#4E4F50]">
                    {dept.name}
                  </th>
                ))}
              </tr>
            </thead>
            
            <tbody className="bg-transparent">
              {mainMenus.map(mainMenu => {
                const mySubMenus = subMenus.filter(sub => sub.parentKey === mainMenu.key);
                
                if (mySubMenus.length === 0) {
                  return (
                    <tr key={mainMenu.id} className="border-b border-[#4E4F50] bg-transparent hover:bg-white/[0.03] transition-colors group">
                      <td className="p-4 font-bold bg-[#252728] group-hover:bg-[#2b2d2e] border-r border-[#4E4F50] align-top w-48 sticky left-0 z-10 text-xs tracking-widest uppercase text-slate-100 transition-colors">
                        {mainMenu.label}
                      </td>
                      <td className="p-4 bg-[#252728] group-hover:bg-[#2b2d2e] border-r border-[#4E4F50] text-slate-400 italic text-sm w-48 sticky left-[192px] z-10 transition-colors">
                        No sub-menus
                      </td>
                      <td colSpan={initialDepartments.length} className="bg-transparent"></td>
                    </tr>
                  );
                }

                return mySubMenus.map((subMenu, subIndex) => {
                  const mySideMenus = rightMenus.filter(right => right.parentKey === subMenu.key);

                  return (
                    <React.Fragment key={subMenu.id}>
                      {/* Sub Menu Row */}
                      <tr className="border-b border-[#4E4F50] bg-transparent hover:bg-white/[0.03] transition-colors group">
                        {subIndex === 0 && (
                          <td rowSpan={getMainMenuRowSpan(mainMenu.key)} className="p-4 font-bold bg-[#252728] border-r border-[#4E4F50] align-top w-48 sticky left-0 z-10 text-xs tracking-widest uppercase text-slate-100">
                            {mainMenu.label}
                          </td>
                        )}
                        
                        <td className="p-4 font-bold bg-[#252728] group-hover:bg-[#2b2d2e] border-r border-[#4E4F50] align-middle w-48 sticky left-[192px] z-10 text-xs tracking-widest uppercase text-slate-100 transition-colors">
                          {subMenu.label}
                        </td>

                        {initialDepartments.map(dept => (
                          <td key={dept.id} className="p-4 text-center border-r border-[#4E4F50] min-w-[140px] bg-transparent">
                            <button
                              onClick={() => handleToggle(dept.id, subMenu.id, isChecked(dept.id, subMenu.id))}
                              disabled={isSaving}
                              className={`w-10 h-6 rounded-full flex items-center justify-center mx-auto transition-all duration-300 relative cursor-pointer ${
                                isChecked(dept.id, subMenu.id) ? "bg-[#C7F33C]" : "bg-[#4E4F50]"
                              }`}
                            >
                              <div className={`absolute w-4 h-4 bg-white rounded-full transition-all duration-300 ${
                                isChecked(dept.id, subMenu.id) ? "translate-x-2" : "-translate-x-2"
                              } flex items-center justify-center`}>
                                {isSaving ? (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin text-slate-400" />
                                ) : isChecked(dept.id, subMenu.id) ? (
                                  <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                                ) : null}
                              </div>
                            </button>
                          </td>
                        ))}
                      </tr>
                      
                      {/* Side Menu Rows */}
                      {mySideMenus.map(sideMenu => {
                        const isLocked = sideMenu.isLocked;
                        const description = sideMenu.description || (sideMenu.key === "pipeline.information" ? "Sale Deal card allowed" : null);
                        return (
                        <tr key={sideMenu.id} className="border-b border-[#4E4F50] bg-transparent hover:bg-white/[0.03] transition-colors group">
                          <td className="p-4 font-medium text-slate-400 italic text-sm text-right bg-[#252728] group-hover:bg-[#2b2d2e] border-r border-[#4E4F50] w-48 sticky left-[192px] z-10 transition-colors">
                            <div className="flex flex-col items-end">
                              <div className="flex items-center justify-end gap-2">
                                {isLocked ? (
                                  <button onClick={() => handleLockToggle(sideMenu.id, true)} disabled={isSaving} className="text-red-400 hover:text-red-300 transition-colors cursor-pointer" title="Locked to parent (Click to unlock)">
                                    <Lock className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button onClick={() => handleLockToggle(sideMenu.id, false)} disabled={isSaving} className="text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" title="Unlocked (Click to lock to parent)">
                                    <Unlock className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <span>{sideMenu.label}</span>
                              </div>
                              {description && (
                                <span className="text-[10px] text-slate-400/80 not-italic font-normal tracking-tight mt-0.5">
                                  {description}
                                </span>
                              )}
                            </div>
                          </td>
                          {initialDepartments.map(dept => {
                            const checked = isChecked(dept.id, sideMenu.id);
                            return (
                              <td key={dept.id} className="p-4 text-center border-r border-[#4E4F50] min-w-[140px] bg-transparent">
                                <button
                                  onClick={() => handleToggle(dept.id, sideMenu.id, checked)}
                                  disabled={isSaving || isLocked}
                                  title={isLocked ? "This menu is locked to parent (always enabled when parent sub-menu is enabled)" : undefined}
                                  className={`w-5 h-5 rounded flex items-center justify-center mx-auto transition-all border ${
                                    checked 
                                      ? (isLocked ? 'bg-[#4E4F50] border-[#4E4F50] text-slate-400 opacity-60 cursor-not-allowed' : 'bg-[#C7F33C] border-[#C7F33C] text-black cursor-pointer') 
                                      : (isLocked ? 'bg-[#252728] border-[#4E4F50] opacity-40 cursor-not-allowed' : 'bg-[#252728] border-[#4E4F50] hover:border-[#C7F33C] cursor-pointer')
                                  }`}
                                >
                                  {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      )})}
                    </React.Fragment>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>
      </div>
      </main>
    </>
  );
}
