import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  console.log("Users in DB:", users);

  const logs = await prisma.activityLog.findMany({
    take: 5,
    include: { user: true },
    where: { type: 'COMMENT' },
    orderBy: { createdAt: 'desc' }
  });
  console.log("Sample Logs:", JSON.stringify(logs, null, 2));
}
run().finally(() => prisma.$disconnect());
