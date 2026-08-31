import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { OpportunityWithRelations } from "@/components/pipeline/KanbanCard";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { getUserVisibleMenuKeys } from "@/lib/actions/permission";

import Link from "next/link";
import { PipelineSearch } from "@/components/pipeline/PipelineSearch";

export const dynamic = 'force-dynamic';

export default async function PipelinePage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const tab = resolvedSearchParams?.tab === 'completed' ? 'completed' : 'workspace';
  const searchQuery = resolvedSearchParams?.search as string | undefined;
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/");
  }

  const { id: userId, role, department } = session.user as { id: string; role: string; department?: unknown };

  if (role !== 'ADMIN') {
    const visibleKeys = await getUserVisibleMenuKeys(userId);
    if (!visibleKeys.includes('pipeline')) {
      redirect("/");
    }
  }

  // Base where clause
  const whereClause: Prisma.OpportunityWhereInput = {
    status: tab === 'completed' 
      ? { in: ["WON", "LOST", "COMPLETED", "CANCELLED"] } 
      : "OPEN"
  };

  // RBAC Filtering
  if (role === "GENERAL") {
    // Sees ONLY deals where ownerId === user.id OR teamMembers contains user.id
    whereClause.OR = [
      { ownerId: userId },
      { teamMembers: { some: { id: userId } } }
    ];
  } else if (role === "MANAGER") {
    // Sees ALL deals where owner or teamMembers are in the same department
    if (department) {
      whereClause.OR = [
        { owner: { departments: { some: { name: department } } } },
        { teamMembers: { some: { departments: { some: { name: department } } } } }
      ];
    } else {
      // If manager has no department, default to just their own stuff like GENERAL
      whereClause.OR = [
        { ownerId: userId },
        { teamMembers: { some: { id: userId } } }
      ];
    }
  }

  // Handle Search Filtering
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

  // Fetch real data from DB
  const stages = await prisma.pipelineStage.findMany({
    orderBy: { order: 'asc' }
  });

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
    orderBy: tab === 'completed' ? { closedAt: 'desc' } : { updatedAt: 'desc' },
    take: tab === 'completed' ? 20 : undefined,
  });

  // Transform to the structure KanbanBoard expects initially, or pass raw data and let KanbanBoard handle it.
  // We'll pass the raw data so the board can render it accurately.
  return (
    <div className="flex flex-col w-full h-full bg-[#252728]">
      {/* 2. WORK SPACE */}
      <main className={`flex-1 ${tab === 'completed' ? 'overflow-y-auto' : 'overflow-hidden'} hide-scrollbar p-6 flex flex-col`}>
        <div className="max-w-[1400px] mx-auto w-full flex flex-col h-full gap-4 min-h-0">
          
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2 bg-[#252728] p-1 rounded-full">
              <Link 
                href="/pipeline?tab=workspace"
                className={`px-5 py-2 text-sm font-semibold flex items-center gap-2 rounded-full transition-all ${tab === 'workspace' ? 'bg-[#3A3B3C] text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                My Workspace
              </Link>
              <Link 
                href="/pipeline?tab=completed"
                className={`px-5 py-2 text-sm font-semibold flex items-center gap-2 rounded-full transition-all ${tab === 'completed' ? 'bg-[#3A3B3C] text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Completed Projects
              </Link>
            </div>
            <div>
              <PipelineSearch />
            </div>
          </div>

          <KanbanBoard 
            currentUserId={userId} 
            currentUserRole={role}
            initialStages={stages} 
            initialOpportunities={opportunities as OpportunityWithRelations[]} 
            isCompletedTab={tab === 'completed'}
          />
        </div>
      </main>
    </div>
  );
}
