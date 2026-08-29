import { PrismaClient, BoardType } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Clear existing
  await prisma.opportunity.deleteMany()
  await prisma.pipelineStage.deleteMany()

  // Create Pipeline Stages for LEAD
  const leadStages = [
    { name: 'Qualified', boardType: BoardType.LEAD, order: 1 },
    { name: 'Quoted', boardType: BoardType.LEAD, order: 2 },
    { name: 'Following', boardType: BoardType.LEAD, order: 3 },
  ]
  
  for (const stage of leadStages) {
    await prisma.pipelineStage.create({ data: stage })
  }

  // Create Pipeline Stages for TASK
  const taskStages = [
    { name: 'Doing', boardType: BoardType.TASK, order: 1 },
  ]
  
  for (const stage of taskStages) {
    await prisma.pipelineStage.create({ data: stage })
  }

  console.log("Mock data inserted successfully")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
