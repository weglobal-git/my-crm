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

  // Preload actor, types, and countries concurrently with maximum parallelism
  const actorPromise = getContactActor(session);
  const typesPromise = getCompanyTypes();
  const countriesPromise = getCompanyCountries();

  const actor = await actorPromise;

  const [companiesResult, initialTypes, initialCountries] = await Promise.all([
    getCompaniesWithContacts({
      status: "QUALIFIED",
      type: "ALL",
      search: "",
      page: 1,
      pageSize: 20,
      actor,
    }),
    typesPromise,
    countriesPromise,
  ]);

  const { companies, stats, total } = companiesResult;

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

