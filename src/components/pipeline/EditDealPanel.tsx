"use client";

import { X, MoreHorizontal, MessageSquare, Trash2, BellRing, Send, Paperclip, Download, Loader2, RefreshCw, Sparkles, Copy, Check, AlertCircle, Bot, Zap, Target, ChevronLeft, ChevronRight, UserPlus, Save, Image as ImageIcon, Link2, FileText, ArrowRightLeft, PhoneCall } from "lucide-react";
import { OpportunityWithRelations } from "./KanbanCard";
import imageCompression from 'browser-image-compression';
import { useDropzone } from 'react-dropzone';

import { addActivityLog, removeTeamMember, addTeamMembers, editActivityLog, deleteActivityLog, addSystemLog, getOpportunityActivityLogs, updateDueDateWithLog, updateOpportunity } from "@/lib/actions/opportunity";
import { getLatestDealSummary, generateDealSummary, getDealSummaryPromptConfig, saveDealSummaryPromptConfig, resetDealSummaryPromptConfig } from "@/lib/actions/deal-summary";
import { getDealAccelerators, generateDealAccelerators, answerDealAccelerator, updateDealTargetGoal, createManagerCallQuestion, deleteDealAcceleratorQuestion, type DealAcceleratorsState, type AcceleratorQuestion } from "@/lib/actions/ai-accelerator";
import { getAllUsers } from "@/lib/actions/users";
import { requestDealTransfer } from "@/lib/actions/notification";
import { MemberSelectDrawer } from "./MemberSelectDrawer";
import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from "react";
import useSWR, { useSWRConfig, mutate, preload } from "swr";
import useSWRInfinite from "swr/infinite";
import { useSession } from "next-auth/react";
import { User, OpportunityType, Role } from "@prisma/client";
import { usePermissions } from "@/providers/PermissionProvider";
import { IconMap } from "@/lib/menu-registry";
import { useDialog } from "@/providers/DialogProvider";
import { getOpportunitySharedMedia } from "@/lib/actions/opportunity";
import { CustomerTab, type CustomerTabRef } from "./CustomerTab";
import { NotesTab } from "./NotesTab";
import { SharedMediaTab } from "./SharedMediaTab";
import { EditDealMainBar } from "./EditDealMainBar";
import { EditDealSubBar, SubBarTab, SubBarActionItem } from "./EditDealSubBar";
import { DealActionsDrawer } from "./DealActionsDrawer";
import { ChatAttachmentButton } from "./ChatAttachmentButton";
import { AcceleratorQuestionCard } from "./AcceleratorQuestionCard";
import { HighlightText } from "@/components/ui/HighlightText";
import { pusherClient } from "@/lib/pusher";
import { useSwipeToClose } from "@/hooks/useSwipeToClose";
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

const formatShortDueDate = (date: Date | string) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  const year = String(d.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
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

function ActivityComment({
  log,
  dealId,
  currentUser,
  refresh,
  mutateLogs,
  onReplyClick,
  onImageClick,
  searchQuery = '',
  acceleratorsState,
  onAnswerQuestion,
  onDeleteQuestion,
  canUseManagerCall = false,
}: {
  log: ActivityLogWithRelations;
  dealId: string;
  currentUser: { id: string; name?: string | null; image?: string | null; email?: string | null; role?: string };
  refresh: () => void;
  mutateLogs?: (data: (currentPages?: ActivityLogPage[]) => ActivityLogPage[] | undefined, opts?: { revalidate: boolean }) => void;
  onReplyClick?: (username: string) => void;
  onImageClick?: (url: string, index?: number, allUrls?: string[]) => void;
  searchQuery?: string;
  acceleratorsState?: DealAcceleratorsState;
  onAnswerQuestion?: (questionId: string, answer: string) => Promise<void>;
  onDeleteQuestion?: (questionId: string) => Promise<void> | void;
  canUseManagerCall?: boolean;
}) {
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

  // Urgent Call (Manager Call or AI) Unified Question Card
  if (log.content.startsWith('[URGENT_CALL:')) {
    const urgentCallMatch = log.content.match(/^\[URGENT_CALL:([^\]]+)\]\s*([\s\S]*)$/);
    const qId = urgentCallMatch ? urgentCallMatch[1] : '';
    const qText = urgentCallMatch ? urgentCallMatch[2].trim() : log.content;
    let targetQ = acceleratorsState?.questions?.find(q => q.id === qId && q.question.trim() === qText)
      || acceleratorsState?.questions?.find(q => q.id === qId && q.status === 'PENDING')
      || acceleratorsState?.questions?.find(q => q.id === qId);
    const replyLog = log.replies?.find(r => r.content.startsWith('[URGENT_REPLY:'));

    if (!targetQ) {
      // Fallback for optimistic logs or first-time sends before acceleratorsState finishes populating
      const isOptimistic = String(log.id).startsWith('opt_log_') || qId.startsWith('acc_mgr_');
      if (isOptimistic || !acceleratorsState) {
        targetQ = {
          id: qId || String(log.id),
          question: qText || log.content,
          reason: "คำถามด่วนจากฝ่ายบริหาร (Manager Call)",
          status: "PENDING",
          source: "MANAGER",
          createdAt: typeof log.createdAt === 'string' ? log.createdAt : new Date(log.createdAt).toISOString(),
          askedBy: log.user?.name || "Manager",
          askedByImage: log.user?.image || null,
        };
      } else {
        // หาก acceleratorsState โหลดแล้วและไม่ใช่ optimistic log แสดงว่าคำถามถูกลบหรือตอบไปแล้ว ไม่สร้างขึ้นมาใหม่
        return null;
      }
    } else if (!targetQ.answeredByImage && replyLog?.user?.image) {
      targetQ = {
        ...targetQ,
        answeredByImage: replyLog.user.image,
      };
    }

    // Manager Call / AI Accelerator ที่ตอบแล้ว ไม่ต้องแสดงในหน้า Activity feed (ให้ไปอยู่ที่ Manager Call > Answer History)
    if (targetQ.status === 'ANSWERED') {
      return null;
    }

    const nonUrgentReplies = log.replies?.filter(r => !r.content.startsWith('[URGENT_REPLY:')) || [];

    return (
      <div className="flex flex-col gap-2 my-2 w-full">
        <div className="flex flex-row-reverse gap-3 self-end w-full max-w-[95%] sm:max-w-[88%] ml-auto">
          {/* Avatar on Right */}
          <div className={`w-10 h-10 rounded-full shrink-0 overflow-hidden relative flex items-center justify-center shadow-md ${
            targetQ.source === 'AI'
              ? 'bg-purple-500/20 border-2 border-purple-500'
              : 'bg-amber-500/20 border-2 border-amber-500'
          }`}>
            {targetQ.source === 'AI' ? (
              <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
            ) : log.user?.image ? (
              <img src={log.user.image} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-black text-amber-400">
                {log.user?.name ? log.user.name.charAt(0).toUpperCase() : 'M'}
              </span>
            )}
          </div>

          {/* Unified Question Card (Same component as Manager Call Tab) */}
          <div className="flex-1 min-w-0">
            <AcceleratorQuestionCard
              question={targetQ}
              canDelete={canUseManagerCall}
              onDelete={onDeleteQuestion}
              onAnswer={onAnswerQuestion}
              variant="activity"
            />
          </div>
        </div>

        {/* Any manual non-urgent replies if any */}
        {nonUrgentReplies.length > 0 && (
          <div className="flex flex-col gap-2 mt-2 w-full pr-12 items-end">
            {nonUrgentReplies.map(reply => (
              <div key={reply.id} className="flex flex-row-reverse gap-2 max-w-[85%] items-start">
                <div className="w-7 h-7 rounded-full bg-[#4E4F50] shrink-0 overflow-hidden">
                  <img
                    src={reply.user?.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${reply.user?.name || reply.userId}`}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="bg-[#3A3B3C] rounded-2xl rounded-tr-sm p-2.5 text-left border border-[#4E4F50]">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-slate-200">{reply.user?.name || 'User'}</span>
                    <span className="text-xs text-slate-400">{formatDateTime(reply.createdAt)}</span>
                  </div>
                  <p className="text-xs text-slate-100 leading-normal">{reply.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

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
                <span className="text-xs font-bold text-slate-100">{log.user?.name || 'Unknown User'}</span>
                {dueDateMatch && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${dueDateMatch[1] === 'Removed' ? 'text-slate-300 bg-slate-600 border-slate-500' : 'text-pink-400 bg-pink-900/30 border-pink-900/50'}`}>
                    {dueDateMatch[1] === 'Removed' ? 'Due Date Removed' : `Due: ${dueDateMatch[1]}`}
                  </span>
                )}
              </div>

              {isEditing ? (
                <div className="flex flex-col gap-2 min-w-[250px]">
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="w-full bg-[#252728] border border-[#4E4F50] text-slate-100 rounded-lg p-2 text-xs min-h-[60px]"
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
                          <div className="text-xs text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
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
                                  <span className="text-xs font-semibold text-slate-200 truncate">{file.filename || "Attached file"}</span>
                                  <span className="text-xs text-slate-500 uppercase">File</span>
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
              <div className="relative flex items-center" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 hover:bg-[#4E4F50] rounded-full transition-colors flex items-center justify-center -ml-2 cursor-pointer"
                >
                  <MoreHorizontal className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200" />
                </button>

                {showMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-[#3A3B3C] border border-[#4E4F50] rounded-lg flex flex-col py-1 w-24 z-10">
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
                  acceleratorsState={acceleratorsState}
                  onAnswerQuestion={onAnswerQuestion}
                  onDeleteQuestion={onDeleteQuestion}
                  canUseManagerCall={canUseManagerCall}
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
                    className="w-full bg-transparent text-xs text-slate-100 focus:outline-none resize-none"
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

export type TabType = 'activity' | 'system' | 'collaborate' | 'information' | 'notes' | 'sharedMedia' | 'summary' | 'manager-call';

interface EditDealPanelProps {
  deal: OpportunityWithRelations;
  initialTab?: TabType;
  isOpen: boolean;
  onClose: () => void;
  onDealClosed?: (dealId: string, status: "WON" | "LOST") => void;
}

export function EditDealPanel({ deal, initialTab = 'activity', isOpen, onClose, onDealClosed }: EditDealPanelProps) {
  const { dragOffset, isDragging, isDismissed, swipeHandlers } = useSwipeToClose({
    onClose,
    isOpen,
  });
  const { mutate } = useSWRConfig();
  const [newLog, setNewLog] = useState("");
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, 28), 120);
    el.style.height = `${nextHeight}px`;
  };

  useEffect(() => {
    if (!newLog && inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [newLog]);
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const { visibleRightMenus, canSee, isAdmin: isPermAdmin } = usePermissions();
  const canUseSalesDeal = canSee("pipeline.information");
  const rawRightMenus = visibleRightMenus("pipeline");
  const rightMenus = rawRightMenus.filter(m => {
    if (m.key === 'pipeline.information') {
      return deal.type === 'SALES_DEAL';
    }
    return true;
  });

  // Try to find the initial tab matching a visible right menu, fallback to the first one available
  const allowedInitialTab = (initialTab === 'manager-call')
    ? 'manager-call'
    : rightMenus.find(m => m.key.endsWith(`.${initialTab}`)) ? initialTab : (rightMenus[0]?.key.split('.').pop() as TabType || 'activity');
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

  // Topic state
  const [topic, setTopic] = useState(deal.topic || 'Untitled Deal');

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

  const [isSearching, setIsSearching] = useState(false);
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);
  const hamburgerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleHamburgerClickOutside = (e: MouseEvent) => {
      if (hamburgerMenuRef.current && !hamburgerMenuRef.current.contains(e.target as Node)) {
        setShowHamburgerMenu(false);
      }
    };
    if (showHamburgerMenu) {
      document.addEventListener('mousedown', handleHamburgerClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleHamburgerClickOutside);
  }, [showHamburgerMenu]);

  // Users state for ownership transfer & member invite
  const [users, setUsers] = useState<Awaited<ReturnType<typeof getAllUsers>>>([]);
  const { data: allCachedUsers } = useSWR<Awaited<ReturnType<typeof getAllUsers>>>("all-users", getAllUsers, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  });
  const [isTransferring, setIsTransferring] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [prevDealId, setPrevDealId] = useState(deal.id);
  const [dealType, setDealType] = useState(deal.type);

  if (deal.id !== prevDealId) {
    setPrevDealId(deal.id);
    setDealType(deal.type);
  }

  const { data: session } = useSession();
  const isAdmin = Boolean(isPermAdmin || (session?.user as Record<string, unknown>)?.role === "ADMIN");
  const isOwner = Boolean(
    (session?.user?.id && (session.user.id === deal.ownerId || session.user.id === deal.owner?.id)) ||
    (session?.user?.email && deal.owner?.email && session.user.email.toLowerCase() === deal.owner.email.toLowerCase())
  );
  const isTeamMember = Boolean(
    deal.teamMembers?.some(tm => 
      (session?.user?.id && tm.id === session.user.id) ||
      (session?.user?.email && tm.email && session.user.email.toLowerCase() === tm.email.toLowerCase())
    )
  );
  const userRole = (session?.user as Record<string, unknown>)?.role as string | undefined;
  const userDepartments = ((session?.user as Record<string, unknown>)?.departments as string[]) || [];
  const isManagerOfOwner = Boolean(
    userRole === "MANAGEMENT" &&
    (deal.owner as { departments?: { id: string; name: string }[] })?.departments?.some(d => userDepartments.includes(d.name))
  );
  const canInvite = isOwner || isTeamMember || isAdmin;
  const canDelete = isAdmin || isOwner;
  const canCloseDeal = (isAdmin || isOwner || isManagerOfOwner) && deal.status === "OPEN";
  const canConvert = deal.status === "OPEN" && dealType === 'INTERNAL_TASK' && (isOwner || isAdmin || isManagerOfOwner) && (canUseSalesDeal || isAdmin);
  const hasCardActions = Boolean(canCloseDeal || canConvert || canDelete);
  const canEditDueDate = isOwner || isAdmin;
  const canUseManagerCall = Boolean(isAdmin || isManagerOfOwner);

  const [isManagerCallMode, setIsManagerCallMode] = useState(false);
  const [isSendingManagerCall, setIsSendingManagerCall] = useState(false);
  const isSendingManagerCallRef = useRef(false);
  const isSubmittingLogRef = useRef(false);
  const isManagerCallModeRef = useRef(false);

  useEffect(() => {
    isManagerCallModeRef.current = isManagerCallMode;
  }, [isManagerCallMode]);

  // Card Actions Drawer State (Standard Component)
  const [isActionsDrawerOpen, setIsActionsDrawerOpen] = useState(false);

  // Tab Sub-States
  const [sharedMediaSubTab, setSharedMediaSubTab] = useState<"images" | "links" | "files">("images");
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [isSearchingNotes, setIsSearchingNotes] = useState(false);
  const customerTabRef = useRef<CustomerTabRef>(null);
  const [isSavingCustomerTab, setIsSavingCustomerTab] = useState(false);

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
    isOpen ? ['deal-summary-on-demand', deal.id] : null,
    ([, id]) => getLatestDealSummary(id),
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isCopiedSummary, setIsCopiedSummary] = useState(false);

  // AI Deal Accelerators State
  const {
    data: acceleratorsResponse,
    mutate: mutateAccelerators,
  } = useSWR(
    isOpen ? ['deal-accelerators', deal.id] : null,
    ([, id]) => getDealAccelerators(id),
    { revalidateOnFocus: false, dedupingInterval: 5000 }
  );

  // Idle Background Preloader: warms caches for Shared Media & AI Summary (0ms tab switch)
  useEffect(() => {
    if (!isOpen || !deal?.id) return;
    const timer = setTimeout(() => {
      void preload(['opportunity-shared-media', deal.id], () => getOpportunitySharedMedia(deal.id));
      void preload(['deal-summary-on-demand', deal.id], () => getLatestDealSummary(deal.id));
    }, 150);
    return () => clearTimeout(timer);
  }, [isOpen, deal?.id]);

  const acceleratorsState = acceleratorsResponse?.data;
  const [isGeneratingAccelerators, setIsGeneratingAccelerators] = useState(false);
  const [isAnsweringQuestionId, setIsAnsweringQuestionId] = useState<string | null>(null);
  const [isDeletingQuestionId, setIsDeletingQuestionId] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState('');
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const goalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const saveGoalDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const adjustGoalTextareaHeight = useCallback(() => {
    if (goalTextareaRef.current) {
      goalTextareaRef.current.style.height = 'auto';
      goalTextareaRef.current.style.height = `${goalTextareaRef.current.scrollHeight}px`;
    }
  }, []);

  // Sync goalInput during render when source goal updates (avoids cascading render effect)
  const currentGoal = acceleratorsState?.targetGoal || deal.topic || '';
  const [prevSourceGoal, setPrevSourceGoal] = useState(currentGoal);
  if (currentGoal !== prevSourceGoal) {
    setPrevSourceGoal(currentGoal);
    setGoalInput(currentGoal);
  }

  useLayoutEffect(() => {
    if (activeTab === 'manager-call') {
      adjustGoalTextareaHeight();
    }
  }, [activeTab, goalInput, adjustGoalTextareaHeight]);

  // Revalidate accelerators state when entering Manager tab only if data is not yet loaded
  useEffect(() => {
    if (isOpen && activeTab === 'manager-call' && !acceleratorsResponse?.data) {
      void mutateAccelerators();
    }
  }, [isOpen, activeTab, mutateAccelerators, acceleratorsResponse?.data]);

  const [acceleratorTab, setAcceleratorTab] = useState<'pending' | 'answered'>('pending');

  // Deduplicate pending and answered questions so no duplicate cards ever render in the Manager tab
  const { pendingQuestions, answeredQuestions } = useMemo(() => {
    const rawQuestions = acceleratorsState?.questions || [];

    // 1. Collect all answered question texts (trimmed, lowercased)
    const answeredMap = new Map<string, AcceleratorQuestion>();
    for (const q of rawQuestions) {
      if (q.status === 'ANSWERED') {
        const key = q.question.trim().toLowerCase();
        if (!answeredMap.has(key) || new Date(q.answeredAt || q.createdAt || 0) > new Date(answeredMap.get(key)!.answeredAt || answeredMap.get(key)!.createdAt || 0)) {
          answeredMap.set(key, q);
        }
      }
    }

    // 2. Pending questions: exclude any question text that was already answered, and keep only 1 pending per question text
    const pendingMap = new Map<string, AcceleratorQuestion>();
    for (const q of rawQuestions) {
      if (q.status === 'PENDING') {
        const key = q.question.trim().toLowerCase();
        if (answeredMap.has(key)) continue;
        if (!pendingMap.has(key) || new Date(q.createdAt || 0) > new Date(pendingMap.get(key)!.createdAt || 0)) {
          pendingMap.set(key, q);
        }
      }
    }

    return {
      pendingQuestions: Array.from(pendingMap.values()),
      answeredQuestions: Array.from(answeredMap.values()),
    };
  }, [acceleratorsState?.questions]);
  const pendingQuestionsCount = pendingQuestions.length;

  // Smart transition: when pending reaches 0, default to answered tab if history exists (render-time synchronization)
  const [prevPendingCount, setPrevPendingCount] = useState(pendingQuestions.length);
  if (pendingQuestions.length !== prevPendingCount) {
    setPrevPendingCount(pendingQuestions.length);
    if (pendingQuestions.length === 0 && answeredQuestions.length > 0) {
      setAcceleratorTab('answered');
    }
  }

  // Pure clock state for live elapsed wait timer
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    if (pendingQuestions.length === 0) return;
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, [pendingQuestions.length]);

  const getElapsedWaitText = () => {
    if (!pendingQuestions || pendingQuestions.length === 0) return '';
    let earliestCreatedAt: Date | null = null;
    for (const q of pendingQuestions) {
      if (q.createdAt) {
        const d = new Date(q.createdAt);
        if (!earliestCreatedAt || d < earliestCreatedAt) {
          earliestCreatedAt = d;
        }
      }
    }
    if (!earliestCreatedAt) return '';
    const diffMs = Math.max(0, currentTime - earliestCreatedAt.getTime());
    const diffSec = Math.floor(diffMs / 1000);
    const days = Math.floor(diffSec / (24 * 3600));
    const hours = Math.floor((diffSec % (24 * 3600)) / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    const pad = (n: number) => n.toString().padStart(2, '0');

    if (days > 0) {
      return `${days}DAY | ${pad(hours)}:${pad(minutes)}`;
    }
    return `${pad(hours)}:${pad(minutes)}`;
  };

  const handleSendManagerCall = async () => {
    if (isSendingManagerCallRef.current || !newLog.trim()) return;
    const questionText = newLog.trim();
    isSendingManagerCallRef.current = true;
    setIsSendingManagerCall(true);

    // 1. Clear input immediately synchronously
    setNewLog('');
    if (inputRef.current) {
      inputRef.current.value = '';
      adjustTextareaHeight(inputRef.current);
    }
    setIsManagerCallMode(false);
    isManagerCallModeRef.current = false;

    // 2. Optimistic UI (< 10ms): Render question instantly without waiting for network
    const optimisticQId = `acc_mgr_${Date.now()}`;
    const optimisticQuestion: AcceleratorQuestion = {
      id: optimisticQId,
      question: questionText,
      reason: "คำถามด่วนจากฝ่ายบริหาร (Manager Call)",
      status: "PENDING",
      source: "MANAGER",
      createdAt: new Date().toISOString(),
      askedBy: session?.user?.name || "Manager",
      askedByImage: session?.user?.image || null,
    };

    const previousState = acceleratorsResponse;
    const baseState: DealAcceleratorsState = acceleratorsState || {
      targetGoal: deal.topic || 'บรรลุเป้าหมายการ์ด',
      goalSource: 'AI_INFERRED',
      questions: [],
    };
    const newState: DealAcceleratorsState = {
      ...baseState,
      questions: [...(baseState.questions || []), optimisticQuestion],
      updatedAt: new Date().toISOString(),
    };
    void mutate(['deal-accelerators', deal.id], { success: true, data: newState }, false);
    void mutateAccelerators({ success: true, data: newState }, false);

    const optimisticLog = {
      id: `opt_log_${Date.now()}`,
      content: `[URGENT_CALL:${optimisticQId}] ${questionText}`,
      type: "COMMENT",
      opportunityId: deal.id,
      userId: session?.user?.id || "",
      createdAt: new Date(),
      updatedAt: new Date(),
      isEdited: false,
      parentId: null,
      user: {
        id: session?.user?.id || "",
        name: session?.user?.name || "Manager",
        email: session?.user?.email || null,
        image: session?.user?.image || null,
        role: ((session?.user as Record<string, unknown>)?.role || "MANAGEMENT") as Role,
      },
      replies: [],
    } as unknown as ActivityLogWithRelations;

    if (loadActivityLogs) {
      void loadActivityLogs(
        (currentPages) => {
          if (!currentPages || currentPages.length === 0) {
            return [{ data: [optimisticLog] }];
          }
          return [
            {
              ...currentPages[0],
              data: [optimisticLog, ...currentPages[0].data],
            },
            ...currentPages.slice(1),
          ];
        },
        false
      );
    }

    // Optimistically increment badge count preserving object structure
    void mutate(
      key => Array.isArray(key) && key[0] === 'pending-accelerators',
      (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) => {
        if (!prevMap) return prevMap;
        const current = prevMap[deal.id];
        const currentCount = typeof current === 'number' ? current : (current?.count || 0);
        const nextCount = currentCount + 1;
        return {
          ...prevMap,
          [deal.id]: {
            count: nextCount,
            earliestPendingAt: current?.earliestPendingAt || new Date().toISOString(),
          },
        };
      },
      false
    );

    // Rollback helper for pending-accelerators badge
    const rollbackPendingBadge = () => {
      void mutate(
        key => Array.isArray(key) && key[0] === 'pending-accelerators',
        (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) => {
          if (!prevMap) return prevMap;
          const current = prevMap[deal.id];
          const currentCount = typeof current === 'number' ? current : (current?.count || 0);
          const nextCount = Math.max(0, currentCount - 1);
          return {
            ...prevMap,
            [deal.id]: {
              count: nextCount,
              earliestPendingAt: nextCount > 0 ? (current?.earliestPendingAt || null) : null,
            },
          };
        },
        false
      );
    };

    // 3. Fire server action in background with deterministic optimisticQId (zero UI delay, no ID mismatch)
    try {
      console.log('[MGR-CALL-UI] Submitting createManagerCallQuestion:', { dealId: deal.id, questionText, optimisticQId });
      const res = await createManagerCallQuestion(deal.id, questionText, optimisticQId);
      console.log('[MGR-CALL-UI] createManagerCallQuestion response:', res);
      if (!res.success) {
        console.error('Failed to send manager call:', res.error);
        if (previousState) {
          void mutate(['deal-accelerators', deal.id], previousState, false);
          void mutateAccelerators(previousState, false);
        }
        rollbackPendingBadge();
        void loadActivityLogs();
        setNewLog(questionText);
        toast({ title: 'ส่งคำถามไม่สำเร็จ', description: res.error || 'เกิดข้อผิดพลาดในการส่งคำถามด่วน', type: 'error' });
        return;
      }
      if (res.data) {
        void mutate(['deal-accelerators', deal.id], { success: true, data: res.data }, false);
        void mutateAccelerators({ success: true, data: res.data }, false);
      }
    } catch (err) {
      console.error('Failed to send manager call:', err);
      if (previousState) {
        void mutate(['deal-accelerators', deal.id], previousState, false);
        void mutateAccelerators(previousState, false);
      }
      rollbackPendingBadge();
      void loadActivityLogs();
      setNewLog(questionText);
      const errMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งคำถามด่วน';
      toast({ title: 'ส่งคำถามไม่สำเร็จ', description: errMsg, type: 'error' });
    } finally {
      setIsSendingManagerCall(false);
      isSendingManagerCallRef.current = false;
    }
  };

  const handleAnswerAccelerator = async (questionId: string, answer: string) => {
    if (!answer.trim() || isAnsweringQuestionId) return;
    const cleanAnswer = answer.trim();
    setIsAnsweringQuestionId(questionId);
    const previousState = acceleratorsResponse;

    // 1. Optimistic UI update (< 10ms)
    if (acceleratorsState) {
      const targetQ = acceleratorsState.questions?.find(q => q.id === questionId);
      const targetText = targetQ?.question?.trim()?.toLowerCase();

      const updatedQuestions = (acceleratorsState.questions || []).map(q => {
        if (q.id === questionId || (targetText && q.question.trim().toLowerCase() === targetText)) {
          return {
            ...q,
            status: 'ANSWERED' as const,
            answer: cleanAnswer,
            answeredBy: session?.user?.name || 'คุณ',
            answeredByImage: session?.user?.image || null,
            answeredAt: new Date().toISOString(),
          };
        }
        return q;
      });

      // Deduplicate answered questions so only 1 entry per question text exists
      const seen = new Set<string>();
      const dedupedQuestions: AcceleratorQuestion[] = [];
      for (const q of updatedQuestions) {
        if (q.status === 'ANSWERED') {
          const key = q.question.trim().toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
        }
        dedupedQuestions.push(q);
      }

      const optimisticState = {
        ...acceleratorsState,
        questions: dedupedQuestions,
        updatedAt: new Date().toISOString(),
      };
      void mutate(['deal-accelerators', deal.id], { success: true, data: optimisticState }, false);
      void mutateAccelerators({ success: true, data: optimisticState }, false);

      // Optimistically decrement pending counter on board preserving object structure
      void mutate(
        key => Array.isArray(key) && key[0] === 'pending-accelerators',
        (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) => {
          if (!prevMap) return prevMap;
          const current = prevMap[deal.id];
          const currentCount = typeof current === 'number' ? current : (current?.count || 0);
          const nextCount = Math.max(0, currentCount - 1);
          return {
            ...prevMap,
            [deal.id]: {
              count: nextCount,
              earliestPendingAt: nextCount > 0 ? (current?.earliestPendingAt || null) : null,
            },
          };
        },
        false
      );

      // Optimistically remove the urgent call log from local activity logs
      if (loadActivityLogs) {
        void loadActivityLogs(
          (currentPages) => {
            if (!currentPages) return currentPages;
            return currentPages.map((page) => ({
              ...page,
              data: page.data.filter(l => {
                if (l.content.startsWith(`[URGENT_CALL:${questionId}]`)) return false;
                if (targetQ && l.content.startsWith(`[URGENT_CALL:${targetQ.id}]`)) return false;
                if (targetText && l.content.startsWith('[URGENT_CALL:') && l.content.toLowerCase().includes(targetText)) return false;
                return true;
              }),
            }));
          },
          false
        );
      }
    }

    const rollbackAnswerPendingBadge = () => {
      void mutate(
        key => Array.isArray(key) && key[0] === 'pending-accelerators',
        (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) => {
          if (!prevMap) return prevMap;
          const current = prevMap[deal.id];
          const currentCount = typeof current === 'number' ? current : (current?.count || 0);
          const nextCount = currentCount + 1;
          return {
            ...prevMap,
            [deal.id]: {
              count: nextCount,
              earliestPendingAt: current?.earliestPendingAt || new Date().toISOString(),
            },
          };
        },
        false
      );
    };

    // 2. Fire server action in background without blocking UI or triggering redundant GET re-fetches
    try {
      const res = await answerDealAccelerator(deal.id, questionId, cleanAnswer);
      if (res.success && res.data) {
        void mutate(['deal-accelerators', deal.id], { success: true, data: res.data }, false);
        void mutateAccelerators({ success: true, data: res.data }, false);
      } else {
        console.error('Failed to answer accelerator:', res.error);
        if (previousState) {
          void mutate(['deal-accelerators', deal.id], previousState, false);
          void mutateAccelerators(previousState, false);
        }
        rollbackAnswerPendingBadge();
        void loadActivityLogs();
        toast({ title: 'บันทึกคำตอบไม่สำเร็จ', description: res.error || 'เกิดข้อผิดพลาดในการบันทึกคำตอบ', type: 'error' });
      }
    } catch (err) {
      console.error('Failed to answer accelerator:', err);
      if (previousState) {
        void mutate(['deal-accelerators', deal.id], previousState, false);
        void mutateAccelerators(previousState, false);
      }
      rollbackAnswerPendingBadge();
      void loadActivityLogs();
      const errMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกคำตอบ';
      toast({ title: 'บันทึกคำตอบไม่สำเร็จ', description: errMsg, type: 'error' });
    } finally {
      setIsAnsweringQuestionId(null);
    }
  };

  const handleDeleteAcceleratorQuestion = async (questionId: string) => {
    if (isDeletingQuestionId) return;
    setIsDeletingQuestionId(questionId);
    const targetQ = acceleratorsState?.questions?.find(q => q.id === questionId);
    const isPendingQ = targetQ?.status === 'PENDING';

    const rollbackDeletePendingBadge = () => {
      if (!isPendingQ) return;
      void mutate(
        key => Array.isArray(key) && key[0] === 'pending-accelerators',
        (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) => {
          if (!prevMap) return prevMap;
          const current = prevMap[deal.id];
          const currentCount = typeof current === 'number' ? current : (current?.count || 0);
          const nextCount = currentCount + 1;
          return {
            ...prevMap,
            [deal.id]: {
              count: nextCount,
              earliestPendingAt: current?.earliestPendingAt || new Date().toISOString(),
            },
          };
        },
        false
      );
    };

    try {
      const previousState = acceleratorsResponse;

      // 1. Optimistically remove question from Accelerators State
      if (previousState?.data) {
        const updatedQuestions = previousState.data.questions.filter(q => q.id !== questionId);
        const newState = { ...previousState.data, questions: updatedQuestions };
        void mutate(['deal-accelerators', deal.id], { success: true, data: newState }, false);
        void mutateAccelerators({ success: true, data: newState }, false);
      }

      // 2. If it was pending, optimistically decrement badge count preserving object structure
      if (isPendingQ) {
        void mutate(
          key => Array.isArray(key) && key[0] === 'pending-accelerators',
          (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) => {
            if (!prevMap) return prevMap;
            const current = prevMap[deal.id];
            const currentCount = typeof current === 'number' ? current : (current?.count || 0);
            const nextCount = Math.max(0, currentCount - 1);
            return {
              ...prevMap,
              [deal.id]: {
                count: nextCount,
                earliestPendingAt: nextCount > 0 ? (current?.earliestPendingAt || null) : null,
              },
            };
          },
          false
        );
      }

      // 3. Optimistically remove from local activity logs
      if (loadActivityLogs) {
        void loadActivityLogs(
          (currentPages) => {
            if (!currentPages) return currentPages;
            return currentPages.map((page) => ({
              ...page,
              data: page.data.filter(l => !l.content.startsWith(`[URGENT_CALL:${questionId}]`)),
            }));
          },
          false
        );
      }

      // 4. Fire server action in background without re-fetching all deals or logs
      const res = await deleteDealAcceleratorQuestion(deal.id, questionId);
      if (!res.success) {
        console.error('Failed to delete question:', res.error);
        if (previousState) {
          void mutate(['deal-accelerators', deal.id], previousState, false);
          void mutateAccelerators(previousState, false);
        }
        rollbackDeletePendingBadge();
        void loadActivityLogs();
        toast({ title: 'ลบคำถามไม่สำเร็จ', description: res.error || 'เกิดข้อผิดพลาดในการลบคำถาม', type: 'error' });
      } else if (res.data) {
        void mutate(['deal-accelerators', deal.id], { success: true, data: res.data }, false);
        void mutateAccelerators({ success: true, data: res.data }, false);
      }
    } catch (err) {
      console.error('Failed to delete question:', err);
      if (acceleratorsResponse) {
        void mutate(['deal-accelerators', deal.id], acceleratorsResponse, false);
        void mutateAccelerators(acceleratorsResponse, false);
      }
      rollbackDeletePendingBadge();
      void loadActivityLogs();
      const errMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบคำถาม';
      toast({ title: 'ลบคำถามไม่สำเร็จ', description: errMsg, type: 'error' });
    } finally {
      setIsDeletingQuestionId(null);
    }
  };

  const handleRefreshAccelerators = async () => {
    setIsGeneratingAccelerators(true);
    try {
      const res = await generateDealAccelerators(deal.id, acceleratorsState?.targetGoal);
      if (res.success && res.data) {
        const newAiQuestions = (res.data.questions || []).filter(q => q.source === 'AI' && q.status === 'PENDING');
        const oldPendingAiIds = new Set(
          (acceleratorsState?.questions || [])
            .filter(q => q.source === 'AI' && q.status === 'PENDING')
            .map(q => q.id)
        );

        // Optimistically synchronize ActivityLog in memory to prevent duplicate cards during DB roundtrip
        if (loadActivityLogs) {
          const newAiLogs = newAiQuestions.map(q => ({
            id: `synth_log_${q.id}`,
            content: `[URGENT_CALL:${q.id}] ${q.question}`,
            type: 'COMMENT',
            opportunityId: deal.id,
            userId: session?.user?.id || '',
            createdAt: new Date(),
            updatedAt: new Date(),
            isEdited: false,
            parentId: null,
            user: {
              id: session?.user?.id || '',
              name: 'AI Assistant',
              image: null,
              email: null,
              role: 'ADMIN' as Role,
            },
            replies: [],
          })) as unknown as ActivityLogWithRelations[];

          void loadActivityLogs(
            (currentPages) => {
              if (!currentPages || currentPages.length === 0) {
                return [{ data: newAiLogs }];
              }
              const cleanedPages = currentPages.map(page => ({
                ...page,
                data: page.data.filter(l => {
                  if (!l.content.startsWith('[URGENT_CALL:')) return true;
                  const match = l.content.match(/^\[URGENT_CALL:([^\]]+)\]/);
                  const id = match ? match[1] : '';
                  return !oldPendingAiIds.has(id);
                }),
              }));
              cleanedPages[0] = {
                ...cleanedPages[0],
                data: [...newAiLogs, ...cleanedPages[0].data],
              };
              return cleanedPages;
            },
            false
          );
        }

        void mutate(['deal-accelerators', deal.id], { success: true, data: res.data }, false);
        await mutateAccelerators({ success: true, data: res.data }, false);

        const pendingCount = (res.data.questions || []).filter(q => q.status === 'PENDING').length;
        void mutate(
          key => Array.isArray(key) && key[0] === 'pending-accelerators',
          (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) => {
            if (!prevMap) return prevMap;
            const current = prevMap[deal.id];
            if (pendingCount === 0) {
              const next = { ...prevMap };
              delete next[deal.id];
              return next;
            }
            return {
              ...prevMap,
              [deal.id]: {
                count: pendingCount,
                earliestPendingAt: current?.earliestPendingAt || new Date().toISOString(),
              },
            };
          },
          false
        );
      } else {
        console.error('Failed to generate accelerators:', res.error);
        toast({ title: 'AI Accelerator Error', description: res.error || 'ไม่สามารถสร้างคำถาม AI ได้', type: 'error' });
      }
    } catch (err) {
      console.error('Failed to generate accelerators:', err);
      const errMsg = err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อกับ AI ได้';
      toast({ title: 'AI Accelerator Error', description: errMsg, type: 'error' });
    } finally {
      setIsGeneratingAccelerators(false);
    }
  };

  const handleAutoSaveGoal = useCallback((newGoal: string) => {
    if (saveGoalDebounceRef.current) {
      clearTimeout(saveGoalDebounceRef.current);
    }
    saveGoalDebounceRef.current = setTimeout(async () => {
      const trimmed = newGoal.trim();
      if (!trimmed || trimmed === acceleratorsState?.targetGoal) return;
      setIsSavingGoal(true);
      try {
        const res = await updateDealTargetGoal(deal.id, trimmed);
        if (res.success && res.data) {
          void mutate(['deal-accelerators', deal.id], { success: true, data: res.data }, false);
          await mutateAccelerators({ success: true, data: res.data }, false);
        }
      } catch (err) {
        console.error("Failed to auto-save target goal:", err);
      } finally {
        setIsSavingGoal(false);
      }
    }, 800);
  }, [deal.id, acceleratorsState?.targetGoal, mutate, mutateAccelerators]);

  const handleBlurGoal = async () => {
    if (saveGoalDebounceRef.current) {
      clearTimeout(saveGoalDebounceRef.current);
    }
    const trimmed = goalInput.trim();
    if (!trimmed || trimmed === acceleratorsState?.targetGoal) return;
    setIsSavingGoal(true);
    try {
      const res = await updateDealTargetGoal(deal.id, trimmed);
      if (res.success && res.data) {
        void mutate(['deal-accelerators', deal.id], { success: true, data: res.data }, false);
        await mutateAccelerators({ success: true, data: res.data }, false);
      }
    } catch (err) {
      console.error("Failed to save target goal on blur:", err);
    } finally {
      setIsSavingGoal(false);
    }
  };

  // Admin Prompt Configuration State
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
            const pCount = (accRes.data.questions || []).filter(q => q.status === 'PENDING').length;
            void mutate(
              key => Array.isArray(key) && key[0] === 'pending-accelerators',
              (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) => {
                if (!prevMap) return prevMap;
                const current = prevMap[deal.id];
                if (pCount === 0) {
                  const next = { ...prevMap };
                  delete next[deal.id];
                  return next;
                }
                return {
                  ...prevMap,
                  [deal.id]: {
                    count: pCount,
                    earliestPendingAt: current?.earliestPendingAt || new Date().toISOString(),
                  },
                };
              },
              false
            );
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
    const channelName = `private-pipeline-${session.user.id}`;
    console.log(`[PANEL-PUSHER] Subscribing to: "${channelName}" for deal (id=${deal.id})`);
    const channel = pusherClient.subscribe(channelName);

    const onSubSucceeded = () => {
      console.log(`[PANEL-PUSHER] Subscribed successfully to: "${channelName}"`);
    };
    const onSubError = (status: unknown) => {
      console.warn(`[PANEL-PUSHER] Subscription issue for channel "${channelName}":`, status);
    };
    channel.bind('pusher:subscription_succeeded', onSubSucceeded);
    channel.bind('pusher:subscription_error', onSubError);

    const handleUpdate = (data?: ActivityUpdateEvent & {
      dealId?: string;
      action?: string;
      state?: DealAcceleratorsState;
      pendingCount?: number;
      question?: AcceleratorQuestion;
      questions?: AcceleratorQuestion[];
      deletedQuestionId?: string;
      questionId?: string;
      answeredQuestion?: AcceleratorQuestion;
    }) => {
      console.log(`[PANEL-PUSHER] Received event: action="${data?.action}" dealId="${data?.dealId}" (current deal.id="${deal.id}")`);
      if (data?.dealId === deal.id) {
        if (data?.action?.startsWith('ACTIVITY_')) {
          loadActivityLogs(pages => applyActivityEvent(pages, data as ActivityUpdateEvent), { revalidate: false });
          void mutate(['opportunity-shared-media', deal.id]);
        } else if (data?.action === 'DEAL_SUMMARY_UPDATED') {
          void mutate(['deal-summary-on-demand', deal.id]);
        } else if (data?.action === 'DEAL_ACCELERATORS_UPDATED') {
          if (data?.state) {
            void mutate(['deal-accelerators', deal.id], { success: true, data: data.state }, false);
            void mutateAccelerators({ success: true, data: data.state }, false);
          } else {
            void mutate(['deal-accelerators', deal.id]);
            void mutateAccelerators();
          }

          // Realtime in-memory Activity feed delta update (0ms sync across all connected clients)
          if (loadActivityLogs) {
            const questionToAdd = data?.question || (data?.questions && data.questions[0]);
            const deletedQId = data?.deletedQuestionId || data?.questionId;

            void loadActivityLogs(
              (currentPages) => {
                if (!currentPages || currentPages.length === 0) {
                  if (questionToAdd && questionToAdd.status === 'PENDING') {
                    const syntheticLog = {
                      id: `pusher_log_${questionToAdd.id}`,
                      content: `[URGENT_CALL:${questionToAdd.id}] ${questionToAdd.question}`,
                      type: 'COMMENT',
                      opportunityId: deal.id,
                      userId: questionToAdd.askedByUserId || '',
                      createdAt: questionToAdd.createdAt ? new Date(questionToAdd.createdAt) : new Date(),
                      updatedAt: questionToAdd.createdAt ? new Date(questionToAdd.createdAt) : new Date(),
                      isEdited: false,
                      parentId: null,
                      user: {
                        id: questionToAdd.askedByUserId || '',
                        name: questionToAdd.askedBy || (questionToAdd.source === 'MANAGER' ? 'Manager' : 'AI Assistant'),
                        image: questionToAdd.askedByImage || null,
                        email: null,
                        role: (questionToAdd.source === 'MANAGER' ? 'MANAGEMENT' : 'ADMIN') as Role,
                      },
                      replies: [],
                    } as unknown as ActivityLogWithRelations;
                    return [{ data: [syntheticLog] }];
                  }
                  return currentPages;
                }

                let updatedPages = currentPages;
                // 1. If a question was deleted or answered, remove its log immediately
                if (deletedQId) {
                  updatedPages = updatedPages.map(page => ({
                    ...page,
                    data: page.data.filter(l => !l.content.startsWith(`[URGENT_CALL:${deletedQId}]`)),
                  }));
                }
                if (data?.answeredQuestion?.question) {
                  const answeredText = data.answeredQuestion.question.trim().toLowerCase();
                  updatedPages = updatedPages.map(page => ({
                    ...page,
                    data: page.data.filter(l => {
                      if (data.answeredQuestion?.id && l.content.startsWith(`[URGENT_CALL:${data.answeredQuestion.id}]`)) return false;
                      if (l.content.startsWith('[URGENT_CALL:') && l.content.toLowerCase().includes(answeredText)) return false;
                      return true;
                    }),
                  }));
                }

                // 2. If a new pending question was received, prepend synthetic log if not present
                if (questionToAdd && questionToAdd.status === 'PENDING') {
                  const alreadyExists = updatedPages.some(page =>
                    page.data.some(l => l.content.startsWith(`[URGENT_CALL:${questionToAdd.id}]`))
                  );
                  if (!alreadyExists) {
                    const syntheticLog = {
                      id: `pusher_log_${questionToAdd.id}`,
                      content: `[URGENT_CALL:${questionToAdd.id}] ${questionToAdd.question}`,
                      type: 'COMMENT',
                      opportunityId: deal.id,
                      userId: questionToAdd.askedByUserId || '',
                      createdAt: questionToAdd.createdAt ? new Date(questionToAdd.createdAt) : new Date(),
                      updatedAt: questionToAdd.createdAt ? new Date(questionToAdd.createdAt) : new Date(),
                      isEdited: false,
                      parentId: null,
                      user: {
                        id: questionToAdd.askedByUserId || '',
                        name: questionToAdd.askedBy || (questionToAdd.source === 'MANAGER' ? 'Manager' : 'AI Assistant'),
                        image: questionToAdd.askedByImage || null,
                        email: null,
                        role: (questionToAdd.source === 'MANAGER' ? 'MANAGEMENT' : 'ADMIN') as Role,
                      },
                      replies: [],
                    } as unknown as ActivityLogWithRelations;

                    updatedPages = [
                      {
                        ...updatedPages[0],
                        data: [syntheticLog, ...updatedPages[0].data],
                      },
                      ...updatedPages.slice(1),
                    ];
                  }
                }

                return updatedPages;
              },
              false
            );
          }

          if (typeof data?.pendingCount === 'number') {
            const nextPendingCount = data.pendingCount;
            void mutate(
              key => Array.isArray(key) && key[0] === 'pending-accelerators',
              (prevMap: Record<string, { count: number; earliestPendingAt: string | null }> | undefined) => {
                if (!prevMap) return prevMap;
                const current = prevMap[deal.id];
                if (nextPendingCount === 0) {
                  const next = { ...prevMap };
                  delete next[deal.id];
                  return next;
                }
                return {
                  ...prevMap,
                  [deal.id]: {
                    count: nextPendingCount,
                    earliestPendingAt: current?.earliestPendingAt || new Date().toISOString(),
                  },
                };
              },
              false
            );
          }
        } else if (data?.action === 'OPPORTUNITY_UPDATED') {
          void mutate(['deal-summary-on-demand', deal.id]);
        }
      }
    };

    channel.bind('pipeline-updated', handleUpdate);

    return () => {
      channel.unbind('pusher:subscription_succeeded', onSubSucceeded);
      channel.unbind('pusher:subscription_error', onSubError);
      channel.unbind('pipeline-updated', handleUpdate);
    };
  }, [deal.id, isOpen, loadActivityLogs, mutate, mutateAccelerators, session?.user?.id]);
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
    if (isSubmittingLogRef.current || isSendingManagerCallRef.current) return;
    if (isManagerCallMode || isManagerCallModeRef.current) {
      await handleSendManagerCall();
      return;
    }
    if (!newLog.trim() && pendingAttachments.length === 0 && !pendingDueDate) return;
    isSubmittingLogRef.current = true;

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

      if (currentAttachments.length > 0 || finalLog.includes('http')) {
        void mutate(['opportunity-shared-media', deal.id]);
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
      isSubmittingLogRef.current = false;
      if (inputRef.current) {
        adjustTextareaHeight(inputRef.current);
      }
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
    if (deal.ownerId === newOwnerId || (!isOwner && !isAdmin)) return;
    setIsTransferring(true);
    try {
      await requestDealTransfer(deal.id, newOwnerId);

      const allKnownUsers = (allCachedUsers && allCachedUsers.length > 0) ? allCachedUsers : users;
      const newOwner = allKnownUsers.find((u: { id: string; name?: string | null }) => u.id === newOwnerId);
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

  const handleAddMembers = async (userIds: string[]) => {
    if (!userIds || userIds.length === 0) return;
    setIsAddingMembers(true);
    const originalTeamMembers = deal.teamMembers || [];
    const originalLocalTeamMembers = localTeamMembers;

    // 1. Optimistic Update (Local Panel State)
    const allKnownUsers = (allCachedUsers && allCachedUsers.length > 0) ? allCachedUsers : users;
    const usersToAdd = allKnownUsers.filter((u: { id: string }) => userIds.includes(u.id));
    const newMembers = userIds.map(id => {
      const found = usersToAdd.find(u => u.id === id);
      return found || { id, name: "User", email: "", image: null, role: "USER" };
    });

    setLocalTeamMembers(prev => {
      const existingIds = new Set(prev.map(u => u.id));
      const toAppend = newMembers.filter(u => !existingIds.has(u.id));
      return [...prev, ...(toAppend as unknown as TeamMember[])];
    });

    // 2. Global Optimistic Update (Kanban Card)
    mutate(
      (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
      (currentData: OpportunityWithRelations[] | undefined) => {
        if (!currentData) return currentData;
        return currentData.map(opp => {
          if (opp.id === deal.id) {
            const currentMembers = opp.teamMembers || [];
            const existingIds = new Set(currentMembers.map(u => u.id));
            const toAppend = newMembers.filter(u => !existingIds.has(u.id)) as unknown as OpportunityWithRelations['teamMembers'];
            return { ...opp, teamMembers: [...currentMembers, ...toAppend] };
          }
          return opp;
        });
      },
      { revalidate: false } // Prevent immediate refetch before action finishes
    );

    try {
      await addTeamMembers(deal.id, userIds);
      if (session?.user?.id && usersToAdd.length > 0) {
        const names = usersToAdd.map(u => u.name || "user").join(", ");
        void addSystemLog(deal.id, `Invited ${names} to the team`).catch(console.error);
      }
      toast({ title: "Success", description: `Added ${userIds.length} member${userIds.length > 1 ? 's' : ''} to the deal`, type: "success" });
    } catch (e) {
      setLocalTeamMembers(originalLocalTeamMembers);
      mutate(
        (key) => Array.isArray(key) && key[0] === 'pipeline-deals',
        (currentData: OpportunityWithRelations[] | undefined) => currentData?.map(opp =>
          opp.id === deal.id ? { ...opp, teamMembers: originalTeamMembers } : opp
        ),
        { revalidate: false }
      );
      if (e instanceof Error) toast({ title: "Error", description: e.message, type: "error" });
    } finally {
      setIsAddingMembers(false);
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

  const [showTransferDrawer, setShowTransferDrawer] = useState(false);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);

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
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300 ${internalIsOpen && !isDismissed ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={
          isDismissed
            ? {
                opacity: 0,
                transition: "opacity 0.2s ease-out",
                pointerEvents: "none",
              }
            : dragOffset > 0
            ? {
                opacity: Math.max(0, 1 - dragOffset / 350),
                transition: isDragging ? "none" : "opacity 0.2s ease-out",
              }
            : undefined
        }
        onClick={onClose}
      />

      <div
        {...swipeHandlers}
        style={
          isDismissed
            ? {
                transform: "translateX(100%)",
                opacity: 0,
                transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out",
                pointerEvents: "none",
              }
            : dragOffset > 0
            ? {
                transform: `translateX(${dragOffset}px)`,
                transition: isDragging ? "none" : "transform 0.2s ease-out",
              }
            : undefined
        }
        className={`fixed inset-0 md:inset-y-4 md:right-4 md:left-auto md:mx-0 w-full md:w-[600px] md:max-w-[calc(100vw-32px)] z-[101] flex transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${internalIsOpen && !isDismissed ? "opacity-100 translate-y-0 md:translate-x-0 scale-100" : "opacity-0 translate-y-4 md:translate-y-0 md:translate-x-8 scale-[0.97] pointer-events-none"}`}
      >
        <div className="flex flex-col md:flex-row w-full h-full rounded-none md:rounded-2xl overflow-hidden border-0 md:border border-[#3A3B3C]">
          {/* Tab Sidebar (desktop only) */}
          <div className="hidden md:flex w-16 bg-[#252728] border-r border-[#1C1C1D] flex-col items-center py-3 gap-3 z-10 shrink-0">
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
                    ? "bg-[#C7F33C] text-black "
                    : "text-slate-400 hover:bg-[#C7F33C] hover:text-[#111111]"}
                `}
              >
                <Icon className="h-5 w-5" strokeWidth={activeTab === tabId || (activeTab === 'system' && tabId === 'activity') ? 2.5 : 2} />
              </button>
            )
          })}
        </div>

        {/* Main Panel Content */}
        <div className="w-full flex-1 bg-[#252728] flex flex-col min-w-0 h-full">
          {/* Main Bar (Card-level controls & actions) */}
          <EditDealMainBar
            dealType={dealType}
            topic={topic}
            onTopicSave={async (newTopic) => {
              await updateOpportunity(deal.id, { topic: newTopic });
              await addSystemLog(deal.id, `Changed topic from "${deal.topic}" to "${newTopic}".`);
              setTopic(newTopic);
              toast({ title: 'Success', description: 'Topic updated successfully', type: 'success' });
            }}
            canEditTopic={canEditDueDate}
            companyName={deal.company?.name}
            companyDisplayName={deal.company?.displayName}
            hasActions={hasCardActions}
            onOpenActions={() => setIsActionsDrawerOpen(true)}
            onClose={onClose}
          />

          {/* Sub Bar (Tab-specific navigation & actions) */}
          {(() => {
            if (activeTab === 'activity' || activeTab === 'system' || activeTab === 'manager-call') {
              const pendingCount = pendingQuestionsCount;
              const subTabs: SubBarTab[] = [
                { id: 'activity', label: 'Activity' },
                { id: 'system', label: 'System' },
                {
                  id: 'manager-call',
                  label: 'Manager',
                  badge: pendingCount > 0 ? (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F59E0B] text-slate-950">
                      {pendingCount}
                    </span>
                  ) : undefined,
                },
              ];

              const actions: SubBarActionItem[] = [];
              if (canUseManagerCall) {
                actions.push({
                  id: 'recall',
                  label: isGeneratingAccelerators ? 'Calling AI...' : 'Recall',
                  icon: Sparkles,
                  loading: isGeneratingAccelerators,
                  disabled: isGeneratingAccelerators,
                  onClick: handleRefreshAccelerators,
                });
              }

              return (
                <EditDealSubBar
                  tabs={subTabs}
                  activeTab={activeTab}
                  onTabChange={(tabId) => setActiveTab(tabId as TabType)}
                  actions={actions.length > 0 ? actions : undefined}
                  search={activeTab !== 'manager-call' ? {
                    isActive: isSearching,
                    query: activitySearchQuery,
                    placeholder: 'Search updates...',
                    onToggle: () => setIsSearching(prev => !prev),
                    onChange: setActivitySearchQuery,
                    onClear: () => setActivitySearchQuery(''),
                  } : undefined}
                />
              );
            }

            if (activeTab === 'collaborate') {
              const collaborateActions: SubBarActionItem[] = [];
              if (canInvite) {
                collaborateActions.push({
                  id: 'add',
                  label: 'Add',
                  icon: UserPlus,
                  onClick: () => {
                    setShowInviteDrawer(true);
                    setShowTransferDrawer(false);
                  },
                });
              }
              if (isOwner || isAdmin) {
                collaborateActions.push({
                  id: 'transfer',
                  label: 'Transfer',
                  icon: ArrowRightLeft,
                  onClick: () => {
                    setShowTransferDrawer(true);
                    setShowInviteDrawer(false);
                  },
                });
              }

              return (
                <EditDealSubBar
                  leftContent={<div />}
                  actions={collaborateActions.length > 0 ? collaborateActions : undefined}
                />
              );
            }

            if (activeTab === 'information') {
              return (
                <EditDealSubBar
                  leftContent={<div />}
                  actions={[
                    {
                      id: 'save',
                      label: isSavingCustomerTab ? 'Saving...' : 'Save',
                      icon: Save,
                      loading: isSavingCustomerTab,
                      onClick: async () => {
                        setIsSavingCustomerTab(true);
                        try {
                          await customerTabRef.current?.save();
                        } finally {
                          setIsSavingCustomerTab(false);
                        }
                      },
                    }
                  ]}
                />
              );
            }

            if (activeTab === 'notes') {
              return (
                <EditDealSubBar
                  leftContent={<div />}
                  search={{
                    isActive: isSearchingNotes,
                    query: noteSearchQuery,
                    placeholder: 'Search notes...',
                    onToggle: () => setIsSearchingNotes(prev => !prev),
                    onChange: setNoteSearchQuery,
                    onClear: () => setNoteSearchQuery(''),
                  }}
                />
              );
            }

            if (activeTab === 'sharedMedia') {
              return (
                <EditDealSubBar
                  tabs={[
                    { id: 'images', label: 'Photos', icon: ImageIcon },
                    { id: 'links', label: 'Links', icon: Link2 },
                    { id: 'files', label: 'Files', icon: FileText },
                  ]}
                  activeTab={sharedMediaSubTab}
                  onTabChange={(tabId) => setSharedMediaSubTab(tabId as "images" | "links" | "files")}
                />
              );
            }

            if (activeTab === 'summary') {
              const summaryActions: SubBarActionItem[] = [
                {
                  id: 'copy',
                  label: isCopiedSummary ? 'Copied' : 'Copy',
                  icon: isCopiedSummary ? Check : Copy,
                  onClick: handleCopySummary,
                },
                {
                  id: 'resummarize',
                  label: isGeneratingSummary ? 'Re-summarizing...' : 'Re-Summarize',
                  icon: RefreshCw,
                  loading: isGeneratingSummary,
                  disabled: isGeneratingSummary,
                  onClick: handleGenerateSummary,
                },
              ];

              const summaryTabs: SubBarTab[] = [
                { id: 'summary', label: 'Summary' },
              ];
              if (isAdmin) {
                summaryTabs.push({ id: 'prompt', label: 'Prompt' });
              }

              return (
                <EditDealSubBar
                  tabs={summaryTabs}
                  activeTab={summaryViewMode}
                  onTabChange={(tabId) => {
                    setSummaryViewMode(tabId as "summary" | "prompt");
                    if (tabId === 'prompt') {
                      void handleLoadPromptConfig();
                    }
                  }}
                  actions={summaryViewMode === 'summary' ? summaryActions : undefined}
                />
              );
            }

            return null;
          })()}

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 flex flex-col gap-8 custom-scrollbar">

            {(activeTab === 'activity' || activeTab === 'system' || activeTab === 'summary' || activeTab === 'manager-call') && (
              <>
                {/* Activity Logs (Facebook Style) */}
                <div className="flex flex-col gap-4 flex-1">

                  {activeTab === 'activity' && (
                    <div className="flex flex-col">
                      {/* Urgent Call Announcement Bar (Single Row, Minimal) */}
                      {pendingQuestions.length > 0 && (
                        <div
                          onClick={() => setActiveTab('manager-call')}
                          className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center justify-between gap-3 text-amber-300 hover:bg-amber-500/15 transition cursor-pointer shadow-sm"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
                            <PhoneCall className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                            <span className="font-bold text-xs text-amber-400 shrink-0">Manager Call</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 shrink-0">
                              {pendingQuestions.length} Pending
                            </span>
                            <span className="text-xs text-amber-200/90 font-mono font-medium tracking-wide tabular-nums shrink-0">
                              {getElapsedWaitText()}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTab('manager-call');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold shrink-0 hover:bg-amber-400 transition cursor-pointer shadow"
                          >
                            Answer
                          </button>
                        </div>
                      )}

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

                          // กรองเอา Manager Call / AI Accelerator ที่ตอบแล้วออกไปจากหน้า Activity feed (จะไปแสดงใน Manager Call > Answer History)
                          comments = comments.filter(log => {
                            if (!log.content.startsWith('[URGENT_CALL:')) return true;
                            // ไม่แสดงคำถามเร่งด่วนก่อนที่ acceleratorsState จะโหลดเสร็จ เพื่อป้องกันการกระพริบของคำถามที่ตอบแล้ว (Flicker / Layout Shift)
                            if (!acceleratorsState) return false;
                            const match = log.content.match(/^\[URGENT_CALL:([^\]]+)\]\s*([\s\S]*)$/);
                            const qId = match ? match[1] : '';
                            const qText = match ? match[2].trim() : '';
                            const targetQ = acceleratorsState.questions?.find(q => q.id === qId && q.question.trim() === qText)
                              || acceleratorsState.questions?.find(q => q.id === qId && q.status === 'PENDING')
                              || acceleratorsState.questions?.find(q => q.id === qId);
                            if (targetQ) {
                              return targetQ.status === 'PENDING';
                            }
                            // หาก acceleratorsState โหลดแล้วและไม่พบคำถามนี้ แสดงว่าคำถามถูกลบแล้ว
                            return false;
                          });

                          // Fallback: หากมีคำถาม AI / Manager Call ที่ยัง PENDING แต่ยังไม่อยู่ใน comments ให้แสดงผลทันที
                          const pendingAccelerators = acceleratorsState?.questions?.filter(q => q.status === 'PENDING') || [];
                          if (pendingAccelerators.length > 0) {
                            const existingQIds = new Set(
                              comments
                                .filter(log => log.content.startsWith('[URGENT_CALL:'))
                                .map(log => {
                                  const match = log.content.match(/^\[URGENT_CALL:([^\]]+)\]/);
                                  return match ? match[1] : '';
                                })
                                .filter(Boolean)
                            );

                            const missingQuestions = pendingAccelerators.filter(q => {
                              if (existingQIds.has(q.id)) return false;
                              // Match question text to prevent duplicate card if IDs temporarily differ during transitions
                              const isTextAlreadyPresent = comments.some(log => {
                                if (!log.content.startsWith('[URGENT_CALL:')) return false;
                                const match = log.content.match(/^\[URGENT_CALL:[^\]]+\]\s*([\s\S]*)$/);
                                return match && match[1].trim() === q.question.trim();
                              });
                              return !isTextAlreadyPresent;
                            });
                            if (missingQuestions.length > 0) {
                              const syntheticLogs = missingQuestions.map(q => ({
                                id: `synth_log_${q.id}`,
                                content: `[URGENT_CALL:${q.id}] ${q.question}`,
                                type: 'COMMENT',
                                opportunityId: deal.id,
                                userId: q.askedByUserId || session?.user?.id || '',
                                createdAt: q.createdAt ? new Date(q.createdAt) : new Date(),
                                updatedAt: q.createdAt ? new Date(q.createdAt) : new Date(),
                                isEdited: false,
                                parentId: null,
                                user: {
                                  id: q.askedByUserId || session?.user?.id || '',
                                  name: q.askedBy || (q.source === 'MANAGER' ? 'Manager' : 'AI Assistant'),
                                  image: q.askedByImage || null,
                                  email: null,
                                  role: (q.source === 'MANAGER' ? 'MANAGEMENT' : 'ADMIN') as Role,
                                },
                                replies: [],
                              })) as unknown as ActivityLogWithRelations[];

                              comments = [...syntheticLogs, ...comments];
                            }
                          }

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
                                <p className="text-xs text-slate-300 font-medium">{activitySearchQuery.trim() ? "No updates found." : "No updates yet."}</p>
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
                                    currentUser={session?.user as unknown as { id: string; name?: string | null; image?: string | null; email?: string | null; role?: string }}
                                    refresh={() => loadActivityLogs()}
                                    mutateLogs={loadActivityLogs}
                                    searchQuery={activitySearchQuery}
                                    acceleratorsState={acceleratorsState}
                                    onAnswerQuestion={handleAnswerAccelerator}
                                    onDeleteQuestion={handleDeleteAcceleratorQuestion}
                                    canUseManagerCall={canUseManagerCall}
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
                                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
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
                                  className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3.5 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                                  placeholder="Enter system prompt instruction..."
                                />
                              </div>

                              {/* 2. Task Instruction */}
                              <div className="flex flex-col gap-2 p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
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
                                  className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3.5 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                                  placeholder="Enter task instruction and topics..."
                                />
                              </div>

                              {/* 3. JSON Schema (Structured Output Definition) */}
                              <div className="flex flex-col gap-2 p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
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
                                  className="w-full bg-[#252728] border border-[#4E4F50] rounded-xl p-3.5 text-xs text-slate-100 font-mono leading-relaxed focus:border-[#C7F33C] focus:outline-none transition-colors resize-none overflow-hidden"
                                  placeholder="Enter JSON Schema..."
                                />
                              </div>

                              {/* Bottom Action Row */}
                              <div className="flex items-center justify-between pt-4 border-t border-[#4E4F50]">
                                <button
                                  type="button"
                                  onClick={handleResetPrompt}
                                  disabled={isSavingPrompt || isLoadingPrompt}
                                  className="px-4 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  Reset to Default
                                </button>

                                <button
                                  type="button"
                                  onClick={handleSavePrompt}
                                  disabled={isSavingPrompt || isLoadingPrompt}
                                  className="px-6 py-2.5 text-xs font-bold bg-[#C7F33C] hover:bg-[#b0d635] text-black rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
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
                                  <p className="text-xs leading-relaxed text-slate-300">{summaryError}</p>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={handleGenerateSummary}
                                disabled={isGeneratingSummary}
                                className="px-6 py-2.5 rounded-full bg-[#C7F33C] hover:bg-[#b0d635] text-black font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
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
                                <div className="p-2 bg-[#3A3B3C] border border-[#C7F33C]/50 rounded-2xl flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-xl bg-[#C7F33C]/10 border border-[#C7F33C]/30 flex items-center justify-center text-[#C7F33C] shrink-0">
                                      <Sparkles className="w-4 h-4" />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-100">
                                          New Activity
                                        </span>
                                        {dealSummaryResponse.newerActivitiesCount && dealSummaryResponse.newerActivitiesCount > 0 ? (
                                          <span className="px-1.5 py-0.5 rounded-full bg-[#C7F33C] text-black font-bold text-xs">
                                            +{dealSummaryResponse.newerActivitiesCount}
                                          </span>
                                        ) : null}
                                      </div>
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
                                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                                      CURRENT STATUS
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-100 leading-relaxed whitespace-pre-wrap font-normal">
                                    {dealSummaryResponse.data.overview}
                                  </p>
                                </div>
                              )}

                              {/* Section 2: KEY HIGHLIGHTS */}
                              {Array.isArray(dealSummaryResponse.data.keyHighlights) && dealSummaryResponse.data.keyHighlights.length > 0 && (
                                <div className="p-4 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50] flex flex-col gap-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-[#C7F33C]" />
                                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                                      KEY HIGHLIGHTS
                                    </span>
                                  </div>
                                  <ul className="flex flex-col gap-2">
                                    {dealSummaryResponse.data.keyHighlights.map((point, idx) => (
                                      <li key={idx} className="text-xs text-slate-100 leading-relaxed flex items-start gap-2.5">
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
                                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                                      BLOCKERS & RISKS
                                    </span>
                                  </div>
                                  <ul className="flex flex-col gap-2">
                                    {dealSummaryResponse.data.blockers.map((blocker, idx) => (
                                      <li key={idx} className="text-xs text-slate-100 leading-relaxed flex items-start gap-2.5">
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
                                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                                      RECOMMENDED NEXT STEPS
                                    </span>
                                  </div>
                                  <ul className="flex flex-col gap-2">
                                    {dealSummaryResponse.data.nextSteps.map((step, idx) => (
                                      <li key={idx} className="text-xs text-slate-100 leading-relaxed flex items-start gap-2.5">
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
                                      <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                                        {formattedTitle}
                                      </span>
                                    </div>
                                    {Array.isArray(value) ? (
                                      <ul className="flex flex-col gap-2">
                                        {value.map((item, idx) => (
                                          <li key={idx} className="text-xs text-slate-100 leading-relaxed flex items-start gap-2.5">
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
                                      <p className="text-xs text-slate-100 leading-relaxed whitespace-pre-wrap font-normal">
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
                              <p className="text-xs text-slate-300 font-medium">{activitySearchQuery.trim() ? "No system logs found." : "No system logs."}</p>
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
                              <span className="text-xs text-slate-500 mb-0.5 font-medium">
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

                  {activeTab === 'manager-call' && (
                    <div className="flex flex-col gap-5 mt-2">
                      {/* Target Goal Milestone (Direct Editable with Auto-Save) */}
                      <div className="flex flex-col gap-2 p-4 rounded-2xl bg-[#3A3B3C] border border-[#4E4F50]/60">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                            <Target className="w-4 h-4 text-[#F59E0B]" />
                            <span>TARGET GOAL</span>
                            <span className="text-slate-500 font-normal">
                              ({acceleratorsState?.goalSource === 'USER_OVERRIDE' ? 'Custom' : 'AI Inferred'})
                            </span>
                          </div>
                          {isSavingGoal && (
                            <span className="text-xs text-amber-400/80 flex items-center gap-1 font-medium">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Saving...
                            </span>
                          )}
                        </div>

                        <textarea
                          ref={goalTextareaRef}
                          value={goalInput}
                          disabled={!isOwner && !isAdmin}
                          onChange={(e) => {
                            setGoalInput(e.target.value);
                            adjustGoalTextareaHeight();
                            handleAutoSaveGoal(e.target.value);
                          }}
                          onBlur={handleBlurGoal}
                          placeholder="Define the primary goal of this deal..."
                          rows={1}
                          className="w-full bg-transparent border-none text-xs text-slate-200 leading-relaxed italic resize-none focus:outline-none placeholder:text-slate-500 py-1 px-0 overflow-hidden disabled:opacity-80"
                        />
                      </div>

                      {/* Sub-tabs: Pending Calls vs Answered History */}
                      <div className="flex items-center gap-2 border-b border-[#4E4F50] pb-2">
                        <button
                          type="button"
                          onClick={() => setAcceleratorTab('pending')}
                          className={`text-xs font-bold px-3.5 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
                            acceleratorTab === 'pending'
                              ? 'bg-[#F59E0B] text-slate-950'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C]'
                          }`}
                        >
                          <span>Pending Calls</span>
                          {pendingQuestions.length > 0 && (
                            <span className={`px-1.5 py-0.2 rounded-full text-xs font-bold ${
                              acceleratorTab === 'pending' ? 'bg-slate-950 text-[#F59E0B]' : 'bg-[#F59E0B] text-slate-950'
                            }`}>
                              {pendingQuestions.length}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAcceleratorTab('answered')}
                          className={`text-xs font-bold px-3.5 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
                            acceleratorTab === 'answered'
                              ? 'bg-[#F59E0B] text-slate-950'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-[#3A3B3C]'
                          }`}
                        >
                          <span>Answered History</span>
                          {answeredQuestions.length > 0 && (
                            <span className={`px-1.5 py-0.2 rounded-full text-xs font-bold ${
                              acceleratorTab === 'answered' ? 'bg-slate-950 text-[#F59E0B]' : 'bg-[#4E4F50] text-slate-200'
                            }`}>
                              {answeredQuestions.length}
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Content: Pending or Answered */}
                      {acceleratorTab === 'pending' ? (
                        pendingQuestions.length > 0 ? (
                          <div className="flex flex-col gap-3">
                            {pendingQuestions.map((q) => (
                              <AcceleratorQuestionCard
                                key={q.id}
                                question={q}
                                canDelete={canUseManagerCall}
                                onDelete={handleDeleteAcceleratorQuestion}
                                onAnswer={handleAnswerAccelerator}
                                isAnswering={isAnsweringQuestionId === q.id}
                                isDeleting={isDeletingQuestionId === q.id}
                                variant="panel"
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="p-8 rounded-2xl bg-[#3A3B3C] border border-[#4E4F50] text-center flex flex-col items-center gap-2">
                            <Check className="w-8 h-8 text-[#C7F33C]" />
                            <p className="text-sm font-semibold text-slate-200">No Question Remaining </p>
                            <p className="text-xs text-slate-400">All questions from Manager and AI have been answered</p>
                          </div>
                        )
                      ) : (
                        answeredQuestions.length > 0 ? (
                          <div className="flex flex-col gap-3">
                            {answeredQuestions.map((q) => (
                              <AcceleratorQuestionCard
                                key={q.id}
                                question={q}
                                canDelete={canUseManagerCall}
                                onDelete={handleDeleteAcceleratorQuestion}
                                isDeleting={isDeletingQuestionId === q.id}
                                variant="panel"
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="p-8 rounded-2xl bg-[#3A3B3C] border border-[#4E4F50] text-center flex flex-col items-center gap-2">
                            <p className="text-xs text-slate-400">No History</p>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {activeTab === 'activity' && hasMoreLogs && (
                    <div ref={lastLogElementRef} className="py-4 flex justify-center mt-2">
                      {isLoadingMore ? (
                        <Loader2 className="w-6 h-6 animate-spin text-[#C7F33C]" />
                      ) : (
                        <span className="text-xs text-slate-400">Scroll for more</span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'collaborate' && (
              <div className="flex flex-col gap-8">

                <div className="flex flex-col gap-4">
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
                                      <span className="text-xs font-semibold text-slate-100">{tm.name || 'Unknown'}</span>
                                      <span className="text-xs text-slate-300">{isRowOwner ? 'Owner' : 'Member'}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {!isRowOwner && (isOwner || isAdmin || (session?.user?.id && tm.id === session.user.id) || (session?.user?.email && tm.email && session.user.email.toLowerCase() === tm.email.toLowerCase())) && (
                                      <button
                                        onClick={() => handleRemoveMember(tm.id)}
                                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-50 cursor-pointer"
                                        title={isOwner || isAdmin ? "Remove from team" : "Leave team"}
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
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
              <CustomerTab ref={customerTabRef} deal={deal} onClose={onClose} />
            )}

            {activeTab === 'notes' && (
              <NotesTab deal={deal} searchQuery={noteSearchQuery} />
            )}

            {['sharedMedia'].includes(activeTab) && (
              <SharedMediaTab
                deal={deal}
                activityLogs={localActivityLogs}
                onImageClick={handleOpenPreview}
                activeSubTab={sharedMediaSubTab}
                onSubTabChange={setSharedMediaSubTab}
                hideHeader={true}
              />
            )}
          </div>

          {/* Sticky Footer for Activity Tab */}
          {activeTab === 'activity' && (
            <div className="p-2 bg-[#252728] border-t border-[#1C1C1D] shrink-0 z-10 flex flex-col gap-2 relative">

              {/* Mini Calendar Popup */}
              {canEditDueDate && showCalendar && (
                <div ref={calendarRef} className="absolute bottom-[100%] left-4 mb-2 bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-4 z-50 w-[280px]">
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
                      <div key={day} className="text-xs font-bold text-slate-400">{day}</div>
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

              {/* Attachments / Due Date Preview */}
              {(pendingDueDate || pendingAttachments.length > 0) && (
                <div className="px-2 pb-1.5 flex flex-wrap gap-2 items-center">
                  {pendingDueDate && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-black text-[#d4ff3a] border border-[#C7F33C]/20">
                      <BellRing className="w-3 h-3" />
                      {pendingDueDate === 'REMOVE' ? 'Remove Due Date' : `Due: ${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(pendingDueDate)}`}
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
                           <img src={objectUrl} alt="preview" className="h-10 w-10 object-cover" />
                         ) : (
                           <div className="h-10 w-10 flex items-center justify-center text-slate-400">
                             <Paperclip className="w-4 h-4" />
                           </div>
                         )}
                         <button
                           onClick={() => setPendingAttachments(prev => prev.filter((_, i) => i !== idx))}
                           className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/att:opacity-100 transition-opacity scale-75 hover:scale-100"
                         >
                           <X className="w-3 h-3" />
                         </button>
                       </div>
                     );
                  })}
                </div>
              )}

              {/* Manager Call Mode Banner */}
              {isManagerCallMode && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400 text-xs font-semibold animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <PhoneCall className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    <span>Manager Call Mode: Send urgent question to deal owner.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsManagerCallMode(false)}
                    className="p-1 rounded-md text-amber-300/80 hover:text-white hover:bg-amber-500/20 transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Auto-expanding Chat Input (LINE / WhatsApp style) */}
              <div {...getRootProps()} className={`flex items-end gap-1 bg-[#3A3B3C] px-1 py-1.5 rounded-lg border transition-all ${isManagerCallMode ? 'border-[#F59E0B] bg-[#342a1d]' : isDragActive ? 'border-[#C7F33C] bg-[#4E4F50]' : 'border-[#4E4F50]'}`}>
                <input {...getInputProps()} />

                {/* Left Action Buttons: Attach, Due Date, Manager Call */}
                <div className="flex items-center gap-1 shrink-0 h-7 self-end">
                  {session?.user?.id && !isManagerCallMode && (
                    <ChatAttachmentButton
                      onFileSelect={(files) => setPendingAttachments(prev => [...prev, ...files])}
                    />
                  )}
                  {canEditDueDate && !isManagerCallMode && (() => {
                    const activeDueDate = (pendingDueDate && pendingDueDate !== 'REMOVE')
                      ? pendingDueDate
                      : (!pendingDueDate && deal.dueDate ? deal.dueDate : null);
                    return (
                      <button
                        type="button"
                        onClick={() => setShowCalendar(!showCalendar)}
                        title={activeDueDate ? `Due: ${formatShortDueDate(activeDueDate)} (Click to change)` : "Set Due Date"}
                        className={`h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                          activeDueDate
                            ? 'bg-[#C7F33C] text-black font-bold text-xs px-2.5 gap-1.5'
                            : 'w-7 px-0 hover:bg-[#4E4F50] text-slate-300'
                        }`}
                      >
                        <BellRing className="w-3.5 h-3.5 shrink-0" />
                        {activeDueDate && (
                          <span className="whitespace-nowrap tracking-tight">{formatShortDueDate(activeDueDate)}</span>
                        )}
                      </button>
                    );
                  })()}
                  {canUseManagerCall && (
                    <button
                      type="button"
                      onClick={() => setIsManagerCallMode(prev => !prev)}
                      title={isManagerCallMode ? "Cancel Manager Call mode" : "Manager Call (Urgent question)"}
                      className={`h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                        isManagerCallMode
                          ? 'bg-[#F59E0B] text-slate-950 font-bold text-xs px-2.5 gap-1.5 shadow-sm'
                          : 'w-7 px-0 hover:bg-[#4E4F50] text-amber-400'
                      }`}
                    >
                      <PhoneCall className="w-3.5 h-3.5 shrink-0" />
                      {isManagerCallMode && (
                        <span className="whitespace-nowrap tracking-tight">Manager Call</span>
                      )}
                    </button>
                  )}
                </div>

                {/* Auto-adjusting Textarea with Shift+Enter & Mobile Return to Newline */}
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={newLog}
                  onChange={e => {
                    setNewLog(e.target.value);
                    adjustTextareaHeight(e.target);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (e.shiftKey) {
                        setTimeout(() => adjustTextareaHeight(inputRef.current), 0);
                        return;
                      }
                      const isMobileDevice = typeof window !== 'undefined' &&
                        ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
                        window.innerWidth < 768;

                      if (!isMobileDevice) {
                        e.preventDefault();
                        if (isManagerCallMode || isManagerCallModeRef.current) {
                          handleSendManagerCall();
                        } else {
                          handleAddLog();
                        }
                      } else {
                        setTimeout(() => adjustTextareaHeight(inputRef.current), 0);
                      }
                    }
                  }}
                  placeholder={isManagerCallMode ? " Urgent Question..." : isDragActive ? "Drop files here..." : "Write an update..."}
                  style={{ height: 'auto', minHeight: '28px', maxHeight: '120px' }}
                  className="flex-1 bg-transparent border-none pl-1 text-white text-[16px] focus:outline-none placeholder:text-slate-400 min-w-0 resize-none overflow-y-auto leading-5 hide-scrollbar py-1"
                />

                {/* Send Button / Indicator (Anchored to bottom, height 28px) */}
                {isSubmittingLog || isSendingManagerCall ? (
                  <div className="w-7 h-7 flex items-center justify-center shrink-0 self-end">
                    <Loader2 className={`w-4 h-4 animate-spin ${isManagerCallMode ? 'text-[#F59E0B]' : 'text-[#C7F33C]'}`} />
                  </div>
                ) : (newLog.trim() || pendingAttachments.length > 0 || pendingDueDate) ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (isManagerCallMode || isManagerCallModeRef.current) {
                        handleSendManagerCall();
                      } else {
                        handleAddLog();
                      }
                    }}
                    className={`w-7 h-7 flex items-center justify-center shrink-0 rounded-full transition-colors cursor-pointer self-end ${
                      isManagerCallMode ? 'text-[#F59E0B] hover:bg-amber-500/20' : 'text-[#C7F33C] hover:bg-black/20'
                    }`}
                    title="Send (Enter)"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* Mobile Bottom Tab Bar (Icons only - no text) */}
          {rightMenus.length > 0 && (
            <div className="flex md:hidden w-full h-12 border-t border-[#1C1C1D] bg-[#252728] items-center justify-around p-3 shrink-0 z-10">
              {rightMenus.map(menu => {
                const tabId = menu.key.split('.').pop() as TabType;
                const Icon = tabId === 'summary' || menu.key === 'pipeline.summary' 
                  ? Bot 
                  : (menu.iconName ? IconMap[menu.iconName] || MessageSquare : MessageSquare);
                const isActive = activeTab === tabId || (activeTab === 'system' && tabId === 'activity');
                return (
                  <button
                    key={menu.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(tabId);
                    }}
                    title={menu.label}
                    className={`flex items-center justify-center h-9 w-9 rounded-full transition-all duration-200 cursor-pointer ${
                      isActive
                        ? "bg-[#C7F33C] text-black"
                        : "text-slate-400 hover:bg-[#3A3B3C]/50 hover:text-slate-200"
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  </button>
                );
              })}
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
              className="p-2.5 rounded-full bg-[#1C1C1D]/80 border border-[#3A3B3C] text-slate-200 hover:bg-[#C7F33C] hover:text-black transition-all cursor-pointer pointer-events-auto"
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
              className="absolute left-6 z-10 p-3 rounded-full bg-[#1C1C1D]/80 border border-[#3A3B3C] text-slate-200 hover:bg-[#C7F33C] hover:text-black transition-all cursor-pointer backdrop-blur-md hover:scale-105 active:scale-95"
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
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl transition-all"
              onClick={e => e.stopPropagation()}
              alt={`Preview ${previewLightbox.currentIndex + 1}`}
            />
          </div>

          {/* Next Button */}
          {previewLightbox.images.length > 1 && (
            <button
              type="button"
              className="absolute right-6 z-10 p-3 rounded-full bg-[#1C1C1D]/80 border border-[#3A3B3C] text-slate-200 hover:bg-[#C7F33C] hover:text-black transition-all cursor-pointer backdrop-blur-md hover:scale-105 active:scale-95"
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
              <div className="bg-[#1C1C1D]/80 border border-[#3A3B3C] p-1.5 rounded-2xl flex items-center gap-2 backdrop-blur-md">
                {previewLightbox.images.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPreviewLightbox(prev => prev ? { ...prev, currentIndex: idx } : null)}
                    className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                      idx === previewLightbox.currentIndex
                        ? "border-[#C7F33C] scale-105"
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

      {/* Standard Deal Actions Drawer (Won, Lost, Convert, Delete) */}
      <DealActionsDrawer
        isOpen={isActionsDrawerOpen && hasCardActions}
        onClose={() => setIsActionsDrawerOpen(false)}
        deal={deal}
        canCloseDeal={canCloseDeal}
        canConvert={canConvert}
        canDelete={canDelete}
        onDealClosed={(dealId, status) => {
          setIsActionsDrawerOpen(false);
          onDealClosed?.(dealId, status);
          onClose();
        }}
        onDealConverted={() => {
          setDealType(OpportunityType.SALES_DEAL);
          setIsActionsDrawerOpen(false);
          setActiveTab('information');
        }}
        onDealDeleted={(dealId) => {
          setIsActionsDrawerOpen(false);
          onDealClosed?.(dealId, "LOST");
          onClose();
        }}
      />

      {/* Invite Members Drawer (Multi-select) */}
      <MemberSelectDrawer
        isOpen={showInviteDrawer}
        onClose={() => setShowInviteDrawer(false)}
        title="Invite Team Members"
        subtitle="Select department or individual members to add to this card."
        mode="multiple"
        dealId={deal.id}
        currentOwnerId={deal.ownerId}
        excludeUserIds={[deal.ownerId, ...(localTeamMembers?.map(tm => tm.id) || [])]}
        onConfirmMultiple={async (selectedIds) => {
          await handleAddMembers(selectedIds);
          setShowInviteDrawer(false);
        }}
        isSubmitting={isAddingMembers}
      />

      {/* Transfer Ownership Drawer (Single-select) */}
      <MemberSelectDrawer
        isOpen={showTransferDrawer}
        onClose={() => setShowTransferDrawer(false)}
        title="Transfer Ownership"
        subtitle="Select a new deal owner. You will remain on the deal as a collaborator."
        mode="single"
        dealId={deal.id}
        currentOwnerId={deal.ownerId}
        excludeUserIds={[deal.ownerId]}
        onConfirmSingle={async (selectedId) => {
          await handleTransfer(selectedId);
          setShowTransferDrawer(false);
        }}
        isSubmitting={isTransferring}
      />
    </>
  );
}
