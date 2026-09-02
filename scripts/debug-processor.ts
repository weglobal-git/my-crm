import { OutboxProcessor } from "../src/lib/ai/processor";
import prisma from "../src/lib/prisma";

async function main() {
  console.log("Resetting circuit breaker failures...");
  await prisma.agentRun.deleteMany({});
  
  console.log("Resetting ALL outbox items to PENDING and available now...");
  await prisma.agentOutbox.updateMany({
    data: { status: "PENDING", attempts: 0, leaseUntil: null, availableAt: new Date(0) }
  });

  console.log("Running processor...");
  const processor = new OutboxProcessor();
  try {
    const result = await processor.processNextPendingOutbox();
    console.log("Processor result:", result);
  } catch (error: any) {
    console.error("Processor unhandled exception:", error);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
