"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { Pin, Send, Trash2, Loader2, StickyNote } from "lucide-react";
import { getNotes, createNote, deleteNote, togglePinNote } from "@/lib/actions/notes";
import { OpportunityWithRelations } from "./KanbanCard";
import { useDialog } from "@/providers/DialogProvider";
import { HighlightText } from "@/components/ui/HighlightText";
import useSWR from "swr";
import { pusherClient } from "@/lib/pusher";

type NoteItem = {
  id: string;
  content: string;
  isPinned: boolean;
  createdAt: Date;
  author: { name: string | null; image: string | null; email: string | null };
};

export interface NotesTabProps {
  deal: OpportunityWithRelations;
  searchQuery?: string;
}

export function NotesTab({ deal, searchQuery: externalSearchQuery }: NotesTabProps) {
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
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

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
    const channel = pusherClient.subscribe(`private-pipeline-${session.user.id}`);
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
            return [event.note, ...existing.filter((note) => note.id !== event.note?.id)].sort(
              (a, b) =>
                Number(b.isPinned) - Number(a.isPinned) ||
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          }
          return existing;
        },
        { revalidate: false }
      );
    };
    channel.bind("pipeline-updated", handleNoteUpdate);
    return () => {
      channel.unbind("pipeline-updated", handleNoteUpdate);
    };
  }, [deal.id, mutateNotes, session?.user?.id]);

  const handleCreateNote = async () => {
    if (!newNote.trim() || isSubmitting) return;
    const content = newNote.trim();
    const temporaryId = `temp-note-${Date.now()}`;
    const optimisticNote: NoteItem = {
      id: temporaryId,
      content,
      isPinned: false,
      createdAt: new Date(),
      author: {
        name: session?.user?.name || null,
        image: session?.user?.image || null,
        email: session?.user?.email || null,
      },
    };
    await mutateNotes((current) => [optimisticNote, ...(current || [])], { revalidate: false });
    setNewNote("");
    setIsSubmitting(true);
    try {
      const persistedNote = await createNote(deal.id, content);
      await mutateNotes(
        (current) => [
          persistedNote,
          ...(current || []).filter((note) => note.id !== temporaryId && note.id !== persistedNote.id),
        ],
        { revalidate: false }
      );
      toast({ title: "Note added", type: "success" });
    } catch {
      setNewNote(content);
      await mutateNotes((current) => (current || []).filter((note) => note.id !== temporaryId), {
        revalidate: false,
      });
      toast({ title: "Failed to add note", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const previousNotes = notes;
    await mutateNotes((current) => (current || []).filter((note) => note.id !== id), {
      revalidate: false,
    });
    try {
      await deleteNote(id);
      toast({ title: "Note deleted", type: "success" });
    } catch {
      await mutateNotes(previousNotes, { revalidate: false });
      toast({ title: "Failed to delete", type: "error" });
    }
  };

  const handleTogglePin = async (id: string, isPinned: boolean) => {
    const previousNotes = notes;
    try {
      await mutateNotes(
        (current) =>
          (current || [])
            .map((note) => (note.id === id ? { ...note, isPinned: !isPinned } : note))
            .sort(
              (a, b) =>
                Number(b.isPinned) - Number(a.isPinned) ||
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ),
        { revalidate: false }
      );
      await togglePinNote(id, !isPinned);
    } catch {
      toast({ title: "Failed to pin", type: "error" });
      await mutateNotes(previousNotes, { revalidate: false });
    }
  };

  const filteredNotes = notes.filter(
    (n) =>
      n.content.toLowerCase().includes(activeSearchQuery.toLowerCase()) ||
      n.author.name?.toLowerCase().includes(activeSearchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#252728]">
      {/* Notes List */}
      <div className="flex-1 overflow-y-auto py-2 px-1 space-y-3 custom-scrollbar">
        {isLoading ? (
          <div className="flex justify-center py-8 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3">
            <div className="w-12 h-12 rounded-full bg-[#1C1C1D] flex items-center justify-center">
              <StickyNote className="w-6 h-6" />
            </div>
            <p className="text-xs">
              {activeSearchQuery
                ? "No notes found matching your search."
                : "No notes yet. Create the first one below."}
            </p>
          </div>
        ) : (
          filteredNotes.map((note) => {
            const isAuthor = session?.user?.email === note.author.email;
            const isAdmin = (session?.user as Record<string, unknown>)?.role === "ADMIN";
            const canManage = isAuthor || isAdmin;

            return (
              <div
                key={note.id}
                className={`p-4 rounded-2xl border transition-colors ${
                  note.isPinned
                    ? "bg-[#2A2B28] border-[#C7F33C]/30"
                    : "bg-[#3A3B3C] border-[#4E4F50]"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {note.author.image ? (
                      <img
                        src={note.author.image}
                        alt={note.author.name || undefined}
                        className="w-8 h-8 rounded-full bg-[#1C1C1D] object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#1C1C1D] flex items-center justify-center text-xs font-bold text-slate-300">
                        {note.author.name?.charAt(0) || "?"}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-slate-100">{note.author.name}</p>
                      <p className="text-xs text-slate-400">
                        {format(new Date(note.createdAt), "MMM d, yyyy • HH:mm")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleTogglePin(note.id, note.isPinned)}
                      className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                        note.isPinned
                          ? "text-[#C7F33C] hover:bg-[#C7F33C]/10"
                          : "text-slate-400 hover:text-slate-200 hover:bg-[#4E4F50]"
                      }`}
                      title={note.isPinned ? "Unpin note" : "Pin note"}
                    >
                      <Pin className="w-4 h-4" />
                    </button>

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleDelete(note.id)}
                        className="p-1.5 rounded-full text-slate-400 hover:text-red-400 hover:bg-[#4E4F50] transition-colors cursor-pointer"
                        title="Delete note"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed pt-1">
                  <HighlightText text={note.content} highlight={activeSearchQuery} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Auto-expanding Chat Input (LINE / WhatsApp style) */}
      <div className="pt-3 pb-1 bg-[#252728] border-t border-[#1C1C1D] shrink-0 z-10">
        <div className="flex items-end gap-2 bg-[#3A3B3C] px-3 py-1.5 rounded-lg border border-[#4E4F50] focus-within:border-[#C7F33C] transition-all">
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
                const isMobileDevice = typeof window !== "undefined" &&
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
            placeholder="Write a note..."
            style={{ height: "auto", minHeight: "28px", maxHeight: "120px" }}
            className="flex-1 bg-transparent border-none text-white pl-1 text-[16px] focus:outline-none placeholder:text-slate-400 min-w-0 resize-none overflow-y-auto leading-5 hide-scrollbar py-1"
          />
          <button
            type="button"
            onClick={handleCreateNote}
            disabled={!newNote.trim() || isSubmitting}
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-[#C7F33C] transition-colors disabled:opacity-40 cursor-pointer shrink-0 self-end"
            title="Post note (Enter)"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#C7F33C]" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
