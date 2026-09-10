'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useSWRConfig } from 'swr';
import {
  Bot,
  Paperclip,
  Download,
  MoreHorizontal,
  X,
  Send,
} from 'lucide-react';
import type { User, Role } from '@prisma/client';
import { editActivityLog, addActivityLog, deleteActivityLog } from '@/lib/actions/opportunity';
import type { OpportunityWithRelations } from '@/components/pipeline/KanbanCard';
import { AcceleratorQuestionCard } from '@/components/pipeline/AcceleratorQuestionCard';
import type { DealAcceleratorsState } from '@/lib/actions/ai-accelerator';
import { renderCommentText } from '@/components/ui/HighlightText';
import {
  applyActivityEvent,
  replaceOptimisticActivity,
  type ActivityLogPage,
  type ActivityLogWithRelations,
} from '@/lib/pipeline-activity-cache';
import { rollbackDeletedPageItem } from '@/lib/pipeline-delete-rollback';

export const formatDateTime = (date: Date | string) => {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

export const formatShortDueDate = (date: Date | string) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  const year = String(d.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
};

export const MIN_DUE_DATE_REASON_LENGTH = 10;

export function ImageGrid({
  images,
  onImageClick,
}: {
  images: { url: string; filename: string; type: string }[];
  onImageClick?: (url: string, index?: number, allUrls?: string[]) => void;
}) {
  if (images.length === 0) return null;

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = 'https://placehold.co/600x400/252728/4E4F50?text=Image+Unavailable';
  };

  const allUrls = images.map((img) => img.url);

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
            key={idx}
            src={img.url}
            alt={img.filename}
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
            <div
              key={idx}
              className="relative cursor-pointer group"
              onClick={() => onImageClick?.(img.url, 3, allUrls)}
            >
              <img src={img.url} alt="" className="w-full h-32 object-cover" onError={handleImageError} />
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center transition-colors group-hover:bg-black/70">
                <span className="text-white text-2xl font-bold">+{images.length - 4}</span>
              </div>
            </div>
          );
        }
        return (
          <img
            key={idx}
            src={img.url}
            alt={img.filename}
            className="w-full h-32 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onImageClick?.(img.url, idx, allUrls)}
            onError={handleImageError}
          />
        );
      })}
    </div>
  );
}

export interface ActivityCommentProps {
  log: ActivityLogWithRelations;
  dealId: string;
  currentUser: { id: string; name?: string | null; image?: string | null; email?: string | null; role?: string };
  refresh: () => void;
  mutateLogs?: (
    data: (currentPages?: ActivityLogPage[]) => ActivityLogPage[] | undefined,
    opts?: { revalidate: boolean }
  ) => void;
  onReplyClick?: (username: string) => void;
  onImageClick?: (url: string, index?: number, allUrls?: string[]) => void;
  searchQuery?: string;
  acceleratorsState?: DealAcceleratorsState;
  onAnswerQuestion?: (questionId: string, answer: string) => Promise<void>;
  onDeleteQuestion?: (questionId: string) => Promise<void> | void;
  canUseManagerCall?: boolean;
}

export function ActivityComment({
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
}: ActivityCommentProps) {
  const { mutate } = useSWRConfig();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(log.content);
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [replyingToUsername, setReplyingToUsername] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  const adjustReplyTextareaHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, 28), 120);
    el.style.height = `${nextHeight}px`;
  };

  useEffect(() => {
    if (!replyContent && replyInputRef.current) {
      replyInputRef.current.style.height = 'auto';
    }
  }, [replyContent]);

  useEffect(() => {
    if (isReplying && replyInputRef.current) {
      setTimeout(() => {
        replyInputRef.current?.focus();
        adjustReplyTextareaHeight(replyInputRef.current);
      }, 50);
    }
  }, [isReplying]);

  // Close menu if clicked outside
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAdmin = (currentUser as Record<string, unknown>).role === 'ADMIN';
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
            data: page.data.map((l) =>
              l.id === log.id
                ? tempUpdatedLog
                : {
                    ...l,
                    replies: l.replies?.map((r) =>
                      r.id === log.id ? (tempUpdatedLog as unknown as ActivityLogWithRelations) : r
                    ),
                  }
            ),
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
            const updatedLogs = opp.activityLogs.map((l) => (l.id === log.id ? tempUpdatedLog : l));
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
      const persistedLog = (await editActivityLog(log.id, editContent)) as ActivityLogWithRelations;
      mutateLogs?.(
        (pages) => applyActivityEvent(pages, { action: 'ACTIVITY_UPDATED', activityLog: persistedLog }),
        { revalidate: false }
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
      type: 'COMMENT',
      opportunityId: dealId,
      userId: currentUser.id,
      parentId: log.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { ...currentUser, role: 'GENERAL' } as unknown as User,
      replies: [],
    } as unknown as ActivityLogWithRelations;

    if (mutateLogs) {
      mutateLogs(
        (currentPages?: ActivityLogPage[]) => {
          if (!currentPages) return currentPages;
          return currentPages.map((page) => ({
            ...page,
            data: page.data.map((l) =>
              l.id === log.id ? { ...l, replies: [...(l.replies || []), tempReply] } : l
            ),
          }));
        },
        { revalidate: false }
      );
    }

    setIsReplying(false);
    setReplyContent('');
    setReplyingToUsername(null);

    try {
      const persistedReply = (await addActivityLog(dealId, finalContent, log.id)) as ActivityLogWithRelations;
      mutateLogs?.((pages) => replaceOptimisticActivity(pages, fakeLogId, persistedReply), { revalidate: false });
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
            data: page.data
              .map((l) => ({
                ...l,
                replies: l.replies?.filter((r) => r.id !== log.id),
              }))
              .filter((l) => l.id !== log.id),
          }));
        },
        { revalidate: false }
      );
    }

    try {
      await deleteActivityLog(log.id);
    } catch {
      if (mutateLogs) {
        mutateLogs(
          (currentPages?: ActivityLogPage[]) => {
            if (!currentPages) return currentPages;
            if (log.parentId) {
              return currentPages.map((page) => ({
                ...page,
                data: page.data.map((l) =>
                  l.id === log.parentId
                    ? {
                        ...l,
                        replies: l.replies?.some((r) => r.id === log.id)
                          ? l.replies
                          : [...(l.replies || []), log].sort(
                              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                            ),
                      }
                    : l
                ),
              }));
            }
            return rollbackDeletedPageItem(currentPages, log, 0);
          },
          { revalidate: false }
        );
      }
    }
  };

  // Urgent Call (Manager Call or AI) Unified Question Card
  if (log.content.startsWith('[URGENT_CALL:')) {
    const urgentCallMatch = log.content.match(/^\[URGENT_CALL:([^\]]+)\]\s*([\s\S]*)$/);
    const qId = urgentCallMatch ? urgentCallMatch[1] : '';
    const qText = urgentCallMatch ? urgentCallMatch[2].trim() : log.content;
    let targetQ =
      acceleratorsState?.questions?.find((q) => q.id === qId && q.question.trim() === qText) ||
      acceleratorsState?.questions?.find((q) => q.id === qId && q.status === 'PENDING') ||
      acceleratorsState?.questions?.find((q) => q.id === qId);
    const replyLog = log.replies?.find((r) => r.content.startsWith('[URGENT_REPLY:'));

    if (!targetQ) {
      // Fallback for optimistic logs or first-time sends before acceleratorsState finishes populating
      const isOptimistic = String(log.id).startsWith('opt_log_') || qId.startsWith('acc_mgr_');
      if (isOptimistic || !acceleratorsState) {
        targetQ = {
          id: qId || String(log.id),
          question: qText || log.content,
          reason: 'คำถามด่วนจากฝ่ายบริหาร (Manager Call)',
          status: 'PENDING',
          source: 'MANAGER',
          createdAt: typeof log.createdAt === 'string' ? log.createdAt : new Date(log.createdAt).toISOString(),
          askedBy: log.user?.name || 'Manager',
          askedByImage: log.user?.image || null,
        };
      } else {
        return null;
      }
    } else if (!targetQ.answeredByImage && replyLog?.user?.image) {
      targetQ = {
        ...targetQ,
        answeredByImage: replyLog.user.image,
      };
    }

    // Manager Call / AI Accelerator that has been answered is not shown in Activity feed
    if (targetQ.status === 'ANSWERED') {
      return null;
    }

    const nonUrgentReplies = log.replies?.filter((r) => !r.content.startsWith('[URGENT_REPLY:')) || [];

    return (
      <div className="flex flex-col gap-2 my-2 w-full">
        <div className="flex flex-row-reverse gap-3 self-end w-full max-w-[95%] sm:max-w-[88%] ml-auto">
          {/* Avatar on Right */}
          <div
            className={`w-10 h-10 rounded-full shrink-0 overflow-hidden relative flex items-center justify-center shadow-md ${
              targetQ.source === 'AI'
                ? 'bg-purple-500/20 border-2 border-purple-500'
                : 'bg-amber-500/20 border-2 border-amber-500'
            }`}
          >
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
            {nonUrgentReplies.map((reply) => (
              <div key={reply.id} className="flex flex-row-reverse gap-2 max-w-[85%] items-start">
                <div className="w-7 h-7 rounded-full bg-[#4E4F50] shrink-0 overflow-hidden">
                  <img
                    src={
                      reply.user?.image ||
                      `https://api.dicebear.com/7.x/notionists/svg?seed=${reply.user?.name || reply.userId}`
                    }
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
          <img
            src={
              log.user?.image ||
              `https://api.dicebear.com/7.x/notionists/svg?seed=${log.user?.name || log.user?.email || log.userId}`
            }
            alt="Avatar"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex flex-col flex-1 group/comment">
          {/* Main Comment Bubble */}
          <div className="flex items-center gap-2">
            <div className="bg-[#3A3B3C] rounded-2xl p-3 inline-block self-start relative w-full max-w-[85%] sm:max-w-md">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-slate-100">{log.user?.name || 'Unknown User'}</span>
                {dueDateMatch && (
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                      dueDateMatch[1] === 'Removed'
                        ? 'text-slate-300 bg-slate-600 border-slate-500'
                        : 'bg-[#C7F33C] text-black'
                    }`}
                  >
                    {dueDateMatch[1] === 'Removed' ? 'Due Date Removed' : `Due: ${dueDateMatch[1]}`}
                  </span>
                )}
              </div>

              {isEditing ? (
                <div className="flex flex-col gap-2 min-w-[250px]">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full bg-[#252728] text-[16px] border border-[#4E4F50] text-slate-100 rounded-lg p-2 text-xs min-h-[150px]"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setIsEditing(false)} className="text-xs text-slate-300 hover:underline">
                      Cancel
                    </button>
                    <button
                      onClick={handleEdit}
                      className="flex items-center px-4 py-2 rounded-full font-semibold transition-all text-xs select-none bg-[#C7F33C] text-black hover:bg-[#b0d932] cursor-pointer shadow-sm"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col w-full">
                  {(() => {
                    const displayContent = dueDateMatch ? dueDateMatch[2] : log.content;
                    const images: { url: string; filename: string; type: string }[] = [];
                    const files: { url: string; filename: string; type: string }[] = [];

                    const cleanText = displayContent
                      .replace(
                        /\[ATTACHMENT:([^\|\]]+)(?:\|([^\|\]]*))?(?:\|([^\|\]]*))?\]/g,
                        (_match, url, filename = '', type = '') => {
                          const cleanUrl = (url || '').trim();
                          const cleanFilename = (filename || '').trim();
                          const cleanType = (type || '').trim();
                          const isImg =
                            cleanType.startsWith('image/') ||
                            cleanType.startsWith('video/') ||
                            Boolean(cleanUrl.match(/\.(jpeg|jpg|png|gif|webp|svg|bmp)(\?.*)?$/i)) ||
                            Boolean(cleanUrl.includes('/image/upload/')) ||
                            cleanUrl.startsWith('blob:') ||
                            cleanUrl.startsWith('data:') ||
                            Boolean(cleanFilename.match(/\.(jpeg|jpg|png|gif|webp|svg|bmp)$/i));
                          if (isImg) {
                            images.push({ url: cleanUrl, filename: cleanFilename || 'Attachment', type: cleanType || 'image/jpeg' });
                          } else {
                            files.push({ url: cleanUrl, filename: cleanFilename || 'File', type: cleanType || 'application/octet-stream' });
                          }
                          return '';
                        }
                      )
                      .trim();

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
                              <a
                                key={idx}
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 rounded-xl bg-[#252728] border border-[#4E4F50] hover:border-slate-400 transition-colors w-full group"
                              >
                                <div className="w-10 h-10 rounded-lg bg-[#3A3B3C] flex items-center justify-center shrink-0">
                                  <Paperclip className="w-5 h-5 text-slate-400" />
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                  <span className="text-xs font-semibold text-slate-200 truncate">
                                    {file.filename || 'Attached file'}
                                  </span>
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
            <span className="font-normal text-slate-500">
              {formatDateTime(log.createdAt)}
              {log.isEdited && ' (edited)'}
            </span>
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
                      onClick={() => {
                        setIsEditing(true);
                        setShowMenu(false);
                      }}
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
                <img
                  src={
                    currentUser?.image ||
                    `https://api.dicebear.com/7.x/notionists/svg?seed=${
                      currentUser?.name || currentUser?.email || currentUser?.id
                    }`
                  }
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <div className="w-full bg-[#3A3B3C] border border-[#4E4F50] rounded-xl p-2 min-h-[44px] focus-within:border-[#C7F33C] flex flex-col gap-1 transition-colors">
                  {replyingToUsername && (
                    <div className="flex items-center gap-1 mb-1">
                      <span className="font-bold text-black bg-[#C7F33C] px-1.5 py-1 rounded-md text-xs flex items-center gap-1">
                        @{replyingToUsername}
                        <button onClick={() => setReplyingToUsername(null)} className="hover:text-slate-600 ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                  )}
                  <textarea
                    ref={replyInputRef}
                    rows={1}
                    value={replyContent}
                    onChange={(e) => {
                      setReplyContent(e.target.value);
                      adjustReplyTextareaHeight(e.target);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (e.shiftKey) {
                          setTimeout(() => adjustReplyTextareaHeight(replyInputRef.current), 0);
                          return;
                        }
                        const isMobileDevice =
                          typeof window !== 'undefined' &&
                          ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
                          window.innerWidth < 768;

                        if (!isMobileDevice) {
                          e.preventDefault();
                          handleReply();
                        } else {
                          setTimeout(() => adjustReplyTextareaHeight(replyInputRef.current), 0);
                        }
                      }
                    }}
                    placeholder="Write a reply..."
                    autoFocus
                    style={{ height: 'auto', minHeight: '28px', maxHeight: '120px' }}
                    className="w-full bg-transparent text-xs text-slate-100 focus:outline-none resize-none overflow-y-auto leading-5 custom-scrollbar py-1"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setIsReplying(false);
                      setReplyingToUsername(null);
                    }}
                    className="text-xs font-semibold text-slate-500 hover:underline"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReply}
                    className="text-xs font-bold bg-[#C7F33C] text-black px-3 py-1.5 rounded-full hover:bg-[#b0d635] cursor-pointer"
                  >
                    <Send className="w-3 h-3 inline mr-1" /> Reply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
