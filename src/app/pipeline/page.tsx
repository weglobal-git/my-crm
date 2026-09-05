import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PipelineView } from "@/components/pipeline/PipelineView";
import { requirePipelineActor } from '@/lib/pipeline-security';
import { getPipelineOpportunitiesForActor } from '@/lib/pipeline-opportunities';

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
  // getCompanies is loaded on demand when user opens CreateDealButton.
  const [stages, serializedOpportunities] = await Promise.all([
    prisma.pipelineStage.findMany({ orderBy: { order: 'asc' } }),
    getPipelineOpportunitiesForActor(actor, tab, search || undefined),
  ]);
  const initialOpportunities = JSON.parse(serializedOpportunities);

  return (
    <PipelineView 
      userId={actor.id}
      role={actor.role}
      stages={stages}
      initialOpportunities={initialOpportunities}
      initialTab={tab}
    />
  );
}
