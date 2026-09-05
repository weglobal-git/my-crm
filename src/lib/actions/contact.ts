"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ContactType, ContactStatus, Role, Prisma, AddressType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { maskEmail, maskPhone } from "@/lib/contact-utils";
import { pusherServer } from "@/lib/pusher";

export type ContactActor = {
  id: string;
  name: string;
  email: string;
  role: Role;
  departments: string[]; // names of departments
  departmentIds: string[];
};

export async function getContactActor(): Promise<ContactActor> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id && !session?.user?.email) {
    throw new Error("Unauthorized");
  }

  const dbUser = await prisma.user.findFirst({
    where: {
      OR: [
        { id: session.user.id || undefined },
        { email: session.user.email || undefined },
      ],
    },
    include: {
      departments: true,
    },
  });

  if (!dbUser) {
    throw new Error("Unauthorized user not found");
  }

  return {
    id: dbUser.id,
    name: dbUser.name || "Unknown User",
    email: dbUser.email || "",
    role: dbUser.role,
    departments: dbUser.departments.map((d: { name: string }) => d.name),
    departmentIds: dbUser.departments.map((d: { id: string }) => d.id),
  };
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
  country?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  traceId?: string;
  actor?: ContactActor;
}

let cachedCountries: { country: string; count: number }[] | null = null;
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

    const result = raw
      .filter((r): r is typeof r & { country: string } => Boolean(r.country && r.country.trim()))
      .map((r) => ({
        country: r.country.trim(),
        count: r._count.id,
      }));
    cachedCountries = result;
    lastCountriesFetch = now;
    return result;
  } catch (err) {
    console.error("Failed to fetch company countries:", err);
    return cachedCountries || [];
  }
}

export async function getCompaniesWithContacts({
  status = "ALL",
  type = "ALL",
  country = "",
  search = "",
  page = 1,
  pageSize = 20,
  actor: providedActor,
}: GetCompaniesParams = {}) {
  const actor = providedActor || (await getContactActor());

  const where: Prisma.CompanyWhereInput = {};

  if (status && status !== "ALL") {
    where.status = status as ContactStatus;
  }
  if (type && type !== "ALL") {
    where.type = type as ContactType;
  }
  if (country && country.trim() && country !== "ALL") {
    where.country = country.trim();
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

  const [
    total,
    rawCompanies,
    qualifiedCount,
    unqualifiedCount,
    totalCount,
  ] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      select: {
        id: true,
        displayName: true,
        name: true,
        country: true,
        status: true,
        type: true,
        starRating: true,
        createdAt: true,
        _count: {
          select: {
            contacts: true,
            opportunities: true,
          },
        },
      },
      orderBy: [{ starRating: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.company.count({ where: { status: "QUALIFIED" } }),
    prisma.company.count({ where: { status: "UNQUALIFIED" } }),
    prisma.company.count(),
  ]);

  return {
    companies: rawCompanies,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    stats: {
      qualifiedCount,
      unqualifiedCount,
      totalCount,
    },
  };
}

export type GetCompaniesResult = Awaited<ReturnType<typeof getCompaniesWithContacts>>;
export type CompanyMasterItem = GetCompaniesResult["companies"][number];

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

  return {
    ...contact,
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
  email?: string;
  phone?: string;
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

export async function updateContact(contactId: string, input: UpdateContactInput) {
  const actor = await getContactActor();

  const current = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { company: true },
  });

  if (!current) {
    throw new Error("Contact not found");
  }

  const logsToCreate: Prisma.ContactLogCreateManyInput[] = [];

  // Track contact changes
  if (input.name !== undefined && input.name !== current.name) {
    logsToCreate.push({
      contactId,
      userId: actor.id,
      action: "UPDATE",
      fieldName: "Name",
      oldValue: current.name,
      newValue: input.name,
      summary: `Changed name from "${current.name}" to "${input.name}"`,
    });
  }

  if (input.role !== undefined && input.role !== (current.role || "")) {
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

  if (input.email !== undefined && input.email !== (current.email || "")) {
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

  if (input.phone !== undefined && input.phone !== (current.phone || "")) {
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

  // Track company changes
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
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.role !== undefined ? { role: input.role || null } : {}),
        ...(input.contactDepartment !== undefined ? { contactDepartment: input.contactDepartment || null } : {}),
        ...(input.emails !== undefined ? { emails: input.emails } : {}),
        ...(input.phones !== undefined ? { phones: input.phones } : {}),
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
            ? { country: input.companyCountry || null }
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
  });

  revalidatePath("/contact");
  return { success: true };
}

export async function toggleContactStatus(contactId: string) {
  const actor = await getContactActor();

  const current = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { status: true },
  });

  if (!current) throw new Error("Contact not found");

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

  revalidatePath("/contact");
  return newStatus;
}

export async function deleteContact(contactId: string) {
  const actor = await getContactActor();

  if (actor.role !== "ADMIN" && actor.role !== "MANAGEMENT") {
    throw new Error("Forbidden. Only Management or Admin can delete contacts.");
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
    throw new Error("Contact not found");
  }

  // Safety guard: Active projects check
  const openDeals = contact.company?.opportunities || [];
  if (openDeals.length > 0) {
    throw new Error(
      `Cannot delete contact: There are ${openDeals.length} active (OPEN) projects linked to this customer.`
    );
  }

  await prisma.contact.delete({
    where: { id: contactId },
  });

  revalidatePath("/contact");
  return { success: true };
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

export async function createContact(input: CreateContactInput) {
  const actor = await getContactActor();

  if (!input.name.trim()) throw new Error("Contact name is required");
  if (!input.companyId && !input.companyName?.trim()) {
    throw new Error("Company is required");
  }

  // Determine department: user specified or actor's first department
  const targetDeptId = input.departmentId || actor.departmentIds[0] || null;

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let company: { id: string; name: string } | null = null;
    if (input.companyId) {
      company = await tx.company.findUnique({ where: { id: input.companyId } });
    }
    if (!company && input.companyName?.trim()) {
      company = await tx.company.findFirst({
        where: { name: { equals: input.companyName.trim(), mode: "insensitive" } },
      });
      if (!company) {
        company = await tx.company.create({
          data: {
            name: input.companyName.trim(),
            country: input.companyCountry || null,
            address: input.companyAddress || null,
          },
        });
      }
    }
    if (!company) throw new Error("Company could not be resolved");

    const emailsArray = input.emails && input.emails.length > 0
      ? input.emails.filter(Boolean).map(e => e.trim())
      : (input.email ? [input.email.trim()] : []);

    const phonesArray = input.phones && input.phones.length > 0
      ? input.phones.filter(Boolean).map(p => p.trim())
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
  });

  revalidatePath("/contact");
  return result;
}

export async function toggleContactActive(contactId: string, isActive: boolean) {
  const actor = await getContactActor();

  const current = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, isActive: true },
  });

  if (!current) throw new Error("Person not found");

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

  revalidatePath("/contact");
  return { success: true, isActive };
}

export async function toggleCompanyStatus(companyId: string, status: ContactStatus) {
  const actor = await getContactActor();

  const current = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, status: true },
  });

  if (!current) throw new Error("Account not found");

  const [updated] = await prisma.$transaction([
    prisma.company.update({
      where: { id: companyId },
      data: { status },
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

  revalidatePath("/contact");
  void pusherServer.trigger("contact", "account-updated", {
    action: "STATUS_CHANGE",
    companyId,
    status: updated.status,
  }).catch((err) => console.error("Pusher trigger error:", err));

  return { success: true, status: updated.status };
}

export async function updateCompanyStarRating(companyId: string, starRating: number) {
  const actor = await getContactActor();

  const current = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, starRating: true },
  });

  if (!current) throw new Error("Account not found");

  const clamped = Math.max(0, Math.min(5, Math.round(starRating)));

  const [updated] = await prisma.$transaction([
    prisma.company.update({
      where: { id: companyId },
      data: { starRating: clamped },
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

  revalidatePath("/contact");
  void pusherServer.trigger("contact", "account-updated", {
    action: "RATING_CHANGE",
    companyId,
    starRating: updated.starRating,
  }).catch((err) => console.error("Pusher trigger error:", err));

  return { success: true, starRating: updated.starRating };
}

export async function updateCompanyDetails(
  companyId: string,
  data: {
    displayName?: string;
    name?: string;
    country?: string | null;
    type?: ContactType;
    status?: ContactStatus;
    starRating?: number;
    notes?: string | null;
  }
) {
  const actor = await getContactActor();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });
  if (!company) throw new Error("Account not found");

  const changes: string[] = [];
  if (data.displayName !== undefined && data.displayName.trim() !== (company.displayName || company.name)) {
    changes.push(`Changed display name to "${data.displayName.trim()}"`);
  }
  if (data.name !== undefined && data.name.trim() !== company.name) {
    changes.push(`Changed name from "${company.name}" to "${data.name.trim()}"`);
  }
  if (data.country !== undefined && data.country?.trim() !== (company.country || "")) {
    changes.push(`Updated country to ${data.country || "None"}`);
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
  if (data.notes !== undefined && data.notes?.trim() !== (company.notes || "")) {
    changes.push("Updated account notes");
  }

  const [updated] = await prisma.$transaction([
    prisma.company.update({
      where: { id: companyId },
      data: {
        displayName: data.displayName !== undefined ? data.displayName.trim() : company.displayName,
        name: data.name !== undefined ? data.name.trim() : company.name,
        country: data.country !== undefined ? data.country?.trim() || null : company.country,
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

  revalidatePath("/contact");
  void pusherServer.trigger("contact", "account-updated", {
    action: "DETAILS_CHANGE",
    companyId,
    company: updated,
  }).catch((err) => console.error("Pusher trigger error:", err));

  return updated;
}

export interface CreateCompanyInput {
  displayName?: string;
  name: string;
  country?: string;
  type?: ContactType;
  notes?: string;
  addresses?: CreateCompanyAddressInput[];
  address?: CreateCompanyAddressInput;
}

export async function createCompany(input: CreateCompanyInput) {
  await getContactActor();

  if (!input.name || !input.name.trim()) {
    throw new Error("Account name is required");
  }

  const displayName = input.displayName?.trim() || input.name.trim();

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Check if company already exists
    const existing = await tx.company.findFirst({
      where: { name: { equals: input.name.trim(), mode: "insensitive" } },
    });
    if (existing) {
      throw new Error(`An account with the name "${input.name.trim()}" already exists`);
    }

    const company = await tx.company.create({
      data: {
        displayName,
        name: input.name.trim(),
        country: input.country?.trim() || "Thailand",
        type: input.type || "CUSTOMER",
        notes: input.notes?.trim() || null,
      },
    });

    const addrsToCreate = input.addresses && input.addresses.length > 0
      ? input.addresses
      : (input.address ? [input.address] : []);

    const validAddrs = addrsToCreate.filter((a) => a.addressLine1 && a.addressLine1.trim());
    const hasDefault = validAddrs.some((a) => a.isDefault);

    for (let i = 0; i < validAddrs.length; i++) {
      const addr = validAddrs[i];
      const isDefault = hasDefault ? !!addr.isDefault : i === 0;

      const addressParts = [
        addr.addressLine1,
        addr.addressLine2,
        addr.subdistrict,
        addr.district,
        addr.province,
        addr.postalCode,
        addr.country || company.country || "Thailand",
      ].filter(Boolean);
      const formattedAddress = addressParts.join(" ");

      let mapsUrl = addr.googleMapsUrl?.trim();
      if (!mapsUrl && formattedAddress) {
        const query = encodeURIComponent(`${company.name} ${formattedAddress}`);
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
      }

      await tx.companyAddress.create({
        data: {
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
          country: addr.country?.trim() || company.country || "Thailand",
          formattedAddress,
          googleMapsUrl: mapsUrl || null,
        },
      });
    }

    return company;
  });

  revalidatePath("/contact");
  return result;
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

export async function createCompanyAddress(
  companyId: string,
  input: CreateCompanyAddressInput
) {
  await getContactActor();

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Account not found");

  const addressParts = [
    input.addressLine1,
    input.addressLine2,
    input.subdistrict,
    input.district,
    input.province,
    input.postalCode,
    input.country || "Thailand",
  ].filter(Boolean);
  const formattedAddress = addressParts.join(" ");

  let mapsUrl = input.googleMapsUrl?.trim();
  if (!mapsUrl && formattedAddress) {
    const query = encodeURIComponent(`${company.name} ${formattedAddress}`);
    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (input.isDefault) {
      await tx.companyAddress.updateMany({
        where: { companyId },
        data: { isDefault: false },
      });
    }

    return await tx.companyAddress.create({
      data: {
        companyId,
        title: input.title?.trim() || "Headquarters",
        type: input.type || "BILLING",
        isDefault: !!input.isDefault,
        taxId: input.taxId?.trim() || null,
        branchNumber: input.branchNumber?.trim() || null,
        addressLine1: input.addressLine1.trim(),
        addressLine2: input.addressLine2?.trim() || null,
        subdistrict: input.subdistrict?.trim() || null,
        district: input.district?.trim() || null,
        province: input.province?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
        country: input.country?.trim() || "Thailand",
        formattedAddress,
        googleMapsUrl: mapsUrl || null,
      },
    });
  });

  revalidatePath("/contact");
  return result;
}

export async function updateCompanyAddress(
  addressId: string,
  input: Partial<CreateCompanyAddressInput>
) {
  await getContactActor();

  const current = await prisma.companyAddress.findUnique({
    where: { id: addressId },
    include: { company: true },
  });
  if (!current) throw new Error("Address not found");

  const addressParts = [
    input.addressLine1 !== undefined ? input.addressLine1 : current.addressLine1,
    input.addressLine2 !== undefined ? input.addressLine2 : current.addressLine2,
    input.subdistrict !== undefined ? input.subdistrict : current.subdistrict,
    input.district !== undefined ? input.district : current.district,
    input.province !== undefined ? input.province : current.province,
    input.postalCode !== undefined ? input.postalCode : current.postalCode,
    input.country !== undefined ? input.country : current.country,
  ].filter(Boolean);
  const formattedAddress = addressParts.join(" ");

  let mapsUrl = input.googleMapsUrl !== undefined ? input.googleMapsUrl?.trim() : current.googleMapsUrl;
  if (!mapsUrl && formattedAddress) {
    const query = encodeURIComponent(`${current.company.name} ${formattedAddress}`);
    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (input.isDefault) {
      await tx.companyAddress.updateMany({
        where: { companyId: current.companyId },
        data: { isDefault: false },
      });
    }

    return await tx.companyAddress.update({
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
        ...(input.country !== undefined ? { country: input.country?.trim() || null } : {}),
        formattedAddress,
        googleMapsUrl: mapsUrl || null,
      },
    });
  });

  revalidatePath("/contact");
  return result;
}

export async function deleteCompanyAddress(addressId: string) {
  await getContactActor();

  await prisma.companyAddress.delete({
    where: { id: addressId },
  });

  revalidatePath("/contact");
  return { success: true };
}

export async function setDefaultCompanyAddress(companyId: string, addressId: string) {
  await getContactActor();

  await prisma.$transaction([
    prisma.companyAddress.updateMany({
      where: { companyId },
      data: { isDefault: false },
    }),
    prisma.companyAddress.update({
      where: { id: addressId },
      data: { isDefault: true },
    }),
  ]);

  revalidatePath("/contact");
  return { success: true };
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

export async function getAccountOverview(
  companyId: string,
  _options?: { includeLogs?: boolean; actor?: ContactActor }
) {
  const actor = _options?.actor || (await getContactActor());

  // Parallel Phase 1: Company data + AI Config + Company-level Logs run concurrently
  const [company, aiCache, companyLogs] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        displayName: true,
        type: true,
        status: true,
        starRating: true,
        country: true,
        notes: true,
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
        addresses: {
          orderBy: { createdAt: "asc" },
        },
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
              },
            },
          },
        },
      },
    }),
    prisma.systemConfig.findUnique({
      where: { id: `account_ai_${companyId}` },
      select: { googleRefreshToken: true },
    }).catch(() => null),
    prisma.companyLog.groupBy({
      by: ["userId"],
      where: { companyId },
      _count: { id: true },
    }).catch(() => []),
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

  const deals = company.opportunities;
  const totalDeals = deals.length;
  const openDeals = deals.filter((d) => d.status === "OPEN");
  const wonDeals = deals.filter((d) => d.status === "WON" || (d.status as string) === "COMPLETED");
  const lostDeals = deals.filter((d) => d.status === "LOST" || (d.status as string) === "CANCELLED");

  const totalPipelineValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const totalWonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);

  const winRate = totalDeals > 0 
    ? Math.round((wonDeals.length / totalDeals) * 100) 
    : 0;

  const activePersonsCount = sanitizedContacts.filter((c) => c.isActive).length;
  const inactivePersonsCount = sanitizedContacts.length - activePersonsCount;

  // Parallel Phase 2: Opportunities & Contacts Logs
  const companyOppIds = company.opportunities.map((o) => o.id);
  const companyContactIds = company.contacts.map((c) => c.id);

  const [oppLogs, contactLogs] = await Promise.all([
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
  ]);

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

  if (userContributions.size > 0) {
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
      type: company.type,
      status: company.status,
      starRating: company.starRating,
      country: company.country,
      notes: company.notes,
      address: null,
      createdAt: new Date(),
      logs: [] as OverviewCompanyLog[],
    },
    addresses: company.addresses,
    contacts: sanitizedContacts,
    deals: company.opportunities,
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
  revalidatePath("/contact");
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
  await getContactActor();

  // 1. Fetch attachments across all opportunities for this company
  const rawAttachments = await prisma.attachment.findMany({
    where: {
      opportunity: { companyId },
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
  });

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

  // 2. Fetch activity logs containing URLs (filtered at DB level with contains: "http")
  const logs = await prisma.activityLog.findMany({
    where: {
      opportunity: { companyId },
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
    take: 150,
  });

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

