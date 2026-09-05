import prisma from '../lib/prisma';

async function main() {
  console.log('Finding Export department...');
  let exportDept = await prisma.department.findUnique({
    where: { name: 'Export' }
  });

  if (!exportDept) {
    exportDept = await prisma.department.findFirst({
      where: { name: { contains: 'Export', mode: 'insensitive' } }
    });
  }

  if (!exportDept) {
    throw new Error('Export department not found!');
  }

  console.log(`Found Export department: ${exportDept.name} (id: ${exportDept.id})`);

  const totalContacts = await prisma.contact.count();
  console.log(`Total contacts in database: ${totalContacts}`);

  const updateResult = await prisma.contact.updateMany({
    data: {
      departmentId: exportDept.id,
      type: 'CUSTOMER',
      status: 'UNQUALIFIED'
    }
  });

  console.log(`Updated ${updateResult.count} contacts to Export department.`);

  const unassigned = await prisma.contact.count({
    where: { departmentId: null }
  });
  const inExport = await prisma.contact.count({
    where: { departmentId: exportDept.id }
  });

  console.log(JSON.stringify({ unassigned, inExport, totalContacts }, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
