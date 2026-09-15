import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getCompaniesWithContacts,
  getContactActor,
  getCompanyTypes,
  getCompanyCountries,
} from "@/lib/actions/contact";
import { ContactView } from "@/components/contact/ContactView";

// Preload and render Account & Person view with lightweight SSR
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  // Fetch actor once for the entire SSR request to eliminate duplicate auth/user queries
  const actor = await getContactActor();

  // Preload initial companies, stats, types, and countries on the server concurrently
  const [{ companies, stats, total }, initialTypes, initialCountries] = await Promise.all([
    getCompaniesWithContacts({
      status: "QUALIFIED",
      type: "ALL",
      search: "",
      page: 1,
      pageSize: 20,
      actor,
    }),
    getCompanyTypes(),
    getCompanyCountries(),
  ]);

  return (
    <ContactView
      initialCompanies={companies}
      initialStats={stats}
      initialTotal={total}
      initialTypes={initialTypes}
      initialCountries={initialCountries}
      actorId={actor.id}
    />
  );
}

