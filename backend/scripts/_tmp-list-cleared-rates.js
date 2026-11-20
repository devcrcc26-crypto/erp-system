const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

function readEnvValue(filePath, key) {
  const text = fs.readFileSync(filePath, 'utf8');
  const line = text
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`) && !l.trim().startsWith('#'));
  if (!line) {
    throw new Error(`Missing ${key} in ${filePath}`);
  }
  let value = line.slice(`${key}=`.length).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

async function main() {
  let url = readEnvValue('.env', 'PROD_DIRECT_URL');
  if (!url.includes('sslmode=')) {
    url += url.includes('?') ? '&sslmode=require' : '?sslmode=require';
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await prisma.employeePerDiemRate.findMany({
      where: { deletedAt: { not: null } },
      orderBy: [{ deletedAt: 'desc' }],
      select: {
        domesticRate: true,
        regionalRate: true,
        internationalRate: true,
        currency: true,
        deletedAt: true,
        employee: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            employeeId: true,
          },
        },
      },
    });

    for (const r of rows) {
      const e = r.employee;
      const name =
        [e.firstName, e.lastName].filter(Boolean).join(' ') || '(no name)';
      console.log(
        [
          e.employeeId || '-',
          name,
          e.email || '-',
          `DOM=${r.domesticRate ?? '-'}`,
          `REG=${r.regionalRate ?? '-'}`,
          `INT=${r.internationalRate ?? '-'}`,
          r.currency,
        ].join(' | '),
      );
    }
    console.log(`Total: ${rows.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
