import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const rows = await prisma.$queryRaw`
  SELECT column_name, data_type, udt_name, is_nullable, datetime_precision, column_default
  FROM information_schema.columns
  WHERE table_name = 'overtime_entry'
    AND column_name IN ('start_time', 'end_time', 'total_hours')
  ORDER BY column_name
`;

console.log(JSON.stringify(rows, null, 2));

const timeCols = await prisma.$queryRaw`
  SELECT start_time::text, end_time::text, datetime_precision
  FROM information_schema.columns
  WHERE table_name = 'overtime_entry'
    AND column_name = 'start_time'
`;

console.log('time precision:', JSON.stringify(timeCols, null, 2));

await prisma.$disconnect();
