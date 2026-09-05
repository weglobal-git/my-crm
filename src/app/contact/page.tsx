import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompaniesWithContacts, getAccountOverview, getContactActor } from "@/lib/actions/contact";
import { ContactView } from "@/components/contact/ContactView";

// Preload and render Account & Person view with updated Prisma schema
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  // Fetch actor once for the entire SSR request to eliminate duplicate auth/user queries
  const actor = await getContactActor();

  // Preload initial companies and stats on the server with consolidated queries
  const { companies, stats, total } = await getCompaniesWithContacts({
    status: "QUALIFIED",
    type: "CUSTOMER",
    search: "",
    page: 1,
    pageSize: 20,
    actor,
  });

  const firstCompanyId = companies[0]?.id;
  const initialOverview = firstCompanyId
    ? await getAccountOverview(firstCompanyId, { actor })
    : null;

  return (
    <ContactView
      initialCompanies={companies}
      initialStats={stats}
      initialTotal={total}
      initialOverview={initialOverview}
    />
  );
}
