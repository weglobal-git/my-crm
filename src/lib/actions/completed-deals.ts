"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { getUserVisibleMenuKeys } from "@/lib/actions/permission";

export async function getMoreCompletedOpportunities(skip: number, searchQuery?: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  
  const { id: userId, role, department } = session.user as { id: string; role: string; department?: unknown };

  if (role !== 'ADMIN') {
    const visibleKeys = await getUserVisibleMenuKeys(userId);
    if (!visibleKeys.includes('pipeline')) throw new Error("Unauthorized");
  }

  const whereClause: Prisma.OpportunityWhereInput = {
    status: { in: ["WON", "LOST", "COMPLETED", "CANCELLED"] }
  };

  if (role === "GENERAL") {
    whereClause.OR = [
      { ownerId: userId },
      { teamMembers: { some: { id: userId } } }
    ];
  } else if (role === "MANAGER") {
    if (department) {
      whereClause.OR = [
        { owner: { departments: { some: { name: department as string } } } },
        { teamMembers: { some: { departments: { some: { name: department as string } } } } }
      ];
    } else {
      whereClause.OR = [
        { ownerId: userId },
        { teamMembers: { some: { id: userId } } }
      ];
    }
  }

  if (searchQuery) {
    whereClause.AND = [
      {
        OR: [
          { topic: { contains: searchQuery, mode: 'insensitive' } },
          { company: { name: { contains: searchQuery, mode: 'insensitive' } } }
        ]
      }
    ];
  }

  const opportunities = await prisma.opportunity.findMany({
    where: whereClause,
    include: {
      company: true,
      owner: { include: { departments: true } },
      teamMembers: { include: { departments: true } },
      tags: { include: { tag: true } },
      activityLogs: { 
        where: { parentId: null },
        orderBy: { createdAt: 'desc' }, 
        take: 5,
        select: {
          id: true,
          content: true,
          type: true,
          createdAt: true,
          user: { select: { name: true, image: true } }
        }
      }
    },
    orderBy: { closedAt: 'desc' },
    skip,
    take: 20,
  });

  return opportunities;
}
