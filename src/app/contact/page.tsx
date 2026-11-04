import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getCachedInitialCompanies,
  getContactActor,
  getCompanyTypes,
  getCompanyCountries,
} from "@/lib/actions/contact";
import { ContactView } from "@/components/contact/ContactView";
import { getStoredAccountCardDensityServer } from "@/lib/contact/account-card-density-server";

// Preload and render Account & Person view with lightweight SSR
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  // Preload actor first to avoid duplicate user lookup in companies query
  const actor = await getContactActor(session);

  // Preload companies, types, countries, and density preference concurrently
  const [companiesResult, initialTypes, initialCountries, initialCardDensity] = await Promise.all([
    getCachedInitialCompanies(actor),
    getCompanyTypes(),
    getCompanyCountries(),
    getStoredAccountCardDensityServer(actor.id),
  ]);

  const { companies, stats, total } = companiesResult;

  return (
    <ContactView
      initialCompanies={companies}
      initialStats={stats}
      initialTotal={total}
      initialTypes={initialTypes}
      initialCountries={initialCountries}
      initialCardDensity={initialCardDensity}
      actorId={actor.id}
    />
  );
}

