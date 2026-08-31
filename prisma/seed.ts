import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Clear existing
  await prisma.opportunity.deleteMany()
  await prisma.pipelineStage.deleteMany()

  // Create Generic Pipeline Stages
  const stages = [
    { name: 'To Do', order: 1 },
    { name: 'In Progress', order: 2 },
    { name: 'Review', order: 3 },
    { name: 'Follow Up', order: 4 },
  ]
  
  for (const stage of stages) {
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
