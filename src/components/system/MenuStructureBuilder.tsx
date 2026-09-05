"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { updateMenuStructure, createMainMenu, updateMenuDetails, deleteMainMenu, updateMainMenuSortOrders } from "@/lib/actions/permission";
import { IconMap } from "@/lib/menu-registry";
import { GripVertical, GripHorizontal, Loader2, Plus, Edit2, Trash2, X, Settings } from "lucide-react";
import { useDialog } from "@/providers/DialogProvider";

interface MenuItemType {
  id: string;
  key: string;
  label: string;
  level: number;
  parentKey: string | null;
  icon: string | null;
  description: string | null;
  sortOrder: number;
}

interface MenuStructureBuilderProps {
  menus: MenuItemType[];
}

export function MenuStructureBuilder({ menus: initialMenus }: MenuStructureBuilderProps) {
  const router = useRouter();
  const { toast, confirm } = useDialog();
  const [menus, setMenus] = useState(initialMenus);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Modal State
  const [editModal, setEditModal] = useState<{isOpen: boolean, id?: string, label: string, icon: string, description: string, isSubMenu: boolean}>({ isOpen: false, label: '', icon: 'Settings', description: '', isSubMenu: false });

  // Update menus when initialMenus change (e.g. after refresh)
  useEffect(() => {
    setTimeout(() => {
      setMenus(initialMenus);
    }, 0);
  }, [initialMenus]);

  const mainMenus = menus.filter((m) => m.level === 1);
  const userTools = mainMenus.filter(m => m.key !== 'system');
  const adminTools = mainMenus.filter(m => m.key === 'system');
  const subMenus = menus.filter((m) => m.level === 2);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveSubMenu = subMenus.find((m) => m.id === activeId);
    const isActiveMainMenu = mainMenus.find((m) => m.id === activeId);
    
    // We are dragging a Sub-Menu
    if (isActiveSubMenu) {
      const activeIndex = menus.findIndex((m) => m.id === activeId);
      const overIndex = menus.findIndex((m) => m.id === overId);
      
      const isOverMainMenu = mainMenus.find((m) => m.id === overId);
      const isOverSubMenu = subMenus.find((m) => m.id === overId);

      if (isOverSubMenu && menus[activeIndex].parentKey !== menus[overIndex].parentKey) {
        setMenus((prev) => {
          const newMenus = [...prev];
          newMenus[activeIndex].parentKey = newMenus[overIndex].parentKey;
          return arrayMove(newMenus, activeIndex, overIndex);
        });
      } else if (isOverMainMenu) {
        setMenus((prev) => {
          const newMenus = [...prev];
          newMenus[activeIndex].parentKey = isOverMainMenu.key;
          return arrayMove(newMenus, activeIndex, overIndex);
        });
      }
    } else if (isActiveMainMenu) {
      // We are dragging a Main Menu
      const overItem = menus.find((m) => m.id === overId);
      if (overItem && overItem.level === 1) {
        setMenus((prev) => {
          const activeIndex = prev.findIndex((m) => m.id === activeId);
          const overIndex = prev.findIndex((m) => m.id === overId);
          return arrayMove(prev, activeIndex, overIndex);
        });
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const activeItem = menus.find(m => m.id === activeId);
    
    if (!activeItem) return;

    if (activeId !== overId) {
      setMenus((prev) => {
        const activeIndex = prev.findIndex((m) => m.id === activeId);
        const overIndex = prev.findIndex((m) => m.id === overId);
        return arrayMove(prev, activeIndex, overIndex);
      });
    }

    // Persist changes
    setIsSaving(true);
    try {
      if (activeItem.level === 1) {
        // Find which group it belongs to
        const isAdminTool = activeItem.key === 'system' || activeItem.key === 'setting';
        // Compute new sorted list for that group based on the newly sorted menus state
        // To ensure we use the updated state, we can compute it on the fly:
        let updatedMenus = menus;
        if (activeId !== overId) {
          const activeIndex = menus.findIndex((m) => m.id === activeId);
          const overIndex = menus.findIndex((m) => m.id === overId);
          updatedMenus = arrayMove(menus, activeIndex, overIndex);
        }
        
        const groupMainMenus = updatedMenus.filter(m => m.level === 1 && (isAdminTool ? (m.key === 'system' || m.key === 'setting') : (m.key !== 'system' && m.key !== 'setting')));
        
        const updates = groupMainMenus.map((m, idx) => ({ id: m.id, sortOrder: idx + 1 }));
        await updateMainMenuSortOrders(updates);
        
      } else if (activeItem.level === 2) {
        // handle Sub-Menu saving
        // to get the correct parent and sort order, we check updatedMenus (if arrayMoved) or menus
        let updatedMenus = menus;
        if (activeId !== overId) {
          const activeIndex = menus.findIndex((m) => m.id === activeId);
          const overIndex = menus.findIndex((m) => m.id === overId);
          updatedMenus = arrayMove(menus, activeIndex, overIndex);
        }
        
        const activeMenuNow = updatedMenus.find(m => m.id === activeId)!;
        const siblings = updatedMenus.filter(m => m.parentKey === activeMenuNow.parentKey && m.level === 2);
        
        for (let i = 0; i < siblings.length; i++) {
           await updateMenuStructure(siblings[i].id, activeMenuNow.parentKey || "", i + 1);
        }
      }
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to save structure", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMenu = async () => {
    if (!editModal.label.trim()) return toast({ title: "Error", description: "Label is required", type: "error" });
    
    setIsSaving(true);
    try {
      if (editModal.id) {
        await updateMenuDetails(editModal.id, editModal.label, editModal.icon, editModal.description);
        setMenus(prev => prev.map(m => m.id === editModal.id ? { ...m, label: editModal.label, icon: editModal.icon, description: editModal.description } : m));
        toast({ title: "Updated", description: "Menu updated successfully", type: "success" });
      } else {
        const res = await createMainMenu(editModal.label, editModal.icon);
        if (res.success && res.menu) {
          setMenus(prev => [...prev, res.menu as MenuItemType]);
        }
        toast({ title: "Created", description: "Menu created successfully", type: "success" });
      }
      setEditModal({ isOpen: false, label: '', icon: 'Settings', description: '', isSubMenu: false });
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Operation failed", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMenu = async (id: string) => {
    const ok = await confirm({
      title: "Delete Category?",
      description: "Are you sure you want to delete this category? (Must be empty)",
      confirmText: "Delete",
      variant: "danger"
    });
    if (!ok) return;

    setIsSaving(true);
    try {
      const res = await deleteMainMenu(id);
      if (res.error) {
        toast({ title: "Cannot Delete", description: res.error, type: "error" });
      } else {
        setMenus(prev => prev.filter(m => m.id !== id));
        toast({ title: "Deleted", description: "Menu deleted successfully", type: "success" });
        router.refresh();
      }
    } catch {
      toast({ title: "Error", description: "Delete failed", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col relative min-h-[500px]">
      {isSaving && (
        <div className="absolute top-4 right-6 flex items-center gap-2 text-slate-400 text-sm font-medium">
          <Loader2 className="w-4 h-4 animate-spin" /> Saving...
        </div>
      )}
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-12">
          {/* USER TOOLS */}
          <div>
            <h3 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-2">
              <Settings className="w-5 h-5 text-[#C7F33C]" /> User Tools
            </h3>
            <SortableContext items={userTools.map(m => m.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {userTools.map((mainMenu) => (
                  <SortableMainMenuBucket 
                    key={mainMenu.id} 
                    mainMenu={mainMenu} 
                    subMenus={menus.filter(m => m.parentKey === mainMenu.key && m.level === 2)} 
                    onEdit={() => setEditModal({ isOpen: true, id: mainMenu.id, label: mainMenu.label, icon: mainMenu.icon || 'Settings', description: mainMenu.description || '', isSubMenu: false })}
                    onEditSub={(sub) => setEditModal({ isOpen: true, id: sub.id, label: sub.label, icon: sub.icon || 'LayoutDashboard', description: sub.description || '', isSubMenu: true })}
                    onDelete={() => handleDeleteMenu(mainMenu.id)}
                  />
                ))}

                {/* Add New Category Button */}
                <button
                  onClick={() => setEditModal({ isOpen: true, label: '', icon: 'Settings', description: '', isSubMenu: false })}
                  className="border-2 border-dashed border-[#4E4F50] rounded-2xl p-4 flex flex-col items-center justify-center min-h-[300px] hover:border-[#C7F33C] bg-[#3A3B3C] hover:bg-[#252728] transition-colors text-slate-400 hover:text-[#C7F33C] group"
                >
                  <div className="p-3 bg-[#252728] rounded-full border border-[#4E4F50] mb-3 group-hover:border-[#C7F33C] group-hover:text-[#C7F33C] transition-colors">
                    <Plus className="w-6 h-6" />
                  </div>
                  <span className="font-semibold">Add Category</span>
                </button>
              </div>
            </SortableContext>
          </div>

          {/* ADMIN TOOLS */}
          <div>
            <h3 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-2">
              <Settings className="w-5 h-5 text-[#C7F33C]" /> Admin Tools
            </h3>
            <SortableContext items={adminTools.map(m => m.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {adminTools.map((mainMenu) => (
                  <SortableMainMenuBucket 
                    key={mainMenu.id} 
                    mainMenu={mainMenu} 
                    subMenus={menus.filter(m => m.parentKey === mainMenu.key && m.level === 2)} 
                    onEdit={() => setEditModal({ isOpen: true, id: mainMenu.id, label: mainMenu.label, icon: mainMenu.icon || 'Settings', description: mainMenu.description || '', isSubMenu: false })}
                    onEditSub={(sub) => setEditModal({ isOpen: true, id: sub.id, label: sub.label, icon: sub.icon || 'LayoutDashboard', description: sub.description || '', isSubMenu: true })}
                    onDelete={() => handleDeleteMenu(mainMenu.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </div>
        </div>

        <DragOverlay>
          {activeId ? (
            menus.find((m) => m.id === activeId)?.level === 1 
              ? <SortableMainMenuBucket 
                  mainMenu={menus.find((m) => m.id === activeId)!} 
                  subMenus={menus.filter(m => m.parentKey === menus.find(n => n.id === activeId)?.key && m.level === 2)} 
                  onEdit={() => {}} onDelete={() => {}} onEditSub={() => {}}
                  isOverlay 
                />
              : <SubMenuCard menu={menus.find((m) => m.id === activeId)!} isOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Edit Modal */}
      {editModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#3A3B3C] rounded-[2rem] border border-[#4E4F50] p-8 w-full max-w-md shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-100">{editModal.id ? "Edit Category" : "New Category"}</h2>
              <button onClick={() => setEditModal({ isOpen: false, label: '', icon: 'Settings', description: '', isSubMenu: false })} className="p-2 text-slate-400 hover:text-white hover:bg-[#4E4F50] rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-1.5">Label</label>
                <input 
                  type="text" 
                  value={editModal.label} 
                  onChange={(e) => setEditModal(prev => ({...prev, label: e.target.value}))}
                  className="w-full bg-[#252728] text-slate-100 placeholder-slate-500 border border-[#4E4F50] rounded-xl px-4 py-3 outline-none focus:border-[#C7F33C] focus:ring-1 focus:ring-[#C7F33C] transition-all"
                  placeholder="e.g. Sales & Operations"
                />
              </div>
              {editModal.isSubMenu && (
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-1.5">Description</label>
                  <input 
                    type="text" 
                    value={editModal.description} 
                    onChange={(e) => setEditModal(prev => ({...prev, description: e.target.value}))}
                    className="w-full bg-[#252728] text-slate-100 placeholder-slate-500 border border-[#4E4F50] rounded-xl px-4 py-3 outline-none focus:border-[#C7F33C] focus:ring-1 focus:ring-[#C7F33C] transition-all"
                    placeholder="e.g. Access and manage configurations."
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-1.5">Icon</label>
                <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {Object.entries(IconMap).map(([iconName, IconComponent]) => (
                    <button
                      key={iconName}
                      onClick={() => setTimeout(() => setEditModal(prev => ({...prev, icon: iconName})), 0)}
                      title={iconName}
                      className={`
                        flex items-center justify-center p-2 rounded-xl border transition-all duration-200
                        ${editModal.icon === iconName 
                          ? "bg-[#C7F33C] border-[#C7F33C] text-black" 
                          : "bg-[#252728] border-[#4E4F50] text-slate-400 hover:border-slate-300 hover:text-slate-100"
                        }
                      `}
                    >
                      <IconComponent className="w-5 h-5" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setEditModal({ isOpen: false, label: '', icon: 'Settings', description: '', isSubMenu: false })}
                className="px-5 py-2.5 rounded-full text-slate-300 font-semibold hover:bg-[#4E4F50] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveMenu}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-full bg-[#C7F33C] text-black font-bold hover:bg-[#b5dc35] transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Category"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableMainMenuBucket({ mainMenu, subMenus, onEdit, onEditSub, onDelete, isOverlay }: { mainMenu: MenuItemType; subMenus: MenuItemType[]; onEdit: () => void; onEditSub: (sub: MenuItemType) => void; onDelete: () => void; isOverlay?: boolean }) {
  const Icon = mainMenu.icon ? IconMap[mainMenu.icon] : null;
  const { setNodeRef, attributes, listeners, transform, transition, isDragging, isOver } = useSortable({ id: mainMenu.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`
        bg-[#3A3B3C] rounded-2xl border p-4 flex flex-col h-full min-h-[300px] transition-colors relative group
        ${isOver ? 'border-[#C7F33C] bg-[#252728]' : 'border-[#4E4F50]'}
        ${isOverlay ? 'scale-105 rotate-1 z-50 bg-[#3A3B3C]' : ''}
      `}
    >
      {/* Actions */}
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
        <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-[#C7F33C] hover:bg-[#4E4F50] rounded-md transition-colors"><Edit2 className="w-4 h-4" /></button>
        <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-[#4E4F50] rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
      </div>

      <div className="flex items-center gap-3 mb-6 px-2 pr-16 group/header cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripHorizontal className="w-5 h-5 text-slate-400 group-hover/header:text-[#C7F33C] transition-colors" />
        {Icon && <div className="p-2 bg-[#252728] rounded-lg border border-[#4E4F50] text-slate-300"><Icon className="w-5 h-5" /></div>}
        <h3 className="font-bold text-slate-100 tracking-tight">{mainMenu.label}</h3>
      </div>

      <SortableContext items={subMenus.map((m) => m.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3 flex-1">
          {subMenus.length === 0 ? (
            <div className="flex-1 flex items-center justify-center border-2 border-dashed border-[#4E4F50] rounded-xl bg-[#252728]">
              <span className="text-slate-400 text-sm font-medium">Drop items here</span>
            </div>
          ) : (
            subMenus.map((subMenu) => <SortableSubMenu key={subMenu.id} menu={subMenu} onEdit={() => onEditSub(subMenu)} />)
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableSubMenu({ menu, onEdit }: { menu: MenuItemType; onEdit?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: menu.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <SubMenuCard menu={menu} isDragging={isDragging} onEdit={onEdit} />
    </div>
  );
}

function SubMenuCard({ menu, isDragging, isOverlay, onEdit }: { menu: MenuItemType; isDragging?: boolean; isOverlay?: boolean; onEdit?: () => void }) {
  const Icon = menu.icon ? IconMap[menu.icon] : null;

  return (
    <div className={`
      relative bg-[#252728] rounded-xl border border-[#4E4F50] p-3 flex items-center gap-3 group
      ${isDragging ? 'border-dashed bg-[#252728]' : 'hover:border-[#C7F33C] transition-colors cursor-grab active:cursor-grabbing'}
      ${isOverlay ? 'scale-105 rotate-2 z-50 bg-[#252728]/90 backdrop-blur' : ''}
    `}>
      <div className="text-slate-400 group-hover:text-[#C7F33C] transition-colors">
        <GripVertical className="w-4 h-4" />
      </div>
      {Icon && <Icon className="w-4 h-4 text-slate-400" />}
      <span className="font-semibold text-slate-300 text-sm flex-1">{menu.label}</span>
      {onEdit && (
        <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex gap-1 bg-[#3A3B3C] p-1 rounded-md border border-[#4E4F50]">
          <button onPointerDown={(e) => { e.stopPropagation(); onEdit(); }} className="p-1 text-slate-400 hover:text-[#C7F33C] transition-colors">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
