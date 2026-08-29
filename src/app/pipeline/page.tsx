import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/");
  }

  const { id: userId, role, department } = session.user as { id: string; role: string; department?: unknown };

  // Base where clause
  const whereClause: Prisma.OpportunityWhereInput = {
    type: "LEAD",
    status: "OPEN"
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

  // Fetch real data from DB
  const stages = await prisma.pipelineStage.findMany({
    where: { boardType: "LEAD" },
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
        include: { 
          user: true,
          replies: {
            orderBy: { createdAt: 'asc' },
            include: {
              user: true
            }
          }
        } 
      }
    },
    orderBy: { updatedAt: 'desc' }
  });

  // Transform to the structure KanbanBoard expects initially, or pass raw data and let KanbanBoard handle it.
  // We'll pass the raw data so the board can render it accurately.
  return (
    <div className="flex flex-col w-full h-full bg-[#f4f5f7]">
      {/* 2. WORK SPACE */}
      <main className="flex-1 overflow-y-auto hide-scrollbar p-6">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col h-full">
          <KanbanBoard initialStages={stages} initialOpportunities={opportunities} />
        </div>
      </main>
    </div>
  );
}
