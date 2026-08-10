import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const rows = await prisma.$queryRaw`
  SELECT sequencename
  FROM pg_sequences
  WHERE sequencename ILIKE '%seal%' OR sequencename ILIKE '%official%'
  ORDER BY sequencename
`;

console.log('matching sequences:', rows);

const exact = await prisma.$queryRaw`
  SELECT to_regclass('public.official_seal_request_number_seq') AS request_seq,
         to_regclass('public.official_seal_number_seq') AS number_seq
`;

console.log('exact:', exact);
await prisma.$disconnect();
