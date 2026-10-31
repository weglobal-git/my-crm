import { redirect } from "next/navigation";
import { PipelineView } from "@/components/pipeline/PipelineView";
import type { OpportunityWithRelations } from "@/components/pipeline/KanbanCard";
import { requirePipelineActor } from '@/lib/pipeline-security';
import { getPipelineOpportunitiesListForActor } from '@/lib/pipeline-opportunities';
import { getPipelineStageTitleContext, getCachedPipelineStages } from '@/lib/pipeline-stage-titles';
import { getStoredPinnedDealIdsServer } from "@/lib/user-pinned-deals";
import { getCompanyHolidaysAction, getUserLeavesAction } from "@/lib/actions/holiday";

export const dynamic = 'force-dynamic';

export default async function PipelinePage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const tab = resolvedSearchParams?.tab === 'completed' ? 'completed' : 'workspace';
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search : '';
  const actor = await requirePipelineActor().catch(error => {
    if (error instanceof Error && ['Unauthorized', 'Forbidden'].includes(error.message)) {
      redirect('/');
    }
    throw error;
  });

  // Fetch the first board snapshot + cached holidays/leaves on the server in parallel
  // so KanbanBoard renders accurate Red/Due Today state at 0ms without 2 extra mount Server Actions
  // or redundant JSON.stringify -> JSON.parse CPU overhead.
  const [stages, opportunitiesResult, stageTitleContext, userPinnedSet, initialHolidays, initialLeaves] = await Promise.all([
    getCachedPipelineStages(),
    getPipelineOpportunitiesListForActor(actor, tab, search || undefined),
    getPipelineStageTitleContext(actor),
    getStoredPinnedDealIdsServer(actor.id),
    getCompanyHolidaysAction(),
    getUserLeavesAction(),
  ]);
  const rawOpportunities = opportunitiesResult.data as OpportunityWithRelations[];
  const initialOpportunities = rawOpportunities.map((opp) => ({
    ...opp,
    isPinned: userPinnedSet.has(opp.id),
  }));

  return (
    <PipelineView 
      userId={actor.id}
      role={actor.role}
      stages={stages}
      initialOpportunities={initialOpportunities}
      initialPinnedDealIds={Array.from(userPinnedSet)}
      initialHolidays={initialHolidays}
      initialLeaves={initialLeaves}
      stageTitleDepartments={stageTitleContext.departments}
      initialStageTitlesByDepartment={stageTitleContext.titlesByDepartment}
      canEditStageTitles={stageTitleContext.canEdit}
      initialTab={tab}
    />
  );
}

