"use server";

import prisma from "@/lib/prisma";

export async function getCompanies() {
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      displayName: true,
      contacts: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return companies.sort((a, b) => {
    const nameA = (a.displayName || a.name || "").trim();
    const nameB = (b.displayName || b.name || "").trim();
    return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
  });
}

