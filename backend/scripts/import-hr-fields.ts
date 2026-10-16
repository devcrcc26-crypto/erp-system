/**
 * Import phone, secondary phone, seniority and education from the August 2026
 * directory (columns H, I, E, M) for confirmed matches only.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register scripts/import-hr-fields.ts
 *   npx ts-node -r tsconfig-paths/register scripts/import-hr-fields.ts --apply
 *
 * Fills empty fields only; a different existing value is reported, never
 * overwritten. Matching is the org import's: only EXACT / ALIAS matches of
 * HR-process employees. Values are mapped by data/private/hr-value-map.json.
 * Years of experience are never imported. The console prints counts only;
 * the review list goes to data/private/hr-fields-import-report.md.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { AuditLogSource, EducationLevel, PrismaClient } from '@prisma/client';
import {
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';
import {
  readDirectoryHrFieldRows,
  readDirectoryOrgRows,
} from '../src/shared/org-import/directory-sheet';
import {
  matchEmployees,
  type DirectoryUser,
  type EmployeeAliasTable,
} from '../src/shared/org-import/employee-matching';
import { loadAttendanceNameLinks } from '../src/shared/org-import/attendance-links';
import {
  normaliseLabel,
  planHrFieldImport,
  type HrField,
  type HrFieldFinding,
  type HrFieldUser,
  type HrValueMap,
} from '../src/shared/org-import/hr-fields-plan';

const PHONE_FIELDS: ReadonlySet<HrField> = new Set(['phone', 'secondaryPhone']);

/** Phones in the report keep only their last three digits. */
function maskPhone(value: string | null): string {
  if (!value) return '-';
  return value.replace(/\d(?=\d{3})/g, '•');
}

function shown(finding: HrFieldFinding, value: string | null): string {
  if (value === null) return '-';
  return PHONE_FIELDS.has(finding.field) ? maskPhone(value) : value;
}

async function main(): Promise<void> {
  assertSeedMode();
  const args = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(args.allowRemote);
  const privateDir = join(__dirname, '..', 'data', 'private');
  console.log(
    `[import-hr-fields] ${args.apply ? 'apply' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  const valueMap = JSON.parse(
    readFileSync(join(privateDir, 'hr-value-map.json'), 'utf8'),
  ) as HrValueMap;
  let aliases: EmployeeAliasTable = {};
  try {
    aliases = JSON.parse(
      readFileSync(join(privateDir, 'org-aliases.json'), 'utf8'),
    ) as EmployeeAliasTable;
  } catch {
    aliases = {};
  }

  const orgRows = readDirectoryOrgRows();
  const hrRows = readDirectoryHrFieldRows();
  const prisma = new PrismaClient();

  const company = await prisma.company.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!company) throw new Error('No company.');
  const actorId = (
    await prisma.user.findFirst({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
  )?.id;
  if (!actorId) throw new Error('No actor user.');

  const dbUsers = await prisma.user.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      middleName: true,
      lastName: true,
      excludedFromHrProcesses: true,
      phone: true,
      secondaryPhone: true,
      educationLevel: true,
      seniorityLevel: { select: { name: true } },
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
    orgRows.map((r) => r.name),
    directoryUsers,
    aliases,
    await loadAttendanceNameLinks(prisma, company.id),
  );

  const userById = new Map(dbUsers.map((u) => [u.id, u]));
  const matchedUsers = new Map<number, HrFieldUser>();
  const unmatched: Array<{ row: number; name: string; reason: string }> = [];
  const nameByRow = new Map<number, string>();
  orgRows.forEach((row, i) => {
    const match = matches[i]!;
    nameByRow.set(row.rowIndex, match.sheetName);
    const user = match.userId ? userById.get(match.userId) : undefined;
    if ((match.status === 'EXACT' || match.status === 'ALIAS') && user && !user.excludedFromHrProcesses) {
      matchedUsers.set(row.rowIndex, {
        id: user.id,
        phone: user.phone,
        secondaryPhone: user.secondaryPhone,
        seniorityLevelName: user.seniorityLevel?.name ?? null,
        educationLevel: user.educationLevel,
      });
    } else {
      unmatched.push({
        row: row.rowIndex,
        name: match.sheetName,
        reason: `${match.status}${match.reason ? `: ${match.reason}` : ''}`,
      });
    }
  });

  const plan = planHrFieldImport(
    hrRows,
    matchedUsers,
    valueMap,
    new Set<string>(Object.values(EducationLevel)),
  );

  // Seniority levels the fills need that do not exist yet.
  const existingLevels = await prisma.seniorityLevel.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true },
  });
  const levelIdByName = new Map(existingLevels.map((l) => [normaliseLabel(l.name), l.id]));
  const neededLevels = [...new Set(plan.fills.map((f) => f.seniorityLevelName).filter(Boolean))] as string[];
  const levelsToCreate = valueMap.seniority.levels.filter(
    (level) => neededLevels.includes(level.name) && !levelIdByName.has(normaliseLabel(level.name)),
  );

  // ── Counts (console) and review list (private report) ──
  const fields: HrField[] = ['phone', 'secondaryPhone', 'seniority', 'education'];
  const count = (field: HrField, kind: HrFieldFinding['kind']): number =>
    plan.findings.filter((f) => f.field === field && f.kind === kind).length;
  const summary = fields.map((field) => ({
    field,
    fill: count(field, 'fill'),
    same: count(field, 'same'),
    difference: count(field, 'difference'),
    skipped: count(field, 'skipped'),
  }));
  const notes = (pattern: RegExp): number =>
    plan.findings.filter((f) => f.kind === 'fill' && f.note && pattern.test(f.note)).length;

  console.log(`Sheet rows: ${hrRows.length} | confirmed matches: ${matchedUsers.size} | unmatched: ${unmatched.length} | user matched twice: ${plan.duplicateMatchRows.length} rows`);
  console.table(summary);
  console.log(`Phone fills with fixed (+2519) prefix: ${notes(/doubled/)} | kept original text: ${notes(/original/)}`);
  console.log(`Users to update: ${plan.fills.length} | seniority levels to create: ${levelsToCreate.length}`);

  const findingRows = (kind: HrFieldFinding['kind'], notedOnly = false): string[] =>
    plan.findings
      .filter((f) => f.kind === kind && (!notedOnly || Boolean(f.note)))
      .sort((a, b) => a.rowIndex - b.rowIndex || a.field.localeCompare(b.field))
      .map(
        (f) =>
          `| ${f.rowIndex} | ${nameByRow.get(f.rowIndex) ?? ''} | ${f.field} | ${shown(f, f.sheetValue)} | ${shown(f, f.dbValue)} | ${f.note ?? ''} |`,
      );
  const table = (title: string, rows: string[]): string[] => [
    `## ${title} (${rows.length})`,
    '',
    ...(rows.length
      ? ['| Row | Sheet name | Field | Sheet value | Current value | Note |', '| ---: | --- | --- | --- | --- | --- |', ...rows]
      : ['None.']),
    '',
  ];
  const reportPath = join(privateDir, 'hr-fields-import-report.md');
  writeFileSync(
    reportPath,
    [
      `# HR fields import ${args.apply ? 'apply' : 'dry run'}`,
      '',
      `Generated ${new Date().toISOString()} | Host: ${target.host} | DB: ${target.database}`,
      'Phones are masked except the last three digits. Nothing is overwritten: differences need a decision.',
      '',
      '| Field | Fill | Same | Difference | Skipped |',
      '| --- | ---: | ---: | ---: | ---: |',
      ...summary.map((s) => `| ${s.field} | ${s.fill} | ${s.same} | ${s.difference} | ${s.skipped} |`),
      '',
      `Seniority levels to create: ${levelsToCreate.map((l) => l.name).join(', ') || 'none'}`,
      '',
      ...table('Differences - not overwritten', findingRows('difference')),
      ...table('Skipped values', findingRows('skipped')),
      ...table('Fills with a note', findingRows('fill', true)),
      `## Rows not imported (${unmatched.length + plan.duplicateMatchRows.length})`,
      '',
      '| Row | Sheet name | Reason |',
      '| ---: | --- | --- |',
      ...unmatched.map((u) => `| ${u.row} | ${u.name} | ${u.reason} |`),
      ...plan.duplicateMatchRows.map((r) => `| ${r} | ${nameByRow.get(r) ?? ''} | same user matched by another row |`),
      '',
    ].join('\n'),
    'utf8',
  );
  console.log(`Report: ${reportPath}`);

  if (!args.apply) {
    await prisma.$disconnect();
    return;
  }

  const batchId = randomUUID();
  await prisma.$transaction(async (tx) => {
    for (const level of levelsToCreate) {
      const created = await tx.seniorityLevel.create({
        data: {
          companyId: company.id,
          name: level.name,
          nameZh: level.nameZh ?? null,
          sortOrder: level.sortOrder ?? 0,
          createdBy: actorId,
          updatedBy: actorId,
        },
        select: { id: true },
      });
      levelIdByName.set(normaliseLabel(level.name), created.id);
    }
    for (const fill of plan.fills) {
      const after = {
        ...(fill.phone ? { phone: fill.phone } : {}),
        ...(fill.secondaryPhone ? { secondaryPhone: fill.secondaryPhone } : {}),
        ...(fill.educationLevel ? { educationLevel: fill.educationLevel as EducationLevel } : {}),
        ...(fill.seniorityLevelName
          ? { seniorityLevelId: levelIdByName.get(normaliseLabel(fill.seniorityLevelName))! }
          : {}),
      };
      await tx.user.update({
        where: { id: fill.userId },
        data: { ...after, updatedBy: actorId },
      });
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: actorId,
          source: AuditLogSource.SYSTEM_JOB,
          module: 'user-management',
          action: 'hr_fields_import',
          recordType: 'User',
          recordId: fill.userId,
          batchId,
          beforeValue: Object.fromEntries(Object.keys(after).map((key) => [key, null])),
          afterValue: after,
        },
      });
    }
  });
  console.log(`Applied ${plan.fills.length} user updates (batch ${batchId}).`);
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
