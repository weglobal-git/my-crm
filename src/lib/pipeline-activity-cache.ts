import type { ActivityLog, User } from '@prisma/client';

export type ActivityLogWithRelations = ActivityLog & {
  user: User;
  replies?: ActivityLogWithRelations[];
};

export type ActivityLogPage = {
  data: ActivityLogWithRelations[];
  nextCursor?: string;
};

/** Summary and other right-menu views own their data; never fetch hidden logs. */
export function activityFeedKey(
  dealId: string,
  view: string,
  isOpen: boolean,
  previousPage: { nextCursor?: string } | null,
): [string, string, 'COMMENT' | 'SYSTEM_UPDATE', string] | null {
  if (!isOpen || (view !== 'activity' && view !== 'system')) return null;
  if (previousPage && !previousPage.nextCursor) return null;
  return ['activity-logs', dealId, view === 'system' ? 'SYSTEM_UPDATE' : 'COMMENT', previousPage?.nextCursor ?? ''];
}

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

/** On-Demand Tab Cache Key: only fetch AI Summary when the user is actively viewing the summary tab */
export function dealSummaryKey(
  dealId: string | undefined,
  activeTab: string,
  isOpen: boolean,
): [string, string] | null {
  if (!isOpen || !dealId || activeTab !== 'summary') return null;
  return ['deal-summary-on-demand', dealId];
}

/** On-Demand Tab Cache Key: only fetch Shared Media when the user is actively viewing the sharedMedia tab */
export function sharedMediaKey(
  dealId: string | undefined,
  activeTab: string,
  isOpen: boolean,
): [string, string] | null {
  if (!isOpen || !dealId || activeTab !== 'sharedMedia') return null;
  return ['opportunity-shared-media', dealId];
}

export interface ParsedLogAttachment {
  url: string;
  filename: string;
  type: string;
  isImage: boolean;
}

export function parseLogContent(content: string) {
  const attachments: ParsedLogAttachment[] = [];
  const cleanText = (content || '')
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

        attachments.push({
          url: cleanUrl,
          filename: cleanFilename || 'Attachment',
          type: cleanType || (isImg ? 'image/jpeg' : 'application/octet-stream'),
          isImage: isImg,
        });
        return '';
      }
    )
    .trim();

  const images = attachments.filter((a) => a.isImage);
  const otherFiles = attachments.filter((a) => !a.isImage);

  return { cleanText, images, otherFiles };
}

