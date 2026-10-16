import { PrismaClient } from '@prisma/client';
import { seedOrgStructure } from './seeds/org-structure.seed';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found - run full seed first');
    }
    const actor = '00000000-0000-4000-8000-000000000001';
    await seedOrgStructure(prisma, {
      companyId: company.id,
      createdBy: actor,
    });
    // Second pass must report "already existed"
    await seedOrgStructure(prisma, {
      companyId: company.id,
      createdBy: actor,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
