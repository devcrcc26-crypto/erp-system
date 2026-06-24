import { PrismaClient } from '@prisma/client';
import {
  buildPmSeedContextFromDb,
  seedFullProject,
} from './seed-project-full';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding FULL-001 - all project tables...');

  const ctx = await buildPmSeedContextFromDb(prisma);
  const result = await seedFullProject(ctx);

  console.log('Full project seed completed.');
  console.log(`  Project code: ${result.projectCode}`);
  console.log(`  Project ID  : ${result.projectId}`);
}

main()
  .catch((error: unknown) => {
    console.error('Full project seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
