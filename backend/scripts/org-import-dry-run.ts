/**
 * Org structure import - dry run (steps 1–4 + gap preview).
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register scripts/org-import-dry-run.ts
 *   npx ts-node -r tsconfig-paths/register scripts/org-import-dry-run.ts --allow-remote
 *
 * Reads only Names, Position, 岗位, Report to, Dept from employee-directory-2026-08.xls.
 * Read-only for config: never writes org-aliases.json or approver-only-users.json.
 * Writes only the private report and org-aliases.proposed.json under data/private.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';
import {
  DIRECTORY_SHEET_PATH,
  readDirectoryOrgRows,
} from '../src/shared/org-import/directory-sheet';
import { mapSheetDepartment } from '../src/shared/org-import/department-map';
import {
  matchBucket,
  matchEmployees,
  type DirectoryUser,
  type MatchBucket,
} from '../src/shared/org-import/employee-matching';
import { loadAttendanceNameLinks } from '../src/shared/org-import/attendance-links';
import {
  buildSupervisorAccountIndex,
  resolveSupervisorUserId,
  type AccountUser,
} from '../src/shared/org-import/supervisor-lookup';
import {
  flagProbableSupervisorDuplicates,
  normaliseSupervisorName,
} from '../src/shared/org-import/supervisor-normalise';
import { buildOrgGapReport } from '../src/shared/org/org-gap-report';
import type { EmployeeAliasTable } from '../src/shared/org-import/employee-matching';
import {
  approverJsonCanonicalNames,
  isSupervisorInApproverJson,
} from '../src/shared/org-import/approver-json';

type ApproverJsonRow = {
  fullName: string;
  chineseName?: string | null;
  role?: string | null;
};

function loadAliases(privateDir: string): EmployeeAliasTable {
  const path = join(privateDir, 'org-aliases.json');
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
  return raw;
}

function loadApproverList(privateDir: string): ApproverJsonRow[] {
  const path = join(privateDir, 'approver-only-users.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')) as ApproverJsonRow[];
}

/** Supervisors that would need an approver-only-users.json entry (listed, never written). */
function approversToAdd(
  privateDir: string,
  missingCanonical: string[],
): string[] {
  const known = approverJsonCanonicalNames(loadApproverList(privateDir));
  const toAdd = new Set<string>();
  for (const canonical of missingCanonical) {
    const fullName = normaliseSupervisorName(canonical);
    if (fullName && !known.has(fullName)) toAdd.add(fullName);
  }
  return [...toAdd].sort();
}

async function main(): Promise<void> {
  assertSeedMode();
  const args = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(args.allowRemote);
  const privateDir = join(__dirname, '..', 'data', 'private');
  const reportPath = join(privateDir, 'org-import-dry-run-report.md');

  console.log(
    `[org-import-dry-run] dry-run host=${target.host} db=${target.database}`,
  );
  console.log(`Directory: ${DIRECTORY_SHEET_PATH}`);

  const rows = readDirectoryOrgRows();
  const aliases = loadAliases(privateDir);

  const prisma = new PrismaClient();
  const company = await prisma.company.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!company) {
    console.error('No company found.');
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
      employeeType: true,
      departmentId: true,
      engineeringDisciplineId: true,
      reportsToUserId: true,
      employmentStatus: true,
      isActive: true,
      department: { select: { name: true } },
      engineeringDiscipline: { select: { name: true } },
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

  const sheetNames = rows.map((r) => r.name);
  const attendanceLinks = await loadAttendanceNameLinks(prisma, company.id);
  const matches = matchEmployees(
    sheetNames,
    directoryUsers,
    aliases,
    attendanceLinks,
  );

  const bucketOrder: MatchBucket[] = [
    'alias',
    'attendance',
    'name',
    'compact',
    'proposed',
    'conflict',
    'unmatched',
  ];
  const byBucket = new Map<MatchBucket, number>(bucketOrder.map((b) => [b, 0]));
  const proposed: Record<string, string> = {};
  const unmatched: string[] = [];
  const conflicts = matches.filter((m) => m.status === 'CONFLICT');
  const duplicateRows = matches.filter((m) => m.duplicateRow);
  const prefixRows = duplicateRows.filter((m) => m.reason?.includes('prefix'));
  matches.forEach((m) => {
    const bucket = matchBucket(m);
    byBucket.set(bucket, byBucket.get(bucket)! + 1);
    if (m.status === 'PROPOSED' && m.employeeId) {
      proposed[m.sheetName] = m.employeeId;
    } else if (m.status === 'UNMATCHED' && !m.duplicateRow) {
      unmatched.push(`${m.sheetName} (${m.reason ?? 'no match'})`);
    }
  });
  const employeeTypeById = new Map(dbUsers.map((u) => [u.id, u.employeeType]));
  const matchedFreelancers = matches.filter(
    (m) =>
      (m.status === 'EXACT' || m.status === 'ALIAS') &&
      m.userId &&
      employeeTypeById.get(m.userId) === 'FREELANCER',
  ).length;

  writeFileSync(
    join(privateDir, 'org-aliases.proposed.json'),
    `${JSON.stringify(proposed, null, 2)}\n`,
    'utf8',
  );

  const accountUsers: AccountUser[] = dbUsers.map((u) => ({
    id: u.id,
    employeeId: u.employeeId,
    firstName: u.firstName,
    middleName: u.middleName,
    lastName: u.lastName,
    loginName: u.loginName,
    chineseName: u.chineseName,
    excludedFromHrProcesses: u.excludedFromHrProcesses,
  }));
  const supervisorIndex = buildSupervisorAccountIndex(accountUsers);

  const reportToStats = new Map<
    string,
    { rawVariants: Set<string>; count: number }
  >();
  const approverJson = loadApproverList(privateDir);
  const reportToUnmatched = new Map<string, number>();
  const reportToPendingJson = new Map<string, number>();
  for (const row of rows) {
    if (!row.reportToRaw) continue;
    const canonical = normaliseSupervisorName(row.reportToRaw);
    if (!canonical) continue;
    const bucket =
      reportToStats.get(canonical) ??
      { rawVariants: new Set<string>(), count: 0 };
    bucket.rawVariants.add(row.reportToRaw.trim());
    bucket.count += 1;
    reportToStats.set(canonical, bucket);

    const { userId } = resolveSupervisorUserId(row.reportToRaw, supervisorIndex);
    if (userId) continue;
    if (isSupervisorInApproverJson(canonical, approverJson)) {
      reportToPendingJson.set(
        canonical,
        (reportToPendingJson.get(canonical) ?? 0) + 1,
      );
      continue;
    }
    reportToUnmatched.set(
      canonical,
      (reportToUnmatched.get(canonical) ?? 0) + 1,
    );
  }

  const duplicateFlags = flagProbableSupervisorDuplicates(reportToStats);
  const missingSupervisorAccounts = [...reportToUnmatched.keys()].sort();
  const approverEntriesNeeded = approversToAdd(
    privateDir,
    missingSupervisorAccounts,
  );

  const erpDeptNames = new Map<string, string>();
  for (const row of rows) {
    const mapped = mapSheetDepartment(row.deptRaw);
    if (mapped) erpDeptNames.set(mapped, mapped);
  }
  const dbDepartments = await prisma.department.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true, leaderUserId: true },
  });
  const deptByName = new Map(
    dbDepartments.map((d) => [d.name.toLowerCase(), d]),
  );
  const deptExist: string[] = [];
  const deptCreate: string[] = [];
  for (const name of erpDeptNames.values()) {
    if (deptByName.has(name.toLowerCase())) deptExist.push(name);
    else deptCreate.push(name);
  }

  const disciplinePairs = new Map<
    string,
    { dept: string; post: string; count: number; supervisors: Set<string> }
  >();
  for (const row of rows) {
    const dept = mapSheetDepartment(row.deptRaw) ?? row.deptRaw ?? '';
    const post = row.postZh ?? '';
    const key = `${dept}\t${post}`;
    const bucket =
      disciplinePairs.get(key) ??
      { dept, post, count: 0, supervisors: new Set<string>() };
    bucket.count += 1;
    if (row.reportToRaw) {
      bucket.supervisors.add(normaliseSupervisorName(row.reportToRaw));
    }
    disciplinePairs.set(key, bucket);
  }

  const managerActive = (id: string | null): boolean => {
    if (!id) return false;
    const u = dbUsers.find((x) => x.id === id);
    return Boolean(u?.isActive && u.employmentStatus === 'ACTIVE');
  };

  const gapReport = buildOrgGapReport({
    users: dbUsers.map((u) => ({
      id: u.id,
      employeeId: u.employeeId,
      name: [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' '),
      approverOnly: u.excludedFromHrProcesses,
      departmentId: u.departmentId,
      departmentName: u.department?.name ?? null,
      disciplineId: u.engineeringDisciplineId,
      disciplineName: u.engineeringDiscipline?.name ?? null,
      reportsToUserId: u.reportsToUserId,
      reportsToVacant:
        u.reportsToUserId != null && !managerActive(u.reportsToUserId),
    })),
    departments: dbDepartments.map((d) => ({
      id: d.id,
      name: d.name,
      leaderUserId: d.leaderUserId,
      leaderVacant:
        d.leaderUserId != null && !managerActive(d.leaderUserId),
    })),
    disciplines: (
      await prisma.discipline.findMany({
        where: { companyId: company.id, deletedAt: null },
        select: { id: true, name: true, leaderId: true },
      })
    ).map((d) => ({
      id: d.id,
      name: d.name,
      leaderUserId: d.leaderId,
      leaderVacant: d.leaderId != null && !managerActive(d.leaderId),
    })),
    supervisorsWithoutAccount: missingSupervisorAccounts,
  });

  const lines: string[] = [
    '# Org import dry run',
    '',
    `Host: ${target.host} | DB: ${target.database}`,
    `Rows: ${rows.length}`,
    '',
    '## Employee name matching',
    '',
    'Order: org-aliases.json → attendance identities → name keys → compact → fuzzy.',
    'Only alias / attendance / name / compact rows are imported.',
    '',
    `| Rule | Count |`,
    `| --- | ---: |`,
    ...bucketOrder.map((b) => `| ${b} | ${byBucket.get(b)} |`),
    '',
    `Attendance identities loaded (MAPPED): ${attendanceLinks.length}`,
    `Duplicate sheet rows (in unmatched): ${duplicateRows.length} (same name ${duplicateRows.length - prefixRows.length}, prefix ${prefixRows.length})`,
    `Matched freelancers (employeeType = FREELANCER): ${matchedFreelancers}`,
    '',
  ];
  if (conflicts.length) {
    lines.push(
      '### Conflicts (not imported)',
      '',
      '| Sheet name | Attendance → | Other rule | Other → | Score |',
      '| --- | --- | --- | --- | ---: |',
      ...conflicts.map((m) => {
        const c = m.conflict!;
        return `| ${m.sheetName} | ${c.attendance.employeeId ?? c.attendance.userId} | ${c.other.rule} | ${c.other.employeeId ?? c.other.userId} | ${c.other.score ?? ''} |`;
      }),
      '',
    );
  }
  if (duplicateRows.length) {
    lines.push(
      '### Duplicate sheet rows (not imported)',
      '',
      ...duplicateRows.map((m) => `- ${m.sheetName} - ${m.reason}`),
      '',
    );
  }
  if (unmatched.length) {
    lines.push('### Unmatched names', '', ...unmatched.map((n) => `- ${n}`), '');
  }
  if (Object.keys(proposed).length) {
    lines.push(
      '### Proposed (see org-aliases.proposed.json)',
      '',
      ...Object.entries(proposed).map(
        ([n, id]) => `- ${n} → ${id}${matches.find((m) => m.sheetName === n)?.score != null ? ` (score ${matches.find((m) => m.sheetName === n)?.score})` : ''}`,
      ),
      '',
    );
  }

  lines.push(
    '## Supervisors (Report to)',
    '',
    `Distinct canonical: ${reportToStats.size}`,
    `Without account: ${missingSupervisorAccounts.length}`,
    '',
  );
  const pendingJson = [...reportToPendingJson.keys()].sort();
  if (pendingJson.length) {
    lines.push(
      '### Covered by approver-only-users.json (not in DB yet)',
      '',
      ...pendingJson.map((n) => `- ${n}`),
      '',
    );
  }
  if (missingSupervisorAccounts.length) {
    lines.push(
      '### No user account',
      '',
      ...missingSupervisorAccounts.map((n) => `- ${n}`),
      '',
    );
  }
  if (duplicateFlags.length) {
    lines.push('### Probable duplicate / typo variants', '');
    for (const f of duplicateFlags.slice(0, 20)) {
      lines.push(
        `- ${f.canonical} (${f.count} rows): ${f.variants.join(' | ')}`,
      );
    }
    lines.push('');
  }
  if (approverEntriesNeeded.length) {
    lines.push(
      '### Would need an approver-only-users.json entry (not written)',
      '',
      ...approverEntriesNeeded.map((n) => `- ${n}`),
      '',
    );
  }

  lines.push(
    '## Departments',
    '',
    `Existing (${deptExist.length}): ${deptExist.sort().join(', ') || '(none)'}`,
    '',
    `Will create (${deptCreate.length}): ${deptCreate.sort().join(', ') || '(none)'}`,
    '',
    '## Discipline pairs (Dept × 岗位)',
    '',
    '| Dept | 岗位 | Rows | Supervisors |',
    '| --- | --- | ---: | --- |',
  );
  for (const bucket of [...disciplinePairs.values()].sort(
    (a, b) => b.count - a.count || a.dept.localeCompare(b.dept),
  )) {
    lines.push(
      `| ${bucket.dept} | ${bucket.post} | ${bucket.count} | ${[...bucket.supervisors].sort().join('; ')} |`,
    );
  }
  lines.push(
    '',
    '## DB org gaps (current state)',
    '',
    `- Employees without supervisor: ${gapReport.totals.withoutSupervisor}`,
    `- Without department: ${gapReport.totals.withoutDepartment}`,
    `- Without discipline: ${gapReport.totals.withoutDiscipline}`,
    `- Supervisors without account (directory): ${gapReport.totals.supervisorsWithoutAccount}`,
    '',
  );

  writeFileSync(reportPath, lines.join('\n'), 'utf8');

  console.log(
    `MATCH ${bucketOrder.map((b) => `${b}=${byBucket.get(b)}`).join(' ')} rows=${rows.length}`,
  );
  console.log(
    `MATCH_DETAIL identities=${attendanceLinks.length} duplicateRows=${duplicateRows.length} sameName=${duplicateRows.length - prefixRows.length} prefix=${prefixRows.length} freelancers=${matchedFreelancers}`,
  );
  console.log(
    `SUPERVISORS distinct=${reportToStats.size} noAccount=${missingSupervisorAccounts.length} approverEntriesNeeded=${approverEntriesNeeded.length}`,
  );
  console.log(
    `DEPT exist=${deptExist.length} create=${deptCreate.length} pairs=${disciplinePairs.size}`,
  );
  console.log(`Report: ${reportPath}`);

  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
