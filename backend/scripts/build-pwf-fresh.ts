/**
 * Build pwf_fresh from config seeds + org copy from pwf_test.
 *
 * Usage (from backend/):
 *   $env:SEED_MODE='true'; $env:SEED_PM_DEMO='false'
 *   npx ts-node --transpile-only scripts/build-pwf-fresh.ts
 *
 * Refuses unless SEED_MODE=true and DATABASE_URL host is localhost.
 * Never modifies pwf_test. Does not start the API/frontend.
 */
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import {
  assertLocalhostSeedGuards,
  withDatabase,
} from './lib/localhost-seed-guard';

const SAMUEL_ID = '16040ab7-b923-4fe4-87cf-cc3a916c7325';
const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const ETHIOPIA_BRANCH_ID = 'd5a00c2d-4322-4332-8a89-78d878ebcb92';
const FUNC_DIVISION_ID = 'e6f7a3ec-9c03-46ae-b510-5f410a20598f';
const PROD_DIVISION_ID = '16ea62f6-3966-46dc-a90a-81dfb8ade6cf';
const HEAD_OFFICE_ID = '00000000-0000-4000-8000-000000000010';
const OPS_DIVISION_ID = '359e3881-0f8b-488b-87cd-4a854a0b1d11';
const SOURCE_DB = 'pwf_test';
const TARGET_DB = 'pwf_fresh';
const COMPANY_NAME =
  'CRCC International Engineering Consulting Co. Ltd - Ethiopian Branch';

/** Titles the payroll test seed creates when missing (seed-payroll-test-data.ts). */
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

/** Payroll seed run window observed in pwf_test (created_at cluster). */
const PAYROLL_SEED_CREATED_AT_START = new Date('2026-10-05T13:03:27.000Z');
const PAYROLL_SEED_CREATED_AT_END = new Date('2026-10-05T13:03:28.000Z');

interface PositionRow {
  id: string;
  title: string;
  titleZh: string | null;
  isActive: boolean;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
}

function dockerPsql(database: string, sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', 'pwf-test-db', 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-t', '-A'],
    { input: sql, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  ).trim();
}

function dockerPsqlFile(database: string, sql: string): void {
  execFileSync(
    'docker',
    ['exec', '-i', 'pwf-test-db', 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] },
  );
}

function isPayrollSeedPosition(row: PositionRow): boolean {
  if (!PAYROLL_SEED_POSITION_TITLES.has(row.title)) {
    return false;
  }
  return (
    row.createdAt >= PAYROLL_SEED_CREATED_AT_START &&
    row.createdAt < PAYROLL_SEED_CREATED_AT_END
  );
}

async function reassignActorReferences(
  prisma: PrismaClient,
  fromUserId: string,
  toUserId: string,
): Promise<string[]> {
  const columns = await prisma.$queryRaw<
    Array<{ table_name: string; column_name: string }>
  >`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.data_type IN ('text', 'character varying', 'uuid')
      AND c.column_name IN (
        'created_by', 'updated_by', 'deleted_by', 'assigned_by',
        'locked_by', 'closed_by', 'uploaded_by'
      )
  `;

  const report: string[] = [];
  for (const col of columns) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "${col.table_name}" SET "${col.column_name}" = $1 WHERE "${col.column_name}" = $2`,
      toUserId,
      fromUserId,
    );
    if (result > 0) {
      report.push(`${col.table_name}.${col.column_name}: ${result}`);
    }
  }
  return report;
}

async function main(): Promise<void> {
  const base = assertLocalhostSeedGuards();
  const sourceUrl = withDatabase(base.url, SOURCE_DB);
  const targetUrl = withDatabase(base.url, TARGET_DB);

  process.env.SEED_PM_DEMO = 'false';
  process.env.SEED_MODE = 'true';

  console.log('=== Part 2: build pwf_fresh ===');
  console.log(`Source: ${SOURCE_DB}`);
  console.log(`Target: ${TARGET_DB}`);

  const exists = dockerPsql(
    'postgres',
    `SELECT 1 FROM pg_database WHERE datname = '${TARGET_DB}'`,
  );
  if (exists === '1') {
    throw new Error(
      `Database ${TARGET_DB} already exists. Drop it manually if you intend to rebuild.`,
    );
  }

  console.log(`Creating database ${TARGET_DB}…`);
  dockerPsqlFile('postgres', `CREATE DATABASE ${TARGET_DB};`);

  console.log('Running prisma migrate deploy…');
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
      DIRECT_URL: targetUrl,
      SEED_MODE: 'true',
      SEED_PM_DEMO: 'false',
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  console.log('Running configuration seed (SEED_PM_DEMO=false)…');
  execFileSync('npx', ['ts-node', '--transpile-only', 'prisma/seed.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
      DIRECT_URL: targetUrl,
      SEED_MODE: 'true',
      SEED_PM_DEMO: 'false',
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const source = new PrismaClient({
    datasources: { db: { url: sourceUrl } },
  });
  const target = new PrismaClient({
    datasources: { db: { url: targetUrl } },
  });

  try {
    const admin = await target.user.findFirst({
      where: { email: 'admin@company.local', deletedAt: null },
      select: { id: true, employeeId: true, email: true },
    });
    if (!admin) {
      throw new Error('Seed admin not found after seed');
    }
    console.log(`Seed admin: ${admin.email} (${admin.id})`);

    const workSchedule = await target.workSchedule.findFirst({
      where: { companyId: COMPANY_ID, name: 'CRCC Standard', deletedAt: null },
      select: { id: true },
    });
    if (!workSchedule) {
      throw new Error('Seeded CRCC Standard work schedule not found');
    }

    const leavePolicy = await target.leavePolicy.findFirst({
      where: { companyId: COMPANY_ID, name: 'Standard Staff', deletedAt: null },
      select: { id: true },
    });
    if (!leavePolicy) {
      throw new Error('Seeded Standard Staff leave policy not found');
    }

    const sysAdminRole = await target.role.findFirst({
      where: {
        companyId: COMPANY_ID,
        name: 'System Administrator',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!sysAdminRole) {
      throw new Error('System Administrator role not found');
    }

    // ── Strip demo leftovers from seed ────────────────────────────────────
    const removed: string[] = [];

    const vehicles = await target.companyVehicle.deleteMany({});
    if (vehicles.count > 0) {
      removed.push(`company_vehicle × ${vehicles.count}`);
    }

    const reports = await target.reportDefinition.deleteMany({
      where: {
        OR: [
          { id: '00000000-0000-4000-8000-000000000050' },
          { name: 'Active Users', isSystem: true },
        ],
      },
    });
    if (reports.count > 0) {
      removed.push(`report_definition × ${reports.count}`);
    }

    const costCentres = await target.costCentre.deleteMany({});
    if (costCentres.count > 0) {
      removed.push(`cost_centre (incl. CC-IT) × ${costCentres.count}`);
    }

    // Clear org FKs on users before wiping seed org
    await target.user.updateMany({
      data: {
        branchId: null,
        departmentId: null,
        positionId: null,
        engineeringDisciplineId: null,
        reportsToUserId: null,
        leavePolicyId: null,
        workScheduleId: null,
        profileFolderId: null,
      },
    });

    await target.department.updateMany({ data: { leaderUserId: null } });
    await target.discipline.updateMany({
      data: { leaderId: null, localLeaderId: null },
    });

    const seedDepts = await target.department.deleteMany({});
    removed.push(`seed department × ${seedDepts.count}`);
    const seedDivs = await target.division.deleteMany({});
    removed.push(`seed division × ${seedDivs.count}`);
    const seedBranches = await target.branch.deleteMany({});
    removed.push(`seed branch × ${seedBranches.count}`);
    const seedPositions = await target.position.deleteMany({});
    removed.push(`seed position × ${seedPositions.count}`);
    const seedDisciplines = await target.discipline.deleteMany({});
    if (seedDisciplines.count > 0) {
      removed.push(`seed discipline × ${seedDisciplines.count}`);
    }

    // ── Copy org from pwf_test ────────────────────────────────────────────
    const sourceBranch = await source.branch.findUniqueOrThrow({
      where: { id: ETHIOPIA_BRANCH_ID },
    });
    await target.branch.create({
      data: {
        id: sourceBranch.id,
        companyId: COMPANY_ID,
        name: sourceBranch.name,
        address: sourceBranch.address,
        city: sourceBranch.city,
        country: sourceBranch.country,
        phone: sourceBranch.phone,
        isHeadOffice: sourceBranch.isHeadOffice,
        isActive: sourceBranch.isActive,
        createdAt: sourceBranch.createdAt,
        createdBy: SAMUEL_ID,
        updatedAt: sourceBranch.updatedAt,
        updatedBy: SAMUEL_ID,
        deletedAt: null,
        deletedBy: null,
      },
    });

    const sourceDivisions = await source.division.findMany({
      where: {
        id: { in: [PROD_DIVISION_ID, FUNC_DIVISION_ID] },
        deletedAt: null,
      },
    });
    for (const div of sourceDivisions) {
      await target.division.create({
        data: {
          id: div.id,
          companyId: COMPANY_ID,
          name: div.name,
          code: div.code,
          description: div.description,
          isActive: div.isActive,
          createdAt: div.createdAt,
          createdBy: SAMUEL_ID,
          updatedAt: div.updatedAt,
          updatedBy: SAMUEL_ID,
          deletedAt: null,
          deletedBy: null,
        },
      });
    }

    const sourceDepartments = await source.department.findMany({
      where: { companyId: COMPANY_ID, deletedAt: null },
      orderBy: { code: 'asc' },
    });

    let keptHeadOffice = false;
    let keptOps = false;
    const remappedDepts: string[] = [];

    for (const dept of sourceDepartments) {
      let branchId = dept.branchId;
      let divisionId = dept.divisionId;
      if (branchId === HEAD_OFFICE_ID || divisionId === OPS_DIVISION_ID) {
        remappedDepts.push(dept.name);
        branchId = ETHIOPIA_BRANCH_ID;
        divisionId = FUNC_DIVISION_ID;
      }
      if (branchId === HEAD_OFFICE_ID) keptHeadOffice = true;
      if (divisionId === OPS_DIVISION_ID) keptOps = true;

      await target.department.create({
        data: {
          id: dept.id,
          companyId: COMPANY_ID,
          divisionId,
          branchId,
          name: dept.name,
          nameZh: dept.nameZh,
          code: dept.code,
          isActive: dept.isActive,
          leaderUserId: null,
          createdAt: dept.createdAt,
          createdBy: SAMUEL_ID,
          updatedAt: dept.updatedAt,
          updatedBy: SAMUEL_ID,
          deletedAt: null,
          deletedBy: null,
        },
      });
    }

    if (keptHeadOffice || keptOps) {
      console.warn(
        'WARNING: Head Office / Operations still required after remap - unexpected.',
      );
    } else {
      console.log(
        'Head Office branch and Operations division not copied (nothing required them after remap).',
      );
    }
    console.log(
      `Departments remapped to Ethiopia Regional HQ → Functional: ${remappedDepts.join(', ') || '(none)'}`,
    );

    const sourcePositions = await source.position.findMany({
      where: { companyId: COMPANY_ID, deletedAt: null },
      orderBy: { title: 'asc' },
    });

    const excludedPositions: PositionRow[] = [];
    const copiedPositions: PositionRow[] = [];
    for (const pos of sourcePositions) {
      const row = pos as PositionRow;
      if (isPayrollSeedPosition(row)) {
        excludedPositions.push(row);
        continue;
      }
      copiedPositions.push(row);
      await target.position.create({
        data: {
          id: pos.id,
          companyId: COMPANY_ID,
          title: pos.title,
          titleZh: pos.titleZh,
          isActive: pos.isActive,
          createdAt: pos.createdAt,
          createdBy: SAMUEL_ID,
          updatedAt: pos.updatedAt,
          updatedBy: SAMUEL_ID,
          deletedAt: null,
          deletedBy: null,
        },
      });
    }

    console.log('\n=== Positions EXCLUDED (payroll test seed) ===');
    for (const p of excludedPositions) {
      console.log(
        `  - ${p.title} [${p.id}] created_at=${p.createdAt.toISOString()} created_by=${p.createdBy}`,
      );
    }
    console.log(`Excluded count: ${excludedPositions.length}`);
    console.log('\n=== Positions COPIED ===');
    for (const p of copiedPositions) {
      console.log(`  - ${p.title} [${p.id}]`);
    }
    console.log(`Copied count: ${copiedPositions.length}`);
    console.log(
      'Note: near-duplicates (e.g. Draftsman / Drafts Person) intentionally not merged.',
    );

    const sourceDisciplines = await source.discipline.findMany({
      where: { companyId: COMPANY_ID, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    for (const d of sourceDisciplines) {
      await target.discipline.create({
        data: {
          id: d.id,
          companyId: COMPANY_ID,
          name: d.name,
          nameZh: d.nameZh,
          isActive: d.isActive,
          leaderId: null,
          localLeaderId: null,
          createdAt: d.createdAt,
          createdBy: SAMUEL_ID,
          updatedAt: d.updatedAt,
          updatedBy: SAMUEL_ID,
          deletedAt: null,
          deletedBy: null,
        },
      });
    }
    console.log(`Disciplines copied: ${sourceDisciplines.length} (leaders null)`);

    // ── Samuel ────────────────────────────────────────────────────────────
    const samuelSource = await source.user.findUniqueOrThrow({
      where: { id: SAMUEL_ID },
    });

    await target.user.create({
      data: {
        id: samuelSource.id,
        companyId: COMPANY_ID,
        branchId: null,
        departmentId: samuelSource.departmentId,
        engineeringDisciplineId: samuelSource.engineeringDisciplineId,
        positionId: samuelSource.positionId,
        reportsToUserId: null,
        discipline: samuelSource.discipline,
        employeeId: samuelSource.employeeId,
        firstName: samuelSource.firstName,
        lastName: samuelSource.lastName,
        middleName: samuelSource.middleName,
        chineseName: samuelSource.chineseName,
        email: samuelSource.email,
        pendingEmail: samuelSource.pendingEmail,
        phone: samuelSource.phone,
        addressCountry: samuelSource.addressCountry,
        addressRegion: samuelSource.addressRegion,
        addressCity: samuelSource.addressCity,
        addressSubcity: samuelSource.addressSubcity,
        addressWoreda: samuelSource.addressWoreda,
        addressHouseNumber: samuelSource.addressHouseNumber,
        gender: samuelSource.gender,
        dateOfBirth: samuelSource.dateOfBirth,
        nationalId: samuelSource.nationalId,
        tin: samuelSource.tin,
        nationality: samuelSource.nationality,
        employeeType: samuelSource.employeeType,
        educationLevel: samuelSource.educationLevel,
        fieldOfStudy: samuelSource.fieldOfStudy,
        yearsOfExperience: samuelSource.yearsOfExperience,
        yearsOfExperienceAsOf: samuelSource.yearsOfExperienceAsOf,
        passwordHash: samuelSource.passwordHash,
        preferredLanguage: samuelSource.preferredLanguage,
        preferredTimezone: samuelSource.preferredTimezone,
        preferredDateFormat: samuelSource.preferredDateFormat,
        isActive: samuelSource.isActive,
        mfaEnabled: samuelSource.mfaEnabled,
        emailVerifiedAt: samuelSource.emailVerifiedAt,
        leavePolicyId: leavePolicy.id,
        workScheduleId: workSchedule.id,
        profileFolderId: null,
        emergencyContacts: samuelSource.emergencyContacts ?? undefined,
        photoDocumentId: null,
        bankName: samuelSource.bankName,
        bankBranch: samuelSource.bankBranch,
        bankAccountNumber: samuelSource.bankAccountNumber,
        includeInPayroll: samuelSource.includeInPayroll,
        lastLogin: null,
        createdAt: samuelSource.createdAt,
        createdBy: SAMUEL_ID,
        updatedAt: new Date(),
        updatedBy: SAMUEL_ID,
        deletedAt: null,
        deletedBy: null,
      },
    });

    // Reassign seed-admin audit refs → Samuel, then delete seed users
    const reassigned = await reassignActorReferences(
      target,
      admin.id,
      SAMUEL_ID,
    );
    console.log('\n=== Reassigned created_by/updated_by from seed admin → Samuel ===');
    for (const line of reassigned) {
      console.log(`  ${line}`);
    }

    await target.userRole.deleteMany({});
    await target.userSession.deleteMany({
      where: { userId: { not: SAMUEL_ID } },
    });

    const otherUsers = await target.user.findMany({
      where: { id: { not: SAMUEL_ID } },
      select: { id: true, email: true, employeeId: true },
    });
    for (const u of otherUsers) {
      await target.userSession.deleteMany({ where: { userId: u.id } });
      await target.userRole.deleteMany({ where: { userId: u.id } });
      await target.user.delete({ where: { id: u.id } });
      removed.push(`user ${u.email ?? u.id} (${u.employeeId ?? 'no emp id'})`);
    }

    await target.userRole.create({
      data: {
        userId: SAMUEL_ID,
        roleId: sysAdminRole.id,
        isPrimary: true,
        assignedBy: SAMUEL_ID,
        createdBy: SAMUEL_ID,
        updatedBy: SAMUEL_ID,
      },
    });

    await target.company.update({
      where: { id: COMPANY_ID },
      data: {
        legalName: COMPANY_NAME,
        createdBy: SAMUEL_ID,
        updatedBy: SAMUEL_ID,
      },
    });

    // ── Reset all numbering sequences to start from 1 ─────────────────────
    const sequences = await target.$queryRaw<Array<{ sequencename: string }>>`
      SELECT sequencename FROM pg_sequences ORDER BY sequencename
    `;
    for (const seq of sequences) {
      await target.$executeRawUnsafe(
        `SELECT setval('${seq.sequencename}', 1, false)`,
      );
    }
    console.log(`\nSequences reset to 1: ${sequences.length}`);

    console.log('\n=== Demo leftovers removed ===');
    for (const line of removed) {
      console.log(`  - ${line}`);
    }

    console.log('\n=== Build complete ===');
    console.log(`Company renamed to: ${COMPANY_NAME}`);
    console.log(`Samuel leavePolicyId → ${leavePolicy.id} (Standard Staff)`);
    console.log(`Samuel workScheduleId → ${workSchedule.id} (CRCC Standard)`);
    console.log(`user_role: Samuel → System Administrator only`);
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('build-pwf-fresh failed:', error);
  process.exit(1);
});
