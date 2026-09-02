import prisma from "../src/lib/prisma";

async function main() {
  const outbox = await prisma.agentOutbox.findMany();
  console.log("AgentOutbox records:");
  console.log(JSON.stringify(outbox, null, 2));

  const events = await prisma.dealDomainEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log("\nRecent DealDomainEvents:");
  console.log(JSON.stringify(events, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
