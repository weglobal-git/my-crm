import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserVisibleMenuKeys } from "@/lib/actions/permission";
import { getDashboardSalesSnapshot, resolveDashboardSectionAccess } from "@/lib/dashboard/dashboard-data";
import { DashboardOverviewView } from "@/components/dashboard/DashboardOverviewView";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string | string[]; year?: string | string[]; tab?: string | string[] }>;
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

  const sections = resolveDashboardSectionAccess(visibleKeys, isAdmin);
  const canSeeSales = Object.values(sections).some(Boolean);
  const snapshot = canSeeSales ? await getDashboardSalesSnapshot({ month, year }) : null;
  const initialTab = rawTab === "leaderboard" ? "leaderboard" : canSeeSales ? "sale_deal" : "leaderboard";

  return <DashboardOverviewView snapshot={snapshot} sections={sections} initialTab={initialTab} />;
}
