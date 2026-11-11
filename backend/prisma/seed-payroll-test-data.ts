/**
 * Payroll module end-to-end test data seed (CCECC PWF local test DB).
 *
 * Usage (from backend/, SEED_MODE required, localhost DATABASE_URL only):
 *   $env:SEED_MODE='true'; npx ts-node -r tsconfig-paths/register --transpile-only prisma/seed-payroll-test-data.ts
 */
import 'reflect-metadata';
import 'dotenv/config';
import { join } from 'path';
import { register } from 'tsconfig-paths';
import { randomUUID } from 'crypto';
import {
  EmployeeContractStatus,
  EmployeeContractType,
  EmployeeType,
  Gender,
  LeaveType,
  Nationality,
  Prisma,
  SiteAssignmentStatus,
  WorkFromHomeScope,
} from '@prisma/client';
import type { AttendanceDailyRaw } from '../src/modules/attendance/utils/attendance-excel.parser';
import { assertPayrollSeedGuards } from './seeds/payroll-test/guards';
import {
  createSeededRng,
  pickInt,
  pickOne,
  roundTo,
} from './seeds/payroll-test/rng';
import {
  driveApprovalToOutcome,
  fullyApprove,
} from './seeds/payroll-test/approvals';
import {
  daysInMonth,
  importAttendanceMonth,
  isSaturday,
  isSunday,
  makeScanRow,
  utcDateOnly,
  type DayScanPattern,
} from './seeds/payroll-test/attendance-import';
import { getSeedSuppressedEmailCount } from '../src/shared/mail/resend-email.service';
import { getSeedSuppressedNotificationCount } from '../src/modules/notifications/application/services/notification.service';
import { seedWorkSchedules } from './seed/work-schedules.seed';

register({
  baseUrl: join(__dirname, '..'),
  paths: { '@/*': ['src/*'] },
});

const SEED_YEAR = 2026;
const RNG_SEED = 20261005;

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  departmentId: string | null;
  engineeringDisciplineId: string | null;
  positionId: string | null;
  nationality: Nationality | null;
  gender: Gender | null;
  leavePolicyId: string | null;
  workScheduleId: string | null;
  employeeType: EmployeeType | null;
};

type TestCatalog = Record<string, { id: string; name: string }>;

type Counts = Record<string, number>;

function bump(counts: Counts, key: string, by = 1): void {
  counts[key] = (counts[key] ?? 0) + by;
}

function fullName(e: Emp): string {
  return `${e.firstName} ${e.lastName}`.trim();
}

function formatEmp(e: Emp): { id: string; name: string } {
  return { id: e.id, name: fullName(e) };
}

function salaryBandForTitle(title: string): {
  basicMin: number;
  basicMax: number;
} {
  const t = title.toLowerCase();
  if (
    t.includes('lead') ||
    t.includes('head') ||
    t.includes('manager') ||
    t.includes('deputy general')
  ) {
    return { basicMin: 50_000, basicMax: 80_000 };
  }
  if (t.includes('senior')) {
    return { basicMin: 30_000, basicMax: 50_000 };
  }
  if (
    t.includes('junior') ||
    t.includes('technician') ||
    t.includes('driver') ||
    t.includes('admin') ||
    t.includes('assistant') ||
    t.includes('cleaner') ||
    t.includes('secretary')
  ) {
    return { basicMin: 8_000, basicMax: 15_000 };
  }
  return { basicMin: 15_000, basicMax: 30_000 };
}

async function main(): Promise<void> {
  const { host, database } = assertPayrollSeedGuards();
  console.log(`[seed] Target database: ${host}/${database}`);
  console.log('[seed] SEED_MODE=true - notifications and emails suppressed');

  const counts: Counts = {};
  const catalog: TestCatalog = {};
  const policyNotes: string[] = [];
  const userFieldsModified: string[] = [
    'departmentId',
    'engineeringDisciplineId',
    'positionId',
    'nationality',
    'employeeType',
    'leavePolicyId',
    'bankName',
    'bankBranch',
    'bankAccountNumber',
  ];

  const rng = createSeededRng(RNG_SEED);

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { PrismaService } = await import('../src/shared/prisma/prisma.service');
  const { LeaveService } = await import(
    '../src/modules/leave/application/services/leave.service'
  );
  const { LeavePolicyService } = await import(
    '../src/modules/leave-policy/application/services/leave-policy.service'
  );
  const { EmployeeContractService } = await import(
    '../src/modules/employee-contract/application/services/employee-contract.service'
  );
  const { WorkFromHomeDayService } = await import(
    '../src/modules/work-schedule/application/services/work-from-home-day.service'
  );
  const { SiteAssignmentService } = await import(
    '../src/modules/site-assignment/application/services/site-assignment.service'
  );
  const { AttendanceService } = await import(
    '../src/modules/attendance/application/services/attendance.service'
  );
  const { OvertimeService } = await import(
    '../src/modules/overtime/application/services/overtime.service'
  );
  const { ApprovalsService } = await import(
    '../src/modules/approvals/application/services/approvals.service'
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const leaveService = app.get(LeaveService);
  const leavePolicyService = app.get(LeavePolicyService);
  const contractService = app.get(EmployeeContractService);
  const wfhService = app.get(WorkFromHomeDayService);
  const siteService = app.get(SiteAssignmentService);
  const attendanceService = app.get(AttendanceService);
  const overtimeService = app.get(OvertimeService);
  const approvalsService = app.get(ApprovalsService);

  try {
    const company = await prisma.company.findFirst({
      select: { id: true, legalName: true },
    });
    if (!company) {
      throw new Error('No company found');
    }
    const companyId = company.id;

    const admin = await prisma.user.findFirst({
      where: {
        companyId,
        deletedAt: null,
        email: process.env.SEED_ADMIN_EMAIL ?? 'admin@company.local',
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!admin) {
      throw new Error('Admin user not found - run prisma db seed first');
    }
    const actorId = admin.id;

    let employees = (await prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        includeInPayroll: true,
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        departmentId: true,
        engineeringDisciplineId: true,
        positionId: true,
        nationality: true,
        gender: true,
        leavePolicyId: true,
        workScheduleId: true,
        employeeType: true,
      },
    })) as Emp[];

    console.log(`[seed] In-scope employees: ${employees.length}`);

    const sorted = [...employees];
    const pick = (index: number): Emp => sorted[index] as Emp;

    catalog.augustJoiner1 = formatEmp(pick(5));
    catalog.augustJoiner2 = formatEmp(pick(6));
    catalog.augustJoiner3 = formatEmp(pick(7));
    catalog.septemberJoiner1 = formatEmp(pick(8));
    catalog.septemberJoiner2 = formatEmp(pick(9));
    catalog.leaver = formatEmp(pick(10));
    catalog.absentAllAugust = formatEmp(pick(11));
    catalog.absentAllSeptember = formatEmp(pick(12));
    catalog.saturdayAbsence = formatEmp(pick(13));
    catalog.missingClockOutWithFm = formatEmp(pick(14));
    catalog.missingClockOutNoFm = formatEmp(pick(15));
    catalog.pendingFm = formatEmp(pick(16));
    catalog.direDawa1 = formatEmp(pick(17));
    catalog.direDawa2 = formatEmp(pick(18));
    catalog.direDawa3 = formatEmp(pick(19));
    catalog.hawassa1 = formatEmp(pick(20));
    catalog.hawassa2 = formatEmp(pick(21));
    catalog.halfDayLeave = formatEmp(pick(22));
    catalog.leaveSpanSaturday = formatEmp(pick(23));
    catalog.leaveSpanSep11 = formatEmp(pick(24));
    catalog.maternityLeave = formatEmp(pick(25));
    catalog.sitePending = formatEmp(pick(26));
    catalog.siteRejected = formatEmp(pick(27));
    catalog.siteCancelled = formatEmp(pick(28));

    const expatCandidates = sorted.filter(
      (e) => e.nationality === Nationality.CHINESE,
    );
    let expats: Emp[] = [];
    if (expatCandidates.length > 0) {
      expats = expatCandidates.slice(0, Math.max(3, expatCandidates.length));
    } else {
      const count = Math.max(1, Math.round(sorted.length * 0.1));
      expats = sorted.slice(30, 30 + count);
      for (const e of expats) {
        await prisma.user.update({
          where: { id: e.id },
          data: { nationality: Nationality.CHINESE, updatedBy: actorId },
        });
        e.nationality = Nationality.CHINESE;
      }
      bump(counts, 'user.nationality', expats.length);
    }
    catalog.expat1 = formatEmp(expats[0] as Emp);
    if (expats[1]) catalog.expat2 = formatEmp(expats[1]);
    if (expats[2]) catalog.expat3 = formatEmp(expats[2]);

    const freelancers = sorted.slice(40, 42);
    for (const e of freelancers) {
      await prisma.user.update({
        where: { id: e.id },
        data: { employeeType: EmployeeType.CONTRACT, updatedBy: actorId },
      });
      e.employeeType = EmployeeType.CONTRACT;
    }
    bump(counts, 'user.employeeType', freelancers.length);
    catalog.freelancer1 = formatEmp(freelancers[0] as Emp);
    catalog.freelancer2 = formatEmp(freelancers[1] as Emp);

    // ── A. Organisation ───────────────────────────────────────────────────
    const positionTitles = [
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
    ];
    const positionMap = new Map<string, string>();
    for (const title of positionTitles) {
      let pos = await prisma.position.findFirst({
        where: { companyId, deletedAt: null, title },
        select: { id: true },
      });
      if (!pos) {
        pos = await prisma.position.create({
          data: {
            id: randomUUID(),
            companyId,
            title,
            isActive: true,
            createdBy: actorId,
            updatedBy: actorId,
          },
          select: { id: true },
        });
        bump(counts, 'position');
      }
      positionMap.set(title, pos.id);
    }

    const departments = await prisma.department.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true, leaderUserId: true },
    });
    const disciplines = await prisma.discipline.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true, leaderId: true },
    });

    const samuel = await prisma.user.findFirst({
      where: {
        companyId,
        deletedAt: null,
        firstName: { contains: 'Samuel', mode: 'insensitive' },
      },
      select: { id: true },
    });
    const archDisc = disciplines.find((d) => d.name === 'Architecture');
    if (archDisc && samuel && !archDisc.leaderId) {
      await prisma.discipline.update({
        where: { id: archDisc.id },
        data: { leaderId: samuel.id, updatedBy: actorId },
      });
      archDisc.leaderId = samuel.id;
    }

    for (const disc of disciplines) {
      if (disc.leaderId) continue;
      const member = employees.find(
        (e) => e.engineeringDisciplineId === disc.id,
      );
      if (member) {
        await prisma.discipline.update({
          where: { id: disc.id },
          data: { leaderId: member.id, updatedBy: actorId },
        });
        bump(counts, 'discipline.leader');
      }
    }

    for (const dept of departments) {
      if (dept.leaderUserId) continue;
      const member = employees.find((e) => e.departmentId === dept.id);
      const fallback = employees.find((e) => e.id !== actorId);
      const leaderId = member?.id ?? fallback?.id;
      if (leaderId) {
        await prisma.department.update({
          where: { id: dept.id },
          data: { leaderUserId: leaderId, updatedBy: actorId },
        });
        bump(counts, 'department.leader');
      }
    }

    const assignTitles = [
      'Engineer',
      'Junior Engineer',
      'Senior Engineer',
      'Draftsman',
      'Technician',
      'Admin Officer',
      'HR Officer',
      'Driver',
      'Accountant',
      'Lead Engineer',
    ];
    let orgUpdates = 0;
    for (let i = 0; i < employees.length; i += 1) {
      const e = employees[i] as Emp;
      const patch: Prisma.UserUpdateInput = { updatedBy: actorId };
      if (!e.departmentId && departments.length > 0) {
        patch.department = {
          connect: { id: departments[i % departments.length]?.id },
        };
      }
      if (!e.engineeringDisciplineId && disciplines.length > 0) {
        patch.engineeringDiscipline = {
          connect: { id: disciplines[i % disciplines.length]?.id },
        };
      }
      if (!e.positionId) {
        const title = assignTitles[i % assignTitles.length] as string;
        const pid = positionMap.get(title);
        if (pid) {
          patch.position = { connect: { id: pid } };
        }
      }
      if (Object.keys(patch).length > 1) {
        await prisma.user.update({ where: { id: e.id }, data: patch });
        orgUpdates += 1;
      }
    }
    bump(counts, 'user.org', orgUpdates);

    employees = (await prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        includeInPayroll: true,
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        departmentId: true,
        engineeringDisciplineId: true,
        positionId: true,
        nationality: true,
        gender: true,
        leavePolicyId: true,
        workScheduleId: true,
        employeeType: true,
      },
    })) as Emp[];

    await seedWorkSchedules({
      prisma,
      companyId,
      actorUserId: actorId,
    });

    const standardPolicy = await prisma.leavePolicy.findFirst({
      where: { companyId, deletedAt: null, name: 'Standard Staff' },
      select: { id: true },
    });
    if (!standardPolicy) {
      throw new Error('Standard Staff leave policy missing');
    }

    await leavePolicyService.updatePolicy(
      standardPolicy.id,
      {
        rules: [
          {
            leaveType: LeaveType.ANNUAL,
            baseDays: 16,
            isProgressive: true,
            incrementDays: 1,
            incrementEveryYears: 2,
            minimumServiceMonths: 0,
            maxCarryForwardDays: 8,
          },
          {
            leaveType: LeaveType.MATERNITY,
            baseDays: 120,
            minimumServiceMonths: 0,
          },
          {
            leaveType: LeaveType.SICK,
            baseDays: 30,
            requiresReceipt: true,
          },
        ],
      },
      companyId,
      actorId,
    );
    bump(counts, 'leavePolicyRule', 3);

    policyNotes.push(
      'PATERNITY (3 days): no LeaveType policy rule bucket - requests use ANNUAL balance mapping only',
    );
    policyNotes.push(
      'MARRIAGE (3 days): LeaveType not in schema - cannot configure',
    );
    policyNotes.push(
      'BEREAVEMENT (3 days): use COMPASSIONATE leave type; no dedicated balance row (deducts ANNUAL)',
    );
    policyNotes.push(
      'HALF-DAY leave: seed uses full-day stand-ins on halfDayLeave employee (Aug 20 + Sep 6) - enable MORNING/AFTERNOON in seed when needed',
    );
    policyNotes.push(
      'MATERNITY long leave: skipped for catalog.maternityLeave when entitled balance < requested days (check policy/service-month rules)',
    );
    policyNotes.push(
      'Dire Dawa Aug site rows: inserted APPROVED via Prisma (site submitRequest blocks starts before 1st of previous month in October)',
    );

    const defaultSchedule = await prisma.workSchedule.findFirst({
      where: { companyId, deletedAt: null, isDefault: true },
      select: { id: true },
    });
    if (!defaultSchedule) {
      throw new Error('Default work schedule not found - seed work schedules first');
    }

    let policyAssigns = 0;
    let scheduleAssigns = 0;
    for (const e of employees) {
      const userPatch: Prisma.UserUpdateInput = { updatedBy: actorId };
      if (!e.leavePolicyId) {
        userPatch.leavePolicy = { connect: { id: standardPolicy.id } };
        policyAssigns += 1;
      }
      if (!e.workScheduleId) {
        userPatch.workSchedule = { connect: { id: defaultSchedule.id } };
        scheduleAssigns += 1;
      }
      if (Object.keys(userPatch).length > 1) {
        await prisma.user.update({ where: { id: e.id }, data: userPatch });
      }
      await leavePolicyService.initializeBalances(e.id, companyId, SEED_YEAR);
    }
    bump(counts, 'user.leavePolicyId', policyAssigns);
    bump(counts, 'user.workScheduleId', scheduleAssigns);
    userFieldsModified.push('workScheduleId');
    bump(counts, 'leaveBalance', employees.length * 3);

    const maternityEmp = employees.find((e) => e.id === catalog.maternityLeave?.id);
    if (maternityEmp && maternityEmp.gender !== Gender.FEMALE) {
      await prisma.user.update({
        where: { id: maternityEmp.id },
        data: { gender: Gender.FEMALE, updatedBy: actorId },
      });
    }

    // ── D. Public holidays 2026 ─────────────────────────────────────────
    const holidays2026: Array<{ date: string; name: string }> = [
      { date: '2026-01-07', name: 'Genna' },
      { date: '2026-01-19', name: 'Timket' },
      { date: '2026-03-02', name: 'Adwa' },
      { date: '2026-03-20', name: 'Eid al-Fitr (approx)' },
      { date: '2026-04-10', name: 'Good Friday' },
      { date: '2026-04-12', name: 'Fasika' },
      { date: '2026-05-01', name: 'Labour Day' },
      { date: '2026-05-05', name: "Patriots' Day" },
      { date: '2026-05-27', name: 'Eid al-Adha (approx)' },
      { date: '2026-05-28', name: 'Derg Downfall' },
      { date: '2026-08-26', name: 'Mawlid (approx)' },
      { date: '2026-09-11', name: 'Enkutatash' },
      { date: '2026-09-27', name: 'Meskel' },
    ];
    for (const h of holidays2026) {
      const date = utcDateOnly(
        Number(h.date.slice(0, 4)),
        Number(h.date.slice(5, 7)),
        Number(h.date.slice(8, 10)),
      );
      await prisma.publicHoliday.upsert({
        where: {
          companyId_date_appliesToNationality: {
            companyId,
            date,
            appliesToNationality: 'ALL',
          },
        },
        create: {
          id: randomUUID(),
          companyId,
          name: h.name,
          date,
          isRecurring: false,
          appliesToNationality: 'ALL',
          isActive: true,
          createdBy: actorId,
          updatedBy: actorId,
        },
        update: {
          name: h.name,
          isActive: true,
          updatedBy: actorId,
          deletedAt: null,
          deletedBy: null,
        },
      });
      bump(counts, 'publicHoliday');
    }

    // ── B. Contracts ──────────────────────────────────────────────────────
    const contractSoft = await prisma.employeeContract.updateMany({
      where: { companyId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: actorId },
    });
    bump(counts, 'employeeContract.softDeleted', contractSoft.count);

    const specialStarts = new Map<string, string>([
      [catalog.augustJoiner1.id, '2026-08-15'],
      [catalog.augustJoiner2.id, '2026-08-16'],
      [catalog.augustJoiner3.id, '2026-08-17'],
      [catalog.septemberJoiner1.id, '2026-09-15'],
      [catalog.septemberJoiner2.id, '2026-09-16'],
    ]);
    const leaverEnd = '2026-09-15';
    const endingSoon = sorted.slice(50, 53);

    for (let i = 0; i < employees.length; i += 1) {
      const e = employees[i] as Emp;
      const position = e.positionId
        ? await prisma.position.findFirst({
            where: { id: e.positionId },
            select: { title: true },
          })
        : null;
      const title = position?.title ?? 'Engineer';
      const band = salaryBandForTitle(title);
      let basic = roundTo(
        band.basicMin + rng() * (band.basicMax - band.basicMin),
        500,
      );
      const transport = roundTo(900 + rng() * 2100, 100);
      const bonusPct = rng() < 0.3 ? 0 : rng() * 0.6;
      const bonus = roundTo(basic * bonusPct, 50);

      let startDate = specialStarts.get(e.id);
      if (!startDate) {
        const y = pickInt(rng, 2020, 2026);
        const m = y === 2026 ? pickInt(rng, 1, 6) : pickInt(rng, 1, 12);
        const d = pickInt(rng, 1, 28);
        startDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }

      let endDate: string | undefined;
      if (e.id === catalog.leaver.id) {
        endDate = leaverEnd;
      } else if (endingSoon.some((x) => x.id === e.id)) {
        const day = pickInt(rng, 1, 28);
        const month = pickInt(rng, 10, 12);
        endDate = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }

      const isExpat =
        e.nationality === Nationality.CHINESE || expats.some((x) => x.id === e.id);
      const isFreelancer = freelancers.some((x) => x.id === e.id);
      const notesParts: string[] = [];
      if (isExpat) notesParts.push('payrollCategory=EXPATRIATE');
      if (isFreelancer) notesParts.push('payrollCategory=FREELANCER');

      const bankName = pickOne(rng, [
        'Commercial Bank of Ethiopia',
        'Awash Bank',
        'Dashen Bank',
        'Bank of Abyssinia',
      ]);
      const bankBranch = `${pickOne(rng, ['Bole', 'Kazanchis', 'Piassa', 'Megenagna'])} Branch`;
      const bankAccount = String(pickInt(rng, 1_000_000_000_000, 9_999_999_999_999));

      await prisma.user.update({
        where: { id: e.id },
        data: {
          bankName,
          bankBranch,
          bankAccountNumber: bankAccount,
          updatedBy: actorId,
        },
      });
      bump(counts, 'user.bank');

      await contractService.createContract(
        {
          employeeId: e.id,
          contractType: EmployeeContractType.FIXED_TERM,
          signedAt: startDate,
          startDate,
          endDate: endDate ?? '2027-12-31',
          basicSalary: basic,
          transportationAllowance: transport,
          monthlyBonus: bonus,
          notes: notesParts.length ? notesParts.join('; ') : undefined,
          pensionApplicable: !isFreelancer,
          taxApplicable: !isFreelancer,
        },
        companyId,
        actorId,
      );
      bump(counts, 'employeeContract');
    }

    // ── F. WFH ────────────────────────────────────────────────────────────
    await prisma.workFromHomeDay.deleteMany({
      where: {
        companyId,
        date: {
          in: [
            utcDateOnly(2026, 8, 14),
            utcDateOnly(2026, 9, 4),
            utcDateOnly(2026, 10, 2),
          ],
        },
      },
    });

    await wfhService.create(
      { date: '2026-08-14', reason: 'Company-wide WFH - seed', scope: WorkFromHomeScope.ALL },
      companyId,
      actorId,
    );
    bump(counts, 'workFromHomeDay');
    const wfhDept = departments[0]?.id;
    if (wfhDept) {
      await wfhService.create(
        {
          date: '2026-09-04',
          reason: 'Department WFH - seed',
          scope: WorkFromHomeScope.DEPARTMENTS,
          departmentIds: [wfhDept],
        },
        companyId,
        actorId,
      );
      bump(counts, 'workFromHomeDay');
    }
    await wfhService.create(
      { date: '2026-10-02', reason: 'Company-wide WFH - seed', scope: WorkFromHomeScope.ALL },
      companyId,
      actorId,
    );
    bump(counts, 'workFromHomeDay');

    // ── G. Site assignments ───────────────────────────────────────────────
    const siteTestEmployeeIds = [
      catalog.direDawa1.id,
      catalog.direDawa2.id,
      catalog.direDawa3.id,
      catalog.hawassa1.id,
      catalog.hawassa2.id,
      catalog.sitePending.id,
      catalog.siteRejected.id,
      catalog.siteCancelled.id,
    ];
    await prisma.siteAssignment.updateMany({
      where: {
        companyId,
        employeeId: { in: siteTestEmployeeIds },
        deletedAt: null,
      },
      data: { deletedAt: new Date(), deletedBy: actorId },
    });

    /**
     * August site ranges cannot pass submitRequest when run in October (earliest start = 1st of previous month).
     * Inserts an already-approved row so attendance recalc treats site days correctly.
     */
    async function insertApprovedSiteAssignment(
      employeeId: string,
      siteName: string,
      start: string,
      end: string,
    ): Promise<void> {
      await prisma.siteAssignment.create({
        data: {
          id: randomUUID(),
          companyId,
          requestNumber: `SA-PWF-${randomUUID().slice(0, 8).toUpperCase()}`,
          employeeId,
          siteName,
          startDate: utcDateOnly(
            Number(start.slice(0, 4)),
            Number(start.slice(5, 7)),
            Number(start.slice(8, 10)),
          ),
          endDate: utcDateOnly(
            Number(end.slice(0, 4)),
            Number(end.slice(5, 7)),
            Number(end.slice(8, 10)),
          ),
          reason: 'Payroll test seed (direct approved - pre-window start)',
          status: SiteAssignmentStatus.APPROVED,
          submittedAt: new Date(),
          completedAt: new Date(),
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
      bump(counts, 'siteAssignment');
    }

    async function submitSite(
      employeeId: string,
      siteName: string,
      start: string,
      end: string,
      outcome?: 'APPROVED' | 'REJECTED' | 'PENDING',
    ): Promise<void> {
      const detail = (await siteService.submitRequest(
        {
          siteName,
          startDate: start,
          endDate: end,
          reason: 'Payroll test seed site assignment',
          onBehalfOfEmployeeId: employeeId,
        },
        companyId,
        actorId,
      )) as { approvalRequestId?: string | null; id: string };

      if (outcome === 'PENDING' || !detail.approvalRequestId) {
        bump(counts, 'siteAssignment');
        return;
      }
      const approvalId = detail.approvalRequestId;
      if (outcome === 'REJECTED') {
        await driveApprovalToOutcome(
          approvalsService,
          prisma,
          approvalId,
          'REJECTED',
        );
      } else {
        await fullyApprove(approvalsService, prisma, approvalId);
      }
      bump(counts, 'siteAssignment');
    }

    for (const id of [
      catalog.direDawa1.id,
      catalog.direDawa2.id,
      catalog.direDawa3.id,
    ]) {
      await insertApprovedSiteAssignment(id, 'Dire Dawa', '2026-08-01', '2026-09-15');
    }
    await submitSite(
      catalog.hawassa1.id,
      'Hawassa',
      '2026-09-01',
      '2026-09-15',
      'APPROVED',
    );
    await submitSite(
      catalog.hawassa2.id,
      'Hawassa',
      '2026-09-01',
      '2026-09-15',
      'APPROVED',
    );
    await submitSite(
      catalog.sitePending.id,
      'Bahir Dar',
      '2026-10-01',
      '2026-10-10',
      'PENDING',
    );
    await submitSite(
      catalog.siteRejected.id,
      'Gondar',
      '2026-10-05',
      '2026-10-12',
      'REJECTED',
    );
    const cancelledSite = (await siteService.submitRequest(
      {
        siteName: 'Jimma',
        startDate: '2026-09-20',
        endDate: '2026-09-25',
        onBehalfOfEmployeeId: catalog.siteCancelled.id,
      },
      companyId,
      actorId,
    )) as { id: string; approvalRequestId?: string | null };
    if (cancelledSite.approvalRequestId) {
      await fullyApprove(approvalsService, prisma, cancelledSite.approvalRequestId);
    }
    await siteService.cancelApproved(
      cancelledSite.id,
      companyId,
      actorId,
      'Seed - cancel after approval test case',
    );
    bump(counts, 'siteAssignment', 2);

    // ── E. Leave requests (~60) ───────────────────────────────────────────
    const leaveReseed = await prisma.leaveRequest.findMany({
      where: {
        companyId,
        startDate: { lte: utcDateOnly(2026, 10, 31) },
        endDate: { gte: utcDateOnly(2026, 8, 1) },
      },
      select: { id: true, approvalRequestId: true },
    });
    const leaveIds = leaveReseed.map((l) => l.id);
    const leaveApprovalIds = leaveReseed
      .map((l) => l.approvalRequestId)
      .filter((id): id is string => Boolean(id));
    if (leaveIds.length > 0) {
      await prisma.leaveRequestPeriod.deleteMany({
        where: { leaveRequestId: { in: leaveIds } },
      });
      await prisma.leaveRequest.deleteMany({ where: { id: { in: leaveIds } } });
      bump(counts, 'leaveRequest.purged', leaveIds.length);
    }
    if (leaveApprovalIds.length > 0) {
      await prisma.approvalTier.deleteMany({
        where: { requestId: { in: leaveApprovalIds } },
      });
      await prisma.approvalRequest.deleteMany({
        where: { id: { in: leaveApprovalIds } },
      });
    }

    type LeavePlan = {
      employeeId: string;
      leaveType: LeaveType;
      periods: Array<{
        startDate: string;
        endDate: string;
        dayPortion?: LeaveDayPortion;
      }>;
      outcome:
        | 'APPROVED'
        | 'SUBMITTED'
        | 'REJECTED'
        | 'RETURNED'
        | 'CANCELLED';
    };

    const leavePlans: LeavePlan[] = [
      {
        employeeId: catalog.halfDayLeave.id,
        leaveType: LeaveType.ANNUAL,
        periods: [{ startDate: '2026-08-20', endDate: '2026-08-20' }],
        outcome: 'APPROVED',
      },
      {
        employeeId: catalog.halfDayLeave.id,
        leaveType: LeaveType.ANNUAL,
        periods: [{ startDate: '2026-09-06', endDate: '2026-09-06' }],
        outcome: 'APPROVED',
      },
      {
        employeeId: catalog.leaveSpanSaturday.id,
        leaveType: LeaveType.ANNUAL,
        periods: [{ startDate: '2026-08-21', endDate: '2026-08-24' }],
        outcome: 'APPROVED',
      },
      {
        employeeId: catalog.leaveSpanSep11.id,
        leaveType: LeaveType.ANNUAL,
        periods: [{ startDate: '2026-09-10', endDate: '2026-09-12' }],
        outcome: 'APPROVED',
      },
      {
        employeeId: catalog.maternityLeave.id,
        leaveType: LeaveType.MATERNITY,
        periods: [{ startDate: '2026-09-01', endDate: '2026-10-15' }],
        outcome: 'APPROVED',
      },
      {
        employeeId: sorted[29]?.id ?? catalog.halfDayLeave.id,
        leaveType: LeaveType.ANNUAL,
        periods: [{ startDate: '2026-07-28', endDate: '2026-07-30' }],
        outcome: 'APPROVED',
      },
    ];

    const outcomesPool: LeavePlan['outcome'][] = [];
    for (let i = 0; i < 36; i += 1) outcomesPool.push('APPROVED');
    for (let i = 0; i < 9; i += 1) outcomesPool.push('SUBMITTED');
    for (let i = 0; i < 6; i += 1) outcomesPool.push('REJECTED');
    for (let i = 0; i < 6; i += 1) outcomesPool.push('RETURNED');
    for (let i = 0; i < 3; i += 1) outcomesPool.push('CANCELLED');

    let li = 0;
    for (const e of sorted) {
      if (leavePlans.length >= 60) break;
      if (leavePlans.some((p) => p.employeeId === e.id && p.leaveType === LeaveType.ANNUAL)) {
        continue;
      }
      const startDay = pickInt(rng, 1, 20);
      const month = pickOne(rng, [8, 9, 10]);
      const start = `2026-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
      const span = pickInt(rng, 1, 4);
      const endDate = utcDateOnly(2026, month, startDay + span - 1);
      leavePlans.push({
        employeeId: e.id,
        leaveType: LeaveType.ANNUAL,
        periods: [
          {
            startDate: start,
            endDate: endDate.toISOString().slice(0, 10),
          },
        ],
        outcome: outcomesPool[li % outcomesPool.length] as LeavePlan['outcome'],
      });
      li += 1;
    }

    for (const plan of leavePlans.slice(0, 60)) {
      try {
      const created = (await leaveService.submitOnBehalf(
        plan.employeeId,
        {
          leaveType: plan.leaveType,
          periods: plan.periods,
          reason: 'Payroll test seed leave',
        },
        companyId,
        actorId,
      )) as { id: string; approvalRequestId?: string | null; status?: string };

      const approvalId = created.approvalRequestId;
      if (plan.outcome === 'SUBMITTED') {
        bump(counts, 'leaveRequest');
        continue;
      }
      if (plan.outcome === 'CANCELLED') {
        await leaveService.cancelRequest(created.id, companyId, actorId);
        bump(counts, 'leaveRequest');
        continue;
      }
      if (approvalId) {
        if (plan.outcome === 'APPROVED') {
          await fullyApprove(approvalsService, prisma, approvalId);
        } else {
          await driveApprovalToOutcome(
            approvalsService,
            prisma,
            approvalId,
            plan.outcome,
          );
        }
      }
      bump(counts, 'leaveRequest');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[seed] Skip leave for ${plan.employeeId}: ${msg}`);
      }
    }

    // ── H. Attendance Aug/Sep ─────────────────────────────────────────────
    const siteEmployeeIds = new Set([
      catalog.direDawa1.id,
      catalog.direDawa2.id,
      catalog.direDawa3.id,
      catalog.hawassa1.id,
      catalog.hawassa2.id,
    ]);
    const wfhAllDates = new Set(['2026-08-14', '2026-10-02']);
    const joinerStart = new Map<string, string>([
      ...specialStarts.entries(),
    ]);
    const leaverId = catalog.leaver.id;

    function contractStartFor(employeeId: string): Date | null {
      const s = joinerStart.get(employeeId);
      return s ? utcDateOnly(2026, Number(s.slice(5, 7)), Number(s.slice(8, 10))) : utcDateOnly(2020, 1, 1);
    }

    function buildMonthScans(
      employeeId: string,
      month: number,
    ): AttendanceDailyRaw[] {
      const days = daysInMonth(SEED_YEAR, month);
      const rows: AttendanceDailyRaw[] = [];
      const startBound = contractStartFor(employeeId);
      const endBound =
        employeeId === leaverId ? utcDateOnly(2026, 9, 15) : null;

      for (let day = 1; day <= days; day += 1) {
        const date = utcDateOnly(SEED_YEAR, month, day);
        const iso = date.toISOString().slice(0, 10);
        if (date < startBound) continue;
        if (endBound && date > endBound) continue;

        let pattern: DayScanPattern = 'normal';
        if (employeeId === catalog.absentAllAugust.id && month === 8) {
          pattern = 'absent';
        } else if (employeeId === catalog.absentAllSeptember.id && month === 9) {
          pattern = 'absent';
        } else if (
          employeeId === catalog.saturdayAbsence.id &&
          isSaturday(date)
        ) {
          pattern = 'absent';
        } else if (siteEmployeeIds.has(employeeId) && month === 8) {
          pattern = 'skip';
        } else if (siteEmployeeIds.has(employeeId) && month === 9 && day <= 15) {
          pattern = 'skip';
        } else if (wfhAllDates.has(iso)) {
          pattern = rng() < 0.15 ? 'wfh_scan' : 'skip';
        } else if (employeeId === catalog.missingClockOutWithFm.id && day === 12 && month === 8) {
          pattern = 'missing_clock_out';
        } else if (employeeId === catalog.missingClockOutNoFm.id && day === 14 && month === 8) {
          pattern = 'missing_clock_out';
        } else if (employeeId === catalog.pendingFm.id && day === 18 && month === 9) {
          pattern = 'early_leave';
        } else if (isSunday(date)) {
          pattern = 'skip';
        } else {
          const bucket = rng();
          if (bucket < 0.05 && day % 7 === 3) pattern = 'absent';
          else if (bucket < 0.08) pattern = 'late';
        }

        if (pattern !== 'skip') {
          rows.push(makeScanRow(date, pattern));
        }
      }
      return rows;
    }

    for (const month of [8, 9] as const) {
      const importRows = employees.map((e) => ({
        employeeId: e.id,
        dailyData: buildMonthScans(e.id, month),
      }));
      const result = await importAttendanceMonth(
        attendanceService,
        prisma,
        {
          companyId,
          actorUserId: actorId,
          month,
          year: SEED_YEAR,
          rows: importRows,
          overwrite: true,
        },
      );
      bump(counts, 'attendanceImportBatch');
      bump(counts, 'attendanceRecord', result.recordCount);
      bump(counts, 'attendanceDailyLog', result.logCount);
    }

    // ── I. Field movement logs ────────────────────────────────────────────
    async function createFmForDay(
      employeeId: string,
      dateIso: string,
      reason: 'FORGOT_CLOCK_OUT' | 'EARLY_LEAVE',
      outcome: 'APPROVED' | 'REJECTED' | 'PENDING',
    ): Promise<void> {
      const log = await prisma.attendanceDailyLog.findFirst({
        where: {
          date: utcDateOnly(
            Number(dateIso.slice(0, 4)),
            Number(dateIso.slice(5, 7)),
            Number(dateIso.slice(8, 10)),
          ),
          record: { employeeId, companyId, month: Number(dateIso.slice(5, 7)), year: SEED_YEAR },
        },
        select: { id: true },
      });
      if (!log) return;

      const created = (await attendanceService.createFieldMovementLog(
        {
          entries: [
            {
              dailyLogId: log.id,
              reason,
              destination: reason === 'FORGOT_CLOCK_OUT' ? 'Office' : undefined,
              departureTime: reason === 'EARLY_LEAVE' ? '11:00' : undefined,
              returnTime: reason === 'FORGOT_CLOCK_OUT' ? '17:30' : undefined,
              notes: 'Payroll seed FM',
            },
          ],
          notes: 'Payroll seed',
        },
        companyId,
        employeeId,
      )) as { id: string };

      const submitted = (await attendanceService.submitFieldMovementLog(
        created.id,
        companyId,
        employeeId,
      )) as { approvalRequestId?: string | null };

      bump(counts, 'fieldMovementLog');
      const approvalId = submitted.approvalRequestId;
      if (!approvalId) return;
      if (outcome === 'PENDING') return;
      if (outcome === 'REJECTED') {
        await driveApprovalToOutcome(
          approvalsService,
          prisma,
          approvalId,
          'REJECTED',
        );
      } else {
        await fullyApprove(approvalsService, prisma, approvalId);
      }
    }

    try {
      await createFmForDay(
        catalog.missingClockOutWithFm.id,
        '2026-08-12',
        'FORGOT_CLOCK_OUT',
        'APPROVED',
      );
    } catch (error: unknown) {
      console.warn(
        `[seed] FM approved case skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      await createFmForDay(
        catalog.pendingFm.id,
        '2026-09-18',
        'EARLY_LEAVE',
        'PENDING',
      );
    } catch (error: unknown) {
      console.warn(
        `[seed] FM pending case skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      await createFmForDay(
        catalog.missingClockOutNoFm.id,
        '2026-08-14',
        'FORGOT_CLOCK_OUT',
        'REJECTED',
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[seed] FM rejected case skipped: ${msg}`);
    }

    await attendanceService.recalculateCompanyAttendanceMonth(companyId, 8, SEED_YEAR);
    await attendanceService.recalculateCompanyAttendanceMonth(companyId, 9, SEED_YEAR);

    // ── J. Overtime ───────────────────────────────────────────────────────
    const otSheets = await prisma.overtimeSheet.findMany({
      where: {
        companyId,
        year: SEED_YEAR,
        month: { in: [8, 9] },
      },
      select: { id: true, approvalRequestId: true },
    });
    if (otSheets.length > 0) {
      const otIds = otSheets.map((s) => s.id);
      const otApprovalIds = otSheets
        .map((s) => s.approvalRequestId)
        .filter((id): id is string => Boolean(id));
      await prisma.overtimeEntry.deleteMany({
        where: { sheetId: { in: otIds } },
      });
      await prisma.overtimeSheet.deleteMany({ where: { id: { in: otIds } } });
      if (otApprovalIds.length > 0) {
        await prisma.approvalTier.deleteMany({
          where: { requestId: { in: otApprovalIds } },
        });
        await prisma.approvalRequest.deleteMany({
          where: { id: { in: otApprovalIds } },
        });
      }
      bump(counts, 'overtimeSheet.purged', otIds.length);
    }

    const otEmployees = sorted.filter(() => rng() < 0.4);
    let otRejectedDone = false;
    let otDraftDone = false;
    for (const e of otEmployees) {
      for (const month of [8, 9] as const) {
        let sheet = (await overtimeService.getOrCreateSheet(
          e.id,
          month,
          SEED_YEAR,
          companyId,
          e.id,
        )) as { id: string; status: string };

        if (!otDraftDone && month === 8) {
          bump(counts, 'overtimeSheet');
          otDraftDone = true;
          continue;
        }

        if (sheet.status !== 'DRAFT' && sheet.status !== 'RETURNED') {
          await prisma.overtimeSheet.updateMany({
            where: { id: sheet.id, companyId },
            data: { deletedAt: new Date(), deletedBy: actorId },
          });
          sheet = (await overtimeService.getOrCreateSheet(
            e.id,
            month,
            SEED_YEAR,
            companyId,
            e.id,
          )) as { id: string; status: string };
        }

        try {
        await overtimeService.addEntry(
          sheet.id,
          {
            date: `${SEED_YEAR}-${String(month).padStart(2, '0')}-05`,
            startTime: '18:00',
            endTime: '21:00',
            taskDescription: 'Seed weekday OT',
          },
          companyId,
          e.id,
        );
        bump(counts, 'overtimeEntry');
        if (e.id === catalog.leaveSpanSep11.id && month === 9) {
          await overtimeService.addEntry(
            sheet.id,
            {
              date: '2026-09-11',
              startTime: '18:00',
              endTime: '21:00',
              taskDescription: 'Seed holiday-adjacent OT',
            },
            companyId,
            e.id,
            { allowHolidayOverride: true },
          );
          bump(counts, 'overtimeEntry');
        }
        await overtimeService.addEntry(
          sheet.id,
          {
            date: `${SEED_YEAR}-${String(month).padStart(2, '0')}-07`,
            startTime: '18:00',
            endTime: '23:30',
            taskDescription: 'Seed night hours OT',
            isOvernight: false,
          },
          companyId,
          e.id,
        );
        bump(counts, 'overtimeEntry');

        const submitted = (await overtimeService.submitSheet(
          sheet.id,
          companyId,
          e.id,
        )) as { approvalRequestId?: string | null };

        bump(counts, 'overtimeSheet');
        const approvalId = submitted.approvalRequestId;
        if (!approvalId) continue;

        if (!otRejectedDone) {
          await driveApprovalToOutcome(
            approvalsService,
            prisma,
            approvalId,
            'REJECTED',
          );
          otRejectedDone = true;
          continue;
        }
        if (rng() < 0.85) {
          await fullyApprove(approvalsService, prisma, approvalId);
        }
        } catch (error: unknown) {
          console.warn(
            `[seed] OT skip ${e.id} ${month}/2026: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    // ── Report ────────────────────────────────────────────────────────────
    console.log('\n========== PAYROLL TEST SEED REPORT ==========\n');
    console.log('Counts:');
    for (const [k, v] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ${k}: ${v}`);
    }
    console.log('\nUser fields modified:', userFieldsModified.join(', '));
    console.log('\nSuppressed notifications:', getSeedSuppressedNotificationCount());
    console.log('Suppressed emails:', getSeedSuppressedEmailCount());
    console.log('\nLeave policy / types not fully configurable:');
    for (const note of policyNotes) console.log(`  - ${note}`);
    console.log('\nTest-case employees:');
    for (const [key, val] of Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ${key}: ${val.name} (${val.id})`);
    }
    console.log('\n==============================================\n');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
