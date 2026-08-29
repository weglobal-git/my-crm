import { Search } from "lucide-react";
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

  const { id: userId, role, department } = session.user as any;

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
        { owner: { department: { name: department } } },
        { teamMembers: { some: { department: { name: department } } } }
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
      owner: { include: { department: true } },
      teamMembers: { include: { department: true } },
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
    <div className="w-full h-full flex flex-col max-w-[1600px] mx-auto">
      {/* Header section */}
      <div className="flex flex-col gap-8 mb-10">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          Works Space
        </h1>
        
        {/* Large Pill Search Bar */}
        <div className="flex items-center w-full max-w-2xl bg-white rounded-full p-2 pl-6 shadow-sm border border-slate-100 focus-within:shadow-md focus-within:border-[#007aff] transition-all">
          <input 
            type="text" 
            placeholder="Search and Filter....." 
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-slate-400"
          />
          <button className="w-12 h-12 flex items-center justify-center bg-black text-white rounded-full hover:bg-slate-800 transition-colors shrink-0">
            <Search className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Kanban Board Area */}
      <div className="flex-1 min-h-0">
        <KanbanBoard initialStages={stages} initialOpportunities={opportunities} />
      </div>
    </div>
  );
}
