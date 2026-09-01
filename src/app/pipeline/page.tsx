import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserVisibleMenuKeys } from "@/lib/actions/permission";
import { getCompanies } from "@/lib/actions/company";
import { getPipelineOpportunities } from "@/lib/actions/opportunity";
import { PipelineView } from "@/components/pipeline/PipelineView";

export const dynamic = 'force-dynamic';

export default async function PipelinePage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const tab = resolvedSearchParams?.tab === 'completed' ? 'completed' : 'workspace';
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search : '';
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/");
  }

  const { id: userId, role } = session.user as { id: string; role: string };

  if (role !== 'ADMIN') {
    const visibleKeys = await getUserVisibleMenuKeys(userId);
    if (!visibleKeys.includes('pipeline')) {
      redirect("/");
    }
  }

  // Fetch the first board snapshot on the server so the Kanban does not wait
  // for hydration before starting its most important query.
  const [stages, companies, serializedOpportunities] = await Promise.all([
    prisma.pipelineStage.findMany({ orderBy: { order: 'asc' } }),
    getCompanies(),
    getPipelineOpportunities(tab, search || undefined),
  ]);
  const initialOpportunities = JSON.parse(serializedOpportunities);

  return (
    <PipelineView 
      userId={userId}
      role={role}
      stages={stages}
      companies={companies}
      initialOpportunities={initialOpportunities}
      initialTab={tab}
    />
  );
}
