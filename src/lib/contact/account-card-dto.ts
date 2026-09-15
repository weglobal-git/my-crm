import { ContactStatus, ContactType } from "@prisma/client";
import { normalizeCountryName } from "@/lib/data/countries";

export interface AccountCardDTO {
  id: string;
  displayName: string | null;
  name: string;
  status: ContactStatus;
  type: ContactType;
  country: string | null;
  starRating: number;
  successRate: number;
  wonDealsCount: number;
  totalDealsCount: number;
  revision: string; // server-issued ordering token, updatedAt ISO string
}

export function calculateSuccessRate(wonDealsCount: number, totalDealsCount: number): number {
  if (totalDealsCount <= 0) return 0;
  return Math.round((wonDealsCount / totalDealsCount) * 100);
}

export function accountMatchesFilters(
  account: {
    displayName?: string | null;
    name: string;
    status: ContactStatus;
    type: ContactType;
    country?: string | null;
  },
  filters: {
    status?: ContactStatus | "ALL";
    type?: ContactType | "ALL";
    country?: string;
    search?: string;
  }
): boolean {
  if (filters.status && filters.status !== "ALL" && account.status !== filters.status) {
    return false;
  }
  if (filters.type && filters.type !== "ALL" && account.type !== filters.type) {
    return false;
  }
  if (filters.country && filters.country !== "ALL" && filters.country.trim()) {
    const accCountry = (account.country || "").trim().toLowerCase();
    const filterCountry = filters.country.trim().toLowerCase();
    const accNorm = normalizeCountryName(account.country).toLowerCase();
    const filterNorm = normalizeCountryName(filters.country).toLowerCase();
    if (accCountry !== filterCountry && accNorm !== filterNorm) {
      return false;
    }
  }
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    const nameMatch = (account.name || "").toLowerCase().includes(q);
    const displayMatch = (account.displayName || "").toLowerCase().includes(q);
    const countryMatch = (account.country || "").toLowerCase().includes(q);
    if (!nameMatch && !displayMatch && !countryMatch) {
      return false;
    }
  }
  return true;
}
