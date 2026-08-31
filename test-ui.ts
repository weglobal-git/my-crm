import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function run() {
  const yui = await prisma.user.findFirst({ where: { name: 'YUI' } });
  
  const opportunities = await prisma.opportunity.findMany({
    where: {
      status: 'OPEN',
      OR: [
        { ownerId: yui?.id },
        { teamMembers: { some: { id: yui?.id } } }
      ]
    },
    include: {
      owner: true,
      teamMembers: true,
    }
  });

  const stages = await prisma.pipelineStage.findMany({
    orderBy: { order: 'asc' }
  });

  console.log('Stages:', stages.map(s => s.id));
  const counts = stages.map(s => opportunities.filter(o => o.pipelineStageId === s.id).length);
  console.log('Counts per stage:', counts);
}
run().catch(console.error).finally(() => prisma.$disconnect());
