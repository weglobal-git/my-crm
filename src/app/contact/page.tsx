import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompaniesWithContacts, getAccountOverview } from "@/lib/actions/contact";
import { ContactView } from "@/components/contact/ContactView";

// Preload and render Account & Person view with updated Prisma schema
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  // Preload initial companies and stats on the server
  const { companies, stats, total } = await getCompaniesWithContacts({
    status: "QUALIFIED",
    type: "CUSTOMER",
    search: "",
    page: 1,
    pageSize: 20,
  });

  const firstCompanyId = companies[0]?.id;
  const initialOverview = firstCompanyId
    ? await getAccountOverview(firstCompanyId)
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
