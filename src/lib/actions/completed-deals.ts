"use server";

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requirePipelineActor, getOpportunityAccessWhere } from "@/lib/pipeline-security";
import { pipelineOpportunitySelect, type KanbanCardDTO } from "@/lib/pipeline-opportunities";

export async function getMoreCompletedOpportunities(
  skip: number,
  searchQuery?: string
): Promise<KanbanCardDTO[]> {
  const actor = await requirePipelineActor();

  const whereClause: Prisma.OpportunityWhereInput = {
    ...getOpportunityAccessWhere(actor),
    status: { in: ["WON", "LOST", "COMPLETED", "CANCELLED"] },
  };

  if (searchQuery) {
    whereClause.AND = [
      {
        OR: [
          { topic: { contains: searchQuery, mode: "insensitive" } },
          { company: { name: { contains: searchQuery, mode: "insensitive" } } },
        ],
      },
    ];
  }

  const opportunities = await prisma.opportunity.findMany({
    ...(process.env.NODE_ENV === "production" ? { relationLoadStrategy: "join" as const } : {}),
    where: whereClause,
    select: pipelineOpportunitySelect,
    orderBy: { closedAt: "desc" },
    skip,
    take: 20,
  });

  return opportunities as KanbanCardDTO[];
}
