import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const rows = await prisma.$queryRaw`
  SELECT a.pid, a.state, a.wait_event_type, a.wait_event,
         a.query_start, left(a.query, 200) AS query
  FROM pg_locks l
  JOIN pg_stat_activity a ON a.pid = l.pid
  WHERE l.locktype = 'advisory'
`;

console.log(JSON.stringify(rows, null, 2));

const enums = await prisma.$queryRaw`
  SELECT e.enumlabel
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  WHERE t.typname = 'SealUrgency'
  ORDER BY e.enumsortorder
`;

console.log('SealUrgency values:', JSON.stringify(enums, null, 2));

await prisma.$disconnect();
