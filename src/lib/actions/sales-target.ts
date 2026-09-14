'use server';

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { getContactActor } from '@/lib/actions/contact';
import { getUserVisibleMenuKeys } from '@/lib/actions/permission';
import { getBangkokYear, SUPPORTED_SALES_CURRENCIES } from '@/lib/dashboard/sales-overview';

const requiredMenuKeys = ['contact', 'contact.sale_target'] as const;
const currencySchema = z.enum(SUPPORTED_SALES_CURRENCIES);
const companyIdSchema = z.string().trim().min(1).max(100);

const targetInputSchema = z.object({
  companyId: companyIdSchema,
  year: z.number().int().min(2000),
  amount: z.string().trim().regex(
    /^\d{1,16}(?:\.\d{1,2})?$/,
    'Amount must fit Decimal(18,2) and have at most 2 decimal places',
  ),
  currency: currencySchema.default('THB'),
});

export type CompanySaleTargetDTO = {
  id: string;
  companyId: string;
  year: number;
  amount: string;
  currency: string;
  updatedAt: string;
};

function toDTO(target: {
  id: string;
  companyId: string;
  year: number;
  amount: Prisma.Decimal;
  currency: string;
  updatedAt: Date;
}): CompanySaleTargetDTO {
  return {
    id: target.id,
    companyId: target.companyId,
    year: target.year,
    amount: target.amount.toFixed(2),
    currency: target.currency,
    updatedAt: target.updatedAt.toISOString(),
  };
}

async function requireSaleTargetActor() {
  const actor = await getContactActor();
  const visibleKeys = new Set(await getUserVisibleMenuKeys(actor.id));
  if (actor.role !== 'ADMIN' && requiredMenuKeys.some((key) => !visibleKeys.has(key))) {
    throw new Error('Forbidden');
  }
  return actor;
}

async function requireCompany(companyId: string) {
  // Product policy: Account currently has no row-level access contract. Sale
  // Targets therefore use permission-only account scope, never an invented
  // department/deal heuristic. The two menu checks remain server-authoritative.
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true, name: true },
  });
  if (!company) throw new Error('Account not found');
  return company;
}

function validateYear(year: number) {
  if (year > getBangkokYear()) throw new Error('Future sale target years are not allowed');
}

export async function getCompanySaleTargets(companyIdInput: string): Promise<CompanySaleTargetDTO[]> {
  await requireSaleTargetActor();
  const companyId = companyIdSchema.parse(companyIdInput);
  await requireCompany(companyId);
  const targets = await prisma.companySaleTarget.findMany({
    where: { companyId, year: { lte: getBangkokYear() } },
    orderBy: [{ year: 'desc' }, { currency: 'asc' }],
  });
  return targets.map(toDTO);
}

export async function upsertCompanySaleTarget(input: {
  companyId: string;
  year: number;
  amount: string;
  currency?: string;
}): Promise<CompanySaleTargetDTO> {
  const actor = await requireSaleTargetActor();
  const parsed = targetInputSchema.parse({ ...input, currency: input.currency || 'THB' });
  validateYear(parsed.year);
  const company = await requireCompany(parsed.companyId);
  const amount = new Prisma.Decimal(parsed.amount);

  const target = await prisma.$transaction(async (tx) => {
    const existing = await tx.companySaleTarget.findUnique({
      where: {
        companyId_year_currency: {
          companyId: parsed.companyId,
          year: parsed.year,
          currency: parsed.currency,
        },
      },
    });
    const saved = await tx.companySaleTarget.upsert({
      where: {
        companyId_year_currency: {
          companyId: parsed.companyId,
          year: parsed.year,
          currency: parsed.currency,
        },
      },
      create: { ...parsed, amount },
      update: { amount },
    });
    await tx.companyLog.create({
      data: {
        companyId: parsed.companyId,
        userId: actor.id,
        action: existing ? 'SALE_TARGET_UPDATE' : 'SALE_TARGET_CREATE',
        fieldName: `saleTarget.${parsed.year}.${parsed.currency}`,
        oldValue: existing?.amount.toFixed(2) ?? null,
        newValue: saved.amount.toFixed(2),
        summary: `${existing ? 'Updated' : 'Created'} ${company.displayName || company.name} sale target for ${parsed.year} (${parsed.currency})`,
      },
    });
    return saved;
  });
  return toDTO(target);
}

export async function deleteCompanySaleTarget(input: {
  companyId: string;
  year: number;
  currency?: string;
}): Promise<{ companyId: string; year: number; currency: string; deleted: true }> {
  const actor = await requireSaleTargetActor();
  const parsed = z.object({
    companyId: companyIdSchema,
    year: z.number().int().min(2000),
    currency: currencySchema.default('THB'),
  }).parse({ ...input, currency: input.currency || 'THB' });
  validateYear(parsed.year);
  const company = await requireCompany(parsed.companyId);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.companySaleTarget.findUnique({
      where: { companyId_year_currency: parsed },
    });
    if (!existing) throw new Error('Sale target not found');
    await tx.companySaleTarget.delete({ where: { id: existing.id } });
    await tx.companyLog.create({
      data: {
        companyId: parsed.companyId,
        userId: actor.id,
        action: 'SALE_TARGET_DELETE',
        fieldName: `saleTarget.${parsed.year}.${parsed.currency}`,
        oldValue: existing.amount.toFixed(2),
        newValue: null,
        summary: `Deleted ${company.displayName || company.name} sale target for ${parsed.year} (${parsed.currency})`,
      },
    });
  });
  return { ...parsed, deleted: true };
}
