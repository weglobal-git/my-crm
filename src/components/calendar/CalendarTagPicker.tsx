"use client";

import React, { useState, useEffect, useRef } from "react";
import { Tag as TagIcon, Plus, X, Check, Loader2 } from "lucide-react";
import { getDepartmentTagsAction, createCalendarTagAction } from "@/lib/actions/calendar";

interface TagItem {
  id: string;
  name: string;
  color: string;
  departmentId: string;
}

interface CalendarTagPickerProps {
  departmentId: string;
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
  initialTags?: TagItem[];
}

const PRESET_COLORS = [
  "#10B981", // Emerald
  "#0EA5E9", // Sky
  "#3B82F6", // Blue
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#6B7280", // Gray
];

export function CalendarTagPicker({
  departmentId,
  selectedTagIds,
  onChange,
  disabled = false,
  initialTags = [],
}: CalendarTagPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // New tag inline form state
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
  const [isSubmittingTag, setIsSubmittingTag] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const [prevDepartmentId, setPrevDepartmentId] = useState(departmentId);
  const [prevInitialTags, setPrevInitialTags] = useState(initialTags);

  if (departmentId !== prevDepartmentId || initialTags !== prevInitialTags) {
    setPrevDepartmentId(departmentId);
    setPrevInitialTags(initialTags);
    setTags(initialTags);
    setHasFetched(false);
    setIsOpen(false);
    setIsCreating(false);
  }

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setErrorMessage(null);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // On-demand load of tags when opened
  const handleToggleOpen = async () => {
    if (disabled || !departmentId) return;
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (nextOpen && !hasFetched) {
      setIsLoading(true);
      try {
        const res = await getDepartmentTagsAction(departmentId);
        if (res.success && res.tags) {
          setTags(res.tags);
          setHasFetched(true);
        }
      } catch {
        // fail gracefully
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleToggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  const handleRemoveTag = (tagId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedTagIds.filter((id) => id !== tagId));
  };

  const handleCreateNewTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim() || isSubmittingTag) return;

    setIsSubmittingTag(true);
    setErrorMessage(null);

    try {
      const res = await createCalendarTagAction({
        name: newTagName.trim(),
        color: newTagColor,
        departmentId,
      });

      if (res.success && res.tag) {
        const created = res.tag;
        // Check if already in list
        setTags((prev) => {
          if (prev.some((t) => t.id === created.id)) return prev;
          return [...prev, created];
        });
        // Select it
        if (!selectedTagIds.includes(created.id)) {
          onChange([...selectedTagIds, created.id]);
        }
        setNewTagName("");
        setIsCreating(false);
      } else {
        setErrorMessage(res.error || "Failed to create tag");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error creating tag");
    } finally {
      setIsSubmittingTag(false);
    }
  };

  // Find selected tag items for display
  const selectedTagItems = tags.filter((t) => selectedTagIds.includes(t.id));

  return (
    <div className="relative w-full" ref={containerRef}>
      <label className="block text-xs font-medium text-neutral-400 mb-1.5 flex items-center gap-1.5">
        <TagIcon className="w-3.5 h-3.5 text-neutral-400" />
        Tags
      </label>

      {/* Selected tags pill list + Add button */}
      <div className="flex flex-wrap gap-1.5 items-center min-h-[36px] p-1.5 bg-[#252728] border border-[#4E4F50] rounded-lg">
        {selectedTagIds.length === 0 && (
          <span className="text-xs text-neutral-500 px-2">No tags selected</span>
        )}

        {selectedTagItems.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white border border-[#4E4F50]"
            style={{ backgroundColor: `${tag.color}25`, borderColor: tag.color }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: tag.color }}
            />
            {tag.name}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => handleRemoveTag(tag.id, e)}
                className="hover:text-red-400 transition-colors ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {!disabled && (
          <button
            type="button"
            onClick={handleToggleOpen}
            disabled={!departmentId}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#3A3B3C] text-neutral-300 hover:text-white hover:bg-[#4E4F50] transition-colors disabled:opacity-50 ml-auto"
          >
            <Plus className="w-3 h-3" />
            {isOpen ? "Close" : "Select tag"}
          </button>
        )}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#252728] border border-[#4E4F50] rounded-xl p-2.5 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-4 text-xs text-neutral-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading tags...
            </div>
          ) : (
            <div className="space-y-2">
              {/* Existing Tags List */}
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {tags.length === 0 && !isCreating && (
                  <p className="text-xs text-neutral-500 py-1 px-1">No tags created yet in this department.</p>
                )}

                {tags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleToggleTag(tag.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                        isSelected
                          ? "bg-[#3A3B3C] text-white border-white/50"
                          : "bg-[#1E1F20] text-neutral-300 border-[#4E4F50] hover:border-neutral-400"
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                      {isSelected && <Check className="w-3 h-3 text-[#C7F33C]" />}
                    </button>
                  );
                })}
              </div>

              {/* Inline Create Form */}
              <div className="border-t border-[#3A3B3C] pt-2">
                {!isCreating ? (
                  <button
                    type="button"
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-1.5 text-xs text-[#C7F33C] hover:underline font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create new tag
                  </button>
                ) : (
                  <form onSubmit={handleCreateNewTag} className="space-y-2">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Tag name"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        className="flex-1 bg-[#1E1F20] border border-[#4E4F50] text-xs text-white px-2 py-1 rounded focus:outline-none focus:border-[#C7F33C]"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={!newTagName.trim() || isSubmittingTag}
                        className="px-2.5 py-1 bg-[#C7F33C] text-black font-semibold text-xs rounded hover:bg-[#b8e432] disabled:opacity-50 transition-colors"
                      >
                        {isSubmittingTag ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreating(false);
                          setErrorMessage(null);
                        }}
                        className="px-2 py-1 text-neutral-400 hover:text-white text-xs"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Color palette */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewTagColor(color)}
                          style={{ backgroundColor: color }}
                          className={`w-4 h-4 rounded-full transition-transform ${
                            newTagColor === color ? "scale-125 ring-2 ring-white" : "opacity-80 hover:opacity-100"
                          }`}
                        />
                      ))}
                    </div>

                    {errorMessage && (
                      <p className="text-[11px] text-red-400">{errorMessage}</p>
                    )}
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
