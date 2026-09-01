"use server";

import prisma from "@/lib/prisma";

export async function getCompanies() {
  return await prisma.company.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true }
  });
}
