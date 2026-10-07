/**
 * Verify pwf_fresh contents after build-pwf-fresh.
 *
 * Usage:
 *   $env:SEED_MODE='true'
 *   $env:DATABASE_URL='postgresql://postgres:postgres@localhost:5433/pwf_fresh?schema=public'
 *   npx ts-node --transpile-only scripts/verify-fresh-db.ts
 */
import { PrismaClient } from '@prisma/client';
import {
  assertLocalhostSeedGuards,
  withDatabase,
} from './lib/localhost-seed-guard';

const SOURCE_DB = 'pwf_test';
const TARGET_DB = 'pwf_fresh';
const SAMUEL_ID = '16040ab7-b923-4fe4-87cf-cc3a916c7325';

const PAYROLL_SEED_POSITION_TITLES = new Set([
  'Junior Engineer',
  'Engineer',
  'Senior Engineer',
  'Lead Engineer',
  'Draftsman',
  'Technician',
  'Admin Officer',
  'HR Officer',
  'Driver',
  'Accountant',
]);
const PAYROLL_SEED_CREATED_AT_START = new Date('2026-10-05T13:03:27.000Z');
const PAYROLL_SEED_CREATED_AT_END = new Date('2026-10-05T13:03:28.000Z');

const TRANSACTIONAL_TABLES = [
  'approval_request',
  'leave_request',
  'leave_balance',
  'overtime_sheet',
  'overtime_entry',
  'flight_application',
  'business_trip',
  'expense_claim',
  'purchase_request',
  'material_requisition',
  'consumables_requisition',
  'vehicle_application',
  'vehicle_refueling',
  'per_diem_request',
  'per_diem_settlement',
  'employee_per_diem_rate',
  'exit_permit',
  'employee_contract',
  'attendance_record',
  'attendance_import_batch',
  'attendance_monthly_approval',
  'payroll_run',
  'payroll_entry',
  'payroll_payslip',
  'public_holiday',
  'announcement',
  'employee_evaluation',
  'evaluation_cycle',
  'notification',
  'document',
  'project',
  'company_vehicle',
  'site_assignment',
  'field_movement_log',
  'official_seal',
  'inspection_repair',
  'work_from_home_day',
  'employee_schedule_assignment',
] as const;

async function countTable(
  prisma: PrismaClient,
  table: string,
): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    `SELECT count(*)::bigint AS c FROM "${table}"`,
  );
  return Number(rows[0]?.c ?? 0);
}

async function main(): Promise<void> {
  const base = assertLocalhostSeedGuards({ requireDatabase: TARGET_DB });
  const sourceUrl = withDatabase(base.url, SOURCE_DB);
  const targetUrl = withDatabase(base.url, TARGET_DB);

  const source = new PrismaClient({
    datasources: { db: { url: sourceUrl } },
  });
  const target = new PrismaClient({
    datasources: { db: { url: targetUrl } },
  });

  const failures: string[] = [];

  try {
    const tables = await target.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    console.log('=== Table counts (pwf_fresh) ===');
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const c = await countTable(target, t.table_name);
      counts[t.table_name] = c;
      console.log(`  ${t.table_name}: ${c}`);
    }

    const userCount = counts['user'] ?? -1;
    if (userCount !== 1) {
      failures.push(`users expected 1, got ${userCount}`);
    }

    const userRoleCount = counts['user_role'] ?? -1;
    if (userRoleCount !== 1) {
      failures.push(`user_role expected 1, got ${userRoleCount}`);
    }

    if ((counts['company_vehicle'] ?? -1) !== 0) {
      failures.push(`company_vehicle expected 0, got ${counts['company_vehicle']}`);
    }
    if ((counts['project'] ?? -1) !== 0) {
      failures.push(`project expected 0, got ${counts['project']}`);
    }

    const expectedDeptCount = await source.department.count({
      where: { deletedAt: null },
    });
    const actualDeptCount = await target.department.count({
      where: { deletedAt: null },
    });
    if (actualDeptCount !== expectedDeptCount) {
      failures.push(
        `departments expected ${expectedDeptCount}, got ${actualDeptCount}`,
      );
    }

    const sourcePositions = await source.position.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true, createdAt: true },
    });
    const expectedPositionIds = sourcePositions
      .filter((p) => {
        const inWindow =
          p.createdAt >= PAYROLL_SEED_CREATED_AT_START &&
          p.createdAt < PAYROLL_SEED_CREATED_AT_END;
        return !(PAYROLL_SEED_POSITION_TITLES.has(p.title) && inWindow);
      })
      .map((p) => p.id)
      .sort();
    const actualPositionIds = (
      await target.position.findMany({
        where: { deletedAt: null },
        select: { id: true },
      })
    )
      .map((p) => p.id)
      .sort();
    if (JSON.stringify(actualPositionIds) !== JSON.stringify(expectedPositionIds)) {
      failures.push(
        `positions mismatch: expected ${expectedPositionIds.length}, got ${actualPositionIds.length}`,
      );
    }

    const expectedDiscCount = await source.discipline.count({
      where: { deletedAt: null },
    });
    const actualDiscCount = await target.discipline.count({
      where: { deletedAt: null },
    });
    if (actualDiscCount !== expectedDiscCount) {
      failures.push(
        `disciplines expected ${expectedDiscCount}, got ${actualDiscCount}`,
      );
    }

    const leaders = await target.discipline.findMany({
      where: {
        deletedAt: null,
        OR: [{ leaderId: { not: null } }, { localLeaderId: { not: null } }],
      },
      select: { id: true, name: true, leaderId: true, localLeaderId: true },
    });
    if (leaders.length > 0) {
      failures.push(
        `discipline leader fields not null: ${leaders.map((d) => d.name).join(', ')}`,
      );
    }

    for (const table of TRANSACTIONAL_TABLES) {
      if (!(table in counts)) continue;
      if (counts[table] !== 0) {
        failures.push(`transactional ${table} expected 0, got ${counts[table]}`);
      }
    }

    const samuelRoles = await target.userRole.findMany({
      where: { userId: SAMUEL_ID, deletedAt: null },
      include: { role: { select: { name: true } } },
    });
    if (
      samuelRoles.length !== 1 ||
      samuelRoles[0]?.role.name !== 'System Administrator'
    ) {
      failures.push(
        `Samuel roles expected [System Administrator], got ${JSON.stringify(
          samuelRoles.map((r) => r.role.name),
        )}`,
      );
    }

    const headOffice = await target.branch.findFirst({
      where: { name: 'Head Office', deletedAt: null },
    });
    if (headOffice) {
      failures.push('Head Office branch should not be present');
    }
    const ops = await target.division.findFirst({
      where: { code: 'OPS', deletedAt: null },
    });
    if (ops) {
      failures.push('Operations division should not be present');
    }

    console.log('\n=== Assertions ===');
    if (failures.length === 0) {
      console.log('ALL ASSERTIONS PASSED');
    } else {
      console.error('ASSERTION FAILURES:');
      for (const f of failures) {
        console.error(`  - ${f}`);
      }
      process.exitCode = 1;
    }
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('verify-fresh-db failed:', error);
  process.exit(1);
});
