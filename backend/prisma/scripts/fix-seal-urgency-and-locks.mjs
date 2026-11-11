import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  for (const pid of [3774418, 3791821, 3791819]) {
    const r = await prisma.$queryRawUnsafe(
      `SELECT pg_terminate_backend(${pid}) AS killed`,
    );
    console.log('terminate', pid, r);
  }

  await prisma.$executeRawUnsafe(
    `ALTER TYPE "SealUrgency" RENAME VALUE 'CRITICALLY' TO 'CRITICAL'`,
  );
  console.log('enum renamed');

  const enums = await prisma.$queryRaw`
    SELECT e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'SealUrgency'
    ORDER BY e.enumsortorder
  `;
  console.log('SealUrgency values:', enums);
} finally {
  await prisma.$disconnect();
}
