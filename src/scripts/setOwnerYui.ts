import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('Finding YUI...');
  const yui = await prisma.user.findFirst({
    where: { name: { equals: 'YUI', mode: 'insensitive' } }
  });

  if (!yui) {
    console.error('User YUI not found!');
    process.exit(1);
  }

  console.log(`Found YUI with ID: ${yui.id}`);

  console.log('Updating all opportunities to be owned by YUI...');
  const result = await prisma.opportunity.updateMany({
    data: {
      ownerId: yui.id
    }
  });

  console.log(`Successfully updated ${result.count} opportunities.`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
