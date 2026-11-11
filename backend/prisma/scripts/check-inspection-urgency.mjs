import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const enums = await prisma.$queryRaw`
  SELECT e.enumlabel
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  WHERE t.typname = 'InspectionRepairUrgency'
  ORDER BY e.enumsortorder
`;

console.log('InspectionRepairUrgency DB values:', enums);
await prisma.$disconnect();
