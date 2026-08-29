"use client";

import React, { useRef, useState } from "react";
import { batchUpdatePermissions } from "@/lib/actions/permission";
import { Check, Loader2, ChevronLeft, ChevronRight, Save } from "lucide-react";
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
                  className="flex items-center gap-2 px-6 py-2 bg-black hover:bg-gray-800 text-white rounded-full font-medium transition-all disabled:opacity-50 animate-in fade-in slide-in-from-right-2"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              )}
              <button 
                onClick={() => scroll('left')}
                className="p-2 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => scroll('right')}
                className="p-2 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden flex flex-col relative">
            <div ref={scrollRef} className="overflow-hidden">
            <table className="w-full text-left border-collapse min-w-max">
            <thead>
              <tr className="bg-white border-b-2 border-slate-200 ">
                <th className="p-5 font-semibold text-slate-400 text-sm tracking-wider uppercase w-48 sticky left-0 bg-white z-20 border-r border-slate-200">
                  Main Menu
                </th>
                <th className="p-5 font-semibold text-slate-400 text-sm tracking-wider uppercase w-48 sticky left-[192px] bg-white z-20 border-r border-slate-200">
                  Sub Menu
                </th>
                {initialDepartments.map(dept => (
                  <th key={dept.id} className="p-5 font-semibold text-slate-800 text-center min-w-[140px] uppercase text-sm tracking-wider border-r border-slate-200">
                    {dept.name}
                  </th>
                ))}
              </tr>
            </thead>
            
            <tbody className="bg-white">
              {mainMenus.map(mainMenu => {
                const mySubMenus = subMenus.filter(sub => sub.parentKey === mainMenu.key);
                
                if (mySubMenus.length === 0) {
                  return (
                    <tr key={mainMenu.id} className="border-b border-slate-200 bg-white">
                      <td className="p-4 font-bold bg-white border-r border-slate-200 align-top w-48 sticky left-0 z-10 text-xs tracking-widest uppercase text-slate-900">
                        {mainMenu.label}
                      </td>
                      <td className="p-4 bg-white border-r border-slate-200 text-slate-400 italic text-sm w-48 sticky left-[192px] z-10">
                        No sub-menus
                      </td>
                      <td colSpan={initialDepartments.length} className="bg-white"></td>
                    </tr>
                  );
                }

                return mySubMenus.map((subMenu, subIndex) => {
                  const mySideMenus = rightMenus.filter(right => right.parentKey === subMenu.key);

                  return (
                    <React.Fragment key={subMenu.id}>
                      {/* Sub Menu Row */}
                      <tr className="border-b border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                        {subIndex === 0 && (
                          <td rowSpan={getMainMenuRowSpan(mainMenu.key)} className="p-4 font-bold bg-white border-r border-slate-200 align-top w-48 sticky left-0 z-10 text-xs tracking-widest uppercase text-slate-900">
                            {mainMenu.label}
                          </td>
                        )}
                        
                        <td className="p-4 font-bold bg-white border-r border-slate-200 align-middle w-48 sticky left-[192px] z-10 text-xs tracking-widest uppercase text-slate-900">
                          {subMenu.label}
                        </td>

                        {initialDepartments.map(dept => (
                          <td key={dept.id} className="p-4 text-center border-r border-slate-200 min-w-[140px]">
                            <button
                              onClick={() => handleToggle(dept.id, subMenu.id, isChecked(dept.id, subMenu.id))}
                              disabled={isSaving}
                              className={`w-10 h-6 rounded-full flex items-center justify-center mx-auto transition-all duration-300 relative ${
                                isChecked(dept.id, subMenu.id) ? "bg-black" : "bg-slate-200"
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
                      {mySideMenus.map(sideMenu => (
                        <tr key={sideMenu.id} className="border-b border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-medium text-slate-500 text-slate-400 italic text-sm text-right bg-white border-r border-slate-200 w-48 sticky left-[192px] z-10">
                            {sideMenu.label}
                          </td>
                          {initialDepartments.map(dept => (
                            <td key={dept.id} className="p-4 text-center border-r border-slate-200 min-w-[140px]">
                              <button
                                onClick={() => handleToggle(dept.id, sideMenu.id, isChecked(dept.id, sideMenu.id))}
                                disabled={isSaving}
                                className={`w-5 h-5 rounded flex items-center justify-center mx-auto transition-all border ${
                                  isChecked(dept.id, sideMenu.id) ? 'bg-black border-black text-white' : 'bg-white border-slate-300 hover:border-slate-400'
                                }`}
                              >
                                {isChecked(dept.id, sideMenu.id) && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
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
