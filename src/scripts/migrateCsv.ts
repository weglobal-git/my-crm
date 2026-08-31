import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, OpportunityStatus, PipelineStage } from '@prisma/client';

const prisma = new PrismaClient();
const cleanedPath = path.join(process.cwd(), 'src/scripts/cleaned');

async function migrateContacts() {
  console.log('Migrating Contacts.json...');
  const data = JSON.parse(fs.readFileSync(path.join(cleanedPath, 'Contacts.json'), 'utf8'));

  for (const row of data) {
    const projectName = row.projectName;
    
    // Create Company
    const company = await prisma.company.upsert({
      where: { id: projectName }, 
      create: { name: projectName, address: row.companyAddress, country: row.country },
      update: {}
    }).catch(async () => {
       let existing = await prisma.company.findFirst({ where: { name: projectName } });
       if (!existing) {
         existing = await prisma.company.create({ 
           data: { name: projectName, address: row.companyAddress, country: row.country }
         });
       }
       return existing;
    });

    // Create Contact
    const contactName = row.customerName;
    if (contactName) {
      await prisma.contact.create({
        data: {
          name: contactName,
          email: row.email,
          phone: row.phone,
          companyId: company.id
        }
      });
    }
  }
  console.log('Contacts migration done.');
}

async function migrateProducts() {
  console.log('Migrating Products.json...');
  const data = JSON.parse(fs.readFileSync(path.join(cleanedPath, 'Products.json'), 'utf8'));

  for (const row of data) {
    let sku = row.name || `SKU-${Math.random().toString(36).substr(2, 9)}`;

    const existing = await prisma.product.findFirst({ where: { name: row.name } });
    if (!existing) {
       await prisma.product.create({
         data: {
           sku: sku,
           name: row.name,
           basePrice: row.price || 0,
         }
       });
    }
  }
  console.log('Products migration done.');
}

async function migrateOpportunities(stages: PipelineStage[]) {
  console.log('Migrating Opportunities.json...');
  const data = JSON.parse(fs.readFileSync(path.join(cleanedPath, 'Opportunities.json'), 'utf8'));

  for (const row of data) {
    const ownerName = row.cardOwner || 'Unassigned';
    
    let user = await prisma.user.findFirst({ where: { email: `${ownerName.toLowerCase()}@example.com` }});
    if (!user) {
       user = await prisma.user.create({
         data: { name: ownerName, email: `${ownerName.toLowerCase()}@example.com` }
       });
    }

    const projectName = row.projectName;
    let companyId = null;
    if (projectName) {
      const company = await prisma.company.findFirst({ where: { name: projectName } });
      if (company) companyId = company.id;
    }

    const rawStatus = row.status;
    let status: OpportunityStatus = OpportunityStatus.OPEN;
    let stageId = null;

    if (rawStatus === 'Won') status = OpportunityStatus.WON;
    else if (rawStatus === 'Lost' || rawStatus === 'Discarded') status = OpportunityStatus.LOST;
    else if (rawStatus === 'Completed') status = OpportunityStatus.COMPLETED;
    else {
      let mappedStatus = rawStatus?.toLowerCase() || '';
      if (mappedStatus === 'qualified') mappedStatus = 'to do';
      else if (mappedStatus === 'doing') mappedStatus = 'in progress';
      else if (mappedStatus === 'quoted') mappedStatus = 'review';
      else if (mappedStatus === 'following') mappedStatus = 'follow up';

      const stage = stages.find(s => s.name.toLowerCase() === mappedStatus);
      if (stage) stageId = stage.id;
    }

    const opp = await prisma.opportunity.create({
      data: {
        topic: row.topic || 'Untitled',
        value: row.value,
        dueDate: row.dueDate ? new Date(row.dueDate) : null,
        goodsReadyDate: row.goodsReadyDate ? new Date(row.goodsReadyDate) : null,
        goodsLoadingDate: row.goodsLoadingDate ? new Date(row.goodsLoadingDate) : null,
        closedAt: row.closedAt ? new Date(row.closedAt) : null,
        quotedAt: row.quotedAt ? new Date(row.quotedAt) : null,
        reserveId: row.reserveId,
        invoiceId: row.invoiceId,
        attachmentUrl: row.attachmentUrl,
        status: status,
        pipelineStageId: stageId,
        companyId: companyId,
        ownerId: user.id,
      }
    });

    // Parse Follow-Up-History
    if (row.activityLogs && row.activityLogs.length > 0) {
      for (const log of row.activityLogs) {
         let logUserId = user.id;
         if (log.author && log.author !== ownerName) {
           let logUser = await prisma.user.findFirst({ where: { name: log.author }});
           if (!logUser) {
             logUser = await prisma.user.create({
               data: { name: log.author, email: `${log.author.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com` }
             });
           }
           logUserId = logUser.id;
         }

         await prisma.activityLog.create({
           data: {
             content: log.content,
             type: log.isSystem ? 'SYSTEM_UPDATE' : 'COMMENT',
             opportunityId: opp.id,
             userId: logUserId,
             createdAt: log.date ? new Date(log.date) : new Date()
           }
         });
      }
    }
  }
  console.log('Opportunities migration done.');
}

async function main() {
  console.log('--- Starting Migration ---');
  
  // Clean all previous data to prevent duplicates
  await prisma.activityLog.deleteMany();
  await prisma.opportunityTag.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.product.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();

  // Setup Stages
  await prisma.pipelineStage.deleteMany();
  const genericStages = ['To Do', 'In Progress', 'Review', 'Follow Up'].map((name, i) => ({ name, order: i + 1 }));
  for (const s of genericStages) {
    await prisma.pipelineStage.create({ data: s });
  }
  const stages = await prisma.pipelineStage.findMany();

  await migrateContacts();
  await migrateProducts();
  await migrateOpportunities(stages);

  console.log('--- Migration Completed Successfully! ---');
}

main().catch(console.error).finally(() => prisma.$disconnect());
