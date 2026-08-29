import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, OpportunityStatus, OpportunityType, BoardType, PipelineStage } from '@prisma/client';

const prisma = new PrismaClient();
const basePath = path.join(process.cwd(), 'backup_old_code', 'csv');

function parseDate(dateStr: string) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const d = new Date(`${parts[2].trim()}-${parts[1].trim()}-${parts[0].trim()}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d;
  }
  // Try direct parsing if not DD/MM/YYYY
  const fallback = new Date(dateStr);
  if (!isNaN(fallback.getTime())) return fallback;
  return null;
}

function parseAmount(amountStr: string) {
  if (!amountStr) return null;
  const val = parseFloat(amountStr.replace(/,/g, ''));
  return isNaN(val) ? null : val;
}

async function migrateContacts() {
  console.log('Migrating Contacts.csv...');
  const csvContent = fs.readFileSync(path.join(basePath, 'Contacts.csv'), 'utf8');
  const records = parse(csvContent, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

  for (const row of records) {
    const projectName = row['Project']?.trim();
    if (!projectName || projectName === '-' || projectName === '') continue;

    // Create Company
    const company = await prisma.company.upsert({
      where: { id: projectName }, // We'll just generate CUID and findFirst by name instead
      create: { name: projectName, address: row['Company-Address'], country: row['Country'] },
      update: {}
    }).catch(async () => {
       let existing = await prisma.company.findFirst({ where: { name: projectName } });
       if (!existing) {
         existing = await prisma.company.create({ 
           data: { name: projectName, address: row['Company-Address'], country: row['Country'] }
         });
       }
       return existing;
    });

    // Create Contact
    const contactName = row['Customer-Name']?.trim();
    if (contactName && contactName !== '-' && contactName !== '') {
      await prisma.contact.create({
        data: {
          name: contactName,
          email: row['Email'],
          phone: row['Phone-Number'],
          companyId: company.id
        }
      });
    }
  }
  console.log('Contacts migration done.');
}

async function migrateOpportunities(stages: PipelineStage[]) {
  console.log('Migrating Opportunities.csv...');
  const csvContent = fs.readFileSync(path.join(basePath, 'Opportunities.csv'), 'utf8');
  const records = parse(csvContent, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

  for (const row of records) {
    const ownerName = row['Card-Owner']?.trim() || 'Unassigned';
    
    // Using findFirst instead of upsert to avoid requiring unique constraints on email if it's dynamic
    let user = await prisma.user.findFirst({ where: { email: `${ownerName.toLowerCase()}@example.com` }});
    if (!user) {
       user = await prisma.user.create({
         data: { name: ownerName, email: `${ownerName.toLowerCase()}@example.com` }
       });
    }

    const projectName = row['Project']?.trim();
    let companyId = null;
    if (projectName) {
      const company = await prisma.company.findFirst({ where: { name: projectName } });
      if (company) companyId = company.id;
    }

    const rawStatus = row['Status']?.trim();
    let status: OpportunityStatus = OpportunityStatus.OPEN;
    let stageId = null;

    if (rawStatus === 'Won') status = OpportunityStatus.WON;
    else if (rawStatus === 'Lost' || rawStatus === 'Discarded') status = OpportunityStatus.LOST;
    else if (rawStatus === 'Completed') status = OpportunityStatus.COMPLETED;
    else {
      const stage = stages.find(s => s.name.toLowerCase() === rawStatus?.toLowerCase());
      if (stage) stageId = stage.id;
    }

    const oppType = row['Type']?.toLowerCase().includes('task') ? OpportunityType.TASK : OpportunityType.LEAD;

    const opp = await prisma.opportunity.create({
      data: {
        type: oppType,
        topic: row['Topic'] || 'Untitled',
        value: parseAmount(row['Amount']),
        dueDate: parseDate(row['Due-Date']),
        goodsReadyDate: parseDate(row['Goods-Ready-Date']),
        goodsLoadingDate: parseDate(row['Goods-Loading-Date']),
        status: status,
        pipelineStageId: stageId,
        companyId: companyId,
        ownerId: user.id,
      }
    });

    // Parse Follow-Up-History
    const historyText = row['Follow-Up-History'];
    if (historyText) {
      const logPattern = /\[([^\]]+)\]\s*(.*?)(?=\[|$)/g;
      let match: RegExpExecArray | null;
      while ((match = logPattern.exec(historyText)) !== null) {
         await prisma.activityLog.create({
           data: {
             content: match[2].trim(),
             opportunityId: opp.id,
             userId: user.id,
             createdAt: new Date(match[1])
           }
         }).catch(() => {
           // Fallback if date is unparseable
           if (match) {
             prisma.activityLog.create({
               data: {
                 content: `[${match[1]}] ${match[2].trim()}`,
                 opportunityId: opp.id,
                 userId: user.id
               }
             });
           }
         });
      }
    }

    // Parse Tags
    const tagsStr = row['Tags'];
    if (tagsStr) {
      const tags = tagsStr.split(',').map((t: string) => t.trim()).filter((t: string) => t);
      for (const t of tags) {
        let tag = await prisma.tag.findUnique({ where: { name: t } });
        if (!tag) {
          tag = await prisma.tag.create({ data: { name: t } });
        }
        await prisma.opportunityTag.create({
          data: { opportunityId: opp.id, tagId: tag.id }
        });
      }
    }
  }
  console.log('Opportunities migration done.');
}

async function migrateProducts() {
  console.log('Migrating Products.csv...');
  const csvContent = fs.readFileSync(path.join(basePath, ' Products.csv'), 'utf8');
  // Need to handle the first column which is unnamed in CSV
  const records = parse(csvContent, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

  for (const row of records) {
    const fullProductName = row['Full-Product-Name']?.trim();
    if (!fullProductName || fullProductName === '--- Click to Select a Product ---') continue;

    // Use Product column or generate a placeholder SKU if missing
    let sku = row['Product']?.trim() || row['HS-Code']?.trim() || `SKU-${Math.random().toString(36).substr(2, 9)}`;
    if (sku === '-') sku = `SKU-${Math.random().toString(36).substr(2, 9)}`;

    const price = parseAmount(row['Export-Price']) || parseAmount(row['General Export']) || 0;

    const existing = await prisma.product.findUnique({ where: { sku } });
    if (!existing) {
       await prisma.product.create({
         data: {
           sku: sku,
           name: fullProductName,
           basePrice: price,
           weight: parseAmount(row['NW']),
           cbm: parseAmount(row['CBM']),
         }
       });
    }
  }
  console.log('Products migration done.');
}

async function main() {
  console.log('--- Starting Migration ---');

  // 1. Setup Stages
  await prisma.pipelineStage.deleteMany();
  const leadStages = ['Qualified', 'Quoted', 'Following'].map((name, i) => ({ name, boardType: BoardType.LEAD, order: i + 1 }));
  const taskStages = ['Doing'].map((name, i) => ({ name, boardType: BoardType.TASK, order: i + 1 }));
  for (const s of [...leadStages, ...taskStages]) {
    await prisma.pipelineStage.create({ data: s });
  }
  const stages = await prisma.pipelineStage.findMany();

  await migrateContacts();
  await migrateProducts();
  await migrateOpportunities(stages);

  console.log('--- Migration Completed Successfully! ---');
}

main().catch(console.error).finally(() => prisma.$disconnect());
