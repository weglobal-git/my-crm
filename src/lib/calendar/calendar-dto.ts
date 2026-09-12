export type CalendarItemType =
  | 'EVENT'
  | 'DEAL_GOODS_READY'
  | 'DEAL_GOODS_LOADING';

export interface CalendarMonthItemDTO {
  id: string;
  sourceType: CalendarItemType;
  sourceId: string;
  title: string;
  accountName?: string | null;
  departmentName?: string | null;
  tags?: Array<{ id: string; name: string; color: string }>;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string | null;
  tagIds: string[];
  owner: {
    id: string;
    name: string | null;
    image: string | null;
  };
  departmentId: string | null;
  canEdit: boolean;
  revision: number;
}

export interface CalendarFinancialInfoDTO {
  opportunityId: string;
  accountName: string | null;
  topicName: string;
  totalValue: number | null;
  currency: string;
  reserveId: string | null;
  invoiceNumber: string | null;
  goodsReadyDate: string | null;
  goodsLoadingDate: string | null;
  status: string;
  revision: number;
  canEdit: boolean;
}

export interface CalendarSearchResultDTO extends CalendarMonthItemDTO {
  matchContext: string | null;
}

export interface CalendarMonthSnapshotDTO {
  rangeStart: string;
  rangeEnd: string;
  year: number;
  month: number;
  items: CalendarMonthItemDTO[];
  generatedAt: string;
}

export interface CalendarEventDetailDTO {
  id: string;
  name: string;
  detail: string | null;
  departmentId: string;
  department: { id: string; name: string };
  ownerId: string;
  owner: { id: string; name: string | null; image: string | null; email: string | null };
  allDay: boolean;
  startAt: string;
  endAt: string;
  timezone: string;
  repeatFrequency: string;
  repeatUntil: string | null;
  revision: number;
  canEdit: boolean;
  tags: Array<{ id: string; name: string; color: string }>;
  recipients: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    image: string | null;
    reminderEnabled: boolean;
    reminderOffsetMins: number;
  }>;
  exceptions: Array<{
    occurrenceStartAt: Date;
    overrideStartAt: Date | null;
    overrideEndAt: Date | null;
    isCancelled: boolean;
  }>;
}
