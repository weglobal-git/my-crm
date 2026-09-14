import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserVisibleMenuKeys } from "@/lib/actions/permission";
import { WelcomeLogin } from "@/components/layout/WelcomeLogin";

export default async function RootPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return <WelcomeLogin />;
  }

  const isAdmin = session.user.role === "ADMIN";
  const visibleKeys = isAdmin ? [] : await getUserVisibleMenuKeys(session.user.id);

  if (isAdmin || visibleKeys.includes("crm_overview")) {
    redirect("/dashboard/overview");
  }

  if (visibleKeys.includes("pipeline")) {
    redirect("/pipeline");
  }

  if (visibleKeys.includes("quotation")) {
    redirect("/quotations");
  }

  if (visibleKeys.includes("contact")) {
    redirect("/contact");
  }

  if (visibleKeys.includes("calendar")) {
    redirect("/calendar");
  }

  redirect("/pipeline");
}

