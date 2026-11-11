import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "InspectionRepairUrgency" RENAME VALUE 'CRITICALLY' TO 'CRITICAL'`,
  );
  console.log('InspectionRepairUrgency renamed');

  const enums = await prisma.$queryRaw`
    SELECT e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'InspectionRepairUrgency'
    ORDER BY e.enumsortorder
  `;
  console.log('values:', enums);
} finally {
  await prisma.$disconnect();
}
