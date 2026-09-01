"use client";

import { X, MoreHorizontal, Activity, MessageSquare, Trash2, Search, Users, BellRing, Send, Paperclip, Download, Loader2 } from "lucide-react";
import { OpportunityWithRelations } from "./KanbanCard";
import imageCompression from 'browser-image-compression';
import { useDropzone } from 'react-dropzone';

import { addActivityLog, removeTeamMember, addTeamMember, editActivityLog, deleteActivityLog, addSystemLog, getOpportunityActivityLogs, updateDueDateWithLog, updateOpportunity, deleteOpportunity } from "@/lib/actions/opportunity";
import { getAllUsers } from "@/lib/actions/users";
import { requestDealTransfer } from "@/lib/actions/notification";
import { UserSearchDropdown } from "../ui/UserSearchDropdown";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSWRConfig, mutate } from "swr";
import useSWRInfinite from "swr/infinite";
import { useSession } from "next-auth/react";
import { User } from "@prisma/client";
import { usePermissions } from "@/providers/PermissionProvider";
import { IconMap } from "@/lib/menu-registry";
import { useDialog } from "@/providers/DialogProvider";
import { CustomerTab } from "./CustomerTab";
import { NotesTab } from "./NotesTab";
import { SharedMediaTab } from "./SharedMediaTab";
import { ChatAttachmentButton } from "./ChatAttachmentButton";
import { HighlightText } from "@/components/ui/HighlightText";
import { pusherClient } from "@/lib/pusher";

const formatDateTime = (date: Date | string) => {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
};

const renderCommentText = (text: string, highlight: string = '') => {
  if (!text) return null;
  const parts = text.split(/(@\S+)/g);
  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      return (
        <span key={index} className="font-bold text-black bg-[#C7F33C] px-1.5 py-1 rounded-md text-xs mx-0.5 ">
          {part}
        </span>
      );
    }
    return <HighlightText key={index} text={part} highlight={highlight} />;
  });
};

function ImageGrid({ images, onImageClick }: { images: {url: string, filename: string, type: string}[], onImageClick?: (url: string) => void }) {
  if (images.length === 0) return null;

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = "https://placehold.co/600x400/252728/4E4F50?text=Image+Unavailable";
  };

  if (images.length === 1) {
    return (
      <div className="mt-2 rounded-xl overflow-hidden border border-[#4E4F50] bg-[#1C1C1D]">
        <img 
          src={images[0].url} 
          alt={images[0].filename} 
          className="w-full h-auto max-h-80 object-contain cursor-pointer hover:opacity-90 transition-opacity" 
          onClick={() => onImageClick?.(images[0].url)}
          onError={handleImageError}
        />
      </div>
    );
  }

  if (images.length === 2) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl overflow-hidden border border-[#4E4F50] bg-[#1C1C1D]">
        {images.map((img, idx) => (
          <img 
            key={idx} src={img.url} alt={img.filename}
            className="w-full h-40 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onImageClick?.(img.url)}
            onError={handleImageError}
          />
        ))}
      </div>
    );
  }

  if (images.length === 3) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl overflow-hidden border border-[#4E4F50] bg-[#1C1C1D]">
        <img 
          src={images[0].url} 
          alt=""
          className="col-span-2 w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => onImageClick?.(images[0].url)}
          onError={handleImageError}
        />
        <img 
          src={images[1].url} 
          alt=""
          className="w-full h-32 object-cover cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => onImageClick?.(images[1].url)}
          onError={handleImageError}
        />
        <img 
          src={images[2].url} 
          alt=""
          className="w-full h-32 object-cover cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => onImageClick?.(images[2].url)}
          onError={handleImageError}
        />
      </div>
    );
  }

  // 4 or more
  return (
    <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl overflow-hidden border border-[#4E4F50] bg-[#1C1C1D]">
      {images.slice(0, 4).map((img, idx) => {
        if (idx === 3 && images.length > 4) {
          return (
            <div key={idx} className="relative cursor-pointer group" onClick={() => onImageClick?.(img.url)}>
              <img src={img.url} alt="" className="w-full h-32 object-cover" onError={handleImageError} />
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center transition-colors group-hover:bg-black/70">
                <span className="text-white text-2xl font-bold">+{images.length - 4}</span>
              </div>
            </div>
          )
        }
        return (
          <img 
            key={idx} src={img.url} alt={img.filename}
            className="w-full h-32 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onImageClick?.(img.url)}
            onError={handleImageError}
          />
        )
      })}
    </div>
  );
}

import { ActivityLog } from "@prisma/client";

type ActivityLogWithRelations = ActivityLog & {
  user: User;
  replies?: ActivityLogWithRelations[];
};

type ActivityLogResponse = { data: ActivityLogWithRelations[], nextCursor?: string };

function ActivityComment({ log, dealId, currentUser, refresh, mutateLogs, onReplyClick, onImageClick, searchQuery = '' }: { log: ActivityLogWithRelations, dealId: string, currentUser: { id: string; name?: string | null; image?: string | null; email?: string | null; }, refresh: () => void, mutateLogs?: (data: (currentPages?: ActivityLogResponse[]) => ActivityLogResponse[] | undefined, opts?: { revalidate: boolean }) => void, onReplyClick?: (username: string) => void, onImageClick?: (url: string) => void, searchQuery?: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(log.content);
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [replyingToUsername, setReplyingToUsername] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  
  // Close menu if click outside could be added, but a simple hover or blur works for now.
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isAdmin = (currentUser as Record<string, unknown>).role === "ADMIN";
  const isDueDateLog = log.content.startsWith('[DUE DATE:');
  const canEdit = isAdmin || (log.userId === currentUser.id && !isDueDateLog);

  let dueDateMatch: RegExpMatchArray | null = null;
  if (isDueDateLog) {
    dueDateMatch = log.content.match(/\[DUE DATE: (.*?)\]\nReason: ([\s\S]*)/);
  }

  const handleEdit = async () => {
    if (!editContent.trim()) return;
    
    // Optimistic Update
    const tempUpdatedLog = { ...log, content: editContent, isEdited: true };
    
    if (mutateLogs) {
      mutateLogs(
        (currentPages?: ActivityLogResponse[]) => {
          if (!currentPages) return currentPages;
          return currentPages.map((page) => ({
            ...page,
            data: page.data.map((l) => l.id === log.id ? tempUpdatedLog : {
              ...l,
              replies: l.replies?.map(r => r.id === log.id ? tempUpdatedLog as unknown as ActivityLogWithRelations : r)
            })
          }));
        },
        { revalidate: false }
      );
    }
    
    mutate(
      (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
      (currentData: OpportunityWithRelations[] | undefined) => {
        if (!currentData) return currentData;
        return currentData.map((opp: OpportunityWithRelations) => {
          if (opp.id === dealId) {
            const updatedLogs = opp.activityLogs.map(l => l.id === log.id ? tempUpdatedLog : l);
            return { ...opp, activityLogs: updatedLogs };
          }
          return opp;
        });
      },
      { revalidate: false }
    );

    setIsEditing(false);
    setShowMenu(false);
    await editActivityLog(log.id, editContent);
  };

  const handleReply = async () => {
    if (!replyContent.trim() && !replyingToUsername) return;
    const finalContent = replyingToUsername ? `@${replyingToUsername} ${replyContent}` : replyContent;
    const fakeLogId = `temp-${Date.now()}`;
    const tempReply = {
      id: fakeLogId,
      content: finalContent,
      type: "COMMENT",
      opportunityId: dealId,
      userId: currentUser.id,
      parentId: log.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { ...currentUser, role: "GENERAL" } as unknown as User,
      replies: []
    } as unknown as ActivityLogWithRelations;

    if (mutateLogs) {
      mutateLogs(
        (currentPages?: ActivityLogResponse[]) => {
          if (!currentPages) return currentPages;
          return currentPages.map((page) => ({
            ...page,
            data: page.data.map(l => 
              l.id === log.id ? { ...l, replies: [...(l.replies || []), tempReply] } : l
            )
          }));
        },
        { revalidate: false }
      );
    }
    
    setIsReplying(false);
    setReplyContent("");
    setReplyingToUsername(null);
    await addActivityLog(dealId, finalContent, log.id);
    refresh();
  };

  const handleDelete = async () => {
    // Optimistic Update for Activity Panel only
    if (mutateLogs) {
      mutateLogs(
        (currentPages?: ActivityLogResponse[]) => {
          if (!currentPages) return currentPages;
          return currentPages.map((page) => ({
            ...page,
            data: page.data.map(l => ({
              ...l,
              replies: l.replies?.filter(r => r.id !== log.id)
            })).filter((l) => l.id !== log.id)
          }));
        },
        { revalidate: false }
      );
    }
    
    // Note: We deliberately do NOT optimistic update pipeline-deals here.
    // Doing so would empty the KanbanCard activity log, causing a "No activity yet" flicker 
    // until the Pusher event delivers the nextLatestLog a few ms later.
    
    await deleteActivityLog(log.id);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-[#4E4F50] shrink-0 overflow-hidden">
          <img src={log.user?.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${log.user?.name || log.user?.email || log.userId}`} alt="Avatar" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-col flex-1 group/comment">
          {/* Main Comment Bubble */}
          <div className="flex items-center gap-2">
            <div className="bg-[#3A3B3C] rounded-2xl p-3 inline-block self-start relative w-full max-w-[85%] sm:max-w-md">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-slate-100">{log.user?.name || 'Unknown User'}</span>
                {dueDateMatch && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${dueDateMatch[1] === 'Removed' ? 'text-slate-300 bg-slate-600 border-slate-500' : 'text-pink-400 bg-pink-900/30 border-pink-900/50'}`}>
                    {dueDateMatch[1] === 'Removed' ? 'Due Date Removed' : `Due: ${dueDateMatch[1]}`}
                  </span>
                )}
              </div>
              
              {isEditing ? (
                <div className="flex flex-col gap-2 min-w-[250px]">
                  <textarea 
                    value={editContent} 
                    onChange={e => setEditContent(e.target.value)} 
                    className="w-full bg-[#252728] border border-[#4E4F50] text-slate-100 rounded-lg p-2 text-sm min-h-[60px]"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setIsEditing(false)} className="text-xs text-slate-300 hover:underline">Cancel</button>
                    <button onClick={handleEdit} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700">Save</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col w-full">
                  {(() => {
                    const displayContent = dueDateMatch ? dueDateMatch[2] : log.content;
                    const images: {url: string, filename: string, type: string}[] = [];
                    const files: {url: string, filename: string, type: string}[] = [];
                    
                    const cleanText = displayContent.replace(/\[ATTACHMENT:([^|]+)\|([^|]*)\|([^\]]+)\]/g, (match, url, filename, type) => {
                      if (type.startsWith('image/') || type.startsWith('video/')) {
                        images.push({ url, filename, type });
                      } else {
                        files.push({ url, filename, type });
                      }
                      return '';
                    }).trim();

                    return (
                      <>
                        {cleanText && (
                          <div className="text-sm text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                            {renderCommentText(cleanText, searchQuery)}
                          </div>
                        )}
                        <ImageGrid images={images} onImageClick={onImageClick} />
                        {files.length > 0 && (
                          <div className="mt-2 flex flex-col gap-1.5 w-full">
                            {files.map((file, idx) => (
                              <a key={idx} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-[#252728] border border-[#4E4F50] hover:border-slate-400 transition-colors w-full group">
                                <div className="w-10 h-10 rounded-lg bg-[#3A3B3C] flex items-center justify-center shrink-0">
                                  <Paperclip className="w-5 h-5 text-slate-400" />
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                  <span className="text-sm font-semibold text-slate-200 truncate">{file.filename || "Attached file"}</span>
                                  <span className="text-[10px] text-slate-500 uppercase">File</span>
                                </div>
                                <Download className="w-4 h-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-4 mt-1 pl-2 text-xs font-semibold text-slate-500 relative">
            <span className="font-normal text-slate-500">{formatDateTime(log.createdAt)}{log.isEdited && " (edited)"}</span>
            <button 
              onClick={() => {
                if (log.parentId && onReplyClick) {
                  onReplyClick(log.user?.name?.replace(/\s+/g, '') || 'Unknown');
                } else {
                  setIsReplying(true);
                }
              }} 
              className="hover:underline cursor-pointer"
            >
              Reply
            </button>

            {/* Edit / Delete Menu (3 Dots) */}
            {canEdit && (
              <div className="relative opacity-0 group-hover/comment:opacity-100 transition-opacity flex items-center" ref={menuRef}>
                <button 
                  onClick={() => setShowMenu(!showMenu)} 
                  className="p-1 hover:bg-[#4E4F50] rounded-full transition-colors flex items-center justify-center -ml-2"
                >
                  <MoreHorizontal className="w-3 h-3 text-slate-500" />
                </button>
                
                {showMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-[#3A3B3C] border border-[#4E4F50] rounded-lg shadow-sm flex flex-col py-1 w-24 z-10">
                    <button 
                      onClick={() => { setIsEditing(true); setShowMenu(false); }} 
                      className="text-left px-3 py-1.5 hover:bg-[#4E4F50] text-slate-300 text-xs font-normal"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={handleDelete} 
                      className="text-left px-3 py-1.5 hover:bg-[#4E4F50] text-red-400 text-xs font-normal"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Nested Replies */}
          {log.replies && log.replies.length > 0 && (
            <div className="flex flex-col gap-4 mt-4 border-l-2 border-[#1C1C1D] pl-4">
              {log.replies.map((reply) => (
                <ActivityComment 
                  key={reply.id} 
                  log={reply} 
                  dealId={dealId} 
                  currentUser={currentUser} 
                  refresh={refresh}
                  mutateLogs={mutateLogs}
                  onReplyClick={(username) => {
                    setIsReplying(true);
                    setReplyingToUsername(username);
                  }} 
                  onImageClick={onImageClick}
                />
              ))}
            </div>
          )}

          {/* Reply Form */}
          {isReplying && (
            <div className="flex gap-3 mt-4 border-l-2 border-[#1C1C1D] pl-4">
               <div className="w-8 h-8 rounded-full bg-[#4E4F50] shrink-0 overflow-hidden">
                <img src={currentUser?.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${currentUser?.name || currentUser?.email || currentUser?.id}`} alt="Avatar" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <div className="w-full bg-[#3A3B3C] border border-[#4E4F50] rounded-xl p-2 min-h-[60px] focus-within:border-[#C7F33C] flex flex-col gap-1 transition-colors">
                  {replyingToUsername && (
                    <div className="flex items-center gap-1 mb-1">
                      <span className="font-bold text-black bg-[#C7F33C] px-1.5 py-1 rounded-md text-xs  flex items-center gap-1">
                        @{replyingToUsername}
                        <button onClick={() => setReplyingToUsername(null)} className="hover:text-slate-600 ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                  )}
                  <textarea 
                    value={replyContent}
                    onChange={e => setReplyContent(e.target.value)}
                    placeholder="Write a reply..." 
                    autoFocus
                    className="w-full bg-transparent text-sm text-slate-100 focus:outline-none resize-none"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setIsReplying(false); setReplyingToUsername(null); }} className="text-xs font-semibold text-slate-500 hover:underline">Cancel</button>
                  <button onClick={handleReply} className="text-xs font-bold bg-[#C7F33C] text-black px-3 py-1.5 rounded-full hover:bg-[#b0d635] "><Send className="w-3 h-3 inline mr-1"/> Reply</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type TabType = 'activity' | 'system' | 'collaborate' | 'information' | 'notes' | 'sharedMedia';

interface EditDealPanelProps {
  deal: OpportunityWithRelations;
  initialTab?: TabType;
  isOpen: boolean;
  onClose: () => void;
}

export function EditDealPanel({ deal, initialTab = 'activity', isOpen, onClose }: EditDealPanelProps) {
  const { mutate } = useSWRConfig();
  const [newLog, setNewLog] = useState("");
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const { visibleRightMenus } = usePermissions();
  const rightMenus = visibleRightMenus("pipeline");
  
  // Try to find the initial tab matching a visible right menu, fallback to the first one available
  const allowedInitialTab = rightMenus.find(m => m.key.endsWith(`.${initialTab}`)) ? initialTab : (rightMenus[0]?.key.split('.').pop() as TabType || 'activity');
  const [activeTab, setActiveTab] = useState<TabType>(allowedInitialTab === ('duedate' as TabType) ? 'activity' : allowedInitialTab);
  
  const { toast, confirm } = useDialog();
  const [showCalendar, setShowCalendar] = useState(false);
  const [pendingDueDate, setPendingDueDate] = useState<Date | 'REMOVE' | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [selectedPopupDate, setSelectedPopupDate] = useState<Date | null>(deal.dueDate ? new Date(deal.dueDate) : null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const calendarRef = useRef<HTMLDivElement>(null);
  
  // Lightbox Preview State
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Topic editing state
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [topic, setTopic] = useState(deal.topic || 'Untitled Deal');
  const [isSavingTopic, setIsSavingTopic] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setShowCalendar(false);
      }
    };
    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCalendar]);

  // Auto-focus the activity textarea when the panel opens to the activity tab
  useEffect(() => {
    if (isOpen && activeTab === 'activity') {
      // Small timeout to ensure the textarea is rendered
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeTab]);

  // Users state for ownership transfer
  const [users, setUsers] = useState<Awaited<ReturnType<typeof getAllUsers>>>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const { data: session } = useSession();
  const isOwner = session?.user?.email === deal.owner.email;
  const isTeamMember = deal.teamMembers?.some(tm => tm.email === session?.user?.email);
  const canInvite = isOwner || isTeamMember;
  const canEditDueDate = isOwner || (session?.user as Record<string, unknown>)?.role === "ADMIN";

  useEffect(() => {
    const t = setTimeout(() => setActiveTab(initialTab), 0);
    return () => clearTimeout(t);
  }, [initialTab, isOpen]);

  // Optimistic UI State
  type TeamMember = { id: string; name: string | null; email: string | null; image: string | null; role: string; department?: { name: string } | null; [key: string]: unknown };
  const [localTeamMembers, setLocalTeamMembers] = useState<TeamMember[]>(deal.teamMembers || []);
  const getKey = (pageIndex: number, previousPageData: { data: ActivityLogWithRelations[], nextCursor?: string } | null) => {
    if (!isOpen) return null;
    if (previousPageData && !previousPageData.nextCursor) return null; // reached the end
    return ['activity-logs', deal.id, previousPageData?.nextCursor ?? ''];
  };

  const {
    data: rawLocalActivityPages,
    mutate: loadActivityLogs,
    size,
    setSize,
    isValidating: isLoadingLogs
  } = useSWRInfinite<{ data: ActivityLogWithRelations[], nextCursor?: string }>(
    getKey,
    async ([, id, cursor]: [string, string, string]) => {
      const res = await getOpportunityActivityLogs(id, 10, cursor || undefined);
      return res as { data: ActivityLogWithRelations[], nextCursor?: string };
    }
  );

  const allLogs = rawLocalActivityPages ? rawLocalActivityPages.flatMap(page => page.data) : [];

  useEffect(() => {
    if (!isOpen) return;
    if (!session?.user?.id) return;
    const channel = pusherClient.subscribe(`private-pipeline-${session.user.id}`);
    
    const handleUpdate = (data?: { dealId?: string; action?: string }) => {
      if (data?.dealId === deal.id && data?.action?.startsWith('ACTIVITY_')) {
        // Debounce or directly reload activity logs for this deal when another user modifies them
        loadActivityLogs();
      }
    };
    
    channel.bind('pipeline-updated', handleUpdate);
    
    return () => {
      channel.unbind('pipeline-updated', handleUpdate);
      // KanbanBoard uses the same channel. Unbinding this handler is sufficient;
      // unsubscribing here would silently stop board updates after closing panel.
    };
  }, [deal.id, isOpen, loadActivityLogs, session?.user?.id]);
  const uniqueLogsMap = new Map();
  allLogs.forEach(log => {
    if (!uniqueLogsMap.has(log.id)) {
      uniqueLogsMap.set(log.id, log);
    }
  });
  const localActivityLogs = Array.from(uniqueLogsMap.values()) as ActivityLogWithRelations[];
  
  const hasMoreLogs = rawLocalActivityPages ? !!rawLocalActivityPages[rawLocalActivityPages.length - 1]?.nextCursor : false;
  const isLoadingMore = isLoadingLogs && size > 0 && rawLocalActivityPages && typeof rawLocalActivityPages[size - 1] === "undefined";

  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastLogElementRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    if (isLoadingMore) return; // Disconnect before returning early
    
    if (node) {
      observerRef.current = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && hasMoreLogs) {
          setSize(prev => prev + 1);
        }
      });
      observerRef.current.observe(node);
    }
  }, [isLoadingMore, hasMoreLogs, setSize]);

  useEffect(() => {
    const t = setTimeout(() => setLocalTeamMembers(deal.teamMembers || []), 0);
    return () => clearTimeout(t);
  }, [deal.teamMembers]);

  useEffect(() => {
    if (isOpen && activeTab === 'collaborate' && users.length === 0) {
      getAllUsers().then(setUsers);
    }
  }, [isOpen, activeTab, users.length]);

  const handleAddLog = async () => {
    if (!newLog.trim() && pendingAttachments.length === 0 && !pendingDueDate) return;
    
    const currentNewLog = newLog;
    const currentAttachments = [...pendingAttachments];
    const currentDueDate = pendingDueDate;
    
    // 1. Create Fake Optimistic Log
    const fakeId = `temp-${Date.now()}`;
    const optimisticLog = {
      id: fakeId,
      content: currentNewLog.trim() || (currentDueDate ? 'Updated due date' : (currentAttachments.length ? 'Uploaded attachment' : 'Updated deal')),
      type: "COMMENT",
      createdAt: new Date(),
      opportunityId: deal.id,
      userId: session?.user?.id || '',
      user: {
        id: session?.user?.id || '',
        name: session?.user?.name || '',
        image: session?.user?.image || '',
        email: session?.user?.email || '',
        role: "GENERAL"
      },
      replies: []
    } as unknown as ActivityLogWithRelations;

    // 2. Inject into SWR Cache instantly (0ms delay)
    loadActivityLogs(
      (currentPages) => {
        if (!currentPages) return currentPages;
        const newPages = [...currentPages];
        if (newPages[0]) {
          newPages[0] = {
            ...newPages[0],
            data: [optimisticLog, ...newPages[0].data]
          };
        }
        return newPages;
      },
      { revalidate: false }
    );
    
    mutate(
      (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
      (currentData: OpportunityWithRelations[] | undefined) => {
        if (!currentData) return currentData;
        return currentData.map(opp => {
          if (opp.id === deal.id) {
            return { ...opp, activityLogs: [optimisticLog] };
          }
          return opp;
        });
      },
      { revalidate: false }
    );

    // 3. Clear UI instantly for snappy feel
    setNewLog("");
    setPendingDueDate(null);
    setPendingAttachments([]);
    setShowCalendar(false);

    // 4. Perform heavy lifting in background
    setIsSubmittingLog(true);
    try {
      let attachmentText = "";
      
      // Upload pending attachments
      if (currentAttachments.length > 0) {
        for (const file of currentAttachments) {
          const isImage = file.type.startsWith('image/');
          let fileToUpload = file;
          
          if (isImage) {
            fileToUpload = await imageCompression(file, {
              maxSizeMB: 1,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
            });
          }

          const fileBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(fileToUpload);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
          });

          const response = await fetch('/api/upload/opportunity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              opportunityId: deal.id,
              fileBase64,
              fileName: file.name,
              fileType: file.type,
              size: fileToUpload.size,
              isRaw: !isImage
            })
          });
          
          const data = await response.json();
          if (data.success && data.attachment?.cloudinaryUrl) {
            attachmentText += `\n[ATTACHMENT:${data.attachment.cloudinaryUrl}|${file.name}|${file.type}]`;
          }
        }
      }

      const finalLog = (currentNewLog.trim() + attachmentText).trim() || 'Updated deal';

      if (currentDueDate === 'REMOVE') {
        await updateDueDateWithLog(deal.id, null, finalLog);
      } else if (currentDueDate instanceof Date) {
        await updateDueDateWithLog(deal.id, currentDueDate, finalLog);
      } else {
        await addActivityLog(deal.id, finalLog);
      }
      
      // 5. Revalidate with real data from server
      loadActivityLogs();
    } catch (e) {
      // Revert if error
      setNewLog(currentNewLog);
      setPendingDueDate(currentDueDate);
      setPendingAttachments(currentAttachments);
      loadActivityLogs(); // refresh to remove fake log
      mutate(
        (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
        (currentData: OpportunityWithRelations[] | undefined) => currentData?.map(opp =>
          opp.id === deal.id ? { ...opp, activityLogs: deal.activityLogs || [] } : opp
        ),
        { revalidate: false }
      );
      if (e instanceof Error) {
        toast({ title: "Error", description: "Failed to add log: " + e.message, type: "error" });
      }
    } finally {
      setIsSubmittingLog(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const validFiles = acceptedFiles.filter(file => {
      if (file.size > 4.5 * 1024 * 1024 && !file.type.startsWith('image/')) {
        toast({ title: "File too large", description: `"${file.name}" exceeds 4.5MB limit.`, type: "warning" });
        return false;
      }
      return true;
    });
    setPendingAttachments(prev => [...prev, ...validFiles]);
  }, [toast, setPendingAttachments]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    noClick: true,
    noKeyboard: true
  });

  const handleDeleteSystemLog = async (logId: string) => {
    if (!session?.user?.id) return;
    try {
      await deleteActivityLog(logId);
      loadActivityLogs();
      // router.refresh(); removed for Optimistic UI
    } catch (e) {
      if (e instanceof Error) toast({ title: "Error", description: "Failed to delete log: " + e.message, type: "error" });
    }
  };

  const handleTransfer = async (newOwnerId: string) => {
    if (deal.ownerId === newOwnerId || !isOwner) return;
    setIsTransferring(true);
    try {
      await requestDealTransfer(deal.id, newOwnerId);
      
      const newOwner = users.find(u => u.id === newOwnerId);
      if (session?.user?.id && newOwner) {
        await addSystemLog(deal.id, `Transferred ownership to ${newOwner.name}`);
      }
      toast({ title: "Success", description: "Transfer request sent successfully", type: "success" });
      // router.refresh(); removed for Optimistic UI
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to transfer ownership", type: "error" });
    } finally {
      setIsTransferring(false);
    }
  };



  const handleAddMember = async (userId: string) => {
    const originalTeamMembers = deal.teamMembers || [];
    // 1. Optimistic Update (Local Panel State)
    const userToAdd = users.find(u => u.id === userId);
    if (userToAdd) {
      setLocalTeamMembers(prev => prev.some(u => u.id === userToAdd.id) ? prev : [...prev, userToAdd]);

      // 2. Global Optimistic Update (Kanban Card)
      mutate(
        (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
        (currentData: OpportunityWithRelations[] | undefined) => {
          if (!currentData) return currentData;
          return currentData.map(opp => {
            if (opp.id === deal.id) {
              const isExisting = opp.teamMembers.some(u => u.id === userToAdd.id);
              if (!isExisting) {
                return { ...opp, teamMembers: [...opp.teamMembers, userToAdd as unknown as User] };
              }
            }
            return opp;
          });
        },
        { revalidate: false } // Prevent immediate refetch before action finishes
      );
    }

    try {
      await addTeamMember(deal.id, userId);
      if (session?.user?.id && userToAdd) {
        void addSystemLog(deal.id, `Invited ${userToAdd.name} to the team`).catch(console.error);
      }
    } catch (e) {
      setLocalTeamMembers(originalTeamMembers);
      mutate(
        (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
        (currentData: OpportunityWithRelations[] | undefined) => currentData?.map(opp =>
          opp.id === deal.id ? { ...opp, teamMembers: originalTeamMembers } : opp
        ),
        { revalidate: false }
      );
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
    }
  };

  const handleRemoveMember = async (userId: string) => {
    const originalTeamMembers = deal.teamMembers || [];
    const userToRemove = localTeamMembers.find(u => u.id === userId) || deal.teamMembers.find(u => u.id === userId);

    // 1. Optimistic Update (Local Panel State)
    setLocalTeamMembers(prev => prev.filter(u => u.id !== userId));

    // 2. Global Optimistic Update (Kanban Card)
    mutate(
      (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
      (currentData: OpportunityWithRelations[] | undefined) => {
        if (!currentData) return currentData;
        return currentData.map(opp => {
          if (opp.id === deal.id) {
            return { ...opp, teamMembers: opp.teamMembers.filter(u => u.id !== userId) };
          }
          return opp;
        });
      },
      { revalidate: false } // Prevent immediate refetch before action finishes
    );

    try {
      await removeTeamMember(deal.id, userId);
      if (session?.user?.id && userToRemove) {
        void addSystemLog(deal.id, `Removed ${userToRemove.name} from the team`).catch(console.error);
      }
    } catch (e) {
      setLocalTeamMembers(originalTeamMembers);
      mutate(
        (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
        (currentData: OpportunityWithRelations[] | undefined) => currentData?.map(opp =>
          opp.id === deal.id ? { ...opp, teamMembers: originalTeamMembers } : opp
        ),
        { revalidate: false }
      );
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
    }
  };

  const [mounted, setMounted] = useState(false);
  
  const [showTransferDropdown, setShowTransferDropdown] = useState(false);
  const [showInviteDropdown, setShowInviteDropdown] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timeout);
  }, []);

  const [internalIsOpen, setInternalIsOpen] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => setInternalIsOpen(true));
      });
      return () => cancelAnimationFrame(t);
    } else {
      const t = setTimeout(() => setInternalIsOpen(false), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen && !mounted) return null;

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300 ${internalIsOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`} 
        onClick={onClose}
      />
      
      <div className={`fixed inset-y-4 right-4 z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] origin-right ${internalIsOpen ? "opacity-100 translate-x-0 scale-100" : "opacity-0 translate-x-8 scale-[0.97] pointer-events-none"}`}>
        <div className="flex shadow-2xl h-full rounded-2xl overflow-hidden border border-[#3A3B3C]">
          {/* Tab Sidebar */}
          <div className="w-16 bg-[#252728] border-r border-[#1C1C1D] flex flex-col items-center py-3 gap-3 z-10">
          {rightMenus.map(menu => {
            const tabId = menu.key.split('.').pop() as TabType;
            const Icon = menu.iconName ? IconMap[menu.iconName] : MessageSquare;
            return (
              <button
                key={menu.key}
                onClick={() => setActiveTab(tabId)}
                title={menu.label}
                className={`
                  flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200
                  ${activeTab === tabId || (activeTab === 'system' && tabId === 'activity')
                    ? "bg-[#3A3B3C] text-white " 
                    : "text-slate-400 hover:bg-[#C7F33C] hover:text-[#111111]"}
                `}
              >
                <Icon className="h-5 w-5" strokeWidth={activeTab === tabId || (activeTab === 'system' && tabId === 'activity') ? 2.5 : 2} />
              </button>
            )
          })}
        </div>

        {/* Main Panel Content */}
        <div className="w-[600px] max-w-[90vw] bg-[#252728] flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-[#1C1C1D] shrink-0">
            <div className="flex flex-col flex-1 pr-4">
              {isEditingTopic ? (
                <div className="relative">
                <input
                  autoFocus
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onBlur={async () => {
                    if (topic.trim() !== deal.topic) {
                      setIsSavingTopic(true);
                      try {
                        const newTopic = topic.trim();
                        await updateOpportunity(deal.id, { topic: newTopic });
                        await addSystemLog(deal.id, `Changed topic from "${deal.topic}" to "${newTopic}".`);
                        toast({ title: 'Success', description: 'Topic updated successfully', type: 'success' });
                        // router.refresh(); removed for Optimistic UI
                      } catch {
                        toast({ title: 'Error', description: 'Failed to update topic', type: 'error' });
                        setTopic(deal.topic || 'Untitled Deal');
                      } finally {
                        setIsSavingTopic(false);
                      }
                    }
                    setIsEditingTopic(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') {
                      setTopic(deal.topic || 'Untitled Deal');
                      setIsEditingTopic(false);
                    }
                  }}
                  disabled={isSavingTopic}
                  className="w-full bg-[#1C1C1D] border border-[#4E4F50] rounded-lg px-3 py-1 text-xl font-bold text-slate-100 focus:outline-none focus:border-[#C7F33C]"
                />
              </div>
            ) : (
              <h2 
                className={`text-xl font-bold text-slate-100 line-clamp-1 ${canEditDueDate ? 'cursor-text hover:text-white' : ''}`}
                onClick={() => canEditDueDate && setIsEditingTopic(true)}
                title={canEditDueDate ? "Click to edit title" : undefined}
              >
                {topic}
              </h2>
            )}
            
            <div className="mt-2 flex items-center gap-2">
              <select
                value={deal.type}
                onChange={async (e) => {
                  const newType = e.target.value as typeof deal.type;
                  if (newType !== deal.type) {
                    try {
                      await updateOpportunity(deal.id, { type: newType });
                      const oldLabel = deal.type === 'INTERNAL_TASK' ? 'Internal Task' : (deal.type === 'PARTNERSHIP' ? 'Partnership' : 'Sales Deal');
                      const newLabel = newType === 'INTERNAL_TASK' ? 'Internal Task' : (newType === 'PARTNERSHIP' ? 'Partnership' : 'Sales Deal');
                      await addSystemLog(deal.id, `Changed opportunity type from ${oldLabel} to ${newLabel}.`);
                      toast({ title: 'Success', description: 'Type updated', type: 'success' });
                      // router.refresh(); removed for Optimistic UI
                    } catch {
                      toast({ title: 'Error', description: 'Failed to update type', type: 'error' });
                    }
                  }
                }}
                disabled={!canEditDueDate} // Using canEditDueDate as it checks for isOwner or isAdmin
                className={`text-xs font-semibold px-2 py-1 rounded-md border ${
                  deal.type === 'SALES_DEAL' ? 'bg-[#C7F33C]/20 text-[#C7F33C] border-[#C7F33C]/30' :
                  deal.type === 'INTERNAL_TASK' ? 'bg-slate-700 text-slate-300 border-slate-600' :
                  'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                } ${canEditDueDate ? 'cursor-pointer hover:opacity-80' : 'cursor-default appearance-none'} focus:outline-none`}
              >
                <option value="SALES_DEAL">Sales Deal</option>
                <option value="INTERNAL_TASK">Internal Task</option>
                <option value="PARTNERSHIP">Partnership</option>
              </select>
            </div>
          </div>
            <div className="flex items-center gap-2 shrink-0">
              {deal.dueDate && (
                <div className="text-[11px] font-bold text-[#111111] bg-[#C7F33C] px-3 py-1 rounded-full whitespace-nowrap mr-2">
                  DUE: {new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(deal.dueDate))}
                </div>
              )}
              {((session?.user as Record<string, unknown>)?.role === "ADMIN") && (
                <button
                  onClick={async () => {
                    const isConfirmed = await confirm({
                      title: "Delete Deal",
                      description: "Are you sure you want to permanently delete this deal? This action cannot be undone.",
                      confirmText: "Delete",
                      cancelText: "Cancel",
                      variant: "danger"
                    });
                    if (isConfirmed) {
                      try {
                        await deleteOpportunity(deal.id);
                        toast({ title: 'Deleted', description: 'Opportunity deleted permanently', type: 'success' });
                        onClose();
                        // router.refresh(); removed for Optimistic UI
                      } catch {
                        toast({ title: 'Error', description: 'Failed to delete opportunity', type: 'error' });
                      }
                    }
                  }}
                  className="p-2 hover:bg-rose-500/20 rounded-full transition-colors text-slate-400 hover:text-rose-500"
                  title="Permanently Delete (Admin Only)"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <button 
                onClick={onClose}
                className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sticky Tabs for Activity/System */}
          {(activeTab === 'activity' || activeTab === 'system') && (
            <div className="px-6 pt-6 pb-2 bg-[#252728] shrink-0 z-10">
              <div className="flex items-center justify-between w-full mb-2">
                <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#C7F33C]" />
                  Activity Log
                </h3>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setActiveTab('activity')}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 transition-colors ${
                      activeTab === 'activity' 
                        ? 'bg-[#C7F33C] text-black' 
                        : 'bg-[#3A3B3C] text-slate-300 hover:bg-[#4E4F50]'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" /> Activity
                  </button>
                  <button 
                    onClick={() => setActiveTab('system')}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 transition-colors ${
                      activeTab === 'system' 
                        ? 'bg-[#C7F33C] text-black' 
                        : 'bg-[#3A3B3C] text-slate-300 hover:bg-[#4E4F50]'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" /> System
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative mt-3 mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  type="text"
                  placeholder="Search updates..."
                  value={activitySearchQuery}
                  onChange={(e) => setActivitySearchQuery(e.target.value)}
                  className="w-full bg-[#3A3B3C] hover:bg-[#4E4F50] border border-[#4E4F50] rounded-full pl-10 pr-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#C7F33C] transition-colors placeholder:text-slate-400"
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 flex flex-col gap-8 custom-scrollbar">
            
            {(activeTab === 'activity' || activeTab === 'system') && (
              <>
                {/* Activity Logs (Facebook Style) */}
                <div className="flex flex-col gap-4 flex-1 pb-10">
                  
                  {activeTab === 'activity' && (
                    <div className="flex flex-col gap-6">


                      {/* Feed */}
                      <div className="flex flex-col gap-6 mt-4">
                        {(() => {
                          if (isLoadingLogs && !rawLocalActivityPages) {
                            return (
                              <div className="flex flex-col gap-6 w-full mt-4">
                                {[1, 2, 3].map(i => (
                                  <div key={i} className="flex gap-3 animate-pulse">
                                    <div className="w-10 h-10 rounded-full bg-[#3A3B3C] shrink-0" />
                                    <div className="flex flex-col gap-2 flex-1">
                                      <div className="w-3/4 h-16 bg-[#3A3B3C] rounded-2xl rounded-tl-sm" />
                                      <div className="w-24 h-3 bg-[#3A3B3C] rounded-full ml-2" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          }

                          let comments = localActivityLogs.filter(log => log.type === 'COMMENT' && !log.parentId);
                          
                          if (activitySearchQuery.trim()) {
                            const query = activitySearchQuery.toLowerCase();
                            comments = comments.filter(log => 
                              log.content?.toLowerCase().includes(query) || 
                              log.user?.name?.toLowerCase().includes(query)
                            );
                          }

                          if (comments.length === 0) {
                            return (
                              <div className="text-center py-10 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]">
                                <p className="text-sm text-slate-300 font-medium">{activitySearchQuery.trim() ? "No updates found." : "No updates yet."}</p>
                                <p className="text-xs text-slate-400 mt-1">{activitySearchQuery.trim() ? "Try searching for something else." : "Be the first to post an update on this deal."}</p>
                              </div>
                            );
                          }

                          const groupedComments = comments.reduce((acc, log) => {
                            const year = new Date(log.createdAt).getFullYear();
                            if (!acc[year]) acc[year] = [];
                            acc[year].push(log);
                            return acc;
                          }, {} as Record<number, typeof comments>);

                          const sortedYears = Object.keys(groupedComments).map(Number).sort((a, b) => b - a);

                          return sortedYears.map(year => (
                            <div key={year} className="flex flex-col gap-6">
                              <div className="flex items-center gap-4">
                                <h3 className="font-semibold text-xl text-slate-100">{year}</h3>
                                <div className="h-px bg-[#4E4F50] flex-1"></div>
                              </div>
                              {groupedComments[year].map(log => (
                                <ActivityComment 
                                  key={log.id} 
                                  log={log} 
                                  dealId={deal.id}
                                  currentUser={session?.user as unknown as { id: string; name?: string | null; image?: string | null; email?: string | null; }}
                                  refresh={() => loadActivityLogs()}
                                  mutateLogs={loadActivityLogs}
                                  searchQuery={activitySearchQuery}
                                  onReplyClick={(username) => {
                                    setNewLog(prev => prev ? `${prev} @${username} ` : `@${username} `);
                                    if (inputRef.current) inputRef.current.focus();
                                  }}
                                  onImageClick={(url) => setPreviewImage(url)}
                                />
                              ))}
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  {activeTab === 'system' && (
                    <div className="flex flex-col gap-4 mt-2">
                      {(() => {
                        if (isLoadingLogs && !rawLocalActivityPages) {
                          return (
                            <div className="flex flex-col gap-4 mt-4 w-full">
                              {[1, 2, 3].map(i => (
                                <div key={i} className="flex gap-3 animate-pulse">
                                  <div className="w-8 h-8 rounded-full bg-[#3A3B3C] shrink-0 mt-0.5" />
                                  <div className="flex flex-col gap-1.5 flex-1 mt-1">
                                    <div className="w-32 h-3 bg-[#3A3B3C] rounded-full" />
                                    <div className="w-full max-w-sm h-3 bg-[#3A3B3C] rounded-full" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        }

                        let sysLogs = localActivityLogs.filter(log => log.type === 'SYSTEM_UPDATE');
                        
                        if (activitySearchQuery.trim()) {
                          const query = activitySearchQuery.toLowerCase();
                          sysLogs = sysLogs.filter(log => 
                            log.content?.toLowerCase().includes(query) || 
                            log.user?.name?.toLowerCase().includes(query)
                          );
                        }

                        if (sysLogs.length === 0) {
                          return (
                            <div className="text-center py-10 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]">
                              <p className="text-sm text-slate-300 font-medium">{activitySearchQuery.trim() ? "No system logs found." : "No system logs."}</p>
                            </div>
                          );
                        }

                        return sysLogs.map(log => (
                          <div key={log.id} className="flex gap-3 group/sys">
                            <div className="w-8 h-8 rounded-full bg-[#3A3B3C] shrink-0 overflow-hidden mt-0.5 flex items-center justify-center">
                              {log.user ? (
                                <img src={log.user.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${log.user.name || log.user.email || log.userId}`} alt="Avatar" className="w-full h-full object-cover" />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                              )}
                            </div>
                            <div className="flex flex-col flex-1 justify-center">
                              <span className="text-[11px] text-slate-500 mb-0.5 font-medium">
                                <strong className="text-slate-300">{log.user?.name || 'System'}</strong> • {formatDateTime(log.createdAt)}
                              </span>
                              <p className="text-[13px] text-slate-300 font-medium italic whitespace-pre-wrap">
                                <HighlightText text={log.content?.trim() || ''} highlight={activitySearchQuery} />
                              </p>
                            </div>
                            {session?.user?.role === 'ADMIN' && (
                              <button 
                                onClick={() => handleDeleteSystemLog(log.id)} 
                                className="opacity-0 group-hover/sys:opacity-100 p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                title="Delete System Log"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))
                      })()}
                    </div>
                  )}

                  {hasMoreLogs && (
                    <div ref={lastLogElementRef} className="py-4 flex justify-center mt-2">
                      {isLoadingMore ? (
                        <Loader2 className="w-6 h-6 animate-spin text-[#C7F33C]" />
                      ) : (
                        <span className="text-sm text-slate-400">Scroll for more</span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'collaborate' && (
              <div className="flex flex-col gap-8">
                
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                        <Users className="w-5 h-5 text-[#C7F33C]" />
                        Collaborate
                      </h3>
                    </div>
                    {canInvite && (
                      <div className="relative">
                        <button 
                          onClick={() => {
                            setShowInviteDropdown(!showInviteDropdown);
                            setShowTransferDropdown(false);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3A3B3C] text-slate-300 rounded-lg text-xs font-semibold transition-colors border border-[#4E4F50] hover:border-slate-400 hover:text-white"
                        >
                          + Add
                        </button>
                        <UserSearchDropdown
                          users={users}
                          isOpen={showInviteDropdown}
                          onClose={() => setShowInviteDropdown(false)}
                          onSelect={handleAddMember}
                          actionLabel="Invite"
                          excludeUserIds={[deal.ownerId, ...(localTeamMembers?.map(tm => tm.id) || [])]}
                          align="right"
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-6">
                    {(() => {
                      const allMembers = [deal.owner, ...(localTeamMembers || []).filter(tm => tm.id !== deal.ownerId)];
                      const groupedMembers = allMembers.reduce((acc, member) => {
                        const deptName = (member as User & { department?: { name: string } | null }).department?.name || 'Unassigned';
                        if (!acc[deptName]) acc[deptName] = [];
                        acc[deptName].push(member);
                        return acc;
                      }, {} as Record<string, typeof allMembers>);

                      return Object.entries(groupedMembers).map(([deptName, members]) => (
                        <div key={deptName} className="flex flex-col gap-2">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 pl-1">{deptName}</h4>
                          <div className="flex flex-col gap-2">
                            {members.map(tm => {
                              const isRowOwner = tm.id === deal.ownerId;
                              return (
                                <div key={tm.id} className="group flex items-center justify-between p-3 rounded-2xl border border-[#4E4F50] bg-[#3A3B3C]  hover:border-slate-400 transition-all relative">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#4E4F50] overflow-hidden shrink-0">
                                      <img src={tm.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${tm.name || tm.email || tm.id}`} alt="Avatar" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-sm font-semibold text-slate-100">{tm.name || 'Unknown'}</span>
                                      <span className="text-xs text-slate-300">{isRowOwner ? 'Owner' : 'Member'}</span>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {isRowOwner ? (
                                      isOwner && (
                                        <div className="relative">
                                          <button
                                            onClick={() => {
                                              setShowTransferDropdown(!showTransferDropdown);
                                              setShowInviteDropdown(false);
                                            }}
                                            className="px-3 py-1 text-xs font-semibold bg-[#4E4F50] border border-transparent text-slate-300 hover:bg-slate-500 hover:text-white rounded-lg transition-colors"
                                          >
                                            Transfer
                                          </button>
                                          <UserSearchDropdown
                                            users={users}
                                            isOpen={showTransferDropdown}
                                            onClose={() => setShowTransferDropdown(false)}
                                            onSelect={handleTransfer}
                                            actionLabel="Transfer"
                                            isLoading={isTransferring}
                                            excludeUserIds={[deal.ownerId]}
                                            align="right"
                                          />
                                        </div>
                                      )
                                    ) : (
                                      (isOwner || tm.email === session?.user?.email) && (
                                        <button 
                                          onClick={() => handleRemoveMember(tm.id)}
                                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                          title={isOwner ? "Remove from team" : "Leave team"}
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      )
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'information' && (
              <CustomerTab deal={deal} />
            )}

            {activeTab === 'notes' && (
              <NotesTab deal={deal} />
            )}

            {['sharedMedia'].includes(activeTab) && (
              <SharedMediaTab deal={deal} activityLogs={localActivityLogs} onImageClick={setPreviewImage} />
            )}
          </div>

          {/* Sticky Footer for Activity Tab */}
          {activeTab === 'activity' && (
            <div className="p-4 bg-[#252728] border-t border-[#1C1C1D] shrink-0 z-10 flex flex-col gap-2 relative">

              {/* Mini Calendar Popup */}
              {canEditDueDate && showCalendar && (
                <div ref={calendarRef} className="absolute bottom-[100%] left-4 mb-2 bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl shadow-xl p-4 z-50 w-[280px]">
                  <div className="flex items-center justify-between mb-4">
                    <button 
                      onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                      className="p-1 hover:bg-[#4E4F50] rounded-full text-slate-400"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    </button>
                    <span className="font-bold text-slate-100">
                      {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <button 
                      onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                      className="p-1 hover:bg-[#4E4F50] rounded-full text-slate-400"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center mb-2">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                      <div key={day} className="text-[10px] font-bold text-slate-400">{day}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() }).map((_, i) => (
                      <div key={`empty-${i}`} className="h-8"></div>
                    ))}
                    {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }).map((_, i) => {
                      const date = i + 1;
                      const cellDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), date);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      
                      const isToday = date === new Date().getDate() && calendarMonth.getMonth() === new Date().getMonth() && calendarMonth.getFullYear() === new Date().getFullYear();
                      const isPast = cellDate < today;
                      const isSelected = selectedPopupDate?.getDate() === date && selectedPopupDate?.getMonth() === calendarMonth.getMonth() && selectedPopupDate?.getFullYear() === calendarMonth.getFullYear();
                      
                      return (
                        <button
                          key={date}
                          onClick={() => {
                            const newDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), date);
                            newDate.setHours(0, 0, 0, 0);
                            setSelectedPopupDate(newDate);
                          }}
                          disabled={isPast}
                          className={`
                            h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all
                            ${isPast ? 'text-slate-500 cursor-not-allowed' : 'cursor-pointer'}
                            ${!isPast && !isSelected ? 'hover:bg-[#4E4F50] text-slate-300' : ''}
                            ${isToday && !isSelected ? 'border border-[#C7F33C]' : ''}
                            ${isSelected ? 'bg-[#C7F33C] !text-black hover:bg-[#b0d635]' : ''}
                          `}
                        >
                          {date}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-4">
                    {deal.dueDate && (
                      <button 
                        onClick={() => {
                          setPendingDueDate('REMOVE');
                          setShowCalendar(false);
                        }}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-900/30 hover:bg-red-900/50"
                      >
                        Remove
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setPendingDueDate(selectedPopupDate);
                        setShowCalendar(false);
                      }}
                      disabled={!selectedPopupDate}
                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#c3ff00] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deal.dueDate ? 'Change' : 'Confirm'}
                    </button>
                  </div>
                </div>
              )}

              <div {...getRootProps()} className={`flex gap-3 bg-[#3A3B3C] p-2 rounded-2xl border transition-colors ${isDragActive ? 'border-[#C7F33C] bg-[#4E4F50]' : 'border-[#4E4F50]'}`}>
                <input {...getInputProps()} />
                <div className="w-10 h-10 rounded-full bg-[#4E4F50] shrink-0 overflow-hidden mt-1 ml-1">
                  <img src={session?.user?.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${session?.user?.name || session?.user?.email || "User"}`} alt="Avatar" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 flex flex-col">
                  {/* Previews and Pending Due Date */}
                  <div className="px-2 pt-1 pb-1 flex flex-wrap gap-2">
                    {pendingDueDate && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-black text-[#d4ff3a]">
                        <BellRing className="w-3 h-3" />
                        {pendingDueDate === 'REMOVE' ? 'Remove Due Date' : `Selected Due: ${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(pendingDueDate)}`}
                        <button onClick={() => setPendingDueDate(null)} className="ml-1 opacity-70 hover:opacity-100 transition-opacity">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {pendingAttachments.map((file, idx) => {
                       const isImg = file.type.startsWith('image/');
                       const objectUrl = isImg ? URL.createObjectURL(file) : null;
                       return (
                         <div key={idx} className="relative group/att rounded-lg overflow-hidden border border-[#4E4F50] bg-[#252728] flex items-center justify-center">
                           {isImg && objectUrl ? (
                             <img src={objectUrl} alt="preview" className="h-12 w-12 object-cover" />
                           ) : (
                             <div className="h-12 w-12 flex items-center justify-center text-slate-400">
                               <Paperclip className="w-4 h-4" />
                             </div>
                           )}
                           <button 
                             onClick={() => setPendingAttachments(prev => prev.filter((_, i) => i !== idx))} 
                             className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/att:opacity-100 transition-opacity scale-75 hover:scale-100 shadow-lg"
                           >
                             <X className="w-3 h-3" />
                           </button>
                         </div>
                       );
                    })}
                  </div>
                  
                  <textarea 
                    ref={inputRef}
                    value={newLog}
                    onChange={e => setNewLog(e.target.value)}
                    placeholder={isDragActive ? "Drop files here..." : "Write an update..."}
                    className="w-full bg-transparent border-none rounded-xl text-white px-2 py-2 text-sm min-h-[40px] focus:outline-none resize-none custom-scrollbar"
                    rows={newLog.split('\n').length > 1 ? Math.min(newLog.split('\n').length, 12) : 1}
                  />
                  
                  <div className="flex justify-between items-center mt-2 pr-1 pb-1">
                    <div className="flex items-center gap-1">
                      {session?.user?.id && (
                        <ChatAttachmentButton 
                          onFileSelect={(files) => setPendingAttachments(prev => [...prev, ...files])}
                        />
                      )}
                      {canEditDueDate && (
                        <button 
                          onClick={() => setShowCalendar(!showCalendar)}
                          title="Set Due Date"
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ml-1 ${(pendingDueDate && pendingDueDate !== 'REMOVE') || (!pendingDueDate && deal.dueDate) ? 'bg-[#C7F33C] text-black' : 'hover:bg-[#3A3B3C] text-slate-100'}`}
                        >
                          <BellRing className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <button 
                      onClick={handleAddLog}
                      disabled={isSubmittingLog || (!newLog.trim() && pendingAttachments.length === 0 && !pendingDueDate)}
                      className="flex items-center gap-2 bg-[#C7F33C] text-black px-4 py-1.5 rounded-full text-xs font-bold hover:bg-[#b0d635] transition-colors disabled:opacity-50 "
                    >
                      {isSubmittingLog ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      {isSubmittingLog ? "Posting..." : "Post"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
        </div>
      </div>
      
      {/* Lightbox Overlay */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button 
            className="absolute top-6 right-6 p-2 rounded-full bg-[#1C1C1D]/50 text-white hover:bg-[#C7F33C] hover:text-black transition-colors"
            onClick={() => setPreviewImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img 
            src={previewImage} 
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()} 
            alt="Preview"
          />
        </div>
      )}
    </>
  );
}
