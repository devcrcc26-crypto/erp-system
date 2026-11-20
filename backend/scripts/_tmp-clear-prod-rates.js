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
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  // Prefer direct (5432) over pgbouncer transaction pooler for writes.
  let url = readEnvValue('.env', 'PROD_DIRECT_URL');
  if (!url.includes('sslmode=')) {
    url += url.includes('?') ? '&sslmode=require' : '?sslmode=require';
  }
  const host = new URL(url.replace(/^postgresql:/, 'http:')).hostname;
  console.log(`Target host: ${host}`);
  console.log(dryRun ? 'Mode: DRY_RUN' : 'Mode: CLEAR');

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    // Per diem rates cleared Nov 2026 — re-seed when official rates are confirmed
    const active = await prisma.employeePerDiemRate.count({
      where: { deletedAt: null },
    });
    const soft = await prisma.employeePerDiemRate.count({
      where: { deletedAt: { not: null } },
    });
    console.log(`Active rows: ${active}; already soft-deleted: ${soft}`);

    if (active === 0) {
      console.log('Nothing to do.');
      return;
    }

    if (dryRun) {
      console.log('DRY_RUN=1 — no rows updated.');
      return;
    }

    const clearedAt = new Date();
    const result = await prisma.employeePerDiemRate.updateMany({
      where: { deletedAt: null },
      data: {
        deletedAt: clearedAt,
        deletedBy: null,
        updatedAt: clearedAt,
      },
    });
    console.log(
      `Soft-deleted ${result.count} employee_per_diem_rate row(s) at ${clearedAt.toISOString()}.`,
    );

    const remaining = await prisma.employeePerDiemRate.count({
      where: { deletedAt: null },
    });
    console.log(`Active rows remaining: ${remaining}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
