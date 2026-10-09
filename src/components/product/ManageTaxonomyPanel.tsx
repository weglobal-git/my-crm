"use client";

import React, { useState, useEffect } from "react";
import {
  FolderTree,
  Tag,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Loader2,
  Package,
  GripVertical,
  Star,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SlideOverPanel, SlideOverTab } from "@/components/ui/SlideOverPanel";
import { SlideOverSubBar } from "@/components/ui/SlideOverSubBar";
import {
  createTaxonomyCategory,
  updateTaxonomyCategory,
  deleteTaxonomyCategory,
  reorderTaxonomyCategories,
  setDefaultTaxonomyCategory,
  toggleDefaultTaxonomyCategory,
  clearAllDefaultCategories,
  createTaxonomyBrand,
  updateTaxonomyBrand,
  deleteTaxonomyBrand,
  reorderTaxonomyBrands,
  setDefaultTaxonomyBrand,
  toggleDefaultTaxonomyBrand,
  clearAllDefaultBrands,
  getProductCategories,
  getProductBrands,
} from "@/lib/actions/product";

interface ManageTaxonomyPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onTaxonomyChanged: (newDefaults?: {
    category?: string | null;
    brand?: string | null;
    categories?: string[];
    brands?: string[];
  }) => void;
}

interface SortableTaxonomyItemProps {
  id: string;
  name: string;
  count: number;
  index: number;
  total: number;
  isDefault?: boolean;
  isEditing: boolean;
  editingName: string;
  onToggleDefault?: () => void;
  onStartEdit: () => void;
  onEditingNameChange: (val: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SortableTaxonomyItem({
  id,
  name,
  count,
  index,
  total,
  isDefault,
  isEditing,
  editingName,
  onToggleDefault,
  onStartEdit,
  onEditingNameChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: SortableTaxonomyItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 20 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between py-2 gap-2 transition-colors ${
        isDragging ? "bg-[#252728] shadow-lg rounded-xl ring-1 ring-[#C7F33C]/50 px-2" : ""
      } ${isDefault ? "bg-[#C7F33C]/5 rounded-xl px-1.5" : ""}`}
    >
      {/* Drag Handle + Arrow Buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="p-1 text-slate-500 hover:text-[#C7F33C] cursor-grab active:cursor-grabbing focus:outline-none transition-colors"
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={index === 0}
            onClick={onMoveUp}
            className="p-1 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
            title="Move Up"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={onMoveDown}
            className="p-1 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
            title="Move Down"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Title or Edit Input */}
      <div className="flex-1 min-w-0 px-2">
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={editingName}
              onChange={(e) => onEditingNameChange(e.target.value)}
              className="flex-1 bg-[#252728] border border-[#C7F33C] rounded-lg px-2.5 py-1 text-xs text-slate-100 outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={onSaveEdit}
              className="p-1 text-[#C7F33C] hover:bg-black/20 rounded cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="p-1 text-slate-400 hover:bg-black/20 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-100 truncate">
              {name}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#252728] text-slate-400 tabular-nums">
              {count} items
            </span>
            {isDefault && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#C7F33C]/15 text-[#C7F33C] border border-[#C7F33C]/30 tracking-wide">
                <Star className="w-2.5 h-2.5 fill-[#C7F33C]" />
                DEFAULT
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {!isEditing && (
        <div className="flex items-center gap-1 shrink-0">
          {/* Default Toggle Button (Star) */}
          <button
            type="button"
            onClick={onToggleDefault}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isDefault
                ? "text-[#C7F33C] bg-[#C7F33C]/15 border border-[#C7F33C]/30 hover:bg-[#C7F33C]/25 shadow-xs"
                : "text-slate-500 hover:text-slate-300 hover:bg-[#252728]"
            }`}
            title={
              isDefault
                ? "Currently set as default view on page load (Click to remove)"
                : "Set as default view on page load"
            }
            aria-label={isDefault ? "Unset default" : "Set default"}
          >
            <Star className={`w-3.5 h-3.5 ${isDefault ? "fill-[#C7F33C]" : ""}`} />
          </button>

          <button
            type="button"
            onClick={onStartEdit}
            className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
            title="Rename"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

const TABS: SlideOverTab[] = [
  { key: "categories", label: "Categories", icon: FolderTree },
  { key: "brands", label: "Brands", icon: Tag },
];

export function ManageTaxonomyPanel({
  isOpen,
  onClose,
  onTaxonomyChanged,
}: ManageTaxonomyPanelProps) {
  const [activeTab, setActiveTab] = useState("categories");
  const [isLoading, setIsLoading] = useState(false);

  // Categories & Brands lists
  const [categories, setCategories] = useState<{ id?: string; category: string; count: number; order?: number; isDefault?: boolean }[]>([]);
  const [brands, setBrands] = useState<{ id?: string; brand: string; count: number; order?: number; isDefault?: boolean }[]>([]);

  // Default handlers (supports multiple defaults, e.g. Factory Brands)
  const handleToggleDefaultCategory = async (id: string) => {
    const item = categories.find((c) => c.id === id);
    if (!item) return;
    const nextVal = !item.isDefault;

    const nextCategories = categories.map((c) =>
      c.id === id ? { ...c, isDefault: nextVal } : c
    );
    setCategories(nextCategories);

    try {
      await toggleDefaultTaxonomyCategory(id);
      const defaultNames = nextCategories.filter((c) => c.isDefault).map((c) => c.category);
      onTaxonomyChanged({ categories: defaultNames });
    } catch (err) {
      console.error("Failed to toggle default category:", err);
      void loadData();
    }
  };

  const handleClearDefaultCategories = async () => {
    const nextCategories = categories.map((c) => ({ ...c, isDefault: false }));
    setCategories(nextCategories);

    try {
      await clearAllDefaultCategories();
      onTaxonomyChanged({ categories: [] });
    } catch (err) {
      console.error("Failed to clear default categories:", err);
      void loadData();
    }
  };

  const handleToggleDefaultBrand = async (id: string) => {
    const item = brands.find((b) => b.id === id);
    if (!item) return;
    const nextVal = !item.isDefault;

    const nextBrands = brands.map((b) =>
      b.id === id ? { ...b, isDefault: nextVal } : b
    );
    setBrands(nextBrands);

    try {
      await toggleDefaultTaxonomyBrand(id);
      const defaultNames = nextBrands.filter((b) => b.isDefault).map((b) => b.brand);
      onTaxonomyChanged({ brands: defaultNames });
    } catch (err) {
      console.error("Failed to toggle default brand:", err);
      void loadData();
    }
  };

  const handleClearDefaultBrands = async () => {
    const nextBrands = brands.map((b) => ({ ...b, isDefault: false }));
    setBrands(nextBrands);

    try {
      await clearAllDefaultBrands();
      onTaxonomyChanged({ brands: [] });
    } catch (err) {
      console.error("Failed to clear default brands:", err);
      void loadData();
    }
  };

  // New item inputs
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cats, brs] = await Promise.all([
        getProductCategories(),
        getProductBrands(),
      ]);
      setCategories(cats);
      setBrands(brs);
    } catch (err) {
      console.error("Failed to load taxonomy:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadData();
    }
  }, [isOpen]);

  // CATEGORY ACTIONS
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setIsSubmitting(true);
    try {
      await createTaxonomyCategory(newCategoryName.trim());
      setNewCategoryName("");
      await loadData();
      onTaxonomyChanged();
    } catch (err) {
      console.error("Failed to add category:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEditCategory = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await updateTaxonomyCategory(id, editingName.trim());
      setEditingId(null);
      await loadData();
      onTaxonomyChanged();
    } catch (err) {
      console.error("Failed to edit category:", err);
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete category "${name}"?`)) return;
    try {
      await deleteTaxonomyCategory(id);
      await loadData();
      onTaxonomyChanged();
    } catch (err) {
      console.error("Failed to delete category:", err);
    }
  };

  const handleMoveCategory = async (index: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= categories.length) return;

    const list = [...categories];
    const [moved] = list.splice(index, 1);
    list.splice(newIdx, 0, moved);
    setCategories(list);

    const orderedIds = list.map((c) => c.id).filter(Boolean) as string[];
    try {
      await reorderTaxonomyCategories(orderedIds);
      onTaxonomyChanged();
    } catch (err) {
      console.error("Failed to reorder categories:", err);
      void loadData();
    }
  };

  // BRAND ACTIONS
  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandName.trim()) return;
    setIsSubmitting(true);
    try {
      await createTaxonomyBrand(newBrandName.trim());
      setNewBrandName("");
      await loadData();
      onTaxonomyChanged();
    } catch (err) {
      console.error("Failed to add brand:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEditBrand = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await updateTaxonomyBrand(id, editingName.trim());
      setEditingId(null);
      await loadData();
      onTaxonomyChanged();
    } catch (err) {
      console.error("Failed to edit brand:", err);
    }
  };

  const handleDeleteBrand = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete brand "${name}"?`)) return;
    try {
      await deleteTaxonomyBrand(id);
      await loadData();
      onTaxonomyChanged();
    } catch (err) {
      console.error("Failed to delete brand:", err);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleMoveBrand = async (index: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= brands.length) return;

    const list = [...brands];
    const [moved] = list.splice(index, 1);
    list.splice(newIdx, 0, moved);
    setBrands(list);

    const orderedIds = list.map((b) => b.id).filter(Boolean) as string[];
    try {
      await reorderTaxonomyBrands(orderedIds);
      onTaxonomyChanged();
    } catch (err) {
      console.error("Failed to reorder brands:", err);
      void loadData();
    }
  };

  const handleCategoryDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => (c.id || c.category) === active.id);
    const newIndex = categories.findIndex((c) => (c.id || c.category) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const list = arrayMove(categories, oldIndex, newIndex);
    setCategories(list);

    const orderedIds = list.map((c) => c.id).filter(Boolean) as string[];
    try {
      await reorderTaxonomyCategories(orderedIds);
      onTaxonomyChanged();
    } catch (err) {
      console.error("Failed to reorder categories:", err);
      void loadData();
    }
  };

  const handleBrandDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = brands.findIndex((b) => (b.id || b.brand) === active.id);
    const newIndex = brands.findIndex((b) => (b.id || b.brand) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const list = arrayMove(brands, oldIndex, newIndex);
    setBrands(list);

    const orderedIds = list.map((b) => b.id).filter(Boolean) as string[];
    try {
      await reorderTaxonomyBrands(orderedIds);
      onTaxonomyChanged();
    } catch (err) {
      console.error("Failed to reorder brands:", err);
      void loadData();
    }
  };

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Categories & Brands"
      subtitle="Reorder, create, or rename taxonomy items"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      widthClass="w-[600px]"
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#C7F33C] animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-6 select-none pb-8">
          {/* TAB 1: CATEGORIES */}
          {activeTab === "categories" && (
            <div className="flex flex-col gap-5">
              {/* Default Category View Card (Supports multiple defaults) */}
              {(() => {
                const defaultCats = categories.filter((c) => c.isDefault);
                const hasDefaults = defaultCats.length > 0;

                return (
                  <div className="bg-[#2D2E30] rounded-2xl p-4 border border-[#4E4F50]/40 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                          hasDefaults
                            ? "bg-[#C7F33C]/15 border-[#C7F33C]/40 text-[#C7F33C]"
                            : "bg-[#252728] border-[#3E4042] text-slate-400"
                        }`}
                      >
                        <Star className={`w-4 h-4 ${hasDefaults ? "fill-[#C7F33C]" : ""}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                            DEFAULT CATEGORIES {hasDefaults ? `(${defaultCats.length}):` : ":"}
                          </span>
                          {!hasDefaults && (
                            <span className="text-xs font-black text-slate-400">
                              None (Show All)
                            </span>
                          )}
                        </div>

                        {hasDefaults && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {defaultCats.map((c) => (
                              <span
                                key={c.id || c.category}
                                className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-lg bg-[#C7F33C]/15 text-[#C7F33C] border border-[#C7F33C]/30"
                              >
                                <span>{c.category}</span>
                                <button
                                  type="button"
                                  onClick={() => c.id && handleToggleDefaultCategory(c.id)}
                                  className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[#C7F33C]/30 text-[#C7F33C] hover:text-white transition-colors cursor-pointer"
                                  title={`Remove ${c.category} from defaults`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <p className="text-[11px] text-slate-400 mt-1.5">
                          {hasDefaults
                            ? `เมื่อเปิดหน้านี้จะกรองแสดงเฉพาะ ${defaultCats.length} หมวดหมู่นี้เป็นค่าเริ่มต้น เพื่อไม่ให้เห็นสินค้าเยอะเกินไป`
                            : "คลิกไอคอนดาว ★ ที่หมวดหมู่ด้านล่าง เพื่อตั้งเป็นค่าเริ่มต้นเวลาเปิดหน้ารายการสินค้า (เลือกได้หลายหมวดหมู่)"}
                        </p>
                      </div>
                    </div>

                    {hasDefaults && (
                      <button
                        type="button"
                        onClick={handleClearDefaultCategories}
                        className="text-xs font-semibold text-slate-300 hover:text-white bg-[#252728] hover:bg-[#353738] px-3 py-1.5 rounded-xl border border-[#3E4042] transition-colors shrink-0 cursor-pointer mt-0.5"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Add New Category Box */}
              <form onSubmit={handleAddCategory} className="bg-[#3A3B3C] rounded-2xl p-4 border-0">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                  Add New Category
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Enter category name..."
                    className="flex-1 bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !newCategoryName.trim()}
                    className="px-4 py-2 text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </form>

              {/* Category List with Drag & Drop Reorder & Edit (Requirement 5) */}
              <div className="bg-[#3A3B3C] rounded-2xl p-4 border-0">
                <div className="flex items-center justify-between pb-3 border-b border-[#252728]">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Existing Categories ({categories.length})
                  </span>
                  <span className="text-[11px] text-slate-400">Drag handle or use arrows</span>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleCategoryDragEnd}
                >
                  <SortableContext
                    items={categories.map((c) => c.id || c.category)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y divide-[#252728] mt-1">
                      {categories.map((c, index) => {
                        const isEditing = editingId === c.id;
                        const itemId = c.id || c.category;

                        return (
                          <SortableTaxonomyItem
                            key={itemId}
                            id={itemId}
                            name={c.category}
                            count={c.count}
                            index={index}
                            total={categories.length}
                            isDefault={c.isDefault}
                            isEditing={isEditing}
                            editingName={editingName}
                            onToggleDefault={() => c.id && handleToggleDefaultCategory(c.id)}
                            onStartEdit={() => {
                              if (c.id) {
                                setEditingId(c.id);
                                setEditingName(c.category);
                              }
                            }}
                            onEditingNameChange={setEditingName}
                            onSaveEdit={() => c.id && handleSaveEditCategory(c.id)}
                            onCancelEdit={() => setEditingId(null)}
                            onDelete={() => c.id && handleDeleteCategory(c.id, c.category)}
                            onMoveUp={() => handleMoveCategory(index, "up")}
                            onMoveDown={() => handleMoveCategory(index, "down")}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          )}

          {/* TAB 2: BRANDS */}
          {activeTab === "brands" && (
            <div className="flex flex-col gap-5">
              {/* Default Brand View Card (Supports multiple defaults, e.g. Factory Brands) */}
              {(() => {
                const defaultBrds = brands.filter((b) => b.isDefault);
                const hasDefaults = defaultBrds.length > 0;

                return (
                  <div className="bg-[#2D2E30] rounded-2xl p-4 border border-[#4E4F50]/40 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                          hasDefaults
                            ? "bg-[#C7F33C]/15 border-[#C7F33C]/40 text-[#C7F33C]"
                            : "bg-[#252728] border-[#3E4042] text-slate-400"
                        }`}
                      >
                        <Star className={`w-4 h-4 ${hasDefaults ? "fill-[#C7F33C]" : ""}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                            DEFAULT BRANDS {hasDefaults ? `(${defaultBrds.length}):` : ":"}
                          </span>
                          {!hasDefaults && (
                            <span className="text-xs font-black text-slate-400">
                              None (Show All)
                            </span>
                          )}
                        </div>

                        {hasDefaults && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {defaultBrds.map((b) => (
                              <span
                                key={b.id || b.brand}
                                className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-lg bg-[#C7F33C]/15 text-[#C7F33C] border border-[#C7F33C]/30"
                              >
                                <span>{b.brand}</span>
                                <button
                                  type="button"
                                  onClick={() => b.id && handleToggleDefaultBrand(b.id)}
                                  className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[#C7F33C]/30 text-[#C7F33C] hover:text-white transition-colors cursor-pointer"
                                  title={`Remove ${b.brand} from defaults`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <p className="text-[11px] text-slate-400 mt-1.5">
                          {hasDefaults
                            ? `เมื่อเปิดหน้านี้จะกรองแสดงเฉพาะ ${defaultBrds.length} แบรนด์นี้เป็นค่าเริ่มต้น (เช่น เลือกเฉพาะแบรนด์ของโรงงาน ไม่แสดงของลูกค้า)`
                            : "คลิกไอคอนดาว ★ ที่แบรนด์ด้านล่าง เพื่อตั้งเป็นค่าเริ่มต้นเวลาเปิดหน้ารายการสินค้า (เลือกได้หลายแบรนด์ เช่น แบรนด์โรงงาน)"}
                        </p>
                      </div>
                    </div>

                    {hasDefaults && (
                      <button
                        type="button"
                        onClick={handleClearDefaultBrands}
                        className="text-xs font-semibold text-slate-300 hover:text-white bg-[#252728] hover:bg-[#353738] px-3 py-1.5 rounded-xl border border-[#3E4042] transition-colors shrink-0 cursor-pointer mt-0.5"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Add New Brand Box */}
              <form onSubmit={handleAddBrand} className="bg-[#3A3B3C] rounded-2xl p-4 border-0">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
                  Add New Brand
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="Enter brand name..."
                    className="flex-1 bg-[#252728] border border-transparent rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-[#C7F33C] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !newBrandName.trim()}
                    className="px-4 py-2 text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </form>

              {/* Brand List with Drag & Drop Reorder & Edit (Requirement 5) */}
              <div className="bg-[#3A3B3C] rounded-2xl p-4 border-0">
                <div className="flex items-center justify-between pb-3 border-b border-[#252728]">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Existing Brands ({brands.length})
                  </span>
                  <span className="text-[11px] text-slate-400">Drag handle or use arrows</span>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleBrandDragEnd}
                >
                  <SortableContext
                    items={brands.map((b) => b.id || b.brand)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y divide-[#252728] mt-1">
                      {brands.map((b, index) => {
                        const isEditing = editingId === b.id;
                        const itemId = b.id || b.brand;

                        return (
                          <SortableTaxonomyItem
                            key={itemId}
                            id={itemId}
                            name={b.brand}
                            count={b.count}
                            index={index}
                            total={brands.length}
                            isDefault={b.isDefault}
                            isEditing={isEditing}
                            editingName={editingName}
                            onToggleDefault={() => b.id && handleToggleDefaultBrand(b.id)}
                            onStartEdit={() => {
                              if (b.id) {
                                setEditingId(b.id);
                                setEditingName(b.brand);
                              }
                            }}
                            onEditingNameChange={setEditingName}
                            onSaveEdit={() => b.id && handleSaveEditBrand(b.id)}
                            onCancelEdit={() => setEditingId(null)}
                            onDelete={() => b.id && handleDeleteBrand(b.id, b.brand)}
                            onMoveUp={() => handleMoveBrand(index, "up")}
                            onMoveDown={() => handleMoveBrand(index, "down")}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          )}
        </div>
      )}
    </SlideOverPanel>
  );
}
