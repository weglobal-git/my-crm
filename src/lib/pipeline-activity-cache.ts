import type { ActivityLog, User } from '@prisma/client';

export type ActivityLogWithRelations = ActivityLog & {
  user: User;
  replies?: ActivityLogWithRelations[];
};

export type ActivityLogPage = {
  data: ActivityLogWithRelations[];
  nextCursor?: string;
};

export type ActivityUpdateEvent = {
  dealId?: string;
  action?: string;
  activityLog?: ActivityLogWithRelations;
  logId?: string;
};

const updateReplies = (
  parent: ActivityLogWithRelations,
  update: (replies: ActivityLogWithRelations[]) => ActivityLogWithRelations[],
) => ({ ...parent, replies: update(parent.replies || []) });

export function applyActivityEvent(
  pages: ActivityLogPage[] | undefined,
  event: ActivityUpdateEvent,
) {
  if (!pages) return pages;
  const log = event.activityLog;

  if (event.action === 'ACTIVITY_ADDED' && log) {
    if (log.parentId) {
      return pages.map(page => ({
        ...page,
        data: page.data.map(parent => parent.id === log.parentId
          ? updateReplies(parent, replies => [...replies.filter(reply => reply.id !== log.id), log])
          : parent),
      }));
    }
    if (pages.some(page => page.data.some(item => item.id === log.id))) return pages;
    return pages.map((page, index) => index ? page : { ...page, data: [log, ...page.data] });
  }

  if (event.action === 'ACTIVITY_UPDATED' && log) {
    return pages.map(page => ({
      ...page,
      data: page.data.map(parent => parent.id === log.id
        ? log
        : updateReplies(parent, replies => replies.map(reply => reply.id === log.id ? log : reply))),
    }));
  }

  if (event.action === 'ACTIVITY_DELETED' && event.logId) {
    return pages.map(page => ({
      ...page,
      data: page.data
        .filter(parent => parent.id !== event.logId)
        .map(parent => updateReplies(parent, replies => replies.filter(reply => reply.id !== event.logId))),
    }));
  }

  return pages;
}

export function replaceOptimisticActivity(
  pages: ActivityLogPage[] | undefined,
  temporaryId: string,
  persistedLog: ActivityLogWithRelations,
) {
  if (!pages) return pages;
  const hasTemporary = pages.some(page => page.data.some(parent =>
    parent.id === temporaryId || parent.replies?.some(reply => reply.id === temporaryId)
  ));
  if (!hasTemporary) return pages;

  return pages.map(page => ({
    ...page,
    data: page.data
      .filter(parent => parent.id !== persistedLog.id)
      .map(parent => parent.id === temporaryId
        ? persistedLog
        : updateReplies(parent, replies => replies
            .filter(reply => reply.id !== persistedLog.id)
            .map(reply => reply.id === temporaryId ? persistedLog : reply))),
  }));
}
