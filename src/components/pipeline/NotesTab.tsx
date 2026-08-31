import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { Search, Pin, Send, Trash2, Loader2, StickyNote } from "lucide-react";
import { getNotes, createNote, deleteNote, togglePinNote } from "@/lib/actions/notes";
import { OpportunityWithRelations } from "./KanbanCard";
import { useDialog } from "@/providers/DialogProvider";

type NoteItem = {
  id: string;
  content: string;
  isPinned: boolean;
  createdAt: Date;
  author: { name: string | null; image: string | null; email: string | null; };
};

export function NotesTab({ deal }: { deal: OpportunityWithRelations }) {
  const { data: session } = useSession();
  const { toast } = useDialog();
  
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchNotes = useCallback(async () => {
    try {
      const data = await getNotes(deal.id);
      setNotes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [deal.id]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleCreateNote = async () => {
    if (!newNote.trim()) return;
    setIsSubmitting(true);
    try {
      await createNote(deal.id, newNote);
      setNewNote("");
      fetchNotes();
      toast({ title: "Note added", type: "success" });
    } catch {
      toast({ title: "Failed to add note", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNote(id);
      setNotes(notes.filter(n => n.id !== id));
      toast({ title: "Note deleted", type: "success" });
    } catch {
      toast({ title: "Failed to delete", type: "error" });
    }
  };

  const handleTogglePin = async (id: string, isPinned: boolean) => {
    try {
      setNotes(notes.map(n => n.id === id ? { ...n, isPinned: !isPinned } : n));
      await togglePinNote(id, !isPinned);
    } catch {
      toast({ title: "Failed to pin", type: "error" });
      fetchNotes(); // revert
    }
  };

  const filteredNotes = notes.filter(n => 
    n.content.toLowerCase().includes(searchQuery.toLowerCase()) || 
    n.author.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#252728]">
      {/* Header & Search */}
      <div className="bg-[#252728] sticky top-0 z-10 shrink-0 flex flex-col gap-4">
        <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <StickyNote className="w-5 h-5 text-[#C7F33C]" />
          Deal Notes
        </h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search notes..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#3A3B3C] hover:bg-[#4E4F50] border border-[#4E4F50] rounded-full pl-9 pr-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#C7F33C] transition-colors placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-2 space-y-4 custom-scrollbar">
        {isLoading ? (
          <div className="flex justify-center py-8 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3">
            <div className="w-12 h-12 rounded-full bg-[#1C1C1D] flex items-center justify-center">
              <StickyNote className="w-6 h-6" />
            </div>
            <p className="text-sm">{searchQuery ? "No notes found matching your search." : "No notes yet. Create the first one below."}</p>
          </div>
        ) : (
          filteredNotes.map(note => {
            const isAuthor = session?.user?.email === note.author.email;
            const isAdmin = (session?.user as Record<string, unknown>)?.role === "ADMIN";
            const canManage = isAuthor || isAdmin;

            return (
              <div key={note.id} className={`p-4 rounded-2xl border transition-colors ${note.isPinned ? 'bg-[#2A2B28] border-[#C7F33C]/30' : 'bg-[#3A3B3C] border-[#4E4F50]'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {note.author.image ? (
                      <img src={note.author.image} alt={note.author.name || undefined} className="w-8 h-8 rounded-full bg-[#1C1C1D] object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#1C1C1D] flex items-center justify-center text-xs font-bold text-slate-300">
                        {note.author.name?.charAt(0) || '?'}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{note.author.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {format(new Date(note.createdAt), 'MMM d, yyyy • HH:mm')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleTogglePin(note.id, note.isPinned)}
                      className={`p-1.5 rounded-full transition-colors ${note.isPinned ? 'text-[#C7F33C] hover:bg-[#C7F33C]/10' : 'text-slate-400 hover:text-slate-200 hover:bg-[#4E4F50]'}`}
                      title={note.isPinned ? "Unpin note" : "Pin note"}
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                    
                    {canManage && (
                      <button 
                        onClick={() => handleDelete(note.id)}
                        className="p-1.5 rounded-full text-slate-400 hover:text-red-400 hover:bg-[#4E4F50] transition-colors"
                        title="Delete note"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed pt-1">
                  {note.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div className="bg-[#252728] border-t border-[#1C1C1D] shrink-0 z-10 flex flex-col gap-2 relative">
        <div className="flex gap-3 bg-[#3A3B3C] p-2 rounded-2xl border border-[#4E4F50] transition-">
          <div className="w-10 h-10 rounded-full bg-[#4E4F50] shrink-0 overflow-hidden mt-1 ml-1">
            <img src={session?.user?.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${session?.user?.name || session?.user?.email || "User"}`} alt="Avatar" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 flex flex-col">
            <textarea 
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Write a note..."
              className="w-full bg-transparent border-none rounded-xl text-white px-2 py-2 text-sm min-h-[40px] focus:outline-none resize-none custom-scrollbar"
              rows={newNote.split('\n').length > 1 ? Math.min(newNote.split('\n').length, 12) : 1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCreateNote();
                }
              }}
            />
            <div className="flex justify-end mt-2 pr-1 pb-1">
              <button 
                onClick={handleCreateNote}
                disabled={!newNote.trim() || isSubmitting}
                className="flex items-center gap-2 bg-[#C7F33C] text-black px-4 py-1.5 rounded-full text-xs font-bold hover:bg-[#b0d635] transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                {isSubmitting ? "Posting..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
