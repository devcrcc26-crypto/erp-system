/**
 * Local-dev only: set loginName = full name and a shared password for every
 * active user except System Administrators. Writes a credentials CSV.
 *
 * Usage (from backend/):
 *   npx tsx scripts/provision-dev-logins.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const SHARED_PASSWORD = 'Employee@12345';
const BCRYPT_ROUNDS = 12;
const SYSTEM_ADMIN_ROLE = 'System Administrator';

function formatDisplayFullName(parts: {
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [parts.firstName, parts.middleName, parts.lastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join(' ');
}

function normalizeLoginName(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/i.test(databaseUrl)) {
    throw new Error(
      'Refusing to run: DATABASE_URL host must be localhost/127.0.0.1',
    );
  }

  const prisma = new PrismaClient();
  try {
    const adminUsers = await prisma.user.findMany({
      where: {
        deletedAt: null,
        userRoles: {
          some: {
            deletedAt: null,
            role: { name: SYSTEM_ADMIN_ROLE, deletedAt: null },
          },
        },
      },
      select: { id: true },
    });
    const adminIds = new Set(adminUsers.map((row) => row.id));

    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        loginName: true,
        isActive: true,
        excludedFromHrProcesses: true,
        employeeId: true,
        userRoles: {
          where: { deletedAt: null },
          select: { role: { select: { name: true } } },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const targets = users.filter((user) => !adminIds.has(user.id));
    const passwordHash = await bcrypt.hash(SHARED_PASSWORD, BCRYPT_ROUNDS);

    const adminLoginNames = new Set(
      (
        await prisma.user.findMany({
          where: { id: { in: [...adminIds] }, deletedAt: null },
          select: { loginNameNormalized: true },
        })
      )
        .map((row) => row.loginNameNormalized)
        .filter((value): value is string => Boolean(value)),
    );

    /** loginNameNormalized already assigned in this run */
    const claimed = new Set<string>();
    const rows: Array<{
      fullName: string;
      loginName: string;
      password: string;
      email: string;
      employeeId: string;
      isActive: string;
      approverOnly: string;
      roles: string;
      note: string;
    }> = [];

    for (const user of targets) {
      const baseName = formatDisplayFullName(user);
      let loginName = baseName;
      let normalized = normalizeLoginName(loginName);
      let note = '';
      let suffix = 2;

      while (claimed.has(normalized) || adminLoginNames.has(normalized)) {
        loginName = `${baseName} ${suffix}`;
        normalized = normalizeLoginName(loginName);
        note = `loginName suffix ${suffix} (duplicate full name)`;
        suffix += 1;
      }

      claimed.add(normalized);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginName,
          loginNameNormalized: normalized,
          passwordHash,
          isActive: true,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedBy: user.id,
        },
      });

      rows.push({
        fullName: baseName,
        loginName,
        password: SHARED_PASSWORD,
        email: user.email ?? '',
        employeeId: user.employeeId ?? '',
        isActive: 'true',
        approverOnly: user.excludedFromHrProcesses ? 'yes' : 'no',
        roles: user.userRoles.map((ur) => ur.role.name).join('; '),
        note,
      });
    }

    const outPath = join(
      process.cwd(),
      'scripts',
      'dev-login-credentials.csv',
    );
    const header = [
      'fullName',
      'loginName',
      'password',
      'email',
      'employeeId',
      'isActive',
      'approverOnly',
      'roles',
      'note',
    ];
    const csv = [
      header.join(','),
      ...rows.map((row) =>
        [
          row.fullName,
          row.loginName,
          row.password,
          row.email,
          row.employeeId,
          row.isActive,
          row.approverOnly,
          row.roles,
          row.note,
        ]
          .map(csvEscape)
          .join(','),
      ),
    ].join('\n');

    writeFileSync(outPath, csv, 'utf8');

    console.log(
      JSON.stringify(
        {
          skippedAdmins: adminUsers.length,
          updated: rows.length,
          sharedPassword: SHARED_PASSWORD,
          csvPath: outPath,
          preview: rows.slice(0, 15).map((r) => ({
            loginName: r.loginName,
            password: r.password,
            approverOnly: r.approverOnly,
            roles: r.roles,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
