import prisma from "../src/lib/prisma";

async function main() {
  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log("Recent ActivityLogs:");
  console.log(JSON.stringify(logs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
