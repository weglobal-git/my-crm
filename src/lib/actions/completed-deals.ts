"use server";

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requirePipelineActor, getOpportunityAccessWhere } from "@/lib/pipeline-security";
import {
  pipelineOpportunitySelect,
  buildPipelineSearchWhere,
  type KanbanCardDTO,
} from "@/lib/pipeline-opportunities";
import {
  getCompletedOpportunitiesCursorForActor,
  type CompletedCursorResult,
} from "@/lib/pipeline-cursor";

export type { CompletedCursorResult };

/**
 * Stable keyset-based completed opportunities pagination.
 * Ordered by closedAt DESC with id DESC as deterministic tie-breaker.
 * Server action: Actor is resolved strictly from session/access context.
 */
export async function getCompletedOpportunitiesCursor(
  cursor?: string | null,
  searchQuery?: string,
  limit = 20
): Promise<CompletedCursorResult> {
  const actor = await requirePipelineActor();
  return getCompletedOpportunitiesCursorForActor(actor, cursor, searchQuery, limit);
}

/**
 * Legacy offset-based completed opportunities pagination retained for backwards-compatibility.
 */
export async function getMoreCompletedOpportunities(
  skip: number,
  searchQuery?: string
): Promise<KanbanCardDTO[]> {
  const actor = await requirePipelineActor();

  const whereClause: Prisma.OpportunityWhereInput = {
    ...getOpportunityAccessWhere(actor),
    status: { in: ["WON", "LOST", "COMPLETED", "CANCELLED"] },
  };

  const searchWhere = buildPipelineSearchWhere(searchQuery);
  if (searchWhere.OR) {
    whereClause.AND = [{ OR: searchWhere.OR }];
  }

  const opportunities = await prisma.opportunity.findMany({
    ...(process.env.NODE_ENV === "production" ? { relationLoadStrategy: "join" as const } : {}),
    where: whereClause,
    select: pipelineOpportunitySelect,
    orderBy: [{ closedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    skip,
    take: 20,
  });

  return opportunities as KanbanCardDTO[];
}
