import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding AI configuration...");

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey || apiKey === "dummy-gemini-key" || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
    console.warn("⚠️ WARNING: No valid GOOGLE_GEMINI_API_KEY found in .env");
    console.warn("Please add GOOGLE_GEMINI_API_KEY=\"AIza...\" to your .env file!");
  }

  // Seed System User for AI
  await prisma.user.upsert({
    where: { id: "system" },
    update: {
      name: "WeGlobal AI",
      email: "ai@weglobal.com",
    },
    create: {
      id: "system",
      name: "WeGlobal AI",
      email: "ai@weglobal.com",
    }
  });
  console.log("Upserted system user for AI");

  // Seed Provider Config
  const providerConfig = await prisma.aIProviderConfig.upsert({
    where: { providerKey: "GOOGLE_GEMINI" },
    update: {
      secretRef: apiKey || "dummy-gemini-key",
      enabled: true,
      status: "ENABLED",
    },
    create: {
      providerKey: "GOOGLE_GEMINI",
      secretRef: apiKey || "dummy-gemini-key",
      enabled: true,
      status: "ENABLED",
    }
  });
  console.log("Upserted AIProviderConfig:", providerConfig.providerKey);

  // Seed Model Policy
  const policy = await prisma.aIModelPolicy.upsert({
    where: { agentKey_version: { agentKey: "EVENT_SUMMARIZER", version: 1 } },
    update: { 
      status: "ACTIVE",
      modelId: "gemini-2.5-flash"
    },
    create: {
      agentKey: "EVENT_SUMMARIZER",
      version: 1,
      status: "ACTIVE",
      providerKey: "GOOGLE_GEMINI",
      modelId: "gemini-2.5-flash",
      maximumContext: 6000,
      maxInputTokens: 2000,
      maxOutputTokens: 500,
      dailyTokenLimit: 100000,
      monthlyTokenLimit: 1000000,
      dailyCostLimitMicros: BigInt(100_000), // $0.10
      monthlyCostLimitMicros: BigInt(1_000_000), // $1.00
      perRunCostLimitMicros: BigInt(50_000), // $0.05
      promptVersion: "v1",
      schemaVersion: "v1",
    }
  });
  console.log("Upserted AIModelPolicy:", policy.id);
}

main().catch(console.error).finally(() => prisma.$disconnect());
