'use client';

import React from 'react';
import type { Session } from 'next-auth';
import { Trash2 } from 'lucide-react';
import type { ActivityLogWithRelations, ActivityLogPage } from '@/lib/pipeline-activity-cache';
import { renderCommentText } from '@/components/ui/HighlightText';

export interface DealSystemLogsTabProps {
  localActivityLogs: ActivityLogWithRelations[];
  isLoadingLogs: boolean;
  rawLocalActivityPages?: ActivityLogPage[];
  activitySearchQuery?: string;
  session: Session | null;
  onDeleteSystemLog?: (logId: string) => Promise<void> | void;
}

function formatDateTime(date: Date | string) {
  const d = new Date(date);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function DealSystemLogsTab({
  localActivityLogs,
  isLoadingLogs,
  rawLocalActivityPages,
  activitySearchQuery = '',
  session,
  onDeleteSystemLog,
}: DealSystemLogsTabProps) {
  if (isLoadingLogs && !rawLocalActivityPages) {
    return (
      <div className="flex flex-col gap-4 mt-4 w-full">
        {[1, 2, 3].map((i) => (
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

  let sysLogs = localActivityLogs.filter((log) => log.type === 'SYSTEM_UPDATE');

  if (activitySearchQuery.trim()) {
    const query = activitySearchQuery.toLowerCase();
    sysLogs = sysLogs.filter(
      (log) =>
        log.content?.toLowerCase().includes(query) ||
        log.user?.name?.toLowerCase().includes(query)
    );
  }

  if (sysLogs.length === 0) {
    return (
      <div className="text-center py-10 bg-[#3A3B3C] rounded-2xl border border-[#4E4F50]">
        <p className="text-xs text-slate-300 font-medium">
          {activitySearchQuery.trim() ? 'No system logs found.' : 'No system logs.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 mt-2">
      {sysLogs.map((log) => (
        <div key={log.id} className="flex gap-3 group/sys">
          <div className="w-8 h-8 rounded-full bg-[#3A3B3C] shrink-0 overflow-hidden mt-0.5 flex items-center justify-center">
            {log.user ? (
              <img
                src={
                  log.user.image ||
                  `https://api.dicebear.com/7.x/notionists/svg?seed=${
                    log.user.name || log.user.email || log.userId
                  }`
                }
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
            )}
          </div>
          <div className="flex flex-col flex-1 justify-center">
            <span className="text-xs text-slate-500 mb-0.5 font-medium">
              <strong className="text-slate-300">{log.user?.name || 'System'}</strong> •{' '}
              {formatDateTime(log.createdAt)}
            </span>
            <p className="text-[13px] text-slate-300 font-medium italic whitespace-pre-wrap">
              {renderCommentText(log.content?.trim() || '', activitySearchQuery)}
            </p>
          </div>
          {session?.user?.role === 'ADMIN' && onDeleteSystemLog && (
            <button
              onClick={() => onDeleteSystemLog(log.id)}
              className="opacity-0 group-hover/sys:opacity-100 p-1.5 text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
              title="Delete System Log"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
