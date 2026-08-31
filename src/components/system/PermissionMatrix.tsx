"use client";

import React, { useRef, useState } from "react";
import { batchUpdatePermissions, toggleMenuLock } from "@/lib/actions/permission";
import { Check, Loader2, ChevronLeft, ChevronRight, Save, Lock, Unlock } from "lucide-react";
import { useDialog } from "@/providers/DialogProvider";

import { Department, MenuItem, DepartmentMenuPermission } from "@prisma/client";

interface PermissionMatrixProps {
  initialDepartments: (Department & { permissions: DepartmentMenuPermission[] })[];
  menus: MenuItem[];
}

export function PermissionMatrix({ initialDepartments, menus }: PermissionMatrixProps) {
  const { toast } = useDialog();
  const [localPermissions, setLocalPermissions] = useState<Record<string, Record<string, boolean>>>(() => {
    const map: Record<string, Record<string, boolean>> = {};
    initialDepartments.forEach(dept => {
      map[dept.id] = {};
      dept.permissions.forEach((p) => {
        map[dept.id][p.menuItemId] = p.visible;
      });
    });
    return map;
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);


  const mainMenus = menus.filter(m => m.level === 1);
  const subMenus = menus.filter(m => m.level === 2);
  const rightMenus = menus.filter(m => m.level === 3);

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
      toast({ title: "Success", description: "Menu lock status updated", type: "success" });
      window.location.reload();
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
      window.location.reload();
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to save permissions", type: "error" });
    } finally {
      setIsSaving(false);
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
      <main className="flex-1 overflow-y-auto hide-scrollbar p-6">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col h-full">
          <div className="flex justify-end items-end mb-6">
            <div className="flex items-center gap-3">
              {hasChanges && (
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-2 bg-[#C7F33C] hover:bg-[#b5dc35] text-black rounded-full font-bold transition-all disabled:opacity-50 animate-in fade-in slide-in-from-right-2"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              )}
              <button 
                onClick={() => scroll('left')}
                className="p-2 bg-[#3A3B3C] border border-[#4E4F50] rounded-full text-slate-400 hover:text-[#C7F33C] hover:bg-[#4E4F50] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => scroll('right')}
                className="p-2 bg-[#3A3B3C] border border-[#4E4F50] rounded-full text-slate-400 hover:text-[#C7F33C] hover:bg-[#4E4F50] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-[#3A3B3C] rounded-[2rem] border border-[#4E4F50] overflow-hidden flex flex-col relative">
            <div ref={scrollRef} className="overflow-hidden">
            <table className="w-full text-left border-collapse min-w-max">
            <thead>
              <tr className="bg-[#252728] border-b-2 border-[#4E4F50]">
                <th className="p-5 font-semibold text-slate-400 text-sm tracking-wider uppercase w-48 sticky left-0 bg-[#252728] z-20 border-r border-[#4E4F50]">
                  Main Menu
                </th>
                <th className="p-5 font-semibold text-slate-400 text-sm tracking-wider uppercase w-48 sticky left-[192px] bg-[#252728] z-20 border-r border-[#4E4F50]">
                  Sub Menu
                </th>
                {initialDepartments.map(dept => (
                  <th key={dept.id} className="p-5 font-semibold text-slate-300 text-center min-w-[140px] uppercase text-sm tracking-wider border-r border-[#4E4F50]">
                    {dept.name}
                  </th>
                ))}
              </tr>
            </thead>
            
            <tbody className="bg-[#3A3B3C]">
              {mainMenus.map(mainMenu => {
                const mySubMenus = subMenus.filter(sub => sub.parentKey === mainMenu.key);
                
                if (mySubMenus.length === 0) {
                  return (
                    <tr key={mainMenu.id} className="border-b border-[#4E4F50] bg-[#3A3B3C]">
                      <td className="p-4 font-bold bg-[#3A3B3C] border-r border-[#4E4F50] align-top w-48 sticky left-0 z-10 text-xs tracking-widest uppercase text-slate-100">
                        {mainMenu.label}
                      </td>
                      <td className="p-4 bg-[#3A3B3C] border-r border-[#4E4F50] text-slate-400 italic text-sm w-48 sticky left-[192px] z-10">
                        No sub-menus
                      </td>
                      <td colSpan={initialDepartments.length} className="bg-[#3A3B3C]"></td>
                    </tr>
                  );
                }

                return mySubMenus.map((subMenu, subIndex) => {
                  const mySideMenus = rightMenus.filter(right => right.parentKey === subMenu.key);

                  return (
                    <React.Fragment key={subMenu.id}>
                      {/* Sub Menu Row */}
                      <tr className="border-b border-[#4E4F50] bg-[#3A3B3C] hover:bg-[#252728] transition-colors">
                        {subIndex === 0 && (
                          <td rowSpan={getMainMenuRowSpan(mainMenu.key)} className="p-4 font-bold bg-[#3A3B3C] border-r border-[#4E4F50] align-top w-48 sticky left-0 z-10 text-xs tracking-widest uppercase text-slate-100">
                            {mainMenu.label}
                          </td>
                        )}
                        
                        <td className="p-4 font-bold bg-[#3A3B3C] border-r border-[#4E4F50] align-middle w-48 sticky left-[192px] z-10 text-xs tracking-widest uppercase text-slate-100">
                          {subMenu.label}
                        </td>

                        {initialDepartments.map(dept => (
                          <td key={dept.id} className="p-4 text-center border-r border-[#4E4F50] min-w-[140px]">
                            <button
                              onClick={() => handleToggle(dept.id, subMenu.id, isChecked(dept.id, subMenu.id))}
                              disabled={isSaving}
                              className={`w-10 h-6 rounded-full flex items-center justify-center mx-auto transition-all duration-300 relative ${
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
                        return (
                        <tr key={sideMenu.id} className="border-b border-[#4E4F50] bg-[#3A3B3C] hover:bg-[#252728] transition-colors">
                          <td className="p-4 font-medium text-slate-400 italic text-sm text-right bg-[#3A3B3C] border-r border-[#4E4F50] w-48 sticky left-[192px] z-10 flex items-center justify-end gap-2">
                            {isLocked ? (
                              <button onClick={() => handleLockToggle(sideMenu.id, true)} disabled={isSaving} className="text-red-400 hover:text-red-300 transition-colors" title="Unlock from parent">
                                <Lock className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button onClick={() => handleLockToggle(sideMenu.id, false)} disabled={isSaving} className="text-slate-400 hover:text-slate-300 transition-colors" title="Lock to parent">
                                <Unlock className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {sideMenu.label}
                          </td>
                          {initialDepartments.map(dept => (
                            <td key={dept.id} className="p-4 text-center border-r border-[#4E4F50] min-w-[140px]">
                              <button
                                onClick={() => handleToggle(dept.id, sideMenu.id, isChecked(dept.id, sideMenu.id))}
                                disabled={isSaving || isLocked}
                                className={`w-5 h-5 rounded flex items-center justify-center mx-auto transition-all border ${
                                  isChecked(dept.id, sideMenu.id) ? (isLocked ? 'bg-[#4E4F50] border-[#4E4F50] text-slate-400 opacity-50 cursor-not-allowed' : 'bg-[#C7F33C] border-[#C7F33C] text-black') : (isLocked ? 'bg-[#252728] border-[#4E4F50] opacity-50 cursor-not-allowed' : 'bg-[#252728] border-[#4E4F50] hover:border-[#C7F33C]')
                                }`}
                              >
                                {isChecked(dept.id, sideMenu.id) && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                              </button>
                            </td>
                          ))}
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
