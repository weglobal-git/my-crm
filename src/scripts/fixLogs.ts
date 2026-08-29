import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.activityLog.findMany({
    where: {
      type: "COMMENT",
      OR: [
        { content: { startsWith: "Invited " } },
        { content: { startsWith: "Removed " } },
        { content: { startsWith: "Requested to transfer ownership to" } }
      ]
    }
  });

  for (const log of logs) {
    await prisma.activityLog.update({
      where: { id: log.id },
      data: { type: "SYSTEM_UPDATE" }
    });
  }

  console.log(`Updated ${logs.length} logs to SYSTEM_UPDATE`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
