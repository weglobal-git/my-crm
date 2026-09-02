import { OutboxProcessor } from "../src/lib/ai/processor";
import prisma from "../src/lib/prisma";

async function main() {
  console.log("Checking for pending outbox items...");
  const pendingCount = await prisma.agentOutbox.count({ where: { status: 'PENDING' } });
  console.log(`Found ${pendingCount} pending items.`);

  if (pendingCount === 0) {
    console.log("No pending items found. AI will only summarize NEW events.");
    console.log("If you want to see the UI, try posting a new update on the deal first, then run this script again.");
    return;
  }

  const processor = new OutboxProcessor();
  console.log("Processing next item...");
  const result = await processor.processNextPendingOutbox();
  console.log("Process result:", result);
}

main().catch(console.error).finally(() => prisma.$disconnect());
