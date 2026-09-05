"use client";

import { X, MoreHorizontal, Activity, MessageSquare, Trash2, Search, Users, BellRing, Send, Paperclip, Download, Loader2, RefreshCw, Sparkles, Copy, Check, AlertCircle, Settings, Bot, Zap, Target, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Lock, Building2, Pencil, Briefcase } from "lucide-react";
import { OpportunityWithRelations } from "./KanbanCard";
import { DealTypeIcon } from "./DealTypeBadge";
import imageCompression from 'browser-image-compression';
import { useDropzone } from 'react-dropzone';

import { addActivityLog, removeTeamMember, addTeamMember, editActivityLog, deleteActivityLog, addSystemLog, getOpportunityActivityLogs, updateDueDateWithLog, updateOpportunity, deleteOpportunity } from "@/lib/actions/opportunity";
import { getLatestDealSummary, generateDealSummary, getDealSummaryPromptConfig, saveDealSummaryPromptConfig, resetDealSummaryPromptConfig } from "@/lib/actions/deal-summary";
import { getDealAccelerators, generateDealAccelerators, answerDealAccelerator, updateDealTargetGoal } from "@/lib/actions/ai-accelerator";
import { getAllUsers } from "@/lib/actions/users";
import { requestDealTransfer } from "@/lib/actions/notification";
import { UserSearchDropdown } from "../ui/UserSearchDropdown";
import { useEffect, useState, useRef, useCallback } from "react";
import useSWR, { useSWRConfig, mutate } from "swr";
import useSWRInfinite from "swr/infinite";
import { useSession } from "next-auth/react";
import { User, OpportunityType } from "@prisma/client";
import { usePermissions } from "@/providers/PermissionProvider";
import { IconMap } from "@/lib/menu-registry";
import { useDialog } from "@/providers/DialogProvider";
import { CustomerTab } from "./CustomerTab";
import { NotesTab } from "./NotesTab";
import { SharedMediaTab } from "./SharedMediaTab";
import { ChatAttachmentButton } from "./ChatAttachmentButton";
import { HighlightText } from "@/components/ui/HighlightText";
import { pusherClient } from "@/lib/pusher";
import {
  applyActivityEvent,
  activityFeedKey,
  replaceOptimisticActivity,
  type ActivityLogPage,
  type ActivityLogWithRelations,
  type ActivityUpdateEvent,
} from "@/lib/pipeline-activity-cache";

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

function ImageGrid({ images, onImageClick }: { images: {url: string, filename: string, type: string}[], onImageClick?: (url: string, index?: number, allUrls?: string[]) => void }) {
  if (images.length === 0) return null;

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = "https://placehold.co/600x400/252728/4E4F50?text=Image+Unavailable";
  };

  const allUrls = images.map(img => img.url);

  if (images.length === 1) {
    return (
      <div className="mt-2 rounded-xl overflow-hidden border border-[#4E4F50] bg-[#1C1C1D]">
        <img
          src={images[0].url}
          alt={images[0].filename}
          className="w-full h-auto max-h-80 object-contain cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => onImageClick?.(images[0].url, 0, allUrls)}
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
            onClick={() => onImageClick?.(img.url, idx, allUrls)}
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
          onClick={() => onImageClick?.(images[0].url, 0, allUrls)}
          onError={handleImageError}
        />
        <img
          src={images[1].url}
          alt=""
          className="w-full h-32 object-cover cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => onImageClick?.(images[1].url, 1, allUrls)}
          onError={handleImageError}
        />
        <img
          src={images[2].url}
          alt=""
          className="w-full h-32 object-cover cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => onImageClick?.(images[2].url, 2, allUrls)}
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
            <div key={idx} className="relative cursor-pointer group" onClick={() => onImageClick?.(img.url, 3, allUrls)}>
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
            onClick={() => onImageClick?.(img.url, idx, allUrls)}
            onError={handleImageError}
          />
        )
      })}
    </div>
  );
}

function ActivityComment({ log, dealId, currentUser, refresh, mutateLogs, onReplyClick, onImageClick, searchQuery = '' }: { log: ActivityLogWithRelations, dealId: string, currentUser: { id: string; name?: string | null; image?: string | null; email?: string | null; }, refresh: () => void, mutateLogs?: (data: (currentPages?: ActivityLogPage[]) => ActivityLogPage[] | undefined, opts?: { revalidate: boolean }) => void, onReplyClick?: (username: string) => void, onImageClick?: (url: string, index?: number, allUrls?: string[]) => void, searchQuery?: string }) {
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
        (currentPages?: ActivityLogPage[]) => {
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
    try {
      const persistedLog = await editActivityLog(log.id, editContent) as ActivityLogWithRelations;
      mutateLogs?.(
        pages => applyActivityEvent(pages, { action: 'ACTIVITY_UPDATED', activityLog: persistedLog }),
        { revalidate: false },
      );
    } catch {
      refresh();
    }
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
        (currentPages?: ActivityLogPage[]) => {
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

    try {
      const persistedReply = await addActivityLog(dealId, finalContent, log.id) as ActivityLogWithRelations;
      mutateLogs?.(
        pages => replaceOptimisticActivity(pages, fakeLogId, persistedReply),
        { revalidate: false },
      );
    } catch {
      refresh();
    }
  };

  const handleDelete = async () => {
    // Optimistic Update for Activity Panel only
    if (mutateLogs) {
      mutateLogs(
        (currentPages?: ActivityLogPage[]) => {
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

    try {
      await deleteActivityLog(log.id);
    } catch {
      refresh();
    }
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

                    const cleanText = displayContent.replace(/\[ATTACHMENT:(https?:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+[^\s\]|]*|blob:[^\]|\s]+)(?:\|([^\]|]*))?(?:\|([^\]|]*))?\]/g, (_match, url, filename = '', type = '') => {
                      const isImg =
                        type.startsWith('image/') ||
                        type.startsWith('video/') ||
                        Boolean(url.match(/\.(jpeg|jpg|png|gif|webp|svg|bmp)(\?.*)?$/i)) ||
                        Boolean(url.includes('/image/upload/')) ||
                        url.startsWith('blob:');
                      if (isImg) {
                        images.push({ url, filename: filename || 'Attachment', type: type || 'image/jpeg' });
                      } else {
                        files.push({ url, filename: filename || 'File', type: type || 'application/octet-stream' });
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

export type TabType = 'activity' | 'system' | 'collaborate' | 'information' | 'notes' | 'sharedMedia' | 'summary';

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
  const { visibleRightMenus, canSee } = usePermissions();
  const canUseSalesDeal = canSee("pipeline.information");
  const rawRightMenus = visibleRightMenus("pipeline");
  const rightMenus = rawRightMenus.filter(m => {
    if (m.key === 'pipeline.information') {
      return deal.type === 'SALES_DEAL';
    }
    return true;
  });

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

  // Lightbox Preview State (Supports multi-image gallery with Next/Prev)
  const [previewLightbox, setPreviewLightbox] = useState<{
    images: string[];
    currentIndex: number;
  } | null>(null);

  const handleOpenPreview = useCallback((url: string, index?: number, allUrls?: string[]) => {
    if (allUrls && allUrls.length > 0) {
      const initialIdx = typeof index === 'number' ? index : allUrls.indexOf(url);
      setPreviewLightbox({
        images: allUrls,
        currentIndex: initialIdx >= 0 ? initialIdx : 0
      });
    } else {
      setPreviewLightbox({
        images: [url],
        currentIndex: 0
      });
    }
  }, [setPreviewLightbox]);

  // Keyboard navigation for image lightbox
  useEffect(() => {
    if (!previewLightbox) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewLightbox(null);
      } else if (e.key === 'ArrowLeft') {
        setPreviewLightbox(prev => {
          if (!prev || prev.images.length <= 1) return prev;
          const nextIdx = prev.currentIndex > 0 ? prev.currentIndex - 1 : prev.images.length - 1;
          return { ...prev, currentIndex: nextIdx };
        });
      } else if (e.key === 'ArrowRight') {
        setPreviewLightbox(prev => {
          if (!prev || prev.images.length <= 1) return prev;
          const nextIdx = prev.currentIndex < prev.images.length - 1 ? prev.currentIndex + 1 : 0;
          return { ...prev, currentIndex: nextIdx };
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewLightbox]);

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
      inputRef.current?.focus();
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
  const canAnswerAccelerators = isOwner || (session?.user as Record<string, unknown>)?.role === "ADMIN";

  useEffect(() => {
    const t = setTimeout(() => setActiveTab(allowedInitialTab), 0);
    return () => clearTimeout(t);
  }, [allowedInitialTab, isOpen]);

  // Optimistic UI State
  type TeamMember = { id: string; name: string | null; email: string | null; image: string | null; role: string; department?: { name: string } | null; [key: string]: unknown };
  const [localTeamMembers, setLocalTeamMembers] = useState<TeamMember[]>(deal.teamMembers || []);
  const getKey = (pageIndex: number, previousPageData: { data: ActivityLogWithRelations[], nextCursor?: string } | null) => {
    return activityFeedKey(deal.id, activeTab, isOpen, previousPageData);
  };

  const {
    data: rawLocalActivityPages,
    mutate: loadActivityLogs,
    size,
    setSize,
    isValidating: isLoadingLogs
  } = useSWRInfinite<{ data: ActivityLogWithRelations[], nextCursor?: string }>(
    getKey,
    async ([, id, typeFilter, cursor]: [string, string, string, string]) => {
      const res = await getOpportunityActivityLogs(
        id,
        10,
        cursor || undefined,
        typeFilter as 'COMMENT' | 'SYSTEM_UPDATE',
      );
      return res as { data: ActivityLogWithRelations[], nextCursor?: string };
    }
  );

  const allLogs = rawLocalActivityPages ? rawLocalActivityPages.flatMap(page => page.data) : [];
  const {
    data: dealSummaryResponse,
    mutate: mutateDealSummary,
    isLoading: isLoadingDealSummary,
  } = useSWR(
    isOpen && activeTab === 'summary' ? ['deal-summary-on-demand', deal.id] : null,
    ([, id]) => getLatestDealSummary(id),
  );

  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isCopiedSummary, setIsCopiedSummary] = useState(false);

  // AI Deal Accelerators State
  const {
    data: acceleratorsResponse,
    mutate: mutateAccelerators,
    isLoading: isLoadingAccelerators,
  } = useSWR(
    isOpen && activeTab === 'summary' ? ['deal-accelerators', deal.id] : null,
    ([, id]) => getDealAccelerators(id),
  );

  const acceleratorsState = acceleratorsResponse?.data;
  const [isGeneratingAccelerators, setIsGeneratingAccelerators] = useState(false);
  const [isAnsweringQuestionId, setIsAnsweringQuestionId] = useState<string | null>(null);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [showCustomInput, setShowCustomInput] = useState<Record<string, boolean>>({});
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [isAcceleratorsExpanded, setIsAcceleratorsExpanded] = useState(true);
  const [acceleratorTab, setAcceleratorTab] = useState<'pending' | 'answered'>('pending');
  const [editingAnswerQuestionId, setEditingAnswerQuestionId] = useState<string | null>(null);
  const [editCustomAnswers, setEditCustomAnswers] = useState<Record<string, string>>({});
  const [showEditCustomInput, setShowEditCustomInput] = useState<Record<string, boolean>>({});
  const [prevDealId, setPrevDealId] = useState(deal.id);
  const [dealType, setDealType] = useState(deal.type);

  if (deal.id !== prevDealId) {
    setPrevDealId(deal.id);
    setDealType(deal.type);
  }

  const [isConverting, setIsConverting] = useState(false);

  const handleConvertToSalesDeal = async () => {
    const isConfirmed = await confirm({
      title: "Convert to Sale Deal",
      description: "Are you sure you want to convert this card to a Sales Deal? Once converted, this deal cannot be reverted back to an Internal Task.",
      confirmText: "Convert to Sale Deal",
      cancelText: "Cancel",
      variant: "primary"
    });

    if (!isConfirmed) return;

    setIsConverting(true);
    const prevType = dealType;
    setDealType(OpportunityType.SALES_DEAL);

    // Optimistic cache update
    mutate(
      (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
      (currentData: OpportunityWithRelations[] | undefined) =>
        currentData?.map(opp => opp.id === deal.id ? { ...opp, type: OpportunityType.SALES_DEAL } : opp),
      { revalidate: false }
    );

    try {
      await updateOpportunity(deal.id, { type: 'SALES_DEAL' });
      await addSystemLog(deal.id, "Converted opportunity type from Internal Task to Sales Deal.");
      toast({ title: "Converted to Sale Deal", description: "This card is now a Sales Deal.", type: "success" });
      setActiveTab('information');
    } catch (e: unknown) {
      setDealType(prevType);
      mutate((key) => Array.isArray(key) && key[0] === 'pipeline-deals');
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to convert to Sales Deal", type: "error" });
    } finally {
      setIsConverting(false);
    }
  };

  const pendingQuestions = acceleratorsState?.questions?.filter(q => q.status === 'PENDING') || [];
  const answeredQuestions = acceleratorsState?.questions?.filter(q => q.status === 'ANSWERED') || [];
  const pendingQuestionsCount = pendingQuestions.length;

  const handleAnswerAccelerator = async (questionId: string, answer: string) => {
    if (!answer.trim() || isAnsweringQuestionId) return;
    setIsAnsweringQuestionId(questionId);
    try {
      const res = await answerDealAccelerator(deal.id, questionId, answer.trim());
      if (res.success && res.data) {
        await mutateAccelerators({ success: true, data: res.data }, false);
        void mutate(key => Array.isArray(key) && key[0] === 'pending-accelerators');
        toast({ title: 'บันทึกคำตอบเรียบร้อย', description: `ตอบ: "${answer}"`, type: 'success' });
      } else {
        toast({ title: 'เกิดข้อผิดพลาด', description: res.error || 'ไม่สามารถบันทึกคำตอบได้', type: 'error' });
      }
    } catch {
      toast({ title: 'เกิดข้อผิดพลาด', description: 'ไม่สามารถบันทึกคำตอบได้', type: 'error' });
    } finally {
      setIsAnsweringQuestionId(null);
    }
  };

  const handleRefreshAccelerators = async () => {
    setIsGeneratingAccelerators(true);
    try {
      const res = await generateDealAccelerators(deal.id, acceleratorsState?.targetGoal);
      if (res.success && res.data) {
        await mutateAccelerators({ success: true, data: res.data }, false);
        void mutate(key => Array.isArray(key) && key[0] === 'pending-accelerators');
        toast({ title: 'วิเคราะห์สำเร็จ', description: 'อัปเดตเป้าหมายและจุดคอขวดเรียบร้อยแล้ว', type: 'success' });
      } else {
        toast({ title: 'ไม่สามารถวิเคราะห์ได้', description: res.error || 'โปรดตรวจสอบการเชื่อมต่อ', type: 'error' });
      }
    } catch {
      toast({ title: 'เกิดข้อผิดพลาด', description: 'ไม่สามารถสร้างคำถามเร่งงานได้', type: 'error' });
    } finally {
      setIsGeneratingAccelerators(false);
    }
  };

  const handleSaveGoal = async () => {
    if (!goalInput.trim() || isSavingGoal) return;
    setIsSavingGoal(true);
    try {
      const res = await updateDealTargetGoal(deal.id, goalInput.trim());
      if (res.success && res.data) {
        await mutateAccelerators({ success: true, data: res.data }, false);
        setIsEditingGoal(false);
        toast({ title: 'อัปเดตเป้าหมายเรียบร้อย', type: 'success' });
      } else {
        toast({ title: 'เกิดข้อผิดพลาด', description: res.error || 'ไม่สามารถบันทึกเป้าหมายได้', type: 'error' });
      }
    } catch {
      toast({ title: 'เกิดข้อผิดพลาด', description: 'ไม่สามารถบันทึกเป้าหมายได้', type: 'error' });
    } finally {
      setIsSavingGoal(false);
    }
  };

  // Admin Prompt Configuration State
  const isAdmin = session?.user?.role === 'ADMIN';
  const [summaryViewMode, setSummaryViewMode] = useState<'summary' | 'prompt'>('summary');
  const [systemInstructionInput, setSystemInstructionInput] = useState('');
  const [taskInstructionInput, setTaskInstructionInput] = useState('');
  const [jsonSchemaInput, setJsonSchemaInput] = useState('');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);

  // Stable refs for Prompt Settings textareas to prevent render-time height resets & scroll jumping
  const systemInstructionRef = useRef<HTMLTextAreaElement | null>(null);
  const taskInstructionRef = useRef<HTMLTextAreaElement | null>(null);
  const jsonSchemaRef = useRef<HTMLTextAreaElement | null>(null);

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (summaryViewMode === 'prompt') {
      const timer = setTimeout(() => {
        autoResizeTextarea(systemInstructionRef.current);
        autoResizeTextarea(taskInstructionRef.current);
        autoResizeTextarea(jsonSchemaRef.current);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [summaryViewMode, systemInstructionInput, taskInstructionInput, jsonSchemaInput]);

  const handleLoadPromptConfig = async () => {
    setIsLoadingPrompt(true);
    try {
      const config = await getDealSummaryPromptConfig();
      setSystemInstructionInput(config.systemInstruction);
      setTaskInstructionInput(config.taskInstruction);
      setJsonSchemaInput(config.jsonSchema);
    } catch {
      toast({ title: 'Error', description: 'Failed to load prompt configuration', type: 'error' });
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  const handleSavePrompt = async () => {
    if (!systemInstructionInput.trim()) {
      toast({ title: 'Validation Error', description: 'System instruction cannot be empty.', type: 'warning' });
      return;
    }
    if (!taskInstructionInput.trim()) {
      toast({ title: 'Validation Error', description: 'Task instruction cannot be empty.', type: 'warning' });
      return;
    }
    if (jsonSchemaInput.trim()) {
      try {
        JSON.parse(jsonSchemaInput);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid JSON format';
        toast({ title: 'JSON Schema Error', description: `รูปแบบ JSON Schema ไม่ถูกต้อง: ${msg}`, type: 'warning' });
        return;
      }
    }
    setIsSavingPrompt(true);
    try {
      await saveDealSummaryPromptConfig({
        systemInstruction: systemInstructionInput,
        taskInstruction: taskInstructionInput,
        customInstruction: '',
        jsonSchema: jsonSchemaInput,
      });
      toast({ title: 'Prompt Saved', description: 'AI Summary prompt configuration updated successfully.', type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save prompt configuration';
      toast({ title: 'Error', description: msg, type: 'error' });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleResetPrompt = async () => {
    const isConfirmed = await confirm({
      title: 'Reset AI Prompt',
      description: 'Are you sure you want to reset prompts and JSON schema to system defaults?',
      confirmText: 'Reset',
      variant: 'danger',
    });
    if (!isConfirmed) return;
    setIsSavingPrompt(true);
    try {
      const res = await resetDealSummaryPromptConfig();
      setSystemInstructionInput(res.data.systemInstruction);
      setTaskInstructionInput(res.data.taskInstruction);
      setJsonSchemaInput(res.data.jsonSchema);
      toast({ title: 'Prompt Reset', description: 'Prompt and schema restored to default configuration.', type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset prompt configuration';
      toast({ title: 'Error', description: msg, type: 'error' });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    setSummaryError(null);
    try {
      // Also generate accelerators if none exist yet
      if (!acceleratorsState) {
        generateDealAccelerators(deal.id).then(accRes => {
          if (accRes.success && accRes.data) {
            void mutateAccelerators(accRes, false);
            void mutate(key => Array.isArray(key) && key[0] === 'pending-accelerators');
          }
        }).catch(() => {});
      }

      const res = await generateDealSummary(deal.id);
      if (res.success && res.data) {
        await mutateDealSummary(res, false);
        toast({ title: 'AI Summary Ready', description: 'Deal summary generated successfully.', type: 'success' });
      } else {
        const errorMsg = res.message || 'Unable to generate summary.';
        setSummaryError(errorMsg);
        toast({ title: 'Error', description: errorMsg, type: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection error occurred.';
      setSummaryError(msg);
      toast({ title: 'Error', description: msg, type: 'error' });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleCopySummary = () => {
    if (!dealSummaryResponse?.data) return;
    const { overview, keyHighlights, blockers, nextSteps } = dealSummaryResponse.data;

    // Additional custom fields from JSON schema
    const extraSections = Object.entries(dealSummaryResponse.data)
      .filter(([k, v]) => !['overview', 'keyHighlights', 'blockers', 'nextSteps'].includes(k) && v)
      .map(([k, v]) => {
        const title = k.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').toUpperCase().trim();
        if (Array.isArray(v)) {
          return `[${title}]\n${v.map(item => `• ${item}`).join('\n')}\n`;
        }
        return `[${title}]\n${typeof v === 'object' ? JSON.stringify(v, null, 2) : v}\n`;
      });

    const text = [
      `📌 Deal Summary: ${deal.topic}`,
      dealSummaryResponse.generatedAt ? `(As of: ${formatDateTime(dealSummaryResponse.generatedAt)})` : '',
      '',
      overview ? `[CURRENT STATUS]\n${overview}\n` : '',
      keyHighlights?.length ? `[KEY HIGHLIGHTS]\n${keyHighlights.map(k => `• ${k}`).join('\n')}\n` : '',
      blockers?.length ? `[BLOCKERS & RISKS]\n${blockers.map(b => `• ${b}`).join('\n')}\n` : '',
      nextSteps?.length ? `[RECOMMENDED NEXT STEPS]\n${nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n` : '',
      ...extraSections,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text);
    setIsCopiedSummary(true);
    toast({ title: 'Copied', description: 'Summary copied to clipboard.', type: 'success' });
    setTimeout(() => setIsCopiedSummary(false), 2000);
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!session?.user?.id) return;
    const channel = pusherClient.subscribe(`private-pipeline-${session.user.id}`);

    const handleUpdate = (data?: ActivityUpdateEvent) => {
      if (data?.dealId === deal.id && data?.action?.startsWith('ACTIVITY_')) {
        loadActivityLogs(pages => applyActivityEvent(pages, data), { revalidate: false });
      }
    };

    channel.bind('pipeline-updated', handleUpdate);

    return () => {
      channel.unbind('pipeline-updated', handleUpdate);
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

    // 1. Create Fake Optimistic Log with instant local blob previews
    const fakeId = `temp-${Date.now()}`;
    const optimisticAttachmentText = currentAttachments.map(f => {
      const isImg = f.type.startsWith('image/');
      const previewUrl = isImg ? URL.createObjectURL(f) : '';
      return previewUrl ? `\n[ATTACHMENT:${previewUrl}|${f.name}|${f.type}]` : '';
    }).join('');

    const optimisticContent = (currentNewLog.trim() + optimisticAttachmentText).trim() || 
      (currentDueDate ? 'Updated due date' : (currentAttachments.length ? 'Uploaded attachment' : 'Updated deal'));

    const optimisticLog = {
      id: fakeId,
      content: optimisticContent,
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

    // แจ้งเตือน AI Summary ทันทีว่ามีข้อมูลใหม่เข้ามา
    mutateDealSummary(
      (current) => {
        if (!current?.data) return current;
        return {
          ...current,
          isOutdated: true,
          newerActivitiesCount: (current.newerActivitiesCount || 0) + 1,
        };
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

      let persistedLog: ActivityLogWithRelations | null = null;
      if (currentDueDate === 'REMOVE') {
        await updateDueDateWithLog(deal.id, null, finalLog);
      } else if (currentDueDate instanceof Date) {
        await updateDueDateWithLog(deal.id, currentDueDate, finalLog);
      } else {
        persistedLog = await addActivityLog(deal.id, finalLog) as ActivityLogWithRelations;
      }

      if (persistedLog) {
        loadActivityLogs(
          pages => replaceOptimisticActivity(pages, fakeId, persistedLog as ActivityLogWithRelations),
          { revalidate: false },
        );
      } else {
        // A due-date action creates both a comment and a system record in one
        // transaction, so reconcile that uncommon multi-record mutation once.
        loadActivityLogs();
      }
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
      const isVideo = file.type.startsWith('video/') || Boolean(file.name.match(/\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v|3gp)$/i));
      if (isVideo) {
        toast({
          title: "ไม่อนุญาตให้อัปโหลดวิดีโอ",
          description: `"${file.name}" เป็นไฟล์วิดีโอ กรุณาอัปโหลดเข้า Google Drive หรือ YouTube แล้วนำลิงก์มาแนบแทนครับ`,
          type: "warning"
        });
        return false;
      }
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

      const newOwner = users.find((u: { id: string; name?: string | null }) => u.id === newOwnerId);
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
    const userToAdd = users.find((u: { id: string }) => u.id === userId);
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
            const Icon = tabId === 'summary' || menu.key === 'pipeline.summary' 
              ? Bot 
              : (menu.iconName ? IconMap[menu.iconName] || MessageSquare : MessageSquare);
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
        <div className="w-[750px] max-w-[90vw] bg-[#252728] flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-[#1C1C1D] shrink-0">
            <div className="flex flex-col flex-1 pr-4 min-w-0">
              <div className="flex items-center gap-2">
                {/* Card Type Indicator Icon */}
                <div title={dealType === "SALES_DEAL" ? "Sales Deal" : "Internal Task"} className="shrink-0">
                  <DealTypeIcon type={dealType} size="md" />
                </div>

                {/* Topic / Title */}
                {isEditingTopic ? (
                  <div className="relative flex-1 min-w-0">
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
                    className={`text-xl font-bold text-slate-100 line-clamp-1 flex-1 min-w-0 ${canEditDueDate ? 'cursor-text hover:text-white' : ''}`}
                    onClick={() => canEditDueDate && setIsEditingTopic(true)}
                    title={canEditDueDate ? "Click to edit title" : undefined}
                  >
                    {topic}
                  </h2>
                )}
              </div>

              {/* Customer / Company Row (Replacing old Card Type position) */}
              {(deal.company?.displayName || deal.company?.name) && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400 font-medium pl-0.5" title={deal.company.name}>
                  <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">{deal.company.displayName || deal.company.name}</span>
                  {deal.company.displayName && deal.company.displayName !== deal.company.name && (
                    <span className="text-[11px] text-slate-500 truncate">({deal.company.name})</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Convert to Sale Deal Button (Only for Internal Task, and only for users with Sale Deal permission) */}
              {dealType === 'INTERNAL_TASK' && canUseSalesDeal && (
                <button
                  type="button"
                  onClick={handleConvertToSalesDeal}
                  disabled={isConverting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C7F33C]/10 border border-[#C7F33C]/40 text-[#C7F33C] hover:bg-[#C7F33C] hover:text-black rounded-full text-xs font-bold transition-all disabled:opacity-50 mr-1 cursor-pointer"
                  title="Convert this Internal Task to a Sales Deal"
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  {isConverting ? "Converting..." : "Convert to Sale Deal"}
                </button>
              )}
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
                type="button"
                aria-label="Close card panel"
                className="p-2 hover:bg-[#3A3B3C] rounded-full transition-colors text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sticky Tabs for Activity/System/Summary */}
          {(activeTab === 'activity' || activeTab === 'system' || activeTab === 'summary') && (
            <div className="px-6 pt-6 pb-2 bg-[#252728] shrink-0 z-10">
              <div className="flex items-center justify-between w-full mb-2">
                <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  {activeTab === 'summary' ? (
                    <Bot className="w-5 h-5 text-[#C7F33C]" />
                  ) : (
                    <Activity className="w-5 h-5 text-[#C7F33C]" />
                  )}
                  {activeTab === 'summary' ? 'AI Summary' : 'Activity Log'}
                </h3>

                {activeTab !== 'summary' ? (
                  <div className="flex items-center gap-2 overflow-x-auto" role="tablist" aria-label="Deal activity views">
                    <button
                      onClick={() => setActiveTab('activity')}
                      role="tab"
                      aria-selected={activeTab === 'activity'}
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
                      role="tab"
                      aria-selected={activeTab === 'system'}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 transition-colors ${
                        activeTab === 'system'
                          ? 'bg-[#C7F33C] text-black'
                          : 'bg-[#3A3B3C] text-slate-300 hover:bg-[#4E4F50]'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" /> System
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2" role="tablist" aria-label="AI Summary views">
                    <button
                      type="button"
                      onClick={() => setSummaryViewMode('summary')}
                      role="tab"
                      aria-selected={summaryViewMode === 'summary'}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                        summaryViewMode === 'summary'
                          ? 'bg-[#C7F33C] text-black font-semibold'
                          : 'bg-[#3A3B3C] text-slate-300 hover:bg-[#4E4F50]'
                      }`}
                    >
                      <Bot className="w-4 h-4" /> Summary
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setSummaryViewMode('prompt');
                          handleLoadPromptConfig();
                        }}
                        role="tab"
                        aria-selected={summaryViewMode === 'prompt'}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                          summaryViewMode === 'prompt'
                            ? 'bg-[#C7F33C] text-black font-semibold'
                            : 'bg-[#3A3B3C] text-slate-300 hover:bg-[#4E4F50]'
                        }`}
                      >
                        <Settings className="w-4 h-4" /> Prompt Settings
                      </button>
                    )}
                  </div>
                )}
              </div>
              {activeTab === 'summary' && (
                <div className="flex items-center gap-2 mt-1 flex-wrap w-full justify-end">
                  <p className="text-sm text-slate-400">
                    {summaryViewMode === 'prompt'
                      ? ""
                      : dealSummaryResponse?.generatedAt
                        ? `Last summarized: ${formatDateTime(dealSummaryResponse.generatedAt)}`
                        : "Summarize deal status, key highlights, and next steps in one click."}
                  </p>
                  {summaryViewMode === 'summary' && dealSummaryResponse?.data && dealSummaryResponse?.generatedAt && (
                    dealSummaryResponse.isOutdated ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-[#3A3B3C] text-slate-200 border border-[#C7F33C]/60 text-xs font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] animate-pulse" />
                        New updates available
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-[#3A3B3C] text-slate-300 border border-[#4E4F50] text-xs font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C]" />
                        Up to date
                      </span>
                    )
                  )}
                </div>
              )}

              {/* Search Bar (เฉพาะแท็บ Activity และ System) */}
              {activeTab !== 'summary' && (
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
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 flex flex-col gap-8 custom-scrollbar">

            {(activeTab === 'activity' || activeTab === 'system' || activeTab === 'summary') && (
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
                              {groupedComments[year].map(log => {

                                return (
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
                                    onImageClick={handleOpenPreview}
                                  />
                                );
                              })}
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  {activeTab === 'summary' && (
                    <div className="flex flex-col gap-5 mt-2">
                      {summaryViewMode === 'prompt' && isAdmin ? (
                        <div className="flex flex-col gap-5 pb-24">
                          {isLoadingPrompt ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                              <Loader2 className="w-8 h-8 text-[#C7F33C] animate-spin" />
                              <p className="text-xs text-slate-400">Loading prompt configuration...</p>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-4">
                              {/* 1. System Instruction */}
                              <div className="flex flex-col gap-2 p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                                    1. System Instruction (Core Rules & Persona)
                                  </span>
                                </div>
                                <textarea
                                  ref={systemInstructionRef}
                                  value={systemInstructionInput}
                                  onChange={e => {
                                    setSystemInstructionInput(e.target.value);
                                    autoResizeTextarea(e.target);
                                  }}
                                  className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3.5 text-sm text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                                  placeholder="Enter system prompt instruction..."
                                />
                              </div>

                              {/* 2. Task Instruction */}
                              <div className="flex flex-col gap-2 p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                                    2. Task Instructions (Analysis Topics & Guidelines)
                                  </span>
                                </div>
                                <textarea
                                  ref={taskInstructionRef}
                                  value={taskInstructionInput}
                                  onChange={e => {
                                    setTaskInstructionInput(e.target.value);
                                    autoResizeTextarea(e.target);
                                  }}
                                  className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3.5 text-sm text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                                  placeholder="Enter task instruction and topics..."
                                />
                              </div>

                              {/* 3. JSON Schema (Structured Output Definition) */}
                              <div className="flex flex-col gap-2 p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                                    3. JSON Schema (Structured Output Definition)
                                  </span>
                                </div>
                                <textarea
                                  ref={jsonSchemaRef}
                                  value={jsonSchemaInput}
                                  onChange={e => {
                                    setJsonSchemaInput(e.target.value);
                                    autoResizeTextarea(e.target);
                                  }}
                                  rows={12}
                                  className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3.5 text-sm text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                                  placeholder="Enter JSON Schema..."
                                />
                              </div>

                              {/* Bottom Action Row */}
                              <div className="flex items-center justify-between pt-4 border-t border-[#4E4F50]">
                                <button
                                  type="button"
                                  onClick={handleResetPrompt}
                                  disabled={isSavingPrompt || isLoadingPrompt}
                                  className="px-4 py-2 text-sm font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  Reset to Default
                                </button>

                                <button
                                  type="button"
                                  onClick={handleSavePrompt}
                                  disabled={isSavingPrompt || isLoadingPrompt}
                                  className="px-6 py-2.5 text-sm font-bold bg-[#C7F33C] hover:bg-[#b0d635] text-black rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                                >
                                  {isSavingPrompt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                  <span>{isSavingPrompt ? "Saving..." : "Save Prompt"}</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Standard Deal Summary View */
                        <>
                          {/* 🎯 AI Deal Accelerators Box */}
                          {!isGeneratingSummary && (
                            <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex flex-col gap-3 mb-2">
                              {/* Header & Toggle Bar */}
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => setIsAcceleratorsExpanded(prev => !prev)}
                                  className="flex items-center gap-2.5 text-left group cursor-pointer focus:outline-none"
                                >
                                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                                  <span className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                                    <span>AI Deal Accelerators</span>
                                  </span>
                                  {pendingQuestionsCount > 0 ? (
                                    <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-semibold">
                                      {pendingQuestionsCount} Pending
                                    </span>
                                  ) : acceleratorsState ? (
                                    <span className="px-2.5 py-0.5 rounded-full bg-[#C7F33C]/20 text-[#C7F33C] border border-[#C7F33C]/30 text-xs font-semibold flex items-center gap-1">
                                      <Check className="w-3.5 h-3.5" />
                                      <span>All Clear</span>
                                    </span>
                                  ) : null}
                                  <div className="text-slate-400 group-hover:text-slate-200 transition-colors ml-1">
                                    {isAcceleratorsExpanded ? (
                                      <ChevronUp className="w-4 h-4" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4" />
                                    )}
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  onClick={handleRefreshAccelerators}
                                  disabled={isGeneratingAccelerators}
                                  className="px-3 py-1.5 rounded-full bg-[#252728] hover:bg-[#4E4F50] text-xs font-semibold text-slate-200 hover:text-white border border-[#4E4F50] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                                  title="Re-scan and identify bottlenecks"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAccelerators ? 'animate-spin text-[#C7F33C]' : ''}`} />
                                  <span>{isGeneratingAccelerators ? 'Scanning...' : 'Rescan'}</span>
                                </button>
                              </div>

                              {/* Collapsible Content */}
                              {isAcceleratorsExpanded && (
                                <div className="flex flex-col gap-3 pt-1">
                                  {/* Target Goal Milestone */}
                                  <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-[#252728] border border-[#4E4F50]/60">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        <Target className="w-4 h-4 text-[#C7F33C]" />
                                        <span>TARGET GOAL</span>
                                        <span className="text-slate-500 font-normal">
                                          ({acceleratorsState?.goalSource === 'USER_OVERRIDE' ? 'Custom' : 'AI Inferred'})
                                        </span>
                                      </div>
                                      {!isEditingGoal && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setGoalInput(acceleratorsState?.targetGoal || deal.topic);
                                            setIsEditingGoal(true);
                                          }}
                                          className="text-xs text-slate-400 hover:text-[#C7F33C] transition-colors cursor-pointer"
                                        >
                                          Edit Goal
                                        </button>
                                      )}
                                    </div>

                                    {isEditingGoal ? (
                                      <div className="flex items-center gap-2 mt-1">
                                        <input
                                          type="text"
                                          value={goalInput}
                                          onChange={e => setGoalInput(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') handleSaveGoal();
                                            if (e.key === 'Escape') setIsEditingGoal(false);
                                          }}
                                          placeholder="Define the primary goal of this deal..."
                                          className="flex-1 bg-[#3A3B3C] border border-[#C7F33C] rounded-full px-4 py-2 text-sm text-slate-100 outline-none"
                                          autoFocus
                                        />
                                        <button
                                          type="button"
                                          onClick={handleSaveGoal}
                                          disabled={isSavingGoal}
                                          className="px-4 py-2 rounded-full bg-[#C7F33C] text-black text-sm font-bold hover:bg-[#b0d635] transition-colors cursor-pointer disabled:opacity-50"
                                        >
                                          {isSavingGoal ? 'Saving...' : 'Save'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setIsEditingGoal(false)}
                                          className="px-3 py-2 text-sm text-slate-400 hover:text-slate-200 cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <p className="text-sm text-slate-200 font-medium leading-relaxed">
                                        {acceleratorsState?.targetGoal || (isLoadingAccelerators ? 'Loading goal...' : `Deliver results for ${deal.topic}`)}
                                      </p>
                                    )}
                                  </div>

                                  {/* Sub-tabs: Pending (X) vs Answered (Y) */}
                                  <div className="flex items-center justify-between gap-2 pt-1 pb-0.5">
                                    <div className="flex items-center gap-1.5 p-1 rounded-full bg-[#252728] border border-[#4E4F50]/60">
                                      <button
                                        type="button"
                                        onClick={() => setAcceleratorTab('pending')}
                                        className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                          acceleratorTab === 'pending'
                                            ? 'bg-[#3A3B3C] text-slate-100 border border-[#4E4F50]'
                                            : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                      >
                                        <span>Pending</span>
                                        <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
                                          pendingQuestions.length > 0 ? 'bg-amber-400/20 text-amber-300' : 'bg-[#4E4F50]/40 text-slate-400'
                                        }`}>
                                          {pendingQuestions.length}
                                        </span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => setAcceleratorTab('answered')}
                                        className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                          acceleratorTab === 'answered'
                                            ? 'bg-[#3A3B3C] text-slate-100 border border-[#4E4F50]'
                                            : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                      >
                                        <span>Answered</span>
                                        <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
                                          answeredQuestions.length > 0 ? 'bg-[#C7F33C]/20 text-[#C7F33C]' : 'bg-[#4E4F50]/40 text-slate-400'
                                        }`}>
                                          {answeredQuestions.length}
                                        </span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Questions List (Facebook / Activity Thread Style) */}
                                  {acceleratorTab === 'pending' ? (
                                    pendingQuestions.length > 0 ? (
                                      <div className="flex flex-col gap-4">
                                        {pendingQuestions.map((q) => {
                                          const questionDate = q.createdAt || acceleratorsState?.lastGeneratedAt || acceleratorsState?.updatedAt;
                                          return (
                                            <div
                                              key={q.id}
                                              className="p-4 rounded-2xl border bg-[#252728] border-amber-500/30 flex flex-col gap-3.5 transition-all"
                                            >
                                              {/* Thread 1: AI Agent Post (Question) */}
                                              <div className="flex gap-3">
                                                <div className="w-9 h-9 rounded-full bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C] shrink-0 mt-0.5">
                                                  <Bot className="w-5 h-5" />
                                                </div>

                                                <div className="flex flex-col flex-1 min-w-0">
                                                  <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                      <span className="text-sm font-bold text-slate-100">AI Agent</span>
                                                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#C7F33C]/10 text-[#C7F33C] font-semibold border border-[#C7F33C]/20">
                                                        Bot
                                                      </span>
                                                      {questionDate && (
                                                        <span className="text-xs text-slate-500">
                                                          • {formatDateTime(questionDate)}
                                                        </span>
                                                      )}
                                                    </div>

                                                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400/10 text-amber-300 shrink-0 font-semibold border border-amber-400/20">
                                                      Waiting for reply
                                                    </span>
                                                  </div>

                                                  <p className="text-sm text-slate-100 font-medium leading-relaxed mt-1.5 whitespace-pre-wrap">
                                                    {q.question}
                                                  </p>

                                                  {q.reason && (
                                                    <div className="mt-1 text-sm text-slate-400 flex items-center gap-1.5">
                                                      <span>💡</span>
                                                      <span>{q.reason}</span>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Thread 2: Reply Area */}
                                              <div className="ml-4 pl-4 border-l-2 border-[#4E4F50]/40 flex flex-col gap-2.5 pt-1">
                                                {canAnswerAccelerators ? (
                                                  <>
                                                    <div className="flex flex-col gap-2">
                                                      {q.choices.map((choice, cIdx) => (
                                                        <button
                                                          key={cIdx}
                                                          type="button"
                                                          disabled={isAnsweringQuestionId === q.id}
                                                          onClick={() => handleAnswerAccelerator(q.id, choice)}
                                                          className="w-full text-left px-4 py-2.5 rounded-full bg-[#3A3B3C] hover:bg-[#4E4F50] text-sm font-medium text-slate-200 hover:text-white border border-[#4E4F50] hover:border-[#C7F33C] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-between group"
                                                        >
                                                          <span>{choice}</span>
                                                          <span className="opacity-0 group-hover:opacity-100 text-[#C7F33C] text-xs font-bold transition-opacity">
                                                            Reply →
                                                          </span>
                                                        </button>
                                                      ))}
                                                    </div>

                                                    <div className="flex items-center justify-between pt-1">
                                                      <button
                                                        type="button"
                                                        onClick={() => setShowCustomInput(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                                                        className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
                                                      >
                                                        {showCustomInput[q.id] ? 'Hide' : '+ Type custom reply'}
                                                      </button>
                                                    </div>

                                                    {showCustomInput[q.id] && (
                                                      <div className="flex items-center gap-2 mt-1">
                                                        <input
                                                          type="text"
                                                          value={customAnswers[q.id] || ''}
                                                          onChange={e => setCustomAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                                          onKeyDown={e => {
                                                            if (e.key === 'Enter') handleAnswerAccelerator(q.id, customAnswers[q.id] || '');
                                                          }}
                                                          placeholder="Type your reply..."
                                                          className="flex-1 bg-[#3A3B3C] border border-[#4E4F50] rounded-full px-4 py-2 text-sm text-slate-100 outline-none focus:border-[#C7F33C]"
                                                        />
                                                        <button
                                                          type="button"
                                                          disabled={isAnsweringQuestionId === q.id || !customAnswers[q.id]?.trim()}
                                                          onClick={() => handleAnswerAccelerator(q.id, customAnswers[q.id] || '')}
                                                          className="px-5 py-2 rounded-full bg-[#C7F33C] text-black text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                                        >
                                                          Reply
                                                        </button>
                                                      </div>
                                                    )}
                                                  </>
                                                ) : (
                                                  <div className="px-4 py-2.5 rounded-full bg-[#3A3B3C]/70 border border-[#4E4F50]/60 text-xs text-slate-400 flex items-center gap-2">
                                                    <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                                    <span>
                                                      Only the Card Owner ({deal.owner.name}) or an Admin can reply to this question.
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div className="p-4 rounded-2xl bg-[#252728] border border-[#4E4F50]/40 text-center flex flex-col items-center gap-1.5">
                                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#C7F33C]/20 text-[#C7F33C] font-semibold border border-[#C7F33C]/30">
                                          ✓ All Pending Questions Resolved
                                        </span>
                                        <p className="text-xs text-slate-400 mt-1">
                                          No bottleneck questions pending. Check the &quot;Answered&quot; tab to review confirmed decisions.
                                        </p>
                                      </div>
                                    )
                                  ) : (
                                    /* Answered Tab Content */
                                    answeredQuestions.length > 0 ? (
                                      <div className="flex flex-col gap-4">
                                        {answeredQuestions.map((q) => {
                                          const questionDate = q.createdAt || acceleratorsState?.lastGeneratedAt || acceleratorsState?.updatedAt;
                                          return (
                                            <div
                                              key={q.id}
                                              className="p-4 rounded-2xl border bg-[#252728]/50 border-[#4E4F50]/40 flex flex-col gap-3.5 transition-all"
                                            >
                                              {/* Thread 1: AI Agent Post (Question) */}
                                              <div className="flex gap-3">
                                                <div className="w-9 h-9 rounded-full bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C] shrink-0 mt-0.5">
                                                  <Bot className="w-5 h-5" />
                                                </div>

                                                <div className="flex flex-col flex-1 min-w-0">
                                                  <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                      <span className="text-sm font-bold text-slate-100">AI Agent</span>
                                                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#C7F33C]/10 text-[#C7F33C] font-semibold border border-[#C7F33C]/20">
                                                        Bot
                                                      </span>
                                                      {questionDate && (
                                                        <span className="text-xs text-slate-500">
                                                          • {formatDateTime(questionDate)}
                                                        </span>
                                                      )}
                                                    </div>

                                                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#C7F33C]/10 text-[#C7F33C] shrink-0 font-semibold border border-[#C7F33C]/20">
                                                      Answered
                                                    </span>
                                                  </div>

                                                  <p className="text-sm text-slate-100 font-medium leading-relaxed mt-1.5 whitespace-pre-wrap">
                                                    {q.question}
                                                  </p>

                                                  {q.reason && (
                                                    <div className="mt-1 text-sm text-slate-400 flex items-center gap-1.5">
                                                      <span>💡</span>
                                                      <span>{q.reason}</span>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Thread 2: User Reply Bubble or Edit Form */}
                                              <div className="ml-4 pl-4 border-l-2 border-[#4E4F50]/40 flex flex-col gap-2.5 pt-1">
                                                {editingAnswerQuestionId === q.id ? (
                                                  <div className="flex flex-col gap-2">
                                                    <div className="flex flex-col gap-2">
                                                      {q.choices.map((choice, cIdx) => (
                                                        <button
                                                          key={cIdx}
                                                          type="button"
                                                          disabled={isAnsweringQuestionId === q.id}
                                                          onClick={async () => {
                                                            await handleAnswerAccelerator(q.id, choice);
                                                            setEditingAnswerQuestionId(null);
                                                          }}
                                                          className={`w-full text-left px-4 py-2.5 rounded-full text-sm font-medium border transition-all cursor-pointer disabled:opacity-50 flex items-center justify-between group ${
                                                            q.answer === choice
                                                              ? 'bg-[#C7F33C]/20 text-[#C7F33C] border-[#C7F33C]'
                                                              : 'bg-[#3A3B3C] hover:bg-[#4E4F50] text-slate-200 hover:text-white border-[#4E4F50] hover:border-[#C7F33C]'
                                                          }`}
                                                        >
                                                          <span>{choice}</span>
                                                          <span className="text-[#C7F33C] text-xs font-bold">
                                                            {q.answer === choice ? 'Selected' : 'Choose →'}
                                                          </span>
                                                        </button>
                                                      ))}
                                                    </div>

                                                    <div className="flex items-center justify-between pt-1">
                                                      <button
                                                        type="button"
                                                        onClick={() => setShowEditCustomInput(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                                                        className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
                                                      >
                                                        {showEditCustomInput[q.id] ? 'Hide' : '+ Type custom reply'}
                                                      </button>

                                                      <button
                                                        type="button"
                                                        onClick={() => setEditingAnswerQuestionId(null)}
                                                        className="text-xs text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                                                      >
                                                        Cancel
                                                      </button>
                                                    </div>

                                                    {showEditCustomInput[q.id] && (
                                                      <div className="flex items-center gap-2 mt-1">
                                                        <input
                                                          type="text"
                                                          value={editCustomAnswers[q.id] !== undefined ? editCustomAnswers[q.id] : (q.answer || '')}
                                                          onChange={e => setEditCustomAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                                          onKeyDown={async (e) => {
                                                            if (e.key === 'Enter') {
                                                              const val = editCustomAnswers[q.id] !== undefined ? editCustomAnswers[q.id] : (q.answer || '');
                                                              await handleAnswerAccelerator(q.id, val);
                                                              setEditingAnswerQuestionId(null);
                                                            }
                                                          }}
                                                          placeholder="Type updated reply..."
                                                          className="flex-1 bg-[#3A3B3C] border border-[#4E4F50] rounded-full px-4 py-2 text-sm text-slate-100 outline-none focus:border-[#C7F33C]"
                                                        />
                                                        <button
                                                          type="button"
                                                          disabled={isAnsweringQuestionId === q.id || !(editCustomAnswers[q.id] !== undefined ? editCustomAnswers[q.id]?.trim() : q.answer?.trim())}
                                                          onClick={async () => {
                                                            const val = editCustomAnswers[q.id] !== undefined ? editCustomAnswers[q.id] : (q.answer || '');
                                                            await handleAnswerAccelerator(q.id, val);
                                                            setEditingAnswerQuestionId(null);
                                                          }}
                                                          className="px-5 py-2 rounded-full bg-[#C7F33C] text-black text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                                        >
                                                          Save
                                                        </button>
                                                      </div>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <div className="flex gap-3 items-start justify-between">
                                                    <div className="flex gap-3 items-start flex-1 min-w-0">
                                                      <div className="w-8 h-8 rounded-full bg-[#4E4F50] shrink-0 overflow-hidden mt-0.5">
                                                        <img
                                                          src={
                                                            q.answeredByImage ||
                                                            (q.answeredBy === session?.user?.name ? session?.user?.image : null) ||
                                                            (q.answeredBy === deal.owner.name ? deal.owner.image : null) ||
                                                            `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(q.answeredBy || 'User')}`
                                                          }
                                                          alt={q.answeredBy || 'User'}
                                                          className="w-full h-full object-cover"
                                                        />
                                                      </div>
                                                      <div className="flex flex-col flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                          <span className="text-sm font-bold text-slate-200">
                                                            {q.answeredBy || 'User'}
                                                          </span>
                                                          {q.answeredAt && (
                                                            <span className="text-xs text-slate-500">
                                                              • {formatDateTime(q.answeredAt)} {q.isEdited && <span className="text-amber-400/80 font-normal">(edited)</span>}
                                                            </span>
                                                          )}
                                                        </div>
                                                        <div className="mt-1.5 inline-block">
                                                          <div className="px-4 py-2 rounded-full bg-[#3A3B3C] border border-[#4E4F50] text-sm text-[#C7F33C] font-medium leading-normal inline-block">
                                                            &quot;{q.answer}&quot;
                                                          </div>
                                                        </div>
                                                      </div>
                                                    </div>

                                                    {canAnswerAccelerators && (
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          setEditingAnswerQuestionId(q.id);
                                                          setEditCustomAnswers(prev => ({ ...prev, [q.id]: q.answer || '' }));
                                                        }}
                                                        className="text-xs px-2.5 py-1 rounded-full text-slate-400 hover:text-slate-100 hover:bg-[#3A3B3C] border border-transparent hover:border-[#4E4F50] transition-all cursor-pointer shrink-0 flex items-center gap-1"
                                                        title="Edit your response"
                                                      >
                                                        <Pencil className="w-3 h-3" />
                                                        <span>Edit</span>
                                                      </button>
                                                    )}
                                                  </div>
                                                )}
                                              </div>

                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div className="p-4 rounded-2xl bg-[#252728] border border-[#4E4F50]/40 text-center">
                                        <p className="text-sm text-slate-400">No answered questions yet.</p>
                                      </div>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 1. Loading Initial State */}
                          {isLoadingDealSummary && (
                            <div className="flex flex-col gap-4 mt-2 w-full animate-pulse">
                              <div className="h-28 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]" />
                              <div className="h-24 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]" />
                              <div className="h-24 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]" />
                            </div>
                          )}

                          {/* 2. Generating in Progress */}
                          {!isLoadingDealSummary && isGeneratingSummary && (
                            <div className="flex flex-col items-center justify-center p-8 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] text-center gap-4">
                              <div className="w-14 h-14 rounded-2xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C] animate-pulse">
                                <Sparkles className="w-7 h-7 animate-spin" />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <h4 className="text-base font-semibold text-slate-100">Analyzing deal and recent activity logs...</h4>
                                <p className="text-xs text-slate-400 max-w-sm">
                                  Extracting key updates, customer discussions, blockers, and next steps with AI.
                                </p>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-[#C7F33C]">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Usually takes around 3–5 seconds</span>
                              </div>
                            </div>
                          )}

                          {/* 3. Empty State (No summary yet) */}
                          {!isLoadingDealSummary && !isGeneratingSummary && !dealSummaryResponse?.data && (
                            <div className="flex flex-col items-center justify-center p-8 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] text-center gap-5">
                              <div className="w-14 h-14 rounded-2xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C]">
                                <Sparkles className="w-7 h-7" />
                              </div>
                              <div className="flex flex-col gap-2 max-w-md">
                                <h4 className="text-lg font-bold text-slate-100">Instant Deal Summary</h4>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                  Save time reading lengthy activity logs. AI summarizes the current status, key highlights, blockers, and next steps in one click.
                                </p>
                              </div>

                              {summaryError && (
                                <div className="w-full max-w-md p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 text-left flex flex-col gap-2">
                                  <div className="flex items-center gap-2 font-medium text-amber-300">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>Alert</span>
                                  </div>
                                  <p className="text-[11px] leading-relaxed text-slate-300">{summaryError}</p>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={handleGenerateSummary}
                                disabled={isGeneratingSummary}
                                className="px-6 py-2.5 rounded-full bg-[#C7F33C] hover:bg-[#b0d635] text-black font-bold text-sm flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <Sparkles className="w-4 h-4" />
                                ✨ Summarize Deal
                              </button>
                            </div>
                          )}

                          {/* 4. Ready State (Summary Content) */}
                          {!isLoadingDealSummary && !isGeneratingSummary && dealSummaryResponse?.data && (
                            <div className="flex flex-col gap-4">
                              {/* Outdated Warning Notice */}
                              {dealSummaryResponse.isOutdated && (
                                <div className="p-3.5 bg-[#3A3B3C] border border-[#C7F33C]/50 rounded-2xl flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C] shrink-0">
                                      <Sparkles className="w-4 h-4" />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-100">
                                          มีกิจกรรมใหม่เพิ่มเข้ามาหลังจากการสรุปล่าสุด
                                        </span>
                                        {dealSummaryResponse.newerActivitiesCount && dealSummaryResponse.newerActivitiesCount > 0 ? (
                                          <span className="px-1.5 py-0.5 rounded-full bg-[#C7F33C] text-black font-bold text-[10px]">
                                            +{dealSummaryResponse.newerActivitiesCount} new
                                          </span>
                                        ) : null}
                                      </div>
                                      <p className="text-[11px] text-slate-400">
                                        เนื้อหาสรุปด้านล่างยังไม่ได้รวมกิจกรรมล่าสุด กด Re-Summarize เพื่ออัปเดต
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={isGeneratingSummary}
                                    onClick={handleGenerateSummary}
                                    className="px-3.5 py-1.5 rounded-xl bg-[#C7F33C] hover:bg-[#b0d635] text-black text-xs font-bold shrink-0 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingSummary ? 'animate-spin' : ''}`} />
                                    <span>Re-Summarize</span>
                                  </button>
                                </div>
                              )}

                              {summaryError && (
                                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2">
                                  <AlertCircle className="w-4 h-4 shrink-0" />
                                  <span>{summaryError}</span>
                                </div>
                              )}

                              {/* Section 1: CURRENT STATUS */}
                              {dealSummaryResponse.data.overview && (
                                <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                                    <span className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                                      CURRENT STATUS
                                    </span>
                                  </div>
                                  <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap font-normal">
                                    {dealSummaryResponse.data.overview}
                                  </p>
                                </div>
                              )}

                              {/* Section 2: KEY HIGHLIGHTS */}
                              {Array.isArray(dealSummaryResponse.data.keyHighlights) && dealSummaryResponse.data.keyHighlights.length > 0 && (
                                <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex flex-col gap-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                                    <span className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                                      KEY HIGHLIGHTS
                                    </span>
                                  </div>
                                  <ul className="flex flex-col gap-2">
                                    {dealSummaryResponse.data.keyHighlights.map((point, idx) => (
                                      <li key={idx} className="text-sm text-slate-100 leading-relaxed flex items-start gap-2.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] mt-1.5 shrink-0" />
                                        <span>{point}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Section 3: BLOCKERS & RISKS */}
                              {Array.isArray(dealSummaryResponse.data.blockers) && dealSummaryResponse.data.blockers.length > 0 && (
                                <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex flex-col gap-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                                    <span className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                                      BLOCKERS & RISKS
                                    </span>
                                  </div>
                                  <ul className="flex flex-col gap-2">
                                    {dealSummaryResponse.data.blockers.map((blocker, idx) => (
                                      <li key={idx} className="text-sm text-slate-100 leading-relaxed flex items-start gap-2.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                                        <span>{blocker}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Section 4: RECOMMENDED NEXT STEPS */}
                              {Array.isArray(dealSummaryResponse.data.nextSteps) && dealSummaryResponse.data.nextSteps.length > 0 && (
                                <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex flex-col gap-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                                    <span className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                                      RECOMMENDED NEXT STEPS
                                    </span>
                                  </div>
                                  <ul className="flex flex-col gap-2">
                                    {dealSummaryResponse.data.nextSteps.map((step, idx) => (
                                      <li key={idx} className="text-sm text-slate-100 leading-relaxed flex items-start gap-2.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] mt-2 shrink-0" />
                                        <span>{step}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Dynamic Dimensions from Custom JSON Schema */}
                              {Object.entries(dealSummaryResponse.data).map(([key, value]) => {
                                if (['overview', 'keyHighlights', 'blockers', 'nextSteps'].includes(key)) {
                                  return null;
                                }
                                if (value === undefined || value === null || value === '') return null;

                                const formattedTitle = key
                                  .replace(/([A-Z])/g, ' $1')
                                  .replace(/[_-]/g, ' ')
                                  .toUpperCase()
                                  .trim();

                                return (
                                  <div key={key} className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex flex-col gap-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                                      <span className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                                        {formattedTitle}
                                      </span>
                                    </div>
                                    {Array.isArray(value) ? (
                                      <ul className="flex flex-col gap-2">
                                        {value.map((item, idx) => (
                                          <li key={idx} className="text-sm text-slate-100 leading-relaxed flex items-start gap-2.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#C7F33C] mt-2 shrink-0" />
                                            <span>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : typeof value === 'object' ? (
                                      <pre className="text-xs text-slate-200 bg-[#252728] p-3 rounded-xl overflow-x-auto font-mono">
                                        {JSON.stringify(value, null, 2)}
                                      </pre>
                                    ) : (
                                      <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap font-normal">
                                        {String(value)}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Footer Actions */}
                              <div className="flex items-center justify-between pt-4 pb-6 border-t border-[#3A3B3C]">
                                <div className="flex items-center justify-between w-full">
                                  {dealSummaryResponse?.usage && (
                                    <div 
                                      className="text-xs px-2.5 py-2 rounded-xl bg-[#252728] text-slate-300 flex items-center gap-1.5 font-mono"
                                      title={`Tokens: ${dealSummaryResponse.usage.inputTokens.toLocaleString()} input, ${dealSummaryResponse.usage.outputTokens.toLocaleString()} output`}
                                    >
                                      <Zap className="w-3.5 h-3.5 text-[#C7F33C]" />
                                      <span>{dealSummaryResponse.usage.totalTokens.toLocaleString()} tokens</span>
                                      <span className="text-[#4E4F50]">•</span>
                                      <span className="text-[#C7F33C] font-semibold">
                                        ≈ {dealSummaryResponse.usage.costThb < 0.01 ? '<0.01' : dealSummaryResponse.usage.costThb.toFixed(2)} THB
                                      </span>
                                    </div>
                                  )}  
                                  <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={handleCopySummary}
                                    className="px-4 py-2 rounded-xl bg-[#3A3B3C] hover:bg-[#4E4F50] text-sm font-medium text-slate-200 hover:text-white flex items-center gap-2 transition-colors cursor-pointer border border-[#4E4F50]"
                                    title="Copy summary to clipboard"
                                  >
                                    {isCopiedSummary ? <Check className="w-4 h-4 text-[#C7F33C]" /> : <Copy className="w-4 h-4 text-slate-400" />}
                                    <span>{isCopiedSummary ? "Copied" : "Copy"}</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isGeneratingSummary}
                                    onClick={handleGenerateSummary}
                                    className="px-5 py-2 rounded-xl bg-[#C7F33C] hover:bg-[#b0d635] text-black font-bold text-sm flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                                    title="Re-analyze and update summary"
                                  >
                                    <RefreshCw className={`w-4 h-4 ${isGeneratingSummary ? 'animate-spin' : ''}`} />
                                    <span>{isGeneratingSummary ? 'Re-summarizing...' : 'Re-Summarize'}</span>
                                  </button>
                                  </div>  
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
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

                  {activeTab === 'activity' && hasMoreLogs && (
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
              <CustomerTab deal={deal} onClose={onClose} />
            )}

            {activeTab === 'notes' && (
              <NotesTab deal={deal} />
            )}

            {['sharedMedia'].includes(activeTab) && (
              <SharedMediaTab deal={deal} activityLogs={localActivityLogs} onImageClick={handleOpenPreview} />
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
      {previewLightbox && previewLightbox.images.length > 0 && (
        <div
          className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
          onClick={() => setPreviewLightbox(null)}
        >
          {/* Header Controls: Counter badge + Close button */}
          <div className="absolute top-6 inset-x-6 flex items-center justify-between z-10 pointer-events-none">
            {previewLightbox.images.length > 1 ? (
              <div className="bg-[#1C1C1D]/80 border border-[#3A3B3C] text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-md pointer-events-auto">
                {previewLightbox.currentIndex + 1} / {previewLightbox.images.length}
              </div>
            ) : <div />}

            <button
              type="button"
              className="p-2.5 rounded-full bg-[#1C1C1D]/80 border border-[#3A3B3C] text-slate-200 hover:bg-[#C7F33C] hover:text-black transition-all cursor-pointer pointer-events-auto shadow-lg"
              onClick={() => setPreviewLightbox(null)}
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Previous Button */}
          {previewLightbox.images.length > 1 && (
            <button
              type="button"
              className="absolute left-6 z-10 p-3 rounded-full bg-[#1C1C1D]/80 border border-[#3A3B3C] text-slate-200 hover:bg-[#C7F33C] hover:text-black transition-all cursor-pointer backdrop-blur-md shadow-2xl hover:scale-105 active:scale-95"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewLightbox(prev => {
                  if (!prev) return null;
                  const prevIdx = prev.currentIndex > 0 ? prev.currentIndex - 1 : prev.images.length - 1;
                  return { ...prev, currentIndex: prevIdx };
                });
              }}
              title="Previous (Left Arrow)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* Main Image */}
          <div className="relative max-w-full max-h-full flex items-center justify-center">
            <img
              key={previewLightbox.images[previewLightbox.currentIndex]}
              src={previewLightbox.images[previewLightbox.currentIndex]}
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl transition-all"
              onClick={e => e.stopPropagation()}
              alt={`Preview ${previewLightbox.currentIndex + 1}`}
            />
          </div>

          {/* Next Button */}
          {previewLightbox.images.length > 1 && (
            <button
              type="button"
              className="absolute right-6 z-10 p-3 rounded-full bg-[#1C1C1D]/80 border border-[#3A3B3C] text-slate-200 hover:bg-[#C7F33C] hover:text-black transition-all cursor-pointer backdrop-blur-md shadow-2xl hover:scale-105 active:scale-95"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewLightbox(prev => {
                  if (!prev) return null;
                  const nextIdx = prev.currentIndex < prev.images.length - 1 ? prev.currentIndex + 1 : 0;
                  return { ...prev, currentIndex: nextIdx };
                });
              }}
              title="Next (Right Arrow)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* Bottom Thumbnail Strip */}
          {previewLightbox.images.length > 1 && (
            <div 
              className="absolute bottom-6 inset-x-0 flex justify-center items-center gap-2 z-10 pointer-events-auto px-4 overflow-x-auto max-w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-[#1C1C1D]/80 border border-[#3A3B3C] p-1.5 rounded-2xl flex items-center gap-2 backdrop-blur-md shadow-xl">
                {previewLightbox.images.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPreviewLightbox(prev => prev ? { ...prev, currentIndex: idx } : null)}
                    className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                      idx === previewLightbox.currentIndex
                        ? "border-[#C7F33C] scale-105 shadow-md"
                        : "border-transparent opacity-50 hover:opacity-100 hover:border-slate-500"
                    }`}
                  >
                    <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
