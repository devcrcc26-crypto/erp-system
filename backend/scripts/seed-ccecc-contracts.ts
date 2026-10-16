/**
 * Seed gender + employee contracts from the salary/gender roster.
 *
 * - One sheet row → one OPEN_ENDED ACTIVE contract (start = experience_start_date).
 * - Two sheet rows → first contract SUPERSEDED, second ACTIVE (new terms).
 *   Both use the employment start as the first contract's startDate; the second
 *   contract starts the next calendar day as a placeholder so you can edit it.
 *
 * Usage:
 *   $env:SEED_MODE='true'
 *   npx ts-node --transpile-only scripts/seed-ccecc-contracts.ts
 */
import { randomUUID } from 'crypto';
import {
  EmployeeContractStatus,
  EmployeeContractType,
  Gender,
  Prisma,
  PrismaClient,
  SupportedCurrency,
} from '@prisma/client';
import { assertLocalhostSeedGuards } from './lib/localhost-seed-guard';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const SAMUEL_ID = '16040ab7-b923-4fe4-87cf-cc3a916c7325';

interface PayRow {
  basicSalary: number;
  transportationAllowance: number;
  monthlyBonus: number;
}

interface EmployeePay {
  /** 1-based CC index (CC-0001 = 1). */
  index: number;
  gender: Gender;
  contracts: PayRow[];
}

/**
 * Roster in CC-0001…CC-0095 order. Dual-pay employees have two PayRow entries
 * (first = superseded, second = active/new).
 */
const ROSTER: EmployeePay[] = [
  { index: 1, gender: Gender.MALE, contracts: [{ basicSalary: 13000, transportationAllowance: 900, monthlyBonus: 14630.77 }] },
  { index: 2, gender: Gender.MALE, contracts: [{ basicSalary: 50000, transportationAllowance: 2079.59, monthlyBonus: 69031.4 }] },
  {
    index: 3,
    gender: Gender.MALE,
    contracts: [
      { basicSalary: 50000, transportationAllowance: 1955, monthlyBonus: 42933.33 },
      { basicSalary: 70000, transportationAllowance: 746.66, monthlyBonus: 16225.64 },
    ],
  },
  { index: 4, gender: Gender.MALE, contracts: [{ basicSalary: 15000, transportationAllowance: 1800, monthlyBonus: 19153.84 }] },
  { index: 5, gender: Gender.MALE, contracts: [{ basicSalary: 12000, transportationAllowance: 1800, monthlyBonus: 6446.15 }] },
  { index: 6, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2100, monthlyBonus: 51461.54 }] },
  { index: 7, gender: Gender.MALE, contracts: [{ basicSalary: 8000, transportationAllowance: 1260, monthlyBonus: 3357.14 }] },
  { index: 8, gender: Gender.MALE, contracts: [{ basicSalary: 14000, transportationAllowance: 900, monthlyBonus: 13738.46 }] },
  { index: 9, gender: Gender.MALE, contracts: [{ basicSalary: 20000, transportationAllowance: 2400, monthlyBonus: 29153.84 }] },
  { index: 10, gender: Gender.FEMALE, contracts: [{ basicSalary: 20000, transportationAllowance: 1950, monthlyBonus: 22153.84 }] },
  { index: 11, gender: Gender.MALE, contracts: [{ basicSalary: 10000, transportationAllowance: 1400, monthlyBonus: 5000 }] },
  { index: 12, gender: Gender.FEMALE, contracts: [{ basicSalary: 7000, transportationAllowance: 1235, monthlyBonus: 1540 }] },
  { index: 13, gender: Gender.MALE, contracts: [{ basicSalary: 40000, transportationAllowance: 2700, monthlyBonus: 49307.69 }] },
  { index: 14, gender: Gender.MALE, contracts: [{ basicSalary: 40800, transportationAllowance: 2736, monthlyBonus: 49307.69 }] },
  { index: 15, gender: Gender.MALE, contracts: [{ basicSalary: 80000, transportationAllowance: 2800, monthlyBonus: 113461.54 }] },
  { index: 16, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2200, monthlyBonus: 31307.69 }] },
  { index: 17, gender: Gender.MALE, contracts: [{ basicSalary: 10000, transportationAllowance: 800, monthlyBonus: 5153.84 }] },
  { index: 18, gender: Gender.FEMALE, contracts: [{ basicSalary: 10000, transportationAllowance: 950, monthlyBonus: 8000 }] },
  { index: 19, gender: Gender.MALE, contracts: [{ basicSalary: 5000, transportationAllowance: 395, monthlyBonus: 4473.33 }] },
  { index: 20, gender: Gender.MALE, contracts: [{ basicSalary: 40000, transportationAllowance: 2800, monthlyBonus: 72230.77 }] },
  { index: 21, gender: Gender.FEMALE, contracts: [{ basicSalary: 12500, transportationAllowance: 1875, monthlyBonus: 10500 }] },
  { index: 22, gender: Gender.MALE, contracts: [{ basicSalary: 48000, transportationAllowance: 2800, monthlyBonus: 57400 }] },
  { index: 23, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2250, monthlyBonus: 28153.84 }] },
  {
    index: 24,
    gender: Gender.MALE,
    contracts: [
      { basicSalary: 8000, transportationAllowance: 80, monthlyBonus: 669.23 },
      { basicSalary: 10000, transportationAllowance: 746.66, monthlyBonus: 6246.15 },
    ],
  },
  { index: 25, gender: Gender.FEMALE, contracts: [{ basicSalary: 20000, transportationAllowance: 2400, monthlyBonus: 29153.84 }] },
  { index: 26, gender: Gender.MALE, contracts: [{ basicSalary: 5500, transportationAllowance: 445, monthlyBonus: 675 }] },
  { index: 27, gender: Gender.MALE, contracts: [{ basicSalary: 35000, transportationAllowance: 2750, monthlyBonus: 46000 }] },
  { index: 28, gender: Gender.FEMALE, contracts: [{ basicSalary: 12000, transportationAllowance: 1800, monthlyBonus: 6446.15 }] },
  { index: 29, gender: Gender.FEMALE, contracts: [{ basicSalary: 35000, transportationAllowance: 2800, monthlyBonus: 41307.69 }] },
  { index: 30, gender: Gender.FEMALE, contracts: [{ basicSalary: 15000, transportationAllowance: 1925, monthlyBonus: 10500 }] },
  {
    index: 31,
    gender: Gender.MALE,
    contracts: [
      { basicSalary: 30000, transportationAllowance: 375, monthlyBonus: 4692.31 },
      { basicSalary: 68000, transportationAllowance: 2210, monthlyBonus: 37280 },
    ],
  },
  { index: 32, gender: Gender.MALE, contracts: [{ basicSalary: 25000, transportationAllowance: 1900, monthlyBonus: 34692.3 }] },
  { index: 33, gender: Gender.FEMALE, contracts: [{ basicSalary: 20000, transportationAllowance: 2200, monthlyBonus: 37153.84 }] },
  { index: 34, gender: Gender.FEMALE, contracts: [{ basicSalary: 20000, transportationAllowance: 2400, monthlyBonus: 29153.84 }] },
  { index: 35, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2500, monthlyBonus: 43153.84 }] },
  { index: 36, gender: Gender.FEMALE, contracts: [{ basicSalary: 12000, transportationAllowance: 1800, monthlyBonus: 6446.15 }] },
  { index: 37, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2000, monthlyBonus: 27000 }] },
  {
    index: 38,
    gender: Gender.MALE,
    contracts: [
      { basicSalary: 80000, transportationAllowance: 1866.66, monthlyBonus: 75641.03 },
      { basicSalary: 80000, transportationAllowance: 1026.66, monthlyBonus: 52884.62 },
    ],
  },
  { index: 39, gender: Gender.FEMALE, contracts: [{ basicSalary: 70000, transportationAllowance: 2800, monthlyBonus: 68538.46 }] },
  { index: 40, gender: Gender.FEMALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2250, monthlyBonus: 28153.84 }] },
  { index: 41, gender: Gender.MALE, contracts: [{ basicSalary: 10000, transportationAllowance: 600, monthlyBonus: 7000 }] },
  { index: 42, gender: Gender.FEMALE, contracts: [{ basicSalary: 10000, transportationAllowance: 800, monthlyBonus: 5153.84 }] },
  { index: 43, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2500, monthlyBonus: 44000 }] },
  { index: 44, gender: Gender.FEMALE, contracts: [{ basicSalary: 70000, transportationAllowance: 2650, monthlyBonus: 84153.84 }] },
  { index: 45, gender: Gender.MALE, contracts: [{ basicSalary: 78500, transportationAllowance: 2720, monthlyBonus: 84153.84 }] },
  {
    index: 46,
    gender: Gender.FEMALE,
    contracts: [
      { basicSalary: 45000, transportationAllowance: 210, monthlyBonus: 3076.92 },
      { basicSalary: 50000, transportationAllowance: 2142, monthlyBonus: 81350.77 },
    ],
  },
  { index: 47, gender: Gender.MALE, contracts: [{ basicSalary: 7800, transportationAllowance: 171, monthlyBonus: 700 }] },
  { index: 48, gender: Gender.FEMALE, contracts: [{ basicSalary: 15000, transportationAllowance: 1800, monthlyBonus: 19153.84 }] },
  { index: 49, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2525, monthlyBonus: 35500 }] },
  { index: 50, gender: Gender.MALE, contracts: [{ basicSalary: 10000, transportationAllowance: 1100.5, monthlyBonus: 32385.84 }] },
  { index: 51, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2050, monthlyBonus: 36153.84 }] },
  { index: 52, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2500, monthlyBonus: 43153.84 }] },
  { index: 53, gender: Gender.MALE, contracts: [{ basicSalary: 13000, transportationAllowance: 900, monthlyBonus: 14630.77 }] },
  { index: 54, gender: Gender.MALE, contracts: [{ basicSalary: 35000, transportationAllowance: 1865, monthlyBonus: 52100 }] },
  { index: 55, gender: Gender.MALE, contracts: [{ basicSalary: 20000, transportationAllowance: 2100, monthlyBonus: 29153.84 }] },
  { index: 56, gender: Gender.MALE, contracts: [{ basicSalary: 40800, transportationAllowance: 2736, monthlyBonus: 49307.69 }] },
  { index: 57, gender: Gender.FEMALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2250, monthlyBonus: 29000 }] },
  { index: 58, gender: Gender.FEMALE, contracts: [{ basicSalary: 25000, transportationAllowance: 2100, monthlyBonus: 25153.84 }] },
  { index: 59, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2250, monthlyBonus: 28153.84 }] },
  { index: 60, gender: Gender.MALE, contracts: [{ basicSalary: 10000, transportationAllowance: 800, monthlyBonus: 5153.84 }] },
  { index: 61, gender: Gender.FEMALE, contracts: [{ basicSalary: 35000, transportationAllowance: 2500, monthlyBonus: 48307.69 }] },
  {
    index: 62,
    gender: Gender.MALE,
    contracts: [
      { basicSalary: 30000, transportationAllowance: 956.66, monthlyBonus: 16871.79 },
      { basicSalary: 30000, transportationAllowance: 1161.66, monthlyBonus: 32256.41 },
    ],
  },
  { index: 63, gender: Gender.MALE, contracts: [{ basicSalary: 15000, transportationAllowance: 900, monthlyBonus: 14630.77 }] },
  { index: 64, gender: Gender.MALE, contracts: [{ basicSalary: 35000, transportationAllowance: 2550, monthlyBonus: 34000 }] },
  { index: 65, gender: Gender.MALE, contracts: [{ basicSalary: 20000, transportationAllowance: 1950, monthlyBonus: 22153.84 }] },
  { index: 66, gender: Gender.MALE, contracts: [{ basicSalary: 40000, transportationAllowance: 2200, monthlyBonus: 80846.16 }] },
  { index: 67, gender: Gender.FEMALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2500, monthlyBonus: 43153.84 }] },
  { index: 68, gender: Gender.FEMALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2100, monthlyBonus: 51461.54 }] },
  { index: 69, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2050, monthlyBonus: 36153.84 }] },
  { index: 70, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2050, monthlyBonus: 36153.84 }] },
  { index: 71, gender: Gender.MALE, contracts: [{ basicSalary: 40000, transportationAllowance: 2500, monthlyBonus: 25000 }] },
  { index: 72, gender: Gender.MALE, contracts: [{ basicSalary: 50000, transportationAllowance: 2150, monthlyBonus: 72000 }] },
  { index: 73, gender: Gender.MALE, contracts: [{ basicSalary: 50000, transportationAllowance: 2800, monthlyBonus: 74846.16 }] },
  { index: 74, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2500, monthlyBonus: 43153.84 }] },
  { index: 75, gender: Gender.MALE, contracts: [{ basicSalary: 50000, transportationAllowance: 2150, monthlyBonus: 72000 }] },
  { index: 76, gender: Gender.MALE, contracts: [{ basicSalary: 10000, transportationAllowance: 1400, monthlyBonus: 5000 }] },
  { index: 77, gender: Gender.FEMALE, contracts: [{ basicSalary: 13000, transportationAllowance: 900, monthlyBonus: 14630.77 }] },
  { index: 78, gender: Gender.FEMALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2500, monthlyBonus: 43153.84 }] },
  { index: 79, gender: Gender.FEMALE, contracts: [{ basicSalary: 5500, transportationAllowance: 570, monthlyBonus: 1143.75 }] },
  { index: 80, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2250, monthlyBonus: 28153.84 }] },
  { index: 81, gender: Gender.FEMALE, contracts: [{ basicSalary: 15000, transportationAllowance: 1300, monthlyBonus: 9153.84 }] },
  { index: 82, gender: Gender.MALE, contracts: [{ basicSalary: 35000, transportationAllowance: 2350, monthlyBonus: 38000 }] },
  { index: 83, gender: Gender.MALE, contracts: [{ basicSalary: 25000, transportationAllowance: 1999.2, monthlyBonus: 22292 }] },
  { index: 84, gender: Gender.MALE, contracts: [{ basicSalary: 10000, transportationAllowance: 1400, monthlyBonus: 5000 }] },
  { index: 85, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2450, monthlyBonus: 34000 }] },
  { index: 86, gender: Gender.MALE, contracts: [{ basicSalary: 10000, transportationAllowance: 1250, monthlyBonus: 6000 }] },
  { index: 87, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2500, monthlyBonus: 43153.84 }] },
  { index: 88, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2050, monthlyBonus: 36153.84 }] },
  { index: 89, gender: Gender.MALE, contracts: [{ basicSalary: 7800, transportationAllowance: 471, monthlyBonus: 700 }] },
  { index: 90, gender: Gender.MALE, contracts: [{ basicSalary: 30000, transportationAllowance: 2250, monthlyBonus: 28153.84 }] },
  { index: 91, gender: Gender.MALE, contracts: [{ basicSalary: 50000, transportationAllowance: 2053.33, monthlyBonus: 52066.66 }] },
  { index: 92, gender: Gender.FEMALE, contracts: [{ basicSalary: 20000, transportationAllowance: 1200, monthlyBonus: 14576.92 }] },
  { index: 93, gender: Gender.MALE, contracts: [{ basicSalary: 40000, transportationAllowance: 1260, monthlyBonus: 23010.26 }] },
  { index: 94, gender: Gender.MALE, contracts: [{ basicSalary: 10000, transportationAllowance: 680, monthlyBonus: 2571.79 }] },
  { index: 95, gender: Gender.MALE, contracts: [{ basicSalary: 50000, transportationAllowance: 586.66, monthlyBonus: 8923.07 }] },
];

function employeeIdForIndex(index: number): string {
  return `CC-${String(index).padStart(4, '0')}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function dayBefore(date: Date): Date {
  return addDays(date, -1);
}

function toDateOnlyUtc(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

async function nextContractNumber(prisma: PrismaClient): Promise<string> {
  const result = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('employee_contract_number_seq')
  `;
  return `EC-${String(Number(result[0].nextval)).padStart(4, '0')}`;
}

async function main(): Promise<void> {
  assertLocalhostSeedGuards({ requireDatabase: 'pwf_fresh' });

  if (ROSTER.length !== 95) {
    throw new Error(`Expected 95 roster entries, got ${ROSTER.length}`);
  }

  const prisma = new PrismaClient();
  let gendersUpdated = 0;
  let contractsCreated = 0;
  let dualEmployees = 0;

  try {
    // Idempotent re-run: clear prior seeded contracts for CC- employees.
    const ccUsers = await prisma.user.findMany({
      where: { companyId: COMPANY_ID, employeeId: { startsWith: 'CC-' }, deletedAt: null },
      select: { id: true },
    });
    const ccIds = ccUsers.map((u) => u.id);
    if (ccIds.length > 0) {
      const deleted = await prisma.employeeContract.deleteMany({
        where: { companyId: COMPANY_ID, employeeId: { in: ccIds } },
      });
      if (deleted.count > 0) {
        console.log(`Cleared ${deleted.count} existing CC- contracts for re-seed`);
      }
    }
    await prisma.$executeRawUnsafe(
      `SELECT setval('employee_contract_number_seq', 1, false)`,
    );

    for (const row of ROSTER) {
      const employeeCode = employeeIdForIndex(row.index);
      const user = await prisma.user.findFirst({
        where: { companyId: COMPANY_ID, employeeId: employeeCode, deletedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employmentDate: true,
        },
      });
      if (!user) {
        throw new Error(`User ${employeeCode} not found`);
      }
      const hireDate = user.employmentDate;
      if (!hireDate) {
        throw new Error(`${employeeCode} has no employment_date`);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { gender: row.gender, updatedBy: SAMUEL_ID },
      });
      gendersUpdated += 1;

      const firstStart = toDateOnlyUtc(hireDate);
      const hasDual = row.contracts.length > 1;
      if (hasDual) dualEmployees += 1;

      for (let i = 0; i < row.contracts.length; i += 1) {
        const pay = row.contracts[i];
        const isLast = i === row.contracts.length - 1;
        const startDate =
          i === 0 ? firstStart : addDays(firstStart, 1); // placeholder for dual #2
        const signedAt = startDate;
        const status = isLast
          ? EmployeeContractStatus.ACTIVE
          : EmployeeContractStatus.SUPERSEDED;
        const endDate = isLast ? null : dayBefore(addDays(firstStart, 1));

        const contractNumber = await nextContractNumber(prisma);
        await prisma.employeeContract.create({
          data: {
            id: randomUUID(),
            companyId: COMPANY_ID,
            contractNumber,
            employeeId: user.id,
            contractType: EmployeeContractType.OPEN_ENDED,
            status,
            signedAt,
            startDate,
            endDate,
            currency: SupportedCurrency.ETB,
            pensionApplicable: true,
            taxApplicable: true,
            basicSalary: dec(pay.basicSalary),
            transportationAllowance: dec(pay.transportationAllowance),
            monthlyBonus: dec(pay.monthlyBonus),
            monthlyNetBonus: new Prisma.Decimal(0),
            notes: hasDual
              ? i === 0
                ? 'Seeded prior terms (superseded by salary revision row)'
                : 'Seeded current terms - edit start date as needed'
              : 'Seeded from employment salary roster',
            createdBy: SAMUEL_ID,
            updatedBy: SAMUEL_ID,
          },
        });
        contractsCreated += 1;
        console.log(
          `${employeeCode}  ${user.firstName} ${user.lastName}  ${row.gender}  ${contractNumber} ${status}  basic=${pay.basicSalary}  start=${startDate.toISOString().slice(0, 10)}`,
        );
      }
    }

    console.log('\n=== Contract / gender seed complete ===');
    console.log(`Genders updated: ${gendersUpdated}`);
    console.log(`Contracts created: ${contractsCreated}`);
    console.log(`Employees with 2 contracts: ${dualEmployees}`);
    console.log(
      'Dual #2 start dates are employment_start+1 day placeholders - edit in UI.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('seed-ccecc-contracts failed:', error);
  process.exit(1);
});
