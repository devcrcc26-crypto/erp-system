/**
 * Seed CCECC employee roster onto the current local DB with CC-0001… IDs.
 *
 * Usage (from backend/):
 *   $env:SEED_MODE='true'
 *   npx ts-node --transpile-only scripts/seed-ccecc-employees.ts
 *
 * New accounts get a random temporary password (mustChangePassword=true),
 * written only to backend/data/private/initial-credentials.csv (never printed).
 * Samuel (list #59) is matched to the existing System Administrator and only
 * gets employeeId updated to CC-0059.
 */
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { generateTemporaryPassword } from '../src/modules/auth/application/utils/password-policy.util';
import {
  formatDisplayFullName,
  normalizeLoginName,
} from '../src/modules/auth/application/utils/login-name.util';
import { assertCredentialsPathGitignored } from '../src/shared/script-guards/login-setup-guards';
import { appendInitialCredentials } from './lib/credentials-csv';
import { assertLocalhostSeedGuards } from './lib/localhost-seed-guard';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const SAMUEL_ID = '16040ab7-b923-4fe4-87cf-cc3a916c7325';
const BCRYPT_ROUNDS = 12;

/**
 * Roster in image order. Spellings prefer pwf_test canon where confidently matched;
 * remaining names follow the best reading of the uploaded list.
 */
const EMPLOYEES: ReadonlyArray<{ firstName: string; lastName: string }> = [
  { firstName: 'Ababo', lastName: 'Gereme' },
  { firstName: 'Abenezer', lastName: 'Abadi' },
  { firstName: 'Abenezer', lastName: 'Tilahun' },
  { firstName: 'Abraham', lastName: 'Yishak' },
  { firstName: 'Abiyu', lastName: 'Bekele' },
  { firstName: 'Adanech', lastName: 'Geda' },
  { firstName: 'Agegahegn', lastName: 'Tefera' },
  { firstName: 'Agegnehu', lastName: 'Gelaw' },
  { firstName: 'Amare', lastName: 'Melaku' },
  { firstName: 'Ayelech', lastName: 'Worku' },
  { firstName: 'Beru', lastName: 'Yargale' },
  { firstName: 'Bezabih', lastName: 'Denberu' },
  { firstName: 'Birhanu', lastName: 'Melaku' },
  { firstName: 'Biruk', lastName: 'Alemu' },
  { firstName: 'Dagmawi', lastName: 'Tesfaye' },
  { firstName: 'Dame', lastName: 'Geda' },
  { firstName: 'Dinberu', lastName: 'Alemu' },
  { firstName: 'Eden', lastName: 'Alemu' },
  { firstName: 'Efeson', lastName: 'Bassa' },
  { firstName: 'Eskender', lastName: 'Abebaw' },
  { firstName: 'Estesegenet', lastName: 'Degu' },
  { firstName: 'Eyob', lastName: 'Temesgen' },
  { firstName: 'Eyuel', lastName: 'Melaku' },
  { firstName: 'Habtamu', lastName: 'Gizaw' },
  { firstName: 'Hadish', lastName: 'Belay' },
  { firstName: 'Haile', lastName: 'Micheal Mulugeta' },
  { firstName: 'Hailu', lastName: 'Tesfaye' },
  { firstName: 'Haymanot', lastName: 'Yigrem' },
  { firstName: 'Heaven', lastName: 'Jada' },
  { firstName: 'Helen', lastName: 'Abebaw' },
  { firstName: 'Henok', lastName: 'Shiferaw' },
  { firstName: 'Israel', lastName: 'Woldetsadik' },
  { firstName: 'Kahsay', lastName: 'Reda' },
  { firstName: 'Kassaye', lastName: 'Workie' },
  { firstName: 'Kiber', lastName: 'Temesgen' },
  { firstName: 'Kidist', lastName: 'Kabtiyemer' },
  { firstName: 'Lakew', lastName: 'Gulema Urge' },
  { firstName: 'Leul', lastName: 'Tesfaye' },
  { firstName: 'Medhanit', lastName: 'Berhanu' },
  { firstName: 'Mekides', lastName: 'Asfaw' },
  { firstName: 'Mesfin', lastName: 'Abi Mamuye' },
  { firstName: 'Mestawet', lastName: 'Adam' },
  { firstName: 'Micheal', lastName: 'Fetene' },
  { firstName: 'Mihret', lastName: 'Moges' },
  { firstName: 'Mistereselassie', lastName: 'Yonas' },
  { firstName: 'Mizen', lastName: 'Beyene' },
  { firstName: 'Muse', lastName: 'Asefa' },
  { firstName: 'Nahili', lastName: 'Deresa' },
  { firstName: 'Nahom', lastName: 'Alemayehu' },
  { firstName: 'Nahom', lastName: 'Asfaw' },
  { firstName: 'Nasid', lastName: 'Biftu' },
  { firstName: 'Natnael', lastName: 'Argaw' },
  { firstName: 'Natnael', lastName: 'Girma' },
  { firstName: 'Natnael', lastName: 'Mulatu' },
  { firstName: 'Natnael', lastName: 'Takele' },
  { firstName: 'Nebiyu', lastName: 'Samuel' },
  { firstName: 'Netsihit', lastName: 'Alemayehu' },
  { firstName: 'Samrawit', lastName: 'Adane' },
  { firstName: 'Samuel Hailemariam', lastName: 'Seifu' }, // → existing Samuel
  { firstName: 'Seid', lastName: 'Hussen' },
  { firstName: 'Selamawit', lastName: 'Beyene' },
  { firstName: 'Shewaferahun', lastName: 'Tesfaye' },
  { firstName: 'Shimeles', lastName: 'Ayele' },
  { firstName: 'Shimelis', lastName: 'Bacha' },
  { firstName: 'Sisay', lastName: 'Gedishu' },
  { firstName: 'Sisay', lastName: 'Tenna' },
  { firstName: 'Soliyana', lastName: 'Solomon' },
  { firstName: 'Sony', lastName: 'Aboye' },
  { firstName: 'Surafel', lastName: 'Seyoum' },
  { firstName: 'Tariku', lastName: 'Yideg' },
  { firstName: 'Terefe', lastName: 'Bekele' },
  { firstName: 'TesfaMicheal', lastName: 'Negera' },
  { firstName: 'Tesfaye', lastName: 'Tsega Beyin' },
  { firstName: 'Tesfu', lastName: 'Berhane' },
  { firstName: 'Tewele', lastName: 'Brhane' },
  { firstName: 'Tewodros', lastName: 'Desye Sisay' },
  { firstName: 'Tsebaot', lastName: 'Minda Tadesse' },
  { firstName: 'Tsion', lastName: 'Mekonnen' },
  { firstName: 'Werknesh', lastName: 'Tiruha' },
  { firstName: 'Yared', lastName: 'Ejigu' },
  { firstName: 'Yemareshet', lastName: 'Temesgen' },
  { firstName: 'Yisak', lastName: 'Assefa' },
  { firstName: 'Yonas', lastName: 'Bizualem' },
  { firstName: 'Zelalem', lastName: 'Sefiw' },
  { firstName: 'Zerihun', lastName: 'Lemesa' },
  { firstName: 'Zeru', lastName: 'Tasew' },
  { firstName: 'Daniel', lastName: 'Girma' },
  { firstName: 'Dagim', lastName: 'Selemon' },
  { firstName: 'Henok', lastName: 'Tesfaye' },
  { firstName: 'Birhanu', lastName: 'G/Silassie' },
  { firstName: 'Zewidu', lastName: 'Habte' },
  { firstName: 'Asili', lastName: 'Mekonen' },
  { firstName: 'Asaminew', lastName: 'Kebede' },
  { firstName: 'Habtu', lastName: 'Mulat' },
  { firstName: 'Adanech', lastName: 'Shiferaw' },
];

function employeeIdForIndex(index: number): string {
  return `CC-${String(index + 1).padStart(4, '0')}`;
}

function placeholderEmail(employeeId: string): string {
  return `${employeeId.toLowerCase()}@ccecc.local`;
}

function isSamuelRow(row: { firstName: string; lastName: string }): boolean {
  const full = `${row.firstName} ${row.lastName}`.toLowerCase();
  return (
    full.includes('samuel') &&
    (full.includes('hailemariam') ||
      full.includes('h/mariam') ||
      full.includes('seifu'))
  );
}

async function main(): Promise<void> {
  assertLocalhostSeedGuards({ requireDatabase: 'pwf_fresh' });

  if (EMPLOYEES.length === 0) {
    throw new Error('Employee list is empty');
  }
  if (EMPLOYEES.length > 150) {
    throw new Error('Employee list exceeds CC-0150 capacity');
  }

  const rootGitignore = join(__dirname, '..', '..', '.gitignore');
  assertCredentialsPathGitignored(
    readFileSync(rootGitignore, 'utf8'),
    'backend/data/private/initial-credentials.csv',
  );

  const privateDir = join(__dirname, '..', 'data', 'private');
  const credentialRows: Array<{
    loginName: string;
    temporaryPassword: string;
  }> = [];

  const prisma = new PrismaClient();
  try {
    const actor = await prisma.user.findUniqueOrThrow({
      where: { id: SAMUEL_ID },
      select: { id: true },
    });

    const employeeRole = await prisma.role.findFirst({
      where: { companyId: COMPANY_ID, name: 'Employee', deletedAt: null },
      select: { id: true },
    });
    if (!employeeRole) {
      throw new Error('Employee role not found - run configuration seed first');
    }

    const leavePolicy = await prisma.leavePolicy.findFirst({
      where: { companyId: COMPANY_ID, name: 'Standard Staff', deletedAt: null },
      select: { id: true },
    });
    const workSchedule = await prisma.workSchedule.findFirst({
      where: { companyId: COMPANY_ID, name: 'CRCC Standard', deletedAt: null },
      select: { id: true },
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;

    console.log(`Seeding ${EMPLOYEES.length} employees as CC-0001 … CC-${String(EMPLOYEES.length).padStart(4, '0')}`);
    console.log(`(ID namespace reserved through CC-0150)\n`);

    for (let i = 0; i < EMPLOYEES.length; i += 1) {
      const row = EMPLOYEES[i]!;
      const employeeId = employeeIdForIndex(i);
      const fullName = formatDisplayFullName({
        firstName: row.firstName,
        lastName: row.lastName,
      });

      if (isSamuelRow(row)) {
        await prisma.user.update({
          where: { id: actor.id },
          data: {
            employeeId,
            updatedBy: actor.id,
          },
        });
        console.log(`${employeeId}  ${fullName}  [updated existing Samuel]`);
        updated += 1;
        continue;
      }

      const existingById = await prisma.user.findFirst({
        where: { companyId: COMPANY_ID, employeeId, deletedAt: null },
        select: { id: true },
      });
      if (existingById) {
        console.log(`${employeeId}  ${fullName}  [skip - employeeId already exists]`);
        skipped += 1;
        continue;
      }

      let temporaryPassword = generateTemporaryPassword(12);
      while (
        normalizeLoginName(temporaryPassword) === normalizeLoginName(fullName)
      ) {
        temporaryPassword = generateTemporaryPassword(12);
      }
      const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
      const loginNameNormalized = normalizeLoginName(fullName);

      const userId = randomUUID();
      await prisma.user.create({
        data: {
          id: userId,
          companyId: COMPANY_ID,
          employeeId,
          firstName: row.firstName,
          lastName: row.lastName,
          loginName: fullName,
          loginNameNormalized,
          email: placeholderEmail(employeeId),
          passwordHash,
          mustChangePassword: true,
          preferredLanguage: 'en',
          isActive: true,
          mfaEnabled: false,
          emailVerifiedAt: new Date(),
          leavePolicyId: leavePolicy?.id ?? null,
          workScheduleId: workSchedule?.id ?? null,
          includeInPayroll: true,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      });

      await prisma.userRole.create({
        data: {
          userId,
          roleId: employeeRole.id,
          isPrimary: true,
          assignedBy: actor.id,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      });

      credentialRows.push({
        loginName: fullName,
        temporaryPassword,
      });

      console.log(`${employeeId}  ${fullName}`);
      created += 1;
    }

    if (credentialRows.length > 0) {
      appendInitialCredentials(privateDir, credentialRows);
      console.log(
        `Wrote ${credentialRows.length} temporary credentials to backend/data/private/initial-credentials.csv`,
      );
    }

    // Keep auto EMP- sequence clear of CC range; app uses EMP- prefix separately.
    await prisma.$executeRawUnsafe(
      `SELECT setval('employee_id_seq', GREATEST(150, (SELECT COALESCE(MAX(
          CASE WHEN employee_id ~ '^EMP-[0-9]+$'
            THEN CAST(substring(employee_id from 5) AS integer)
            ELSE 0 END
        ), 0) FROM "user")), true)`,
    );

    const totalUsers = await prisma.user.count({ where: { deletedAt: null } });
    console.log('\n=== Seed complete ===');
    console.log(`Created: ${created}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Active users now: ${totalUsers}`);
    console.log(
      'Temporary passwords: backend/data/private/initial-credentials.csv (not printed)',
    );
    console.log('Emails: cc-0001@ccecc.local … (Samuel keeps his real email)');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('seed-ccecc-employees failed:', error);
  process.exit(1);
});
