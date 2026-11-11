/**
 * Read-only contract amount check.
 *
 * Compares every EC-XXXX contract's basicSalary, transportationAllowance and
 * monthlyBonus in the DB against the planned values recorded in the contract
 * seed report (data/private/contract-seed-report.md).
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/check-contract-amounts.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { assertLocalhostSeedGuards } from './lib/localhost-seed-guard';

const REPORT_PATH = join(
  __dirname,
  '..',
  'data',
  'private',
  'contract-seed-report.md',
);
const COMPANY_ID = '00000000-0000-4000-8000-000000000001';

interface PlannedRow {
  employee: string;
  contractNumber: string;
  basic: number;
  transport: number;
  bonus: number;
}

/** Parse the "## Contracts" table from the seed report. */
function parseSeedReport(md: string): PlannedRow[] {
  const rows: PlannedRow[] = [];
  let inTable = false;

  for (const line of md.split('\n')) {
    if (line.trim() === '## Contracts') {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith('## ')) {
      break;
    }
    if (!inTable) continue;

    // Match data rows: | Employee | EC-NNNN | ... | basic | transport | bonus |
    const m =
      /^\|\s*(.+?)\s*\|\s*(EC-\d+)\s*\|[^|]+\|[^|]+\|[^|]+\|\s*([\d.,]+)\s*\|\s*([\d.,]+)\s*\|\s*([\d.,]+)\s*\|/.exec(
        line,
      );
    if (!m) continue;

    const parse = (s: string) => parseFloat(s.replace(/,/g, ''));
    rows.push({
      employee: m[1].trim(),
      contractNumber: m[2].trim(),
      basic: parse(m[3]),
      transport: parse(m[4]),
      bonus: parse(m[5]),
    });
  }

  return rows;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  assertLocalhostSeedGuards();

  const md = readFileSync(REPORT_PATH, 'utf8');
  const planned = parseSeedReport(md);

  if (planned.length === 0) {
    console.error('No contracts found in seed report. Check REPORT_PATH.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const contractNumbers = planned.map((p) => p.contractNumber);
    const dbContracts = await prisma.employeeContract.findMany({
      where: {
        companyId: COMPANY_ID,
        contractNumber: { in: contractNumbers },
        deletedAt: null,
      },
      select: {
        contractNumber: true,
        basicSalary: true,
        transportationAllowance: true,
        monthlyBonus: true,
        employee: {
          select: { employeeId: true },
        },
      },
    });

    const dbByNumber = new Map(
      dbContracts.map((c) => [c.contractNumber, c]),
    );

    const mismatches: Array<{
      contractNumber: string;
      employeeId: string | null;
      field: string;
      seeded: number;
      db: number;
    }> = [];

    let checked = 0;
    let missing = 0;

    for (const plan of planned) {
      const db = dbByNumber.get(plan.contractNumber);
      if (!db) {
        missing += 1;
        console.warn(`  MISSING in DB: ${plan.contractNumber} (${plan.employee})`);
        continue;
      }
      checked += 1;

      const employeeId = db.employee?.employeeId ?? null;
      const dbBasic = round2(Number(db.basicSalary ?? 0));
      const dbTransport = round2(Number(db.transportationAllowance ?? 0));
      const dbBonus = round2(Number(db.monthlyBonus ?? 0));

      if (round2(dbBasic) !== round2(plan.basic)) {
        mismatches.push({
          contractNumber: plan.contractNumber,
          employeeId,
          field: 'basicSalary',
          seeded: plan.basic,
          db: dbBasic,
        });
      }
      if (round2(dbTransport) !== round2(plan.transport)) {
        mismatches.push({
          contractNumber: plan.contractNumber,
          employeeId,
          field: 'transport',
          seeded: plan.transport,
          db: dbTransport,
        });
      }
      if (round2(dbBonus) !== round2(plan.bonus)) {
        mismatches.push({
          contractNumber: plan.contractNumber,
          employeeId,
          field: 'bonus',
          seeded: plan.bonus,
          db: dbBonus,
        });
      }
    }

    console.log('\n=== Contract Amount Check ===');
    console.log(`Planned (seed report): ${planned.length}`);
    console.log(`Checked in DB:         ${checked}`);
    console.log(`Missing from DB:       ${missing}`);
    console.log(`Mismatches:            ${mismatches.length}`);

    if (mismatches.length === 0) {
      console.log('\nAll checked contracts match the seed report.');
    } else {
      console.log('\nMismatches (seeded vs DB):');
      for (const m of mismatches) {
        const emp = m.employeeId ? `${m.employeeId} ` : '';
        console.log(
          `  ${m.contractNumber} ${emp}${m.field}: ${m.seeded.toFixed(2)} → DB has ${m.db.toFixed(2)}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
