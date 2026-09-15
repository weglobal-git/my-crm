import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserVisibleMenuKeys } from "@/lib/actions/permission";
import { getDashboardSalesSnapshot, resolveDashboardSectionAccess } from "@/lib/dashboard/dashboard-data";
import { DashboardOverviewView } from "@/components/dashboard/DashboardOverviewView";
import type { PipelineActor } from "@/lib/pipeline-security";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{
    month?: string | string[];
    year?: string | string[];
    tab?: string | string[];
    country?: string | string[];
    account?: string | string[];
  }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const isAdmin = session.user.role === "ADMIN";
  const visibleKeys = isAdmin ? [] : await getUserVisibleMenuKeys(session.user.id);
  if (!isAdmin && !visibleKeys.includes("crm_overview")) redirect("/pipeline");

  const resolved = await searchParams;
  const month = typeof resolved?.month === "string" ? resolved.month : undefined;
  const year = typeof resolved?.year === "string" ? resolved.year : undefined;
  const rawTab = typeof resolved?.tab === "string" ? resolved.tab : undefined;
  const country = typeof resolved?.country === "string" ? resolved.country : undefined;
  const account = typeof resolved?.account === "string" ? resolved.account : undefined;

  const sections = resolveDashboardSectionAccess(visibleKeys, isAdmin);
  const canSeeSales = Object.values(sections).some(Boolean);
  const actor: PipelineActor = {
    id: session.user.id,
    name: session.user.name,
    role: session.user.role as PipelineActor["role"],
    departments: Array.isArray(session.user.departments)
      ? session.user.departments.filter((name): name is string => typeof name === "string")
      : [],
  };
  const snapshot = canSeeSales
    ? await getDashboardSalesSnapshot({
        month,
        year,
        country,
        account,
        actor,
        visibleKeys,
      })
    : null;
  const initialTab = rawTab === "leaderboard" ? "leaderboard" : canSeeSales ? "sale_deal" : "leaderboard";

  return (
    <DashboardOverviewView
      snapshot={snapshot}
      sections={sections}
      initialTab={initialTab}
      actor={actor}
    />
  );
}
