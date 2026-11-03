"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ContactType, ContactStatus, Role, Prisma, AddressType } from "@prisma/client";
import { maskEmail, maskPhone } from "@/lib/contact-utils";
import { safePusherTrigger } from "@/lib/pusher-server";
import { normalizeCountryName } from "@/lib/data/countries";
import { notifyPipelineAudience } from "@/lib/pipeline-security";
import { dispatchDashboardInvalidation } from "@/lib/dashboard/dashboard-realtime-server";
import {
  actionFail,
  actionOk,
  type ActionResult,
  isUnfilteredAccountStatusQuery,
  sanitizeContactContactabilityInput,
} from "@/lib/contact/action-result";

const CONTACT_TX_OPTIONS = {
  maxWait: 10_000,
  timeout: 15_000,
} as const;

function toServerErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return "A record with this unique value already exists.";
    }
    if (err.code === "P2025") {
      return "The record was not found or has already been removed.";
    }
    if (err.code === "P2028") {
      return "Database connection timed out across regions. Please click Save/Create again.";
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

export type ContactActor = {
  id: string;
  name: string;
  email: string;
  role: Role;
  departments: string[]; // names of departments
  departmentIds: string[];
};

const ACTOR_CACHE_TTL_MS = 60 * 1000;
const actorCache = new Map<string, { actor: ContactActor; expires: number }>();

type SessionLike = {
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    departments?: string[] | null;
    departmentIds?: string[] | null;
  };
} | null;

export async function getContactActor(
  providedSession?: SessionLike
): Promise<ContactActor> {
  const session =
    providedSession !== undefined ? providedSession : ((await getServerSession(authOptions)) as SessionLike);
  if (!session?.user?.id && !session?.user?.email) {
    throw new Error("Unauthorized");
  }

  const cacheKey = session.user.id || session.user.email || "";
  const cached = actorCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.actor;
  }

  // Fast path: authOptions JWT callback already verified user in DB (15s TTL)
  // and populated role, departments, and departmentIds on session.user.
  if (
    session.user.id &&
    session.user.role &&
    ["ADMIN", "MANAGEMENT", "GENERAL"].includes(session.user.role) &&
    Array.isArray(session.user.departments) &&
    Array.isArray(session.user.departmentIds)
  ) {
    const fastActor: ContactActor = {
      id: session.user.id,
      name: session.user.name || "Unknown User",
      email: session.user.email || "",
      role: session.user.role as Role,
      departments: session.user.departments,
      departmentIds: session.user.departmentIds,
    };
    actorCache.set(cacheKey, { actor: fastActor, expires: Date.now() + ACTOR_CACHE_TTL_MS });
    return fastActor;
  }

  const orConditions: Prisma.UserWhereInput[] = [];
  if (session.user.id) orConditions.push({ id: session.user.id });
  if (session.user.email) orConditions.push({ email: session.user.email });

  const dbUser = await prisma.user.findFirst({
    where: { OR: orConditions },
    include: {
      departments: true,
    },
  });

  if (!dbUser) {
    throw new Error("Unauthorized user not found");
  }

  const actor: ContactActor = {
    id: dbUser.id,
    name: dbUser.name || "Unknown User",
    email: dbUser.email || "",
    role: dbUser.role,
    departments: dbUser.departments.map((d: { name: string }) => d.name),
    departmentIds: dbUser.departments.map((d: { id: string }) => d.id),
  };

  actorCache.set(cacheKey, { actor, expires: Date.now() + ACTOR_CACHE_TTL_MS });
  return actor;
}

export interface GetContactsParams {
  status?: "ALL" | "QUALIFIED" | "UNQUALIFIED";
  type?: "ALL" | ContactType;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function getContacts({
  status = "ALL",
  type = "ALL",
  search = "",
  page = 1,
  pageSize = 50,
}: GetContactsParams = {}) {
  const actor = await getContactActor();

  const where: Prisma.ContactWhereInput = {};

  if (status && status !== "ALL") {
    where.status = status as ContactStatus;
  }

  if (type && type !== "ALL") {
    where.type = type as ContactType;
  }

  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { company: { name: { contains: q, mode: "insensitive" } } },
      { company: { country: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, contacts] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            country: true,
            address: true,
            _count: {
              select: {
                opportunities: true,
              },
            },
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Mask sensitive info if user is NOT Admin and NOT in the same department
  const sanitizedContacts = contacts.map((c: (typeof contacts)[number]) => {
    const isSameDept =
      actor.role === "ADMIN" ||
      (c.department && actor.departments.includes(c.department.name));

    return {
      ...c,
      isMasked: !isSameDept,
      email: isSameDept ? c.email : maskEmail(c.email),
      phone: isSameDept ? c.phone : maskPhone(c.phone),
      rawEmail: isSameDept ? c.email : null,
      rawPhone: isSameDept ? c.phone : null,
      projectCount: c.company?._count?.opportunities || 0,
    };
  });

  // Calculate quick stats for tabs
  const [qualifiedCount, unqualifiedCount, totalCount] = await Promise.all([
    prisma.contact.count({ where: { status: "QUALIFIED" } }),
    prisma.contact.count({ where: { status: "UNQUALIFIED" } }),
    prisma.contact.count(),
  ]);

  return {
    contacts: sanitizedContacts,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    stats: {
      qualifiedCount,
      unqualifiedCount,
      totalCount,
    },
  };
}

export interface GetCompaniesParams {
  status?: "ALL" | "QUALIFIED" | "UNQUALIFIED";
  type?: "ALL" | ContactType;
  types?: (ContactType | string)[];
  country?: string;
  countries?: string[];
  search?: string;
  page?: number;
  pageSize?: number;
  traceId?: string;
  actor?: ContactActor;
}

let cachedCountries: { country: string; count: number }[] | null = null;
let cachedCountryDbVariants = new Map<string, string[]>();
let lastCountriesFetch = 0;
const COUNTRIES_CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute memory cache

export async function getCompanyCountries(): Promise<{ country: string; count: number }[]> {
  const now = Date.now();
  if (cachedCountries && now - lastCountriesFetch < COUNTRIES_CACHE_TTL_MS) {
    return cachedCountries;
  }
  try {
    const raw = await prisma.company.groupBy({
      by: ["country"],
      _count: { id: true },
      where: {
        country: {
          not: null,
        },
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
    });

    const countMap = new Map<string, number>();
    const variantsMap = new Map<string, Set<string>>();

    for (const r of raw) {
      if (!r.country || !r.country.trim()) continue;
      const canonical = normalizeCountryName(r.country);
      countMap.set(canonical, (countMap.get(canonical) || 0) + r._count.id);

      const key = canonical.toUpperCase();
      let s = variantsMap.get(key);
      if (!s) {
        s = new Set<string>();
        variantsMap.set(key, s);
      }
      s.add(r.country.trim());
      s.add(canonical);
    }

    const result = Array.from(countMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);

    cachedCountryDbVariants = new Map(
      Array.from(variantsMap.entries()).map(([k, v]) => [k, Array.from(v)])
    );
    cachedCountries = result;
    lastCountriesFetch = now;
    return result;
  } catch (err) {
    console.error("Failed to fetch company countries:", err);
    return cachedCountries || [];
  }
}

let cachedTypes: { type: ContactType; count: number }[] | null = null;
let lastTypesFetch = 0;
const TYPES_CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute memory cache

export async function getCompanyTypes(): Promise<{ type: ContactType; count: number }[]> {
  const now = Date.now();
  if (cachedTypes && now - lastTypesFetch < TYPES_CACHE_TTL_MS) {
    return cachedTypes;
  }
  try {
    const raw = await prisma.company.groupBy({
      by: ["type"],
      _count: { id: true },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
    });

    const result = raw
      .filter((r) => r.type)
      .map((r) => ({ type: r.type, count: r._count.id }));
    cachedTypes = result;
    lastTypesFetch = now;
    return result;
  } catch (err) {
    console.error("Failed to fetch company types:", err);
    return cachedTypes || [];
  }
}

let cachedStatusStats: { qualifiedCount: number; unqualifiedCount: number; totalCount: number } | null = null;
let lastStatusStatsFetch = 0;
const STATUS_STATS_TTL = 60 * 1000;

export async function getCompaniesWithContacts({
  status = "ALL",
  type = "ALL",
  types,
  country = "",
  countries,
  search = "",
  page = 1,
  pageSize = 20,
  actor: providedActor,
}: GetCompaniesParams = {}) {
  if (!providedActor) await getContactActor();

  const where: Prisma.CompanyWhereInput = {};

  if (status && status !== "ALL") {
    where.status = status as ContactStatus;
  }

  // Multi-type selection support
  if (types && types.length > 0) {
    if (types.length === 1 && types[0] === "__NONE__") {
      where.type = { in: [] };
    } else {
      where.type = { in: types as ContactType[] };
    }
  } else if (type && type !== "ALL") {
    where.type = type as ContactType;
  }

  // Multi-country selection support
  if (countries && countries.length > 0) {
    if (countries.length === 1 && countries[0] === "__NONE__") {
      where.country = { in: [] };
    } else {
      const allVariants = new Set<string>();
      for (const rawCountry of countries) {
        if (!rawCountry || rawCountry === "ALL") continue;
        const trimmed = rawCountry.trim();
        const canonical = normalizeCountryName(trimmed);
        allVariants.add(trimmed);
        allVariants.add(canonical);

        const dbVariants =
          cachedCountryDbVariants.get(canonical.toUpperCase()) ||
          cachedCountryDbVariants.get(trimmed.toUpperCase());
        if (dbVariants) {
          for (const v of dbVariants) {
            allVariants.add(v);
          }
        }

        const canonLower = canonical.toLowerCase();
        if (canonLower === "vietnam") {
          allVariants.add("Viet Nam");
          allVariants.add("viet nam");
          allVariants.add("Vietnam");
        } else if (canonLower === "laos") {
          allVariants.add("Lao People's Democratic Republic");
          allVariants.add("Lao Peoples Democratic Republic");
          allVariants.add("Lao PDR");
          allVariants.add("Lao");
          allVariants.add("Laos");
        } else if (canonLower === "united states" || canonLower === "usa") {
          allVariants.add("United States");
          allVariants.add("USA");
          allVariants.add("U.S.A.");
          allVariants.add("United States of America");
        }
      }
      where.country = { in: Array.from(allVariants) };
    }
  } else if (country && country.trim() && country !== "ALL") {
    const trimmed = country.trim();
    const canonical = normalizeCountryName(trimmed);
    const variants = new Set([trimmed, canonical]);

    // Check cached DB variants mapping
    const dbVariants =
      cachedCountryDbVariants.get(canonical.toUpperCase()) ||
      cachedCountryDbVariants.get(trimmed.toUpperCase());
    if (dbVariants) {
      for (const v of dbVariants) {
        variants.add(v);
      }
    }

    // Common aliases (Laos, Vietnam, USA, etc.)
    const canonLower = canonical.toLowerCase();
    if (canonLower === "vietnam") {
      variants.add("Viet Nam");
      variants.add("viet nam");
      variants.add("Vietnam");
    } else if (canonLower === "laos") {
      variants.add("Lao People's Democratic Republic");
      variants.add("Lao Peoples Democratic Republic");
      variants.add("Lao PDR");
      variants.add("Lao");
      variants.add("Laos");
    } else if (canonLower === "united states" || canonLower === "usa") {
      variants.add("United States");
      variants.add("USA");
      variants.add("U.S.A.");
      variants.add("United States of America");
    }

    where.country = { in: Array.from(variants) };
  }

  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { displayName: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { country: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
      {
        contacts: {
          some: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
  }

  const isFirstPage = page === 1;
  const now = Date.now();
  const isStatsFresh = cachedStatusStats && now - lastStatusStatsFetch < STATUS_STATS_TTL;

  // If there is no custom search and no type/types or country/countries filter, the total count for
  // the status is directly available from the status stats without needing a separate count query
  const isUnfilteredStatusQuery = isUnfilteredAccountStatusQuery({
    page,
    search,
    type,
    types: types as string[] | undefined,
    country,
    countries,
  });

  const shouldRunFilterCount = isFirstPage && !isUnfilteredStatusQuery;

  const [totalCountFromFilter, rawCompaniesWithExtra, freshStatusStats] = await Promise.all([
    shouldRunFilterCount ? prisma.company.count({ where }) : Promise.resolve(0),
    prisma.company.findMany({
      where,
      select: {
        id: true,
        displayName: true,
        name: true,
        country: true,
        phone: true,
        email: true,
        emails: true,
        phones: true,
        status: true,
        type: true,
        starRating: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            contacts: true,
            opportunities: true,
          },
        },
      },
      orderBy: [{ starRating: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize + 1,
    }),
    isFirstPage && !isStatsFresh
      ? prisma.company
          .groupBy({
            by: ["status"],
            _count: { id: true },
          })
          .then((groups) => {
            let qualifiedCount = 0;
            let unqualifiedCount = 0;
            for (const group of groups) {
              if (group.status === "QUALIFIED") {
                qualifiedCount = group._count.id;
              } else if (group.status === "UNQUALIFIED") {
                unqualifiedCount = group._count.id;
              }
            }
            const stats = {
              qualifiedCount,
              unqualifiedCount,
              totalCount: qualifiedCount + unqualifiedCount,
            };
            cachedStatusStats = stats;
            lastStatusStatsFetch = Date.now();
            return stats;
          })
          .catch(() => cachedStatusStats)
      : Promise.resolve(cachedStatusStats),
  ]);

  const hasMore = rawCompaniesWithExtra.length > pageSize;
  const rawCompanies = hasMore
    ? rawCompaniesWithExtra.slice(0, pageSize)
    : rawCompaniesWithExtra;

  // Bounded aggregation queries for deal metrics and AI summary status (No N+1)
  const companyIds = rawCompanies.map((c) => c.id);
  const oppStatsMap = new Map<string, { won: number; total: number }>();
  const aiSummaryMap = new Map<string, boolean>();

  if (companyIds.length > 0) {
    const [oppGroups, aiConfigs] = await Promise.all([
      prisma.opportunity.groupBy({
        by: ["companyId", "status"],
        where: {
          companyId: { in: companyIds },
          value: { gt: 0 },
        },
        _count: { id: true },
      }),
      prisma.systemConfig.findMany({
        where: {
          id: { in: companyIds.map((id) => `account_ai_${id}`) },
        },
        select: { id: true, googleRefreshToken: true },
      }),
    ]);

    for (const row of oppGroups) {
      if (!row.companyId) continue;
      const cur = oppStatsMap.get(row.companyId) || { won: 0, total: 0 };
      cur.total += row._count.id;
      if (row.status === "WON" || (row.status as string) === "COMPLETED") {
        cur.won += row._count.id;
      }
      oppStatsMap.set(row.companyId, cur);
    }

    for (const conf of aiConfigs) {
      if (!conf.googleRefreshToken) continue;
      try {
        const parsed = JSON.parse(conf.googleRefreshToken);
        const hasSummary = Boolean(
          (typeof parsed.companyProfile?.businessSummary === "string" &&
            parsed.companyProfile.businessSummary.trim().length > 0) ||
          (typeof parsed.businessSummary === "string" &&
            parsed.businessSummary.trim().length > 0)
        );
        if (hasSummary) {
          const compId = conf.id.replace("account_ai_", "");
          aiSummaryMap.set(compId, true);
        }
      } catch {
        // ignore parse error
      }
    }
  }

  const enrichedCompanies = rawCompanies.map((comp) => {
    const stats = oppStatsMap.get(comp.id) || { won: 0, total: 0 };
    const wonDealsCount = stats.won;
    const totalDealsCount = stats.total;
    const successRate = totalDealsCount > 0 ? Math.round((wonDealsCount / totalDealsCount) * 100) : 0;
    return {
      ...comp,
      wonDealsCount,
      totalDealsCount,
      successRate,
      hasAiSummary: aiSummaryMap.get(comp.id) ?? false,
      revision: comp.updatedAt.toISOString(),
    };
  });

  const stats = freshStatusStats || cachedStatusStats || {
    qualifiedCount: 0,
    unqualifiedCount: 0,
    totalCount: 0,
  };

  const computedTotal = isFirstPage
    ? isUnfilteredStatusQuery
      ? status === "QUALIFIED"
        ? stats.qualifiedCount
        : status === "UNQUALIFIED"
        ? stats.unqualifiedCount
        : stats.totalCount
      : totalCountFromFilter
    : 0;

  return {
    companies: enrichedCompanies,
    total: computedTotal,
    page,
    pageSize,
    hasMore,
    stats,
  };
}

export type GetCompaniesResult = Awaited<ReturnType<typeof getCompaniesWithContacts>>;
export type CompanyMasterItem = GetCompaniesResult["companies"][number];

let cachedInitialCompanies: GetCompaniesResult | null = null;
let lastInitialCompaniesFetch = 0;
const INITIAL_COMPANIES_CACHE_TTL = 45 * 1000; // 45-second memory cache for instant SSR

function invalidateInitialCompaniesCache(includeFacetMetadata = false) {
  cachedInitialCompanies = null;
  lastInitialCompaniesFetch = 0;
  cachedStatusStats = null;
  lastStatusStatsFetch = 0;
  if (includeFacetMetadata) {
    cachedCountries = null;
    lastCountriesFetch = 0;
    cachedTypes = null;
    lastTypesFetch = 0;
  }
}

export async function getCachedInitialCompanies(actor?: ContactActor): Promise<GetCompaniesResult> {
  const now = Date.now();
  if (cachedInitialCompanies && now - lastInitialCompaniesFetch < INITIAL_COMPANIES_CACHE_TTL) {
    return cachedInitialCompanies;
  }

  const result = await getCompaniesWithContacts({
    status: "QUALIFIED",
    type: "ALL",
    search: "",
    page: 1,
    pageSize: 20,
    actor,
  });

  cachedInitialCompanies = result;
  lastInitialCompaniesFetch = now;
  return result;
}

export type GetContactsResult = Awaited<ReturnType<typeof getContacts>>;
export type ContactWithRelations = GetContactsResult["contacts"][number];

export async function getContactById(contactId: string) {
  const actor = await getContactActor();

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      company: {
        include: {
          opportunities: {
            include: {
              owner: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                  departments: { select: { id: true, name: true } },
                },
              },
              teamMembers: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                  departments: { select: { id: true, name: true } },
                },
              },
              stage: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      department: {
        select: {
          id: true,
          name: true,
        },
      },
      logs: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });

  if (!contact) {
    throw new Error("Contact not found");
  }

  const isSameDept =
    actor.role === "ADMIN" ||
    (contact.department && actor.departments.includes(contact.department.name));

  // Filter opportunities based on role:
  // General: only cards where user is owner or team member
  // Management: cards where owner or member is in actor's departments
  // Admin: all cards
  const allDeals = contact.company?.opportunities || [];
  const visibleOpportunities = allDeals.filter((deal: (typeof allDeals)[number]) => {
    if (actor.role === "ADMIN") return true;

    if (actor.role === "MANAGEMENT") {
      const ownerInDept = deal.owner.departments.some((d: { name: string }) =>
        actor.departments.includes(d.name)
      );
      const memberInDept = deal.teamMembers.some((m: { departments: Array<{ name: string }> }) =>
        m.departments.some((d: { name: string }) => actor.departments.includes(d.name))
      );
      return ownerInDept || memberInDept;
    }

    // GENERAL
    return (
      deal.ownerId === actor.id ||
      deal.teamMembers.some((m: { id: string }) => m.id === actor.id)
    );
  });

  const maskedOpportunityCount = allDeals.length - visibleOpportunities.length;

  const sanitizedLogs = isSameDept
    ? contact.logs
      : contact.logs.map((log) => {
          const fieldName = log.fieldName;
          const sensitiveField =
            fieldName === "Email" ||
            fieldName === "Phone" ||
            fieldName === "Emails" ||
            fieldName === "Phones";
          if (!sensitiveField) return log;
          return {
            ...log,
            oldValue: log.oldValue ? "***" : log.oldValue,
            newValue: log.newValue ? "***" : log.newValue,
            summary: `Updated ${fieldName.toLowerCase()} (masked by department policy)`,
          };
        });

  return {
    ...contact,
    logs: sanitizedLogs,
    isMasked: !isSameDept,
    email: isSameDept ? contact.email : maskEmail(contact.email),
    phone: isSameDept ? contact.phone : maskPhone(contact.phone),
    emails: isSameDept ? (contact.emails || []) : (contact.emails || []).map((e: string) => maskEmail(e) ?? ""),
    phones: isSameDept ? (contact.phones || []) : (contact.phones || []).map((p: string) => maskPhone(p) ?? ""),
    contactDepartment: contact.contactDepartment,
    isEmailVerified: contact.isEmailVerified,
    isPhoneVerified: contact.isPhoneVerified,
    rawEmail: isSameDept ? contact.email : null,
    rawPhone: isSameDept ? contact.phone : null,
    visibleOpportunities,
    maskedOpportunityCount,
    canDelete: actor.role === "ADMIN" || actor.role === "MANAGEMENT",
  };
}

export interface UpdateContactInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  contactDepartment?: string | null;
  emails?: string[];
  phones?: string[];
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  image?: string | null;
  departmentId?: string | null;
  isActive?: boolean;
  type?: ContactType;
  status?: ContactStatus;
  companyName?: string;
  companyAddress?: string;
  companyCountry?: string;
}

export async function updateContactSafe(
  contactId: string,
  rawInput: UpdateContactInput
): Promise<ActionResult<{ success: true }>> {
  try {
    const actor = await getContactActor();

    const current = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        company: true,
        department: { select: { id: true, name: true } },
      },
    });

    if (!current) {
      return actionFail("Contact not found", "NOT_FOUND");
    }

    const isSameDept =
      actor.role === "ADMIN" ||
      Boolean(current.department?.name && actor.departments.includes(current.department.name));

    // Server-authoritative guard: never allow cross-department edits or masked '***'
    // placeholders to overwrite real contact emails or phone numbers.
    const input = sanitizeContactContactabilityInput(rawInput, !isSameDept);

    if (input.name !== undefined && !input.name.trim()) {
      return actionFail("Person name is required", "VALIDATION");
    }

    const logsToCreate: Prisma.ContactLogCreateManyInput[] = [];

    if (input.name !== undefined && input.name.trim() !== current.name) {
      logsToCreate.push({
        contactId,
        userId: actor.id,
        action: "UPDATE",
        fieldName: "Name",
        oldValue: current.name,
        newValue: input.name.trim(),
        summary: `Changed name from "${current.name}" to "${input.name.trim()}"`,
      });
    }

    if (input.role !== undefined && (input.role || "") !== (current.role || "")) {
      logsToCreate.push({
        contactId,
        userId: actor.id,
        action: "UPDATE",
        fieldName: "Role",
        oldValue: current.role || "-",
        newValue: input.role || "-",
        summary: `Changed role from "${current.role || "-"}" to "${input.role || "-"}"`,
      });
    }

    if (
      input.contactDepartment !== undefined &&
      (input.contactDepartment || "") !== (current.contactDepartment || "")
    ) {
      logsToCreate.push({
        contactId,
        userId: actor.id,
        action: "UPDATE",
        fieldName: "Department",
        oldValue: current.contactDepartment || "-",
        newValue: input.contactDepartment || "-",
        summary: `Changed department from "${current.contactDepartment || "-"}" to "${input.contactDepartment || "-"}"`,
      });
    }

    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      logsToCreate.push({
        contactId,
        userId: actor.id,
        action: "STATUS_CHANGE",
        fieldName: "isActive",
        oldValue: current.isActive ? "Active" : "Inactive",
        newValue: input.isActive ? "Active" : "Inactive",
        summary: `Changed active status to ${input.isActive ? "Active" : "Inactive"}`,
      });
    }

    if (input.emails !== undefined) {
      const nextEmails = input.emails.map((e) => e.trim()).filter(Boolean);
      const prevEmails = current.emails || (current.email ? [current.email] : []);
      if (JSON.stringify(nextEmails) !== JSON.stringify(prevEmails)) {
        logsToCreate.push({
          contactId,
          userId: actor.id,
          action: "UPDATE",
          fieldName: "Email",
          oldValue: prevEmails.join(", ") || "-",
          newValue: nextEmails.join(", ") || "-",
          summary: `Changed email from "${prevEmails.join(", ") || "-"}" to "${nextEmails.join(", ") || "-"}"`,
        });
      }
    } else if (input.email !== undefined && (input.email || "") !== (current.email || "")) {
      logsToCreate.push({
        contactId,
        userId: actor.id,
        action: "UPDATE",
        fieldName: "Email",
        oldValue: current.email || "-",
        newValue: input.email || "-",
        summary: `Changed email from "${current.email || "-"}" to "${input.email || "-"}"`,
      });
    }

    if (input.phones !== undefined) {
      const nextPhones = input.phones.map((p) => p.trim()).filter(Boolean);
      const prevPhones = current.phones || (current.phone ? [current.phone] : []);
      if (JSON.stringify(nextPhones) !== JSON.stringify(prevPhones)) {
        logsToCreate.push({
          contactId,
          userId: actor.id,
          action: "UPDATE",
          fieldName: "Phone",
          oldValue: prevPhones.join(", ") || "-",
          newValue: nextPhones.join(", ") || "-",
          summary: `Changed phone from "${prevPhones.join(", ") || "-"}" to "${nextPhones.join(", ") || "-"}"`,
        });
      }
    } else if (input.phone !== undefined && (input.phone || "") !== (current.phone || "")) {
      logsToCreate.push({
        contactId,
        userId: actor.id,
        action: "UPDATE",
        fieldName: "Phone",
        oldValue: current.phone || "-",
        newValue: input.phone || "-",
        summary: `Changed phone from "${current.phone || "-"}" to "${input.phone || "-"}"`,
      });
    }

    if (input.type !== undefined && input.type !== current.type) {
      logsToCreate.push({
        contactId,
        userId: actor.id,
        action: "UPDATE",
        fieldName: "Type",
        oldValue: current.type,
        newValue: input.type,
        summary: `Changed type from "${current.type}" to "${input.type}"`,
      });
    }

    if (input.status !== undefined && input.status !== current.status) {
      logsToCreate.push({
        contactId,
        userId: actor.id,
        action: "STATUS_CHANGE",
        fieldName: "Status",
        oldValue: current.status,
        newValue: input.status,
        summary: `Changed status from "${current.status}" to "${input.status}"`,
      });
    }

    if (
      input.companyName !== undefined &&
      input.companyName !== current.company.name
    ) {
      logsToCreate.push({
        contactId,
        userId: actor.id,
        action: "UPDATE",
        fieldName: "Company Name",
        oldValue: current.company.name,
        newValue: input.companyName,
        summary: `Changed company name from "${current.company.name}" to "${input.companyName}"`,
      });
    }

    if (
      input.companyCountry !== undefined &&
      input.companyCountry !== (current.company.country || "")
    ) {
      logsToCreate.push({
        contactId,
        userId: actor.id,
        action: "UPDATE",
        fieldName: "Country",
        oldValue: current.company.country || "-",
        newValue: input.companyCountry || "-",
        summary: `Changed country from "${current.company.country || "-"}" to "${input.companyCountry || "-"}"`,
      });
    }

    if (
      input.companyAddress !== undefined &&
      input.companyAddress !== (current.company.address || "")
    ) {
      logsToCreate.push({
        contactId,
        userId: actor.id,
        action: "UPDATE",
        fieldName: "Address",
        oldValue: current.company.address || "-",
        newValue: input.companyAddress || "-",
        summary: `Changed address from "${current.company.address || "-"}" to "${input.companyAddress || "-"}"`,
      });
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.contact.update({
        where: { id: contactId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.email !== undefined ? { email: input.email || null } : {}),
          ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
          ...(input.role !== undefined ? { role: input.role || null } : {}),
          ...(input.contactDepartment !== undefined ? { contactDepartment: input.contactDepartment || null } : {}),
          ...(input.emails !== undefined ? { emails: input.emails.map((e) => e.trim()).filter(Boolean) } : {}),
          ...(input.phones !== undefined ? { phones: input.phones.map((p) => p.trim()).filter(Boolean) } : {}),
          ...(input.isEmailVerified !== undefined ? { isEmailVerified: input.isEmailVerified } : {}),
          ...(input.isPhoneVerified !== undefined ? { isPhoneVerified: input.isPhoneVerified } : {}),
          ...(input.image !== undefined ? { image: input.image || null } : {}),
          ...(input.departmentId !== undefined ? { departmentId: input.departmentId || null } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });

      if (
        input.companyName !== undefined ||
        input.companyCountry !== undefined ||
        input.companyAddress !== undefined
      ) {
        await tx.company.update({
          where: { id: current.companyId },
          data: {
            ...(input.companyName !== undefined
              ? { name: input.companyName }
              : {}),
            ...(input.companyCountry !== undefined
              ? { country: input.companyCountry ? normalizeCountryName(input.companyCountry) : null }
              : {}),
            ...(input.companyAddress !== undefined
              ? { address: input.companyAddress || null }
              : {}),
          },
        });
      }

      if (logsToCreate.length > 0) {
        await tx.contactLog.createMany({
          data: logsToCreate,
        });
      }
    }, CONTACT_TX_OPTIONS);

    invalidateInitialCompaniesCache(Boolean(input.companyCountry !== undefined));
    safePusherTrigger("private-contacts", "account-updated", {
      action: "CONTACT_UPDATED",
      companyId: current.companyId,
      contactId,
    });

    return actionOk({ success: true });
  } catch (err) {
    console.error("[updateContactSafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to update contact"));
  }
}

export async function updateContact(contactId: string, input: UpdateContactInput) {
  const res = await updateContactSafe(contactId, input);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export async function toggleContactStatusSafe(
  contactId: string
): Promise<ActionResult<ContactStatus>> {
  try {
    const actor = await getContactActor();

    const current = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { status: true, companyId: true },
    });

    if (!current) return actionFail("Contact not found", "NOT_FOUND");

    const newStatus: ContactStatus =
      current.status === "QUALIFIED" ? "UNQUALIFIED" : "QUALIFIED";

    await prisma.$transaction([
      prisma.contact.update({
        where: { id: contactId },
        data: { status: newStatus },
      }),
      prisma.contactLog.create({
        data: {
          contactId,
          userId: actor.id,
          action: "STATUS_CHANGE",
          fieldName: "Status",
          oldValue: current.status,
          newValue: newStatus,
          summary: `Toggled status to ${newStatus}`,
        },
      }),
    ]);

    invalidateInitialCompaniesCache();
    safePusherTrigger("private-contacts", "account-updated", {
      action: "CONTACT_UPDATED",
      companyId: current.companyId,
      contactId,
    });

    return actionOk(newStatus);
  } catch (err) {
    console.error("[toggleContactStatusSafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to toggle contact status"));
  }
}

export async function toggleContactStatus(contactId: string) {
  const res = await toggleContactStatusSafe(contactId);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export async function deleteContactSafe(
  contactId: string
): Promise<ActionResult<{ success: true }>> {
  try {
    const actor = await getContactActor();

    if (actor.role !== "ADMIN" && actor.role !== "MANAGEMENT") {
      return actionFail("Only Management or Admin can delete contacts.", "FORBIDDEN");
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        company: {
          include: {
            opportunities: {
              where: { status: "OPEN" },
              select: { id: true, topic: true },
            },
          },
        },
      },
    });

    if (!contact) {
      return actionFail("Contact not found", "NOT_FOUND");
    }

    const openDeals = contact.company?.opportunities || [];
    if (openDeals.length > 0) {
      return actionFail(
        `Cannot delete contact: There are ${openDeals.length} active (OPEN) project(s) linked to this account.`,
        "HAS_ACTIVE_DEALS"
      );
    }

    await prisma.contact.delete({
      where: { id: contactId },
    });

    invalidateInitialCompaniesCache();
    safePusherTrigger("private-contacts", "account-updated", {
      action: "CONTACT_DELETED",
      companyId: contact.companyId,
      contactId,
    });

    return actionOk({ success: true });
  } catch (err) {
    console.error("[deleteContactSafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to delete contact"));
  }
}

export async function deleteContact(contactId: string) {
  const res = await deleteContactSafe(contactId);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export interface CreateContactInput {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  contactDepartment?: string;
  emails?: string[];
  phones?: string[];
  image?: string;
  isActive?: boolean;
  type?: ContactType;
  status?: ContactStatus;
  companyId?: string;
  companyName?: string;
  companyCountry?: string;
  companyAddress?: string;
  departmentId?: string;
}

export type CreatedContactRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  contactDepartment: string | null;
  emails: string[];
  phones: string[];
  image: string | null;
  isActive: boolean;
  type: ContactType;
  status: ContactStatus;
  companyId: string;
  departmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function createContactSafe(
  input: CreateContactInput
): Promise<ActionResult<CreatedContactRecord>> {
  try {
    const actor = await getContactActor();

    if (!input.name?.trim()) {
      return actionFail("Person name is required", "VALIDATION");
    }
    if (!input.companyId && !input.companyName?.trim()) {
      return actionFail("Account is required", "VALIDATION");
    }

    const targetDeptId = input.departmentId || actor.departmentIds[0] || null;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let company: { id: string; name: string } | null = null;
      if (input.companyId) {
        company = await tx.company.findUnique({
          where: { id: input.companyId },
          select: { id: true, name: true },
        });
      }
      if (!company && input.companyName?.trim()) {
        company = await tx.company.findFirst({
          where: { name: { equals: input.companyName.trim(), mode: "insensitive" } },
          select: { id: true, name: true },
        });
        if (!company) {
          company = await tx.company.create({
            data: {
              name: input.companyName.trim(),
              displayName: input.companyName.trim(),
              country: input.companyCountry ? normalizeCountryName(input.companyCountry) : null,
              address: input.companyAddress || null,
            },
            select: { id: true, name: true },
          });
        }
      }
      if (!company) return null;

      const emailsArray = input.emails && input.emails.length > 0
        ? input.emails.filter(Boolean).map((e) => e.trim())
        : (input.email ? [input.email.trim()] : []);

      const phonesArray = input.phones && input.phones.length > 0
        ? input.phones.filter(Boolean).map((p) => p.trim())
        : (input.phone ? [input.phone.trim()] : []);

      const contact = await tx.contact.create({
        data: {
          name: input.name.trim(),
          email: input.email ? input.email.trim() : (emailsArray[0] || null),
          phone: input.phone ? input.phone.trim() : (phonesArray[0] || null),
          role: input.role ? input.role.trim() : null,
          contactDepartment: input.contactDepartment ? input.contactDepartment.trim() : null,
          emails: emailsArray,
          phones: phonesArray,
          image: input.image ? input.image.trim() : null,
          isActive: input.isActive !== undefined ? input.isActive : true,
          type: input.type || "CUSTOMER",
          status: input.status || "UNQUALIFIED",
          companyId: company.id,
          departmentId: targetDeptId,
        },
      });

      await tx.contactLog.create({
        data: {
          contactId: contact.id,
          userId: actor.id,
          action: "CREATE",
          summary: `Created contact "${contact.name}" under ${company.name}`,
        },
      });

      return contact;
    }, CONTACT_TX_OPTIONS);

    if (!result) {
      return actionFail("Selected account could not be found.", "NOT_FOUND");
    }

    invalidateInitialCompaniesCache(true);
    safePusherTrigger("private-contacts", "account-updated", {
      action: "CONTACT_CREATED",
      companyId: result.companyId,
      contact: result,
    });

    return actionOk(result);
  } catch (err) {
    console.error("[createContactSafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to create contact"));
  }
}

export async function createContact(input: CreateContactInput) {
  const res = await createContactSafe(input);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export async function toggleContactActiveSafe(
  contactId: string,
  isActive: boolean
): Promise<ActionResult<{ success: true; isActive: boolean }>> {
  try {
    const actor = await getContactActor();

    const current = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, name: true, isActive: true, companyId: true },
    });

    if (!current) return actionFail("Person not found", "NOT_FOUND");

    await prisma.$transaction([
      prisma.contact.update({
        where: { id: contactId },
        data: { isActive },
      }),
      prisma.contactLog.create({
        data: {
          contactId,
          userId: actor.id,
          action: "STATUS_CHANGE",
          fieldName: "isActive",
          oldValue: current.isActive ? "Active" : "Inactive",
          newValue: isActive ? "Active" : "Inactive",
          summary: `Marked as ${isActive ? "Active" : "Inactive"}`,
        },
      }),
    ]);

    invalidateInitialCompaniesCache();
    safePusherTrigger("private-contacts", "account-updated", {
      action: "CONTACT_STATUS_CHANGE",
      companyId: current.companyId,
      contactId,
      isActive,
    });

    return actionOk({ success: true, isActive });
  } catch (err) {
    console.error("[toggleContactActiveSafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to update contact status"));
  }
}

export async function toggleContactActive(contactId: string, isActive: boolean) {
  const res = await toggleContactActiveSafe(contactId, isActive);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export async function toggleCompanyStatusSafe(
  companyId: string,
  status: ContactStatus,
  mutationId?: string
): Promise<ActionResult<{ success: true; status: ContactStatus; revision: string; mutationId?: string }>> {
  try {
    const actor = await getContactActor();

    const current = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, status: true },
    });

    if (!current) return actionFail("Account not found", "NOT_FOUND");

    const [updated] = await prisma.$transaction([
      prisma.company.update({
        where: { id: companyId },
        data: { status },
        select: { id: true, status: true, updatedAt: true },
      }),
      prisma.companyLog.create({
        data: {
          companyId,
          userId: actor.id,
          action: "STATUS_CHANGE",
          fieldName: "status",
          oldValue: current.status,
          newValue: status,
          summary: `Marked account as ${status === "QUALIFIED" ? "Qualified" : "Unqualified"}`,
        },
      }),
    ]);

    const revision = updated.updatedAt.toISOString();
    invalidateInitialCompaniesCache();

    safePusherTrigger("private-contacts", "account-updated", {
      action: "STATUS_CHANGE",
      companyId,
      status: updated.status,
      previousStatus: current.status,
      revision,
      mutationId,
    });

    // Sync LTC count in Pipeline and Leaderboard in real-time
    void notifyPipelineAudience({
      action: "LTC_UPDATED",
      companyId,
    });
    void dispatchDashboardInvalidation({
      resources: ["leaderboard", "summary"],
      companyIds: [companyId],
    });

    return actionOk({ success: true, status: updated.status, revision, mutationId });
  } catch (err) {
    console.error("[toggleCompanyStatusSafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to update account status"));
  }
}

export async function toggleCompanyStatus(
  companyId: string,
  status: ContactStatus,
  mutationId?: string
) {
  const res = await toggleCompanyStatusSafe(companyId, status, mutationId);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export async function updateCompanyStarRatingSafe(
  companyId: string,
  starRating: number,
  mutationId?: string
): Promise<
  ActionResult<{
    success: true;
    starRating: number;
    revision: string;
    companyId: string;
    mutationId?: string;
  }>
> {
  try {
    const actor = await getContactActor();

    const current = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, starRating: true },
    });

    if (!current) return actionFail("Account not found", "NOT_FOUND");

    const clamped = Math.max(0, Math.min(5, Math.round(starRating)));

    const [updated] = await prisma.$transaction([
      prisma.company.update({
        where: { id: companyId },
        data: { starRating: clamped },
        select: { id: true, starRating: true, updatedAt: true },
      }),
      prisma.companyLog.create({
        data: {
          companyId,
          userId: actor.id,
          action: "RATING_CHANGE",
          fieldName: "starRating",
          oldValue: String(current.starRating || 0),
          newValue: String(clamped),
          summary: `Updated star rating to ${clamped} star${clamped === 1 ? "" : "s"}`,
        },
      }),
    ]);

    const revision = updated.updatedAt.toISOString();
    invalidateInitialCompaniesCache();

    safePusherTrigger("private-contacts", "account-updated", {
      action: "RATING_CHANGE",
      companyId,
      starRating: updated.starRating,
      revision,
      mutationId,
    });

    return actionOk({
      success: true,
      starRating: updated.starRating,
      revision,
      companyId,
      mutationId,
    });
  } catch (err) {
    console.error("[updateCompanyStarRatingSafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to update star rating"));
  }
}

export async function updateCompanyStarRating(
  companyId: string,
  starRating: number,
  mutationId?: string
) {
  const res = await updateCompanyStarRatingSafe(companyId, starRating, mutationId);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export interface UpdateCompanyDetailsInput {
  displayName?: string;
  name?: string;
  country?: string | null;
  type?: ContactType;
  status?: ContactStatus;
  starRating?: number;
  notes?: string | null;
  phone?: string | null;
  email?: string | null;
  phones?: string[];
  emails?: string[];
}

function buildFormattedAddressAndMapsUrl(
  companyName: string,
  addr: {
    addressLine1?: string | null;
    addressLine2?: string | null;
    subdistrict?: string | null;
    district?: string | null;
    province?: string | null;
    postalCode?: string | null;
    country?: string | null;
    googleMapsUrl?: string | null;
  },
  fallbackMapsUrl?: string | null
) {
  const addressParts = [
    addr.addressLine1,
    addr.addressLine2,
    addr.subdistrict,
    addr.district,
    addr.province,
    addr.postalCode,
    addr.country || "Thailand",
  ].filter(Boolean);
  const formattedAddress = addressParts.join(" ");

  let mapsUrl =
    addr.googleMapsUrl !== undefined ? addr.googleMapsUrl?.trim() : fallbackMapsUrl?.trim();
  if (!mapsUrl && formattedAddress) {
    const query = encodeURIComponent(`${companyName} ${formattedAddress}`);
    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  return {
    formattedAddress,
    googleMapsUrl: mapsUrl || null,
  };
}

export async function updateCompanyDetailsSafe(
  companyId: string,
  data: UpdateCompanyDetailsInput,
  mutationId?: string
): Promise<
  ActionResult<
    Prisma.CompanyGetPayload<Record<string, never>> & {
      revision: string;
    }
  >
> {
  try {
    const actor = await getContactActor();

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return actionFail("Account not found", "NOT_FOUND");

    if (data.name !== undefined) {
      const nextName = data.name.trim();
      if (!nextName) {
        return actionFail("Account legal name is required", "VALIDATION");
      }
      if (nextName.toLowerCase() !== company.name.toLowerCase()) {
        const duplicate = await prisma.company.findFirst({
          where: {
            id: { not: companyId },
            name: { equals: nextName, mode: "insensitive" },
          },
          select: { id: true, name: true, status: true },
        });
        if (duplicate) {
          return actionFail(
            `Another account named "${duplicate.name}" already exists (${duplicate.status === "QUALIFIED" ? "Qualified" : "Unqualified"}).`,
            "DUPLICATE_NAME"
          );
        }
      }
    }

    const changes: string[] = [];
    if (data.displayName !== undefined && data.displayName.trim() !== (company.displayName || company.name)) {
      changes.push(`Changed display name to "${data.displayName.trim()}"`);
    }
    if (data.name !== undefined && data.name.trim() !== company.name) {
      changes.push(`Changed name from "${company.name}" to "${data.name.trim()}"`);
    }
    const newEmails = data.emails !== undefined ? data.emails.map((e) => e.trim()).filter(Boolean) : undefined;
    const newPhones = data.phones !== undefined ? data.phones.map((p) => p.trim()).filter(Boolean) : undefined;
    const primaryEmail = newEmails !== undefined ? (newEmails[0] || null) : (data.email !== undefined ? data.email?.trim() || null : company.email);
    const primaryPhone = newPhones !== undefined ? (newPhones[0] || null) : (data.phone !== undefined ? data.phone?.trim() || null : company.phone);
    const finalEmails = newEmails !== undefined ? newEmails : (primaryEmail ? [primaryEmail] : company.emails || []);
    const finalPhones = newPhones !== undefined ? newPhones : (primaryPhone ? [primaryPhone] : company.phones || []);

    if (data.phone !== undefined && data.phone?.trim() !== (company.phone || "")) {
      changes.push(`Updated office phone to ${data.phone?.trim() || "None"}`);
    }
    if (data.email !== undefined && data.email?.trim() !== (company.email || "")) {
      changes.push(`Updated company email to ${data.email?.trim() || "None"}`);
    }
    if (newEmails !== undefined && JSON.stringify(newEmails) !== JSON.stringify(company.emails)) {
      changes.push(`Updated company emails list (${newEmails.length} email${newEmails.length === 1 ? "" : "s"})`);
    }
    if (newPhones !== undefined && JSON.stringify(newPhones) !== JSON.stringify(company.phones)) {
      changes.push(`Updated company phones list (${newPhones.length} phone${newPhones.length === 1 ? "" : "s"})`);
    }
    const normalizedCountry =
      data.country !== undefined
        ? data.country && data.country.trim()
          ? normalizeCountryName(data.country)
          : null
        : company.country;
    if (data.country !== undefined && (normalizedCountry || "") !== (company.country || "")) {
      changes.push(`Updated country to ${normalizedCountry || "None"}`);
    }
    if (data.type !== undefined && data.type !== company.type) {
      changes.push(`Changed account type to ${data.type}`);
    }
    if (data.status !== undefined && data.status !== company.status) {
      changes.push(`Changed status to ${data.status}`);
    }
    if (data.starRating !== undefined && data.starRating !== company.starRating) {
      changes.push(`Updated star rating to ${data.starRating}`);
    }
    if (data.notes !== undefined && (data.notes?.trim() || "") !== (company.notes || "")) {
      changes.push("Updated account notes");
    }

    const [updated] = await prisma.$transaction([
      prisma.company.update({
        where: { id: companyId },
        data: {
          displayName: data.displayName !== undefined ? data.displayName.trim() : company.displayName,
          name: data.name !== undefined ? data.name.trim() : company.name,
          phone: primaryPhone,
          email: primaryEmail,
          emails: finalEmails,
          phones: finalPhones,
          country: normalizedCountry,
          type: data.type !== undefined ? data.type : company.type,
          status: data.status !== undefined ? data.status : company.status,
          starRating: data.starRating !== undefined ? data.starRating : company.starRating,
          notes: data.notes !== undefined ? data.notes?.trim() || null : company.notes,
        },
      }),
      ...(changes.length > 0
        ? [
            prisma.companyLog.create({
              data: {
                companyId,
                userId: actor.id,
                action: "UPDATE",
                summary: changes.join("; "),
              },
            }),
          ]
        : []),
    ]);

    const revision = updated.updatedAt.toISOString();
    const metadataChanged =
      normalizedCountry !== company.country ||
      (data.type !== undefined && data.type !== company.type);
    invalidateInitialCompaniesCache(metadataChanged);

    safePusherTrigger("private-contacts", "account-updated", {
      action: "DETAILS_CHANGE",
      companyId,
      revision,
      mutationId,
      company: {
        id: updated.id,
        displayName: updated.displayName,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        emails: updated.emails,
        phones: updated.phones,
        country: updated.country,
        type: updated.type,
        status: updated.status,
        starRating: updated.starRating,
        updatedAt: updated.updatedAt,
        revision,
      },
    });

    return actionOk({ ...updated, revision });
  } catch (err) {
    console.error("[updateCompanyDetailsSafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to update account details"));
  }
}

export async function updateCompanyDetails(
  companyId: string,
  data: UpdateCompanyDetailsInput,
  mutationId?: string
) {
  const res = await updateCompanyDetailsSafe(companyId, data, mutationId);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export interface SaveCompanyAccountAddressPatch {
  id: string;
  title?: string;
  type?: AddressType;
  taxId?: string;
  branchNumber?: string;
  addressLine1: string;
  addressLine2?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  isDefault?: boolean;
  googleMapsUrl?: string;
}

export interface SaveCompanyAccountInput {
  details: UpdateCompanyDetailsInput;
  updatedAddresses?: SaveCompanyAccountAddressPatch[];
  newAddress?: CreateCompanyAddressInput | null;
}

export type SavedCompanyAddressRecord = Prisma.CompanyAddressGetPayload<Record<string, never>>;

export interface SaveCompanyAccountResult {
  company: Prisma.CompanyGetPayload<Record<string, never>> & { revision: string };
  addresses: SavedCompanyAddressRecord[];
  revision: string;
}

/**
 * Single atomic Server Action for EditAccountPanel "Save Account":
 * Updates Company details, dirty CompanyAddress rows, and optional new draft address
 * in ONE round-trip and ONE transaction (eliminating N+1 sequential Server Actions
 * and cross-region transaction timeouts between iad1 and ap-southeast-1).
 */
export async function saveCompanyAccount(
  companyId: string,
  input: SaveCompanyAccountInput,
  mutationId?: string
): Promise<ActionResult<SaveCompanyAccountResult>> {
  try {
    const actor = await getContactActor();
    const { details, updatedAddresses = [], newAddress } = input;

    const trimmedName = details.name?.trim();
    if (details.name !== undefined && !trimmedName) {
      return actionFail("Account legal name is required", "VALIDATION");
    }
    if (details.displayName !== undefined && !details.displayName.trim()) {
      return actionFail("Account display name is required", "VALIDATION");
    }

    for (const addr of updatedAddresses) {
      if (!addr.addressLine1?.trim()) {
        return actionFail(
          `Address Line 1 is required for ${addr.title || "an address"}.`,
          "VALIDATION"
        );
      }
    }
    if (newAddress && !newAddress.addressLine1?.trim()) {
      return actionFail("Address Line 1 is required for the new address.", "VALIDATION");
    }

    const [company, duplicate] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        include: { addresses: { orderBy: { createdAt: "asc" } } },
      }),
      trimmedName
        ? prisma.company.findFirst({
            where: {
              id: { not: companyId },
              name: { equals: trimmedName, mode: "insensitive" },
            },
            select: { id: true, name: true, status: true },
          })
        : Promise.resolve(null),
    ]);

    if (!company) {
      return actionFail("Account not found", "NOT_FOUND");
    }
    if (duplicate) {
      return actionFail(
        `Another account named "${duplicate.name}" already exists (${duplicate.status === "QUALIFIED" ? "Qualified" : "Unqualified"}).`,
        "DUPLICATE_NAME"
      );
    }

    const targetCompanyName = trimmedName || company.name;
    const changes: string[] = [];

    if (details.displayName !== undefined && details.displayName.trim() !== (company.displayName || company.name)) {
      changes.push(`Changed display name to "${details.displayName.trim()}"`);
    }
    if (trimmedName && trimmedName !== company.name) {
      changes.push(`Changed name from "${company.name}" to "${trimmedName}"`);
    }

    const newEmails = details.emails !== undefined ? details.emails.map((e) => e.trim()).filter(Boolean) : undefined;
    const newPhones = details.phones !== undefined ? details.phones.map((p) => p.trim()).filter(Boolean) : undefined;
    const primaryEmail = newEmails !== undefined ? (newEmails[0] || null) : (details.email !== undefined ? details.email?.trim() || null : company.email);
    const primaryPhone = newPhones !== undefined ? (newPhones[0] || null) : (details.phone !== undefined ? details.phone?.trim() || null : company.phone);
    const finalEmails = newEmails !== undefined ? newEmails : (primaryEmail ? [primaryEmail] : company.emails || []);
    const finalPhones = newPhones !== undefined ? newPhones : (primaryPhone ? [primaryPhone] : company.phones || []);

    if (newEmails !== undefined && JSON.stringify(newEmails) !== JSON.stringify(company.emails)) {
      changes.push(`Updated company emails (${newEmails.length})`);
    }
    if (newPhones !== undefined && JSON.stringify(newPhones) !== JSON.stringify(company.phones)) {
      changes.push(`Updated company phones (${newPhones.length})`);
    }

    const normalizedCountry =
      details.country !== undefined
        ? details.country && details.country.trim()
          ? normalizeCountryName(details.country)
          : null
        : company.country;
    if (details.country !== undefined && (normalizedCountry || "") !== (company.country || "")) {
      changes.push(`Updated country to ${normalizedCountry || "None"}`);
    }
    if (details.type !== undefined && details.type !== company.type) {
      changes.push(`Changed account type to ${details.type}`);
    }
    if (details.notes !== undefined && (details.notes?.trim() || "") !== (company.notes || "")) {
      changes.push("Updated account notes");
    }

    const existingAddrMap = new Map(company.addresses.map((a) => [a.id, a]));
    const validUpdates = updatedAddresses.filter((a) => existingAddrMap.has(a.id));
    if (validUpdates.length > 0) {
      changes.push(
        validUpdates.length === 1
          ? `Updated address "${validUpdates[0].title || "Location"}"`
          : `Updated ${validUpdates.length} addresses`
      );
    }
    if (newAddress) {
      changes.push(`Added address "${newAddress.title?.trim() || "New Location"}"`);
    }

    const txResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedCompany = await tx.company.update({
        where: { id: companyId },
        data: {
          displayName: details.displayName !== undefined ? details.displayName.trim() : company.displayName,
          name: targetCompanyName,
          phone: primaryPhone,
          email: primaryEmail,
          emails: finalEmails,
          phones: finalPhones,
          country: normalizedCountry,
          type: details.type !== undefined ? details.type : company.type,
          status: details.status !== undefined ? details.status : company.status,
          starRating: details.starRating !== undefined ? details.starRating : company.starRating,
          notes: details.notes !== undefined ? details.notes?.trim() || null : company.notes,
        },
      });

      const newDefaultRequested =
        Boolean(newAddress?.isDefault) || validUpdates.some((u) => u.isDefault === true);
      if (newDefaultRequested) {
        await tx.companyAddress.updateMany({
          where: { companyId },
          data: { isDefault: false },
        });
      }

      if (validUpdates.length > 0) {
        await Promise.all(
          validUpdates.map((addr) => {
            const currentAddr = existingAddrMap.get(addr.id)!;
            const resolvedCountry =
              addr.country !== undefined
                ? addr.country
                  ? normalizeCountryName(addr.country)
                  : null
                : currentAddr.country;
            const { formattedAddress, googleMapsUrl } = buildFormattedAddressAndMapsUrl(
              targetCompanyName,
              {
                addressLine1: addr.addressLine1,
                addressLine2: addr.addressLine2 ?? null,
                subdistrict: addr.subdistrict ?? null,
                district: addr.district ?? null,
                province: addr.province ?? null,
                postalCode: addr.postalCode ?? null,
                country: resolvedCountry,
                googleMapsUrl: addr.googleMapsUrl,
              },
              currentAddr.googleMapsUrl
            );

            return tx.companyAddress.update({
              where: { id: addr.id },
              data: {
                title: addr.title !== undefined ? addr.title?.trim() || null : currentAddr.title,
                type: addr.type !== undefined ? addr.type : currentAddr.type,
                ...(addr.isDefault !== undefined ? { isDefault: addr.isDefault } : {}),
                taxId: addr.taxId !== undefined ? addr.taxId?.trim() || null : currentAddr.taxId,
                branchNumber:
                  addr.branchNumber !== undefined
                    ? addr.branchNumber?.trim() || null
                    : currentAddr.branchNumber,
                addressLine1: addr.addressLine1.trim(),
                addressLine2: addr.addressLine2?.trim() || null,
                subdistrict: addr.subdistrict?.trim() || null,
                district: addr.district?.trim() || null,
                province: addr.province?.trim() || null,
                postalCode: addr.postalCode?.trim() || null,
                country: resolvedCountry,
                formattedAddress,
                googleMapsUrl,
              },
            });
          })
        );
      }

      if (newAddress) {
        const addrCountry = newAddress.country
          ? normalizeCountryName(newAddress.country)
          : normalizedCountry || "Thailand";
        const { formattedAddress, googleMapsUrl } = buildFormattedAddressAndMapsUrl(
          targetCompanyName,
          {
            ...newAddress,
            country: addrCountry,
          }
        );

        await tx.companyAddress.create({
          data: {
            companyId,
            title: newAddress.title?.trim() || "Headquarters",
            type: newAddress.type || "BRANCH",
            isDefault: company.addresses.length === 0 ? true : Boolean(newAddress.isDefault),
            taxId: newAddress.taxId?.trim() || null,
            branchNumber: newAddress.branchNumber?.trim() || null,
            addressLine1: newAddress.addressLine1.trim(),
            addressLine2: newAddress.addressLine2?.trim() || null,
            subdistrict: newAddress.subdistrict?.trim() || null,
            district: newAddress.district?.trim() || null,
            province: newAddress.province?.trim() || null,
            postalCode: newAddress.postalCode?.trim() || null,
            country: addrCountry,
            formattedAddress,
            googleMapsUrl,
          },
        });
      }

      const [freshAddresses] = await Promise.all([
        tx.companyAddress.findMany({
          where: { companyId },
          orderBy: { createdAt: "asc" },
        }),
        changes.length > 0
          ? tx.companyLog.create({
              data: {
                companyId,
                userId: actor.id,
                action: "UPDATE",
                summary: changes.join("; "),
              },
            })
          : Promise.resolve(null),
      ]);

      return { updatedCompany, freshAddresses };
    }, CONTACT_TX_OPTIONS);

    const revision = txResult.updatedCompany.updatedAt.toISOString();
    const metadataChanged =
      normalizedCountry !== company.country ||
      (details.type !== undefined && details.type !== company.type);
    invalidateInitialCompaniesCache(metadataChanged);

    safePusherTrigger("private-contacts", "account-updated", {
      action: "DETAILS_CHANGE",
      companyId,
      revision,
      mutationId,
      company: {
        id: txResult.updatedCompany.id,
        displayName: txResult.updatedCompany.displayName,
        name: txResult.updatedCompany.name,
        phone: txResult.updatedCompany.phone,
        email: txResult.updatedCompany.email,
        emails: txResult.updatedCompany.emails,
        phones: txResult.updatedCompany.phones,
        country: txResult.updatedCompany.country,
        type: txResult.updatedCompany.type,
        status: txResult.updatedCompany.status,
        starRating: txResult.updatedCompany.starRating,
        updatedAt: txResult.updatedCompany.updatedAt,
        revision,
      },
    });

    return actionOk({
      company: { ...txResult.updatedCompany, revision },
      addresses: txResult.freshAddresses,
      revision,
    });
  } catch (err) {
    console.error("[saveCompanyAccount] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to save account changes"));
  }
}

export interface CreateCompanyInput {
  displayName?: string;
  name: string;
  phone?: string;
  email?: string;
  phones?: string[];
  emails?: string[];
  country?: string;
  type?: ContactType;
  notes?: string;
  addresses?: CreateCompanyAddressInput[];
  address?: CreateCompanyAddressInput;
}

export type CreatedCompanyPayload = Prisma.CompanyGetPayload<Record<string, never>> & {
  revision: string;
};

export async function createCompanySafe(
  input: CreateCompanyInput,
  mutationId?: string
): Promise<ActionResult<CreatedCompanyPayload>> {
  try {
    const actor = await getContactActor();

    const trimmedName = input.name?.trim();
    if (!trimmedName) {
      return actionFail("Account legal name is required", "VALIDATION");
    }

    // Pre-transaction duplicate check saves an interactive transaction round-trip
    // and returns a structured user-friendly message instead of throwing #441.
    const existing = await prisma.company.findFirst({
      where: { name: { equals: trimmedName, mode: "insensitive" } },
      select: { id: true, name: true, status: true },
    });
    if (existing) {
      return actionFail(
        `An account named "${existing.name}" already exists (${existing.status === "QUALIFIED" ? "Qualified" : "Unqualified"}).`,
        "DUPLICATE_NAME"
      );
    }

    const displayName = input.displayName?.trim() || trimmedName;
    const rawEmails = (input.emails || []).map((e) => e.trim()).filter(Boolean);
    const rawPhones = (input.phones || []).map((p) => p.trim()).filter(Boolean);
    const primaryEmail = rawEmails[0] || input.email?.trim() || null;
    const primaryPhone = rawPhones[0] || input.phone?.trim() || null;
    const finalEmails = rawEmails.length > 0 ? rawEmails : (primaryEmail ? [primaryEmail] : []);
    const finalPhones = rawPhones.length > 0 ? rawPhones : (primaryPhone ? [primaryPhone] : []);
    const normalizedCountry = input.country ? normalizeCountryName(input.country) : "Thailand";

    const addrsToCreate =
      input.addresses && input.addresses.length > 0
        ? input.addresses
        : input.address
        ? [input.address]
        : [];
    const validAddrs = addrsToCreate.filter((a) => a.addressLine1 && a.addressLine1.trim());
    const hasDefault = validAddrs.some((a) => a.isDefault);

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const company = await tx.company.create({
        data: {
          displayName,
          name: trimmedName,
          phone: primaryPhone,
          email: primaryEmail,
          emails: finalEmails,
          phones: finalPhones,
          country: normalizedCountry,
          type: input.type || "CUSTOMER",
          notes: input.notes?.trim() || null,
        },
      });

      if (validAddrs.length > 0) {
        const addressRows: Prisma.CompanyAddressCreateManyInput[] = validAddrs.map((addr, i) => {
          const isDefault = hasDefault ? Boolean(addr.isDefault) : i === 0;
          const addrCountry = addr.country
            ? normalizeCountryName(addr.country)
            : company.country || "Thailand";
          const { formattedAddress, googleMapsUrl } = buildFormattedAddressAndMapsUrl(
            company.name,
            {
              ...addr,
              country: addrCountry,
            }
          );

          return {
            companyId: company.id,
            title: addr.title?.trim() || (i === 0 ? "Headquarters" : `Location ${i + 1}`),
            type: addr.type || "HEADQUARTERS",
            isDefault,
            taxId: addr.taxId?.trim() || null,
            branchNumber: addr.branchNumber?.trim() || null,
            addressLine1: addr.addressLine1.trim(),
            addressLine2: addr.addressLine2?.trim() || null,
            subdistrict: addr.subdistrict?.trim() || null,
            district: addr.district?.trim() || null,
            province: addr.province?.trim() || null,
            postalCode: addr.postalCode?.trim() || null,
            country: addrCountry,
            formattedAddress,
            googleMapsUrl,
          };
        });

        await tx.companyAddress.createMany({
          data: addressRows,
        });
      }

      await tx.companyLog.create({
        data: {
          companyId: company.id,
          userId: actor.id,
          action: "CREATE",
          summary:
            validAddrs.length > 0
              ? `Created account "${company.name}" with ${validAddrs.length} address${validAddrs.length === 1 ? "" : "es"}`
              : `Created account "${company.name}"`,
        },
      });

      return company;
    }, CONTACT_TX_OPTIONS);

    const revision = result.updatedAt.toISOString();
    invalidateInitialCompaniesCache(true);

    safePusherTrigger("private-contacts", "account-updated", {
      action: "COMPANY_CREATED",
      companyId: result.id,
      revision,
      mutationId,
      company: {
        id: result.id,
        name: result.name,
        displayName: result.displayName,
        phone: result.phone,
        email: result.email,
        emails: result.emails,
        phones: result.phones,
        country: result.country,
        status: result.status,
        type: result.type,
        starRating: result.starRating,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        revision,
        _count: { contacts: 0, opportunities: 0 },
      },
    });

    return actionOk({ ...result, revision });
  } catch (err) {
    console.error("[createCompanySafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to create account"));
  }
}

export async function createCompany(input: CreateCompanyInput) {
  const res = await createCompanySafe(input);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export interface CreateCompanyAddressInput {
  title?: string;
  type?: AddressType;
  taxId?: string;
  branchNumber?: string;
  addressLine1: string;
  addressLine2?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  isDefault?: boolean;
  googleMapsUrl?: string;
}

export async function createCompanyAddressSafe(
  companyId: string,
  input: CreateCompanyAddressInput
): Promise<ActionResult<SavedCompanyAddressRecord>> {
  try {
    const actor = await getContactActor();

    if (!input.addressLine1?.trim()) {
      return actionFail("Address Line 1 is required", "VALIDATION");
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) return actionFail("Account not found", "NOT_FOUND");

    const addrCountry = input.country ? normalizeCountryName(input.country) : "Thailand";
    const { formattedAddress, googleMapsUrl } = buildFormattedAddressAndMapsUrl(company.name, {
      ...input,
      country: addrCountry,
    });

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (input.isDefault) {
        await tx.companyAddress.updateMany({
          where: { companyId },
          data: { isDefault: false },
        });
      }

      const created = await tx.companyAddress.create({
        data: {
          companyId,
          title: input.title?.trim() || "Headquarters",
          type: input.type || "BILLING",
          isDefault: Boolean(input.isDefault),
          taxId: input.taxId?.trim() || null,
          branchNumber: input.branchNumber?.trim() || null,
          addressLine1: input.addressLine1.trim(),
          addressLine2: input.addressLine2?.trim() || null,
          subdistrict: input.subdistrict?.trim() || null,
          district: input.district?.trim() || null,
          province: input.province?.trim() || null,
          postalCode: input.postalCode?.trim() || null,
          country: addrCountry,
          formattedAddress,
          googleMapsUrl,
        },
      });

      await tx.companyLog.create({
        data: {
          companyId,
          userId: actor.id,
          action: "UPDATE",
          summary: `Added address "${created.title || "Location"}"`,
        },
      });

      return created;
    }, CONTACT_TX_OPTIONS);

    invalidateInitialCompaniesCache();
    return actionOk(result);
  } catch (err) {
    console.error("[createCompanyAddressSafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to add address"));
  }
}

export async function createCompanyAddress(
  companyId: string,
  input: CreateCompanyAddressInput
) {
  const res = await createCompanyAddressSafe(companyId, input);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export async function updateCompanyAddressSafe(
  addressId: string,
  input: Partial<CreateCompanyAddressInput>
): Promise<ActionResult<SavedCompanyAddressRecord>> {
  try {
    const actor = await getContactActor();

    const current = await prisma.companyAddress.findUnique({
      where: { id: addressId },
      include: { company: { select: { id: true, name: true } } },
    });
    if (!current) return actionFail("Address not found", "NOT_FOUND");

    const resolvedCountry =
      input.country !== undefined
        ? input.country
          ? normalizeCountryName(input.country)
          : null
        : current.country;
    const { formattedAddress, googleMapsUrl } = buildFormattedAddressAndMapsUrl(
      current.company.name,
      {
        addressLine1: input.addressLine1 !== undefined ? input.addressLine1 : current.addressLine1,
        addressLine2: input.addressLine2 !== undefined ? input.addressLine2 : current.addressLine2,
        subdistrict: input.subdistrict !== undefined ? input.subdistrict : current.subdistrict,
        district: input.district !== undefined ? input.district : current.district,
        province: input.province !== undefined ? input.province : current.province,
        postalCode: input.postalCode !== undefined ? input.postalCode : current.postalCode,
        country: resolvedCountry,
        googleMapsUrl: input.googleMapsUrl,
      },
      current.googleMapsUrl
    );

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (input.isDefault) {
        await tx.companyAddress.updateMany({
          where: { companyId: current.companyId },
          data: { isDefault: false },
        });
      }

      const updated = await tx.companyAddress.update({
        where: { id: addressId },
        data: {
          ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
          ...(input.taxId !== undefined ? { taxId: input.taxId?.trim() || null } : {}),
          ...(input.branchNumber !== undefined ? { branchNumber: input.branchNumber?.trim() || null } : {}),
          ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1.trim() } : {}),
          ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2?.trim() || null } : {}),
          ...(input.subdistrict !== undefined ? { subdistrict: input.subdistrict?.trim() || null } : {}),
          ...(input.district !== undefined ? { district: input.district?.trim() || null } : {}),
          ...(input.province !== undefined ? { province: input.province?.trim() || null } : {}),
          ...(input.postalCode !== undefined ? { postalCode: input.postalCode?.trim() || null } : {}),
          ...(input.country !== undefined ? { country: resolvedCountry } : {}),
          formattedAddress,
          googleMapsUrl,
        },
      });

      await tx.companyLog.create({
        data: {
          companyId: current.companyId,
          userId: actor.id,
          action: "UPDATE",
          summary: `Updated address "${updated.title || "Location"}"`,
        },
      });

      return updated;
    }, CONTACT_TX_OPTIONS);

    invalidateInitialCompaniesCache();
    return actionOk(result);
  } catch (err) {
    console.error("[updateCompanyAddressSafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to update address"));
  }
}

export async function updateCompanyAddress(
  addressId: string,
  input: Partial<CreateCompanyAddressInput>
) {
  const res = await updateCompanyAddressSafe(addressId, input);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export async function deleteCompanyAddressSafe(
  addressId: string
): Promise<ActionResult<{ success: true }>> {
  try {
    const actor = await getContactActor();

    const existing = await prisma.companyAddress.findUnique({
      where: { id: addressId },
      select: { id: true, companyId: true, title: true },
    });
    if (!existing) {
      return actionOk({ success: true });
    }

    await prisma.$transaction([
      prisma.companyAddress.delete({
        where: { id: addressId },
      }),
      prisma.companyLog.create({
        data: {
          companyId: existing.companyId,
          userId: actor.id,
          action: "UPDATE",
          summary: `Removed address "${existing.title || "Location"}"`,
        },
      }),
    ]);

    invalidateInitialCompaniesCache();
    return actionOk({ success: true });
  } catch (err) {
    console.error("[deleteCompanyAddressSafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to delete address"));
  }
}

export async function deleteCompanyAddress(addressId: string) {
  const res = await deleteCompanyAddressSafe(addressId);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export async function setDefaultCompanyAddressSafe(
  companyId: string,
  addressId: string
): Promise<ActionResult<{ success: true }>> {
  try {
    const actor = await getContactActor();

    const target = await prisma.companyAddress.findUnique({
      where: { id: addressId },
      select: { id: true, companyId: true, title: true },
    });
    if (!target || target.companyId !== companyId) {
      return actionFail("Address not found", "NOT_FOUND");
    }

    await prisma.$transaction([
      prisma.companyAddress.updateMany({
        where: { companyId },
        data: { isDefault: false },
      }),
      prisma.companyAddress.update({
        where: { id: addressId },
        data: { isDefault: true },
      }),
      prisma.companyLog.create({
        data: {
          companyId,
          userId: actor.id,
          action: "UPDATE",
          summary: `Set "${target.title || "Location"}" as primary address`,
        },
      }),
    ]);

    invalidateInitialCompaniesCache();
    return actionOk({ success: true });
  } catch (err) {
    console.error("[setDefaultCompanyAddressSafe] error:", err);
    return actionFail(toServerErrorMessage(err, "Failed to set primary address"));
  }
}

export async function setDefaultCompanyAddress(companyId: string, addressId: string) {
  const res = await setDefaultCompanyAddressSafe(companyId, addressId);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export type OverviewUserSummary = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type OverviewContactLog = {
  id: string;
  contactId: string;
  userId: string;
  action: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  summary: string;
  createdAt: Date | string;
  user?: OverviewUserSummary | null;
};

export type OverviewCompanyLog = {
  id: string;
  companyId: string;
  userId: string;
  action: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  summary: string;
  createdAt: Date | string;
  user?: OverviewUserSummary | null;
};

/**
 * On-demand System Log loader for Account -> System Log sub-tab.
 * Keeps `getAccountOverview` lightweight on initial drawer open while delivering
 * real audit logs when the user clicks "System Log".
 */
export async function getCompanySystemLogs(
  companyId: string
): Promise<OverviewCompanyLog[]> {
  await getContactActor();
  const logs = await prisma.companyLog.findMany({
    where: { companyId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return logs.map((log) => ({
    ...log,
    createdAt: log.createdAt.toISOString(),
  }));
}

/**
 * On-demand System Log loader for Contact -> Person -> System Log sub-tab.
 * Preserves department-level masking for email/phone change history.
 */
export async function getContactSystemLogs(
  contactId: string
): Promise<OverviewContactLog[]> {
  const actor = await getContactActor();
  const [contact, logs] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, department: { select: { name: true } } },
    }),
    prisma.contactLog.findMany({
      where: { contactId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  if (!contact) return [];

  const isSameDept =
    actor.role === "ADMIN" ||
    Boolean(contact.department?.name && actor.departments.includes(contact.department.name));

  return logs.map((log) => {
    const serialized = {
      ...log,
      createdAt: log.createdAt.toISOString(),
    };
    if (isSameDept) return serialized;
    const fieldName = log.fieldName;
    const sensitiveField =
      fieldName === "Email" ||
      fieldName === "Phone" ||
      fieldName === "Emails" ||
      fieldName === "Phones";
    if (!sensitiveField) return serialized;
    return {
      ...serialized,
      oldValue: log.oldValue ? "***" : log.oldValue,
      newValue: log.newValue ? "***" : log.newValue,
      summary: `Updated ${fieldName.toLowerCase()} (masked by department policy)`,
    };
  });
}

export interface GetAccountOverviewOptions {
  includeAddresses?: boolean;
  includeLogs?: boolean;
  actor?: ContactActor;
}

export async function getAccountOverview(
  companyId: string,
  _options?: GetAccountOverviewOptions
) {
  const includeAddresses = _options?.includeAddresses ?? true;
  const includeLogs = _options?.includeLogs ?? false;
  const actor = _options?.actor || (await getContactActor());

  // Parallel Phase 1: Company data + AI Config + Company-level Logs run concurrently
  const [company, aiCache, companyLogs] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        displayName: true,
        phone: true,
        email: true,
        emails: true,
        phones: true,
        type: true,
        status: true,
        starRating: true,
        country: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        contacts: {
          select: {
            id: true,
            name: true,
            email: true,
            emails: true,
            phone: true,
            phones: true,
            role: true,
            contactDepartment: true,
            isEmailVerified: true,
            isPhoneVerified: true,
            image: true,
            isActive: true,
            status: true,
            type: true,
            departmentId: true,
            department: { select: { id: true, name: true } },
            createdAt: true,
          },
          orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        },
        ...(includeAddresses ? {
          addresses: {
            orderBy: { createdAt: "asc" as const },
          },
        } : {}),
        opportunities: {
          select: {
            id: true,
            topic: true,
            status: true,
            value: true,
            currency: true,
            dueDate: true,
            createdAt: true,
            ownerId: true,
            stage: {
              select: {
                id: true,
                name: true,
              },
            },
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                departments: {
                  select: { name: true },
                },
              },
            },
            teamMembers: {
              select: {
                id: true,
                name: true,
                email: true,
                departments: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.systemConfig.findUnique({
      where: { id: `account_ai_${companyId}` },
      select: { googleRefreshToken: true },
    }).catch(() => null),
    includeLogs
      ? prisma.companyLog.groupBy({
          by: ["userId"],
          where: { companyId },
          _count: { id: true },
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  if (!company) {
    throw new Error("Account not found");
  }

  // Load cached AI analysis / business profile if present
  let businessSummary: string | null = null;
  if (aiCache?.googleRefreshToken) {
    try {
      const parsed = JSON.parse(aiCache.googleRefreshToken);
      businessSummary = parsed.companyProfile?.businessSummary || null;
    } catch {
      // ignore JSON parse error
    }
  }

  const isSameDept = (cDeptName?: string | null) =>
    actor.role === "ADMIN" ||
    (cDeptName && actor.departments.includes(cDeptName));

  const sanitizedContacts = company.contacts.map((c) => {
    const sameDept = isSameDept(c.department?.name);
    return {
      id: c.id,
      name: c.name,
      email: sameDept ? c.email : maskEmail(c.email),
      phone: sameDept ? c.phone : maskPhone(c.phone),
      role: c.role,
      contactDepartment: c.contactDepartment,
      emails: sameDept ? (c.emails || []) : (c.emails || []).map((e: string) => maskEmail(e) ?? ""),
      phones: sameDept ? (c.phones || []) : (c.phones || []).map((p: string) => maskPhone(p) ?? ""),
      isEmailVerified: c.isEmailVerified,
      isPhoneVerified: c.isPhoneVerified,
      image: c.image,
      isActive: c.isActive,
      type: c.type,
      status: c.status,
      isMasked: !sameDept,
      departmentId: c.departmentId,
      department: c.department,
      createdAt: c.createdAt,
      logs: [] as OverviewContactLog[],
    };
  });

  const allDeals = company.opportunities;
  const visibleDeals = allDeals.filter((deal) => {
    if (actor.role === "ADMIN") return true;
    if (actor.role === "MANAGEMENT") {
      const ownerInDept = Boolean(
        deal.owner?.departments?.some((d) => actor.departments.includes(d.name))
      );
      const memberInDept = Boolean(
        deal.teamMembers?.some((m) =>
          m.departments?.some((d) => actor.departments.includes(d.name))
        )
      );
      return ownerInDept || memberInDept;
    }
    return (
      deal.ownerId === actor.id ||
      Boolean(deal.teamMembers?.some((m) => m.id === actor.id))
    );
  });
  const maskedOpportunityCount = allDeals.length - visibleDeals.length;

  const deals = visibleDeals.map((deal) => ({
    id: deal.id,
    topic: deal.topic,
    status: deal.status,
    value: deal.value,
    currency: deal.currency,
    dueDate: deal.dueDate,
    createdAt: deal.createdAt,
    ownerId: deal.ownerId,
    stage: deal.stage,
    owner: deal.owner
      ? {
          id: deal.owner.id,
          name: deal.owner.name,
          email: deal.owner.email,
          image: deal.owner.image,
        }
      : null,
    teamMembers: deal.teamMembers.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
    })),
  }));

  const totalDeals = deals.length;
  const openDeals = deals.filter((d) => d.status === "OPEN");
  const wonDeals = deals.filter((d) => d.status === "WON" || (d.status as string) === "COMPLETED");
  const lostDeals = deals.filter((d) => d.status === "LOST" || (d.status as string) === "CANCELLED");

  const totalPipelineValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const totalWonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);

  const valuedDeals = deals.filter((d) => (d.value || 0) > 0);
  const totalValuedDeals = valuedDeals.length;
  const wonValuedDeals = valuedDeals.filter((d) => d.status === "WON" || (d.status as string) === "COMPLETED");

  const winRate = totalValuedDeals > 0 
    ? Math.round((wonValuedDeals.length / totalValuedDeals) * 100) 
    : 0;

  const activePersonsCount = sanitizedContacts.filter((c) => c.isActive).length;
  const inactivePersonsCount = sanitizedContacts.length - activePersonsCount;

  // Parallel Phase 2: Opportunities & Contacts Logs (run only when includeLogs is explicitly true)
  const companyOppIds = company.opportunities.map((o) => o.id);
  const companyContactIds = company.contacts.map((c) => c.id);

  type LogSummary = { userId: string; _count: { id: number } };
  const [oppLogs, contactLogs]: [LogSummary[], LogSummary[]] = includeLogs
    ? await Promise.all([
        companyOppIds.length > 0
          ? prisma.activityLog.groupBy({
              by: ["userId"],
              where: { opportunityId: { in: companyOppIds } },
              _count: { id: true },
            }).catch(() => [])
          : Promise.resolve([]),
        companyContactIds.length > 0
          ? prisma.contactLog.groupBy({
              by: ["userId"],
              where: { contactId: { in: companyContactIds } },
              _count: { id: true },
            }).catch(() => [])
          : Promise.resolve([]),
      ])
    : [[], []];

  const userContributions = new Map<string, number>();
  const addContribution = (userId: string | null | undefined, weight = 1) => {
    if (!userId) return;
    userContributions.set(userId, (userContributions.get(userId) || 0) + weight);
  };

  // A. Deal Owners
  for (const opp of company.opportunities) {
    if (opp.ownerId) {
      addContribution(opp.ownerId, 1);
    }
  }

  for (const log of oppLogs) {
    addContribution(log.userId, log._count.id);
  }
  for (const log of companyLogs) {
    addContribution(log.userId, log._count.id);
  }
  for (const log of contactLogs) {
    addContribution(log.userId, log._count.id);
  }

  let topContributors: {
    userId: string;
    name: string;
    image: string | null;
    count: number;
    share: string;
  }[] = [];

  if (includeLogs && userContributions.size > 0) {
    const sortedEntries = Array.from(userContributions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const totalInteractions = sortedEntries.reduce((sum, [, count]) => sum + count, 0);
    const userIds = sortedEntries.map(([uid]) => uid);

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, image: true },
    }).catch(() => []);
    const userMap = new Map(users.map((u) => [u.id, u]));

    topContributors = sortedEntries.map(([userId, count]) => {
      const u = userMap.get(userId);
      const pct = totalInteractions > 0 ? ((count / totalInteractions) * 100).toFixed(1) : "0.0";
      return {
        userId,
        name: u?.name || u?.email?.split("@")[0] || "Team Member",
        image: u?.image || null,
        count,
        share: `${pct}%`,
      };
    });
  }

  return {
    company: {
      id: company.id,
      name: company.name,
      displayName: company.displayName,
      phone: company.phone,
      email: company.email,
      emails: company.emails || (company.email ? [company.email] : []),
      phones: company.phones || (company.phone ? [company.phone] : []),
      type: company.type,
      status: company.status,
      starRating: company.starRating,
      country: company.country,
      notes: company.notes,
      address: null,
      createdAt: company.createdAt,
      logs: [] as OverviewCompanyLog[],
    },
    addresses: ((company as unknown as { addresses?: typeof company.addresses }).addresses || []) as NonNullable<typeof company.addresses>,
    contacts: sanitizedContacts,
    deals,
    maskedOpportunityCount,
    topContributors,
    businessSummary,
    metrics: {
      totalPipelineValue,
      totalWonValue,
      totalDeals,
      openDealsCount: openDeals.length,
      wonDealsCount: wonDeals.length,
      lostDealsCount: lostDeals.length,
      avgWonValue: wonDeals.length > 0 ? Math.round(totalWonValue / wonDeals.length) : 0,
      winRate,
      activePersonsCount,
      inactivePersonsCount,
      totalPersonsCount: sanitizedContacts.length,
      funnelStages: [],
      radarMetrics: [],
    },
  };
}

export async function deleteContactsBulk(contactIds: string[]) {
  const actor = await getContactActor();
  if (actor.role !== "ADMIN" && actor.role !== "MANAGEMENT") {
    throw new Error("Forbidden. Only Management or Admin can delete contacts.");
  }
  if (!contactIds.length) return { count: 0 };

  const res = await prisma.contact.deleteMany({
    where: { id: { in: contactIds } },
  });
  invalidateInitialCompaniesCache();
  return { count: res.count };
}

export type AccountOverviewResult = Awaited<ReturnType<typeof getAccountOverview>>;

export interface AccountSharedAttachment {
  id: string;
  fileName: string;
  fileType: string;
  size: number;
  cloudinaryUrl: string | null;
  googleDriveFileId: string | null;
  createdAt: string;
  deal: {
    id: string;
    topic: string;
    status: string;
    createdAt: string;
  };
}

export interface AccountSharedLink {
  url: string;
  logId: string;
  date: string;
  deal: {
    id: string;
    topic: string;
    status: string;
    createdAt: string;
  };
}

export interface AccountSharedMediaResult {
  attachments: AccountSharedAttachment[];
  links: AccountSharedLink[];
}

export async function getAccountSharedMedia(companyId: string): Promise<AccountSharedMediaResult> {
  const actor = await getContactActor();

  const opportunityWhere: Prisma.OpportunityWhereInput =
    actor.role === "ADMIN"
      ? { companyId }
      : actor.role === "MANAGEMENT"
      ? {
          companyId,
          OR: [
            { owner: { departments: { some: { name: { in: actor.departments } } } } },
            { teamMembers: { some: { departments: { some: { name: { in: actor.departments } } } } } },
          ],
        }
      : {
          companyId,
          OR: [
            { ownerId: actor.id },
            { teamMembers: { some: { id: actor.id } } },
          ],
        };

  // Run Attachment & ActivityLog queries concurrently in parallel with bounded rows
  const [rawAttachments, logs] = await Promise.all([
    prisma.attachment.findMany({
      where: {
        opportunity: opportunityWhere,
      },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        size: true,
        cloudinaryUrl: true,
        googleDriveFileId: true,
        createdAt: true,
        opportunity: {
          select: {
            id: true,
            topic: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.activityLog.findMany({
      where: {
        opportunity: opportunityWhere,
        content: { contains: "http" },
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        opportunity: {
          select: {
            id: true,
            topic: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const attachments: AccountSharedAttachment[] = rawAttachments.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    fileType: a.fileType,
    size: a.size,
    cloudinaryUrl: a.cloudinaryUrl,
    googleDriveFileId: a.googleDriveFileId,
    createdAt: a.createdAt.toISOString(),
    deal: {
      id: a.opportunity.id,
      topic: a.opportunity.topic,
      status: a.opportunity.status,
      createdAt: a.opportunity.createdAt.toISOString(),
    },
  }));

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const links: AccountSharedLink[] = [];

  logs.forEach((log) => {
    if (!log.content) return;
    const cleanContent = log.content.replace(/\[ATTACHMENT:[^\]]+\]/g, "");
    const matches = cleanContent.match(urlRegex);
    if (matches) {
      matches.forEach((url) => {
        const cleanUrl = url.replace(/[),.]+$/, "");
        links.push({
          url: cleanUrl,
          logId: log.id,
          date: log.createdAt.toISOString(),
          deal: {
            id: log.opportunity.id,
            topic: log.opportunity.topic,
            status: log.opportunity.status,
            createdAt: log.opportunity.createdAt.toISOString(),
          },
        });
      });
    }
  });

  return {
    attachments,
    links: links.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  };
}
