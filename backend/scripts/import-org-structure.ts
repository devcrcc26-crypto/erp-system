/**
 * Apply org structure from the August 2026 directory (department, discipline, reports-to).
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register scripts/import-org-structure.ts
 *   npx ts-node -r tsconfig-paths/register scripts/import-org-structure.ts --apply
 *
 * Does not change roles, contracts, or pay. Only alias / attendance / name / compact matches
 * are imported. PROPOSED, CONFLICT and UNMATCHED rows are skipped; so is reports-to when the
 * supervisor has no account or the change would form a cycle. Every skip is listed in
 * data/private/org-import-apply-report.md.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AuditLogSource, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';
import { readDirectoryOrgRows } from '../src/shared/org-import/directory-sheet';
import { mapSheetDepartment } from '../src/shared/org-import/department-map';
import {
  matchEmployees,
  type DirectoryUser,
  type EmployeeAliasTable,
} from '../src/shared/org-import/employee-matching';
import { loadAttendanceNameLinks } from '../src/shared/org-import/attendance-links';
import {
  buildSupervisorAccountIndex,
  resolveSupervisorUserId,
  type AccountUser,
} from '../src/shared/org-import/supervisor-lookup';
import { findReportsToCycle } from '../src/shared/org/reports-to-cycle.util';

async function main(): Promise<void> {
  assertSeedMode();
  const args = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(args.allowRemote);
  const privateDir = join(__dirname, '..', 'data', 'private');

  console.log(
    `[import-org-structure] ${args.apply ? 'apply' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  const aliasPath = join(privateDir, 'org-aliases.json');
  const aliases: EmployeeAliasTable = existsSync(aliasPath)
    ? (JSON.parse(readFileSync(aliasPath, 'utf8')) as EmployeeAliasTable)
    : {};

  const disciplineMapPath = join(privateDir, 'discipline-map.json');
  const disciplineMap: Record<string, string> = existsSync(disciplineMapPath)
    ? (JSON.parse(readFileSync(disciplineMapPath, 'utf8')) as Record<
        string,
        string
      >)
    : {};

  const rows = readDirectoryOrgRows();
  const prisma = new PrismaClient();

  const company = await prisma.company.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!company) {
    console.error('No company.');
    process.exit(1);
  }

  const actorId = (
    await prisma.user.findFirst({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
  )?.id;
  if (!actorId) {
    console.error('No actor user.');
    process.exit(1);
  }

  const dbUsers = await prisma.user.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      middleName: true,
      lastName: true,
      loginName: true,
      chineseName: true,
      excludedFromHrProcesses: true,
      departmentId: true,
      engineeringDisciplineId: true,
      reportsToUserId: true,
    },
  });

  const directoryUsers: DirectoryUser[] = dbUsers
    .filter((u) => !u.excludedFromHrProcesses)
    .map((u) => ({
      id: u.id,
      employeeId: u.employeeId,
      firstName: u.firstName,
      middleName: u.middleName,
      lastName: u.lastName,
    }));

  const matches = matchEmployees(
    rows.map((r) => r.name),
    directoryUsers,
    aliases,
    await loadAttendanceNameLinks(prisma, company.id),
  );

  /** Private skip report: row, sheet name, what was skipped and why. */
  const skipped: Array<{ row: number; name: string; skip: string; reason: string }> = [];
  matches.forEach((m, i) => {
    if (m.status === 'EXACT' || m.status === 'ALIAS') return;
    skipped.push({
      row: rows[i]!.rowIndex,
      name: m.sheetName,
      skip: 'row',
      reason: `${m.status}${m.reason ? `: ${m.reason}` : ''}`,
    });
  });

  let departments = await prisma.department.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true },
  });
  const deptByName = new Map(
    departments.map((d) => [d.name.toLowerCase(), d.id]),
  );

  const neededDeptNames = new Set<string>();
  for (const row of rows) {
    const name = mapSheetDepartment(row.deptRaw);
    if (name) neededDeptNames.add(name);
  }

  async function nextDepartmentCode(): Promise<string> {
    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "department_code_seq" START WITH 1 INCREMENT BY 1`,
    );
    // Copied databases can hold DEPT-n codes the sequence never issued; move it past
    // the highest one (never backwards) so nextval does not collide.
    await prisma.$executeRawUnsafe(`
      SELECT setval('department_code_seq', x.max_n)
      FROM (
        SELECT COALESCE(MAX(CAST(substring(code FROM 6) AS INTEGER)), 0) AS max_n
        FROM department
        WHERE code ~ '^DEPT-[0-9]+$'
      ) x, department_code_seq s
      WHERE x.max_n > 0
        AND (x.max_n > s.last_value OR (x.max_n = s.last_value AND NOT s.is_called))
    `);
    const result = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('department_code_seq')
    `;
    const seq = Number(result[0]?.nextval ?? 1);
    return `DEPT-${String(seq).padStart(4, '0')}`;
  }

  if (args.apply) {
    for (const name of neededDeptNames) {
      if (deptByName.has(name.toLowerCase())) continue;
      const division = await prisma.division.findFirst({
        where: { companyId: company.id, deletedAt: null },
        select: { id: true },
      });
      const branch = await prisma.branch.findFirst({
        where: { companyId: company.id, deletedAt: null },
        select: { id: true },
      });
      if (!division || !branch) {
        console.error('Cannot create department: missing division or branch.');
        process.exit(1);
      }
      const created = await prisma.department.create({
        data: {
          companyId: company.id,
          divisionId: division.id,
          branchId: branch.id,
          name,
          code: await nextDepartmentCode(),
          isActive: true,
          createdBy: actorId,
          updatedBy: actorId,
        },
        select: { id: true, name: true },
      });
      deptByName.set(name.toLowerCase(), created.id);
      departments = [...departments, created];
      console.log(`Created department: ${name}`);
    }
  }

  const disciplines = await prisma.discipline.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true },
  });
  const disciplineByName = new Map(
    disciplines.map((d) => [d.name.toLowerCase(), d.id]),
  );

  const supervisorIndex = buildSupervisorAccountIndex(
    dbUsers as AccountUser[],
  );

  type PlannedUpdate = {
    userId: string;
    departmentId: string | null;
    engineeringDisciplineId: string | null;
    reportsToUserId: string | null;
    before: {
      departmentId: string | null;
      engineeringDisciplineId: string | null;
      reportsToUserId: string | null;
    };
  };

  const plans: PlannedUpdate[] = [];
  const planRow = new Map<string, { row: number; name: string }>();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const match = matches[i]!;
    if (match.status !== 'EXACT' && match.status !== 'ALIAS') continue;
    if (!match.userId) continue;
    const user = dbUsers.find((u) => u.id === match.userId);
    if (!user || user.excludedFromHrProcesses) continue;

    const deptName = mapSheetDepartment(row.deptRaw);
    const departmentId = deptName
      ? deptByName.get(deptName.toLowerCase()) ?? null
      : null;
    if (deptName && !departmentId && !args.apply) {
      console.warn(`Department not in DB yet (dry-run): ${deptName}`);
    }

    // Keep the current discipline unless discipline-map.json maps this 岗位.
    let engineeringDisciplineId: string | null = user.engineeringDisciplineId;
    if (row.postZh && disciplineMap[row.postZh]) {
      const discName = disciplineMap[row.postZh]!;
      engineeringDisciplineId =
        disciplineByName.get(discName.toLowerCase()) ?? engineeringDisciplineId;
    }

    const { userId: supervisorId, canonical } = resolveSupervisorUserId(
      row.reportToRaw,
      supervisorIndex,
    );
    let reportsToUserId = supervisorId;
    if (row.reportToRaw && !supervisorId && canonical) {
      // Keep the current supervisor; department and discipline still apply.
      reportsToUserId = user.reportsToUserId;
      skipped.push({
        row: row.rowIndex,
        name: match.sheetName,
        skip: 'reportsTo',
        reason: `supervisor "${canonical}" has no account`,
      });
    }

    planRow.set(user.id, { row: row.rowIndex, name: match.sheetName });
    plans.push({
      userId: user.id,
      departmentId,
      engineeringDisciplineId,
      reportsToUserId,
      before: {
        departmentId: user.departmentId,
        engineeringDisciplineId: user.engineeringDisciplineId,
        reportsToUserId: user.reportsToUserId,
      },
    });
  }

  const reportsMap = new Map<string, string | null>(
    dbUsers.map((u) => [u.id, u.reportsToUserId]),
  );

  for (const plan of plans) {
    const cycle = await findReportsToCycle(
      plan.userId,
      plan.reportsToUserId,
      async (id) => {
        if (id === plan.userId) {
          return plan.reportsToUserId;
        }
        const pending = plans.find((p) => p.userId === id);
        if (pending) return pending.reportsToUserId;
        return reportsMap.get(id) ?? null;
      },
    );
    if (cycle) {
      // Keep the current supervisor for this row; later plans see the reverted value.
      plan.reportsToUserId = plan.before.reportsToUserId;
      const where = planRow.get(plan.userId);
      skipped.push({
        row: where?.row ?? 0,
        name: where?.name ?? plan.userId,
        skip: 'reportsTo',
        reason: `reports-to cycle (${cycle.length} users)`,
      });
    }
  }

  const changing = plans.filter(
    (p) =>
      p.departmentId !== p.before.departmentId ||
      p.engineeringDisciplineId !== p.before.engineeringDisciplineId ||
      p.reportsToUserId !== p.before.reportsToUserId,
  );

  console.log(
    `Planned updates: ${changing.length} / ${plans.length} matched employees`,
  );

  const skippedRows = skipped.filter((s) => s.skip === 'row').length;
  const skippedReportsTo = skipped.length - skippedRows;
  const reportPath = join(privateDir, 'org-import-apply-report.md');
  writeFileSync(
    reportPath,
    [
      `# Org import ${args.apply ? 'apply' : 'dry run'} - skipped`,
      '',
      `Host: ${target.host} | DB: ${target.database}`,
      `Rows: ${rows.length} | Planned updates: ${changing.length} / ${plans.length}`,
      `Skipped rows: ${skippedRows} | Kept current reports-to: ${skippedReportsTo}`,
      '',
      '| Row | Sheet name | Skipped | Reason |',
      '| ---: | --- | --- | --- |',
      ...skipped
        .sort((a, b) => a.row - b.row)
        .map((s) => `| ${s.row} | ${s.name} | ${s.skip} | ${s.reason} |`),
      '',
    ].join('\n'),
    'utf8',
  );
  console.log(
    `Skipped rows=${skippedRows} reportsToKept=${skippedReportsTo}. Report: ${reportPath}`,
  );

  if (!args.apply) {
    await prisma.$disconnect();
    return;
  }

  const batchId = randomUUID();
  await prisma.$transaction(async (tx) => {
    for (const plan of changing) {
      await tx.user.update({
        where: { id: plan.userId },
        data: {
          departmentId: plan.departmentId,
          engineeringDisciplineId: plan.engineeringDisciplineId,
          reportsToUserId: plan.reportsToUserId,
          updatedBy: actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: actorId,
          source: AuditLogSource.SYSTEM_JOB,
          module: 'user-management',
          action: 'org_import',
          recordType: 'User',
          recordId: plan.userId,
          batchId,
          beforeValue: plan.before,
          afterValue: {
            departmentId: plan.departmentId,
            engineeringDisciplineId: plan.engineeringDisciplineId,
            reportsToUserId: plan.reportsToUserId,
          },
        },
      });
    }
  });

  console.log(`Applied ${changing.length} updates (batch ${batchId}).`);
  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
