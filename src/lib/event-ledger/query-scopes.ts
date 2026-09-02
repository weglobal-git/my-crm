type WhereInput = Readonly<Record<string, unknown>>;

export const ACTIVE_OPPORTUNITY_WHERE = Object.freeze({ deletedAt: null });
export const ACTIVE_ACTIVITY_WHERE = Object.freeze({ deletedAt: null });

export function activeOpportunityWhere<T extends WhereInput>(where?: T) {
  return withActiveScope(ACTIVE_OPPORTUNITY_WHERE, where);
}

export function activeActivityWhere<T extends WhereInput>(where?: T) {
  return withActiveScope(ACTIVE_ACTIVITY_WHERE, where);
}

export function activeActivityTreeWhere(dealId: string) {
  if (!dealId.trim()) throw new Error("dealId must not be empty");
  return activeActivityWhere({ opportunityId: dealId, parentId: null });
}

export function activeRepliesRelation() {
  return { where: ACTIVE_ACTIVITY_WHERE };
}

export function isActiveRecord(record: { deletedAt: Date | null } | null | undefined): boolean {
  return Boolean(record && record.deletedAt === null);
}

function withActiveScope<T extends WhereInput>(active: WhereInput, where?: T) {
  if (!where || Object.keys(where).length === 0) return active;
  return { AND: [active, where] } as const;
}
