import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PipelineView } from "@/components/pipeline/PipelineView";
import { requirePipelineActor } from '@/lib/pipeline-security';
import { getPipelineOpportunitiesForActor } from '@/lib/pipeline-opportunities';
import { getPipelineStageTitleContext } from '@/lib/pipeline-stage-titles';

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

  // Fetch the first board snapshot on the server so the Kanban does not wait
  // for hydration before starting its most important query.
  // Secondary accelerator badges and deal summary indicators are fetched
  // on-demand client-side via SWR to eliminate the blocking SSR waterfall.
  const [stages, serializedOpportunities, stageTitleContext] = await Promise.all([
    prisma.pipelineStage.findMany({ orderBy: { order: 'asc' } }),
    getPipelineOpportunitiesForActor(actor, tab, search || undefined),
    getPipelineStageTitleContext(actor),
  ]);
  const initialOpportunities = JSON.parse(serializedOpportunities);

  return (
    <PipelineView 
      userId={actor.id}
      role={actor.role}
      stages={stages}
      initialOpportunities={initialOpportunities}
      stageTitleDepartments={stageTitleContext.departments}
      initialStageTitlesByDepartment={stageTitleContext.titlesByDepartment}
      canEditStageTitles={stageTitleContext.canEdit}
      initialTab={tab}
    />
  );
}
