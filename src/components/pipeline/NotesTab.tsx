"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { Flame, Send, Trash2, Loader2, ListTodo, Check } from "lucide-react";
import {
  getNotes,
  createNote,
  deleteNote,
  togglePinNote,
  toggleCompleteNote,
} from "@/lib/actions/notes";
import { OpportunityWithRelations } from "./KanbanCard";
import { useDialog } from "@/providers/DialogProvider";
import { renderCommentText } from "@/components/ui/HighlightText";
import useSWR from "swr";
import { acquireChannelWhenConnected } from "@/lib/pusher-subscription-manager";
import { rollbackDeletedItem } from "@/lib/pipeline-delete-rollback";
import {
  sortDealNotes,
  filterDealNotes,
  toggleNoteCompletion,
  toggleNotePriority,
  type DealTodoNote,
} from "@/lib/deal-todo-sync";

export type NoteItem = DealTodoNote;

export interface NotesTabProps {
  deal: OpportunityWithRelations;
  searchQuery?: string;
  subTab?: "todo" | "completed";
}

export function NotesTab({
  deal,
  searchQuery: externalSearchQuery,
  subTab = "todo",
}: NotesTabProps) {
  const { data: session } = useSession();
  const { toast } = useDialog();

  const { data: notes = [], mutate: mutateNotes, isLoading } = useSWR<NoteItem[]>(
    ["deal-notes", deal.id],
    () => getNotes(deal.id),
    { revalidateOnFocus: true, revalidateOnReconnect: true, dedupingInterval: 5_000 }
  );

  const [internalSearchQuery] = useState("");
  const activeSearchQuery =
    externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;

  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleExpandNote = (id: string) => {
    setExpandedNoteId((prev) => (prev === id ? null : id));
  };

  const [prevSubTab, setPrevSubTab] = useState(subTab);
  if (subTab !== prevSubTab) {
    setPrevSubTab(subTab);
    setExpandedNoteId(null);
  }

  useEffect(() => {
    if (!expandedNoteId) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(`[data-todo-card="${expandedNoteId}"]`)) {
        return;
      }
      setExpandedNoteId(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [expandedNoteId]);

  useEffect(() => {
    queueMicrotask(() => {
      setDockEl(document.getElementById("deal-panel-notes-dock"));
    });
  }, []);

  const adjustTextareaHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(Math.max(el.scrollHeight, 28), 120);
    el.style.height = `${nextHeight}px`;
  };

  useEffect(() => {
    if (!newNote && noteTextareaRef.current) {
      noteTextareaRef.current.style.height = "auto";
    }
  }, [newNote]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const channelName = `private-pipeline-${session.user.id}`;
    return acquireChannelWhenConnected(channelName, (channel) => {
      const handleNoteUpdate = (event?: {
        action?: string;
        dealId?: string;
        noteId?: string;
        note?: NoteItem;
      }) => {
        if (event?.dealId !== deal.id || !event.action?.startsWith("NOTE_")) return;
        mutateNotes(
          (current) => {
            const existing = current || [];
            if (event.action === "NOTE_DELETED" && event.noteId) {
              return existing.filter((note) => note.id !== event.noteId);
            }
            if (event.note) {
              return [
                event.note,
                ...existing.filter((note) => note.id !== event.note?.id),
              ].sort(sortDealNotes);
            }
            return existing;
          },
          { revalidate: false }
        );
      };
      channel.bind("pipeline-updated", handleNoteUpdate);
      return () => channel.unbind("pipeline-updated", handleNoteUpdate);
    });
  }, [deal.id, mutateNotes, session?.user?.id]);

  const handleCreateNote = async () => {
    if (!newNote.trim() || isSubmitting) return;
    const content = newNote.trim();
    const temporaryId = `temp-note-${Date.now()}`;
    const optimisticNote: NoteItem = {
      id: temporaryId,
      content,
      isPinned: false,
      isCompleted: false,
      createdAt: new Date(),
      author: {
        name: session?.user?.name || null,
        image: session?.user?.image || null,
        email: session?.user?.email || null,
      },
    };
    await mutateNotes((current) => [optimisticNote, ...(current || [])], {
      revalidate: false,
    });
    setNewNote("");
    setIsSubmitting(true);
    try {
      const persistedNote = await createNote(deal.id, content);
      await mutateNotes(
        (current) => [
          persistedNote,
          ...(current || []).filter(
            (note) => note.id !== temporaryId && note.id !== persistedNote.id
          ),
        ].sort(sortDealNotes),
        { revalidate: false }
      );
      toast({ title: "To-Do created", type: "success" });
    } catch {
      setNewNote(content);
      await mutateNotes(
        (current) => (current || []).filter((note) => note.id !== temporaryId),
        { revalidate: false }
      );
      toast({ title: "Failed to create to-do", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const targetNote = notes?.find((n) => n.id === id);
    await mutateNotes((current) => (current || []).filter((note) => note.id !== id), {
      revalidate: false,
    });
    try {
      await deleteNote(id);
      toast({ title: "To-Do deleted", type: "success" });
    } catch {
      if (targetNote) {
        await mutateNotes(
          (current) => rollbackDeletedItem(current, targetNote, sortDealNotes),
          { revalidate: false }
        );
      }
      toast({ title: "Failed to delete", type: "error" });
    }
  };

  const handleTogglePriority = async (id: string, currentPinned: boolean) => {
    const nextPinned = !currentPinned;
    const previousNotes = notes;
    try {
      await mutateNotes(
        (current) => toggleNotePriority(current || [], id, nextPinned),
        { revalidate: false }
      );
      await togglePinNote(id, nextPinned);
      toast({
        title: nextPinned ? "Marked as priority" : "Priority removed",
        type: "success",
      });
    } catch {
      toast({ title: "Failed to update priority", type: "error" });
      await mutateNotes(previousNotes, { revalidate: false });
    }
  };

  const handleToggleComplete = async (id: string, targetCompleted: boolean) => {
    const previousNotes = notes;
    try {
      await mutateNotes(
        (current) => toggleNoteCompletion(current || [], id, targetCompleted),
        { revalidate: false }
      );
      await toggleCompleteNote(id, targetCompleted);
      toast({
        title: targetCompleted ? "Moved to Completed" : "Moved back to To-Do",
        type: "success",
      });
    } catch {
      toast({ title: "Failed to update status", type: "error" });
      await mutateNotes(previousNotes, { revalidate: false });
    }
  };

  const filteredNotes = filterDealNotes(notes, subTab, activeSearchQuery);


  const inputBar = (
    <div className="bg-[#252728] border-t border-[#1C1C1D] shrink-0 z-10 flex flex-col relative w-full p-2.5 pt-2">
      <div className="flex items-end gap-1 bg-[#3A3B3C] text-[16px] px-2 py-1.5 border border-[#4E4F50] rounded-xl transition-all w-full">
        {/* Left To-Do List Icon indicator */}
        <div className="flex items-center gap-1 shrink-0 h-7 self-end pl-1 pr-1 text-slate-400">
          <ListTodo className="w-4 h-4 text-[#C7F33C]" />
        </div>

        <textarea
          ref={noteTextareaRef}
          rows={1}
          value={newNote}
          onChange={(e) => {
            setNewNote(e.target.value);
            adjustTextareaHeight(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (e.shiftKey) {
                setTimeout(() => adjustTextareaHeight(noteTextareaRef.current), 0);
                return;
              }
              const isMobileDevice =
                typeof window !== "undefined" &&
                ("ontouchstart" in window || navigator.maxTouchPoints > 0) &&
                window.innerWidth < 768;

              if (!isMobileDevice) {
                e.preventDefault();
                if (!isSubmitting && newNote.trim()) {
                  handleCreateNote();
                }
              } else {
                setTimeout(() => adjustTextareaHeight(noteTextareaRef.current), 0);
              }
            }
          }}
          placeholder="Write a to-do..."
          style={{ height: "auto", minHeight: "28px", maxHeight: "120px" }}
          className="flex-1 bg-transparent border-none text-white pl-1 text-[16px] focus:outline-none placeholder:text-slate-400 min-w-0 resize-none overflow-y-auto leading-5 hide-scrollbar py-1"
        />

        {/* Send Button / Indicator */}
        {isSubmitting ? (
          <div className="w-7 h-7 flex items-center justify-center shrink-0 self-end">
            <Loader2 className="w-4 h-4 animate-spin text-[#C7F33C]" />
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCreateNote}
            disabled={!newNote.trim() || isSubmitting}
            className={`w-7 h-7 flex items-center justify-center shrink-0 rounded-full transition-colors cursor-pointer self-end ${
              !newNote.trim()
                ? "text-slate-500 opacity-40 cursor-not-allowed"
                : "text-[#C7F33C] hover:bg-black/20"
            }`}
            title="Post to-do (Enter)"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Notes / To-Do List */}
      <div className="flex-1 overflow-y-auto py-2 px-1 space-y-2 custom-scrollbar">
        {isLoading ? (
          <div className="flex justify-center py-8 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3">
            <div className="w-12 h-12 rounded-full bg-[#1C1C1D] flex items-center justify-center">
              {subTab === "completed" ? (
                <Check className="w-6 h-6 text-[#C7F33C]" />
              ) : (
                <ListTodo className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <p className="text-xs">
              {activeSearchQuery
                ? subTab === "completed"
                  ? "No completed tasks matching your search."
                  : "No to-dos matching your search."
                : subTab === "completed"
                ? "No completed tasks yet."
                : "No to-dos yet. Create the first one below."}
            </p>
          </div>
        ) : (
          filteredNotes.map((note) => {
            const isAuthor = session?.user?.email === note.author.email;
            const isAdmin =
              (session?.user as Record<string, unknown>)?.role === "ADMIN";
            const canManage = isAuthor || isAdmin;
            const isCompleted = !!note.isCompleted;
            const isExpanded = expandedNoteId === note.id;

            return (
              <div
                key={note.id}
                data-todo-card={note.id}
                onClick={() => toggleExpandNote(note.id)}
                className={`px-3 py-2.5 rounded-xl border transition-all cursor-pointer select-none group ${
                  isCompleted
                    ? "bg-[#252728]/70 border-[#383A3C] opacity-75 hover:opacity-100 hover:border-[#4E4F50]"
                    : note.isPinned
                    ? "bg-[#2A2B28] border-amber-400"
                    : "border-[#4E4F50]"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Round Checkbox */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleComplete(note.id, !isCompleted);
                    }}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                      isCompleted
                        ? "bg-[#C7F33C] border-[#C7F33C] text-black hover:bg-[#b8e332]"
                        : "border-slate-400 hover:border-[#C7F33C] hover:bg-[#C7F33C]/10"
                    }`}
                    title={
                      isCompleted
                        ? "Mark as Incomplete (Move to To-Do)"
                        : "Mark as Completed"
                    }
                  >
                    {isCompleted && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>

                  {/* To-Do Content Text: Single row lean (truncate) or multi-line when expanded */}
                  <div
                    className={`flex-1 min-w-0 text-xs transition-colors ${
                      isExpanded
                        ? "whitespace-pre-wrap leading-relaxed py-0.5"
                        : "truncate"
                    } ${
                      isCompleted
                        ? "line-through text-slate-400"
                        : note.isPinned
                        ? "text-slate-100 font-medium"
                        : "text-slate-200 group-hover:text-white"
                    }`}
                  >
                    {renderCommentText(note.content, activeSearchQuery)}
                  </div>

                  {/* Right Actions: Urgent/Priority Flame & Delete Trash */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePriority(note.id, note.isPinned);
                      }}
                      className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                        note.isPinned
                          ? "text-amber-400 bg-amber-400/10 hover:bg-amber-400/20"
                          : "text-slate-400 hover:text-slate-200 hover:bg-white/10"
                      }`}
                      title={
                        note.isPinned
                          ? "Priority task (Click to remove priority)"
                          : "Mark as Priority (Move to top)"
                      }
                    >
                      <Flame className="w-4 h-4" />
                    </button>

                    {canManage && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(note.id);
                        }}
                        className="p-1.5 rounded-full text-slate-400 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
                        title="Delete task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Creator Profile + Name + Created Timestamp */}
                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-slate-400">
                    <div className="flex items-center gap-2 min-w-0">
                      {note.author.image ? (
                        <img
                          src={note.author.image}
                          alt={note.author.name || undefined}
                          className="w-5 h-5 rounded-full bg-[#1C1C1D] object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-[#1C1C1D] flex items-center justify-center text-[9px] font-bold text-slate-300 shrink-0">
                          {note.author.name?.charAt(0) || "?"}
                        </div>
                      )}
                      <span className="text-[11px] font-medium text-slate-300 truncate">
                        {note.author.name || "Unknown"}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                      {format(new Date(note.createdAt), "MMM d, yyyy • HH:mm")}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {dockEl ? createPortal(inputBar, dockEl) : inputBar}
    </div>
  );
}
