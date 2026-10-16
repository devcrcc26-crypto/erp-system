/**
 * Standalone HR demo seed: clears HR request data, promotes Ms. Dong to HR Manager,
 * sets Samuel as Architecture Discipline Lead, and seeds leave / OT / flight /
 * per diem / exit permits with real approval_request + approval_tier rows.
 *
 * Run: npx ts-node --transpile-only prisma/seed-hr-demo.ts
 */
import { randomUUID } from 'crypto';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
  ExitDirection,
  ExitPermitStatus,
  FlightApplicationStatus,
  FlightTicketClass,
  FlightTripType,
  LeaveRequestStatus,
  LeaveType,
  OvertimeSheetStatus,
  PerDiemStatus,
  Prisma,
  PrismaClient,
  SupportedCurrency,
} from '@prisma/client';
import { calculateOvertimeHours } from '../src/modules/overtime/application/utils/overtime-hours.util';

const prisma = new PrismaClient();

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
/** Prompt SYSTEM_USER_ID does not exist as a User row - use admin for FKs. */
const ADMIN_USER_ID = '4cdeb292-ebad-4c3d-85ff-9c5b0ad49fd0';
const MS_DONG_USER_ROLE_ID = '4e7df873-7f88-4580-9eeb-5e10dcdbba98';
const SAMUEL_ID = '16040ab7-b923-4fe4-87cf-cc3a916c7325';

const EMPLOYEES = {
  armias: 'a3c0d6d9-251f-4c9d-9504-5426e45a6ee1',
  dagmawi: 'e0362702-628c-4d24-b04e-334ddaa9253f',
  hailab: 'ef436a78-0c35-4257-a9f1-516203d6ed48',
  heaven: '8fe6378c-94cc-472a-a6bb-33870bf5a8ec',
  naod: '4805a462-3d65-453a-a6d7-01de085aa2eb',
} as const;

type DemoStatus =
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED';

interface TierSpec {
  label: string;
  approverId: string;
  order: number;
  resolver: string;
}

function buildTierState(
  tiers: TierSpec[],
  status: DemoStatus,
): {
  currentTier: number;
  tiers: Array<
    TierSpec & { decision: ApprovalTierDecision; comment: string | null }
  >;
} {
  if (status === 'APPROVED') {
    return {
      currentTier: tiers[tiers.length - 1].order,
      tiers: tiers.map((t) => ({
        ...t,
        decision: ApprovalTierDecision.APPROVED,
        comment: 'Approved.',
      })),
    };
  }
  if (status === 'REJECTED') {
    return {
      currentTier: tiers[0].order,
      tiers: tiers.map((t, i) => ({
        ...t,
        decision:
          i === 0
            ? ApprovalTierDecision.REJECTED
            : ApprovalTierDecision.PENDING,
        comment: i === 0 ? 'Not approved for this period.' : null,
      })),
    };
  }
  if (status === 'RETURNED') {
    return {
      currentTier: tiers[0].order,
      tiers: tiers.map((t, i) => ({
        ...t,
        decision:
          i === 0
            ? ApprovalTierDecision.RETURNED
            : ApprovalTierDecision.PENDING,
        comment: i === 0 ? 'Please provide additional details.' : null,
      })),
    };
  }
  if (status === 'IN_REVIEW') {
    return {
      currentTier: tiers[1]?.order ?? tiers[0].order,
      tiers: tiers.map((t, i) => ({
        ...t,
        decision:
          i === 0
            ? ApprovalTierDecision.APPROVED
            : ApprovalTierDecision.PENDING,
        comment: i === 0 ? 'Approved at discipline level.' : null,
      })),
    };
  }
  return {
    currentTier: tiers[0].order,
    tiers: tiers.map((t) => ({
      ...t,
      decision: ApprovalTierDecision.PENDING,
      comment: null,
    })),
  };
}

function timeAt(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

async function ensurePerDiemCategory(actorId: string): Promise<{
  id: string;
  numberPrefix: string;
}> {
  const existing = await prisma.approvalCategory.findFirst({
    where: { companyId: COMPANY_ID, code: 'PER_DIEM', deletedAt: null },
    select: { id: true, numberPrefix: true },
  });
  if (existing) {
    return existing;
  }

  const created = await prisma.approvalCategory.create({
    data: {
      id: randomUUID(),
      companyId: COMPANY_ID,
      code: 'PER_DIEM',
      name: 'Per Diem',
      description: 'Employee per diem / daily allowance requests',
      module: 'hr',
      numberPrefix: 'PD',
      icon: 'WalletOutlined',
      sortOrder: 55,
      isActive: true,
      formSchema: {
        fields: [
          { name: 'destination', label: 'Destination', type: 'text', required: true },
          { name: 'startDate', label: 'Start date', type: 'date', required: true },
          { name: 'endDate', label: 'End date', type: 'date', required: true },
        ],
      },
      approvalRules: [
        {
          name: 'Default',
          tiers: [
            { label: 'Discipline Lead', resolver: 'ROLE', role: 'Discipline Lead', order: 1 },
            { label: 'HR Manager', resolver: 'ROLE', role: 'HR Manager', order: 2 },
          ],
        },
      ],
      createdBy: actorId,
      updatedBy: actorId,
    },
    select: { id: true, numberPrefix: true },
  });
  console.log('✓ Created missing PER_DIEM approval category');
  return created;
}

async function clearHrModuleData(): Promise<void> {
  console.log('Clearing HR module data...');

  await prisma.approvalResponseDocument.deleteMany({
    where: { response: { request: { companyId: COMPANY_ID } } },
  });
  await prisma.approvalComment.deleteMany({
    where: { request: { companyId: COMPANY_ID } },
  });
  await prisma.approvalResponse.deleteMany({
    where: { request: { companyId: COMPANY_ID } },
  });
  await prisma.approvalTier.deleteMany({
    where: { request: { companyId: COMPANY_ID } },
  });

  const nullAr = { approvalRequestId: null as string | null };
  await prisma.leaveRequest.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.overtimeSheet.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.flightApplication.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.businessTrip.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.perDiemRequest.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.expenseClaim.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.purchaseRequest.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.materialRequisition.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.consumablesRequisition.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.vehicleApplication.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.vehicleRefueling.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.inspectionRepair.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.officialSeal.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.projectSeal.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.exitPermit.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });
  await prisma.fieldMovementLog.updateMany({ where: { companyId: COMPANY_ID }, data: nullAr });

  await prisma.approvalRequest.deleteMany({ where: { companyId: COMPANY_ID } });

  await prisma.leaveRequestDocument.deleteMany({
    where: { leaveRequest: { companyId: COMPANY_ID } },
  });
  await prisma.leaveRequestPeriod.deleteMany({
    where: { leaveRequest: { companyId: COMPANY_ID } },
  });
  await prisma.leaveRequest.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.leaveBalance.deleteMany({ where: { companyId: COMPANY_ID } });

  await prisma.overtimeEntryDocument.deleteMany({
    where: { entry: { sheet: { companyId: COMPANY_ID } } },
  });
  await prisma.overtimeEntry.deleteMany({
    where: { sheet: { companyId: COMPANY_ID } },
  });
  await prisma.overtimeSheet.deleteMany({ where: { companyId: COMPANY_ID } });

  await prisma.perDiemRequest.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.expenseClaimItem.deleteMany({
    where: { claim: { companyId: COMPANY_ID } },
  });
  await prisma.expenseClaim.deleteMany({ where: { companyId: COMPANY_ID } });

  await prisma.flightApplicationDocument.deleteMany({
    where: { application: { companyId: COMPANY_ID } },
  });
  await prisma.flightPassenger.deleteMany({
    where: { application: { companyId: COMPANY_ID } },
  });
  await prisma.flightApplication.deleteMany({ where: { companyId: COMPANY_ID } });

  await prisma.businessTripDocument.deleteMany({
    where: { trip: { companyId: COMPANY_ID } },
  });
  await prisma.businessTripPassenger.deleteMany({
    where: { trip: { companyId: COMPANY_ID } },
  });
  await prisma.businessTrip.deleteMany({ where: { companyId: COMPANY_ID } });

  await prisma.purchaseRequestItem.deleteMany({
    where: { request: { companyId: COMPANY_ID } },
  });
  await prisma.purchaseRequest.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.materialRequisitionItem.deleteMany({
    where: { requisition: { companyId: COMPANY_ID } },
  });
  await prisma.materialRequisition.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.consumablesRequisitionItem.deleteMany({
    where: { requisition: { companyId: COMPANY_ID } },
  });
  await prisma.consumablesRequisition.deleteMany({
    where: { companyId: COMPANY_ID },
  });
  await prisma.vehicleApplication.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.vehicleRefueling.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.inspectionRepair.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.officialSeal.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.projectSeal.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.exitPermitItem.deleteMany({
    where: { request: { companyId: COMPANY_ID } },
  });
  await prisma.exitPermit.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.fieldMovementEntry.deleteMany({
    where: { log: { companyId: COMPANY_ID } },
  });
  await prisma.fieldMovementLog.deleteMany({ where: { companyId: COMPANY_ID } });

  console.log('✓ HR module data cleared');
}

async function main(): Promise<void> {
  console.log('Starting HR demo seed...');

  const msDong = await prisma.user.findFirstOrThrow({
    where: { employeeId: 'EM-049', companyId: COMPANY_ID },
    select: { id: true, firstName: true, lastName: true, departmentId: true },
  });
  const mrZheng = await prisma.user.findFirstOrThrow({
    where: { employeeId: 'EM-061', companyId: COMPANY_ID },
    select: { id: true },
  });
  const hrManagerRole = await prisma.role.findFirstOrThrow({
    where: { name: 'HR Manager', companyId: COMPANY_ID, deletedAt: null },
    select: { id: true },
  });
  const disciplineLeadRole = await prisma.role.findFirstOrThrow({
    where: { name: 'Discipline Lead', companyId: COMPANY_ID, deletedAt: null },
    select: { id: true },
  });

  // Architecture is d100…0007 in this DB (prompt’s …0003 is Structure(Road)).
  const architecture = await prisma.discipline.findFirstOrThrow({
    where: { companyId: COMPANY_ID, name: 'Architecture', deletedAt: null },
    select: { id: true, name: true },
  });

  const leaveCategory = await prisma.approvalCategory.findFirstOrThrow({
    where: { companyId: COMPANY_ID, code: 'LEAVE_REQUEST', deletedAt: null },
    select: { id: true, numberPrefix: true },
  });
  const overtimeCategory = await prisma.approvalCategory.findFirstOrThrow({
    where: {
      companyId: COMPANY_ID,
      code: 'OVERTIME_APPLICATION',
      deletedAt: null,
    },
    select: { id: true, numberPrefix: true },
  });
  const flightCategory = await prisma.approvalCategory.findFirstOrThrow({
    where: {
      companyId: COMPANY_ID,
      code: 'FLIGHT_APPLICATION',
      deletedAt: null,
    },
    select: { id: true, numberPrefix: true },
  });
  const exitPermitCategory = await prisma.approvalCategory.findFirstOrThrow({
    where: { companyId: COMPANY_ID, code: 'EXIT_PERMIT', deletedAt: null },
    select: { id: true, numberPrefix: true },
  });
  const perDiemCategory = await ensurePerDiemCategory(ADMIN_USER_ID);

  console.log('✓ IDs resolved');
  console.log(`  Architecture discipline: ${architecture.id}`);
  console.log(`  Ms. Dong: ${msDong.id}`);
  console.log(`  Mr. Zheng: ${mrZheng.id}`);

  await clearHrModuleData();

  console.log('Setting up Ms. Dong as HR Manager...');
  await prisma.userRole.update({
    where: { id: MS_DONG_USER_ROLE_ID },
    data: {
      roleId: hrManagerRole.id,
      updatedBy: ADMIN_USER_ID,
    },
  });
  console.log('✓ Ms. Dong is now HR Manager (EM-049)');

  console.log('Setting Samuel as Architecture Discipline Lead...');
  await prisma.discipline.update({
    where: { id: architecture.id },
    data: {
      leaderId: SAMUEL_ID,
      updatedBy: ADMIN_USER_ID,
    },
  });

  await prisma.user.update({
    where: { id: SAMUEL_ID },
    data: {
      engineeringDisciplineId: architecture.id,
      updatedBy: ADMIN_USER_ID,
    },
  });

  const demoEmployeeIds = Object.values(EMPLOYEES);
  await prisma.user.updateMany({
    where: { id: { in: demoEmployeeIds }, companyId: COMPANY_ID },
    data: {
      engineeringDisciplineId: architecture.id,
      updatedBy: ADMIN_USER_ID,
    },
  });

  const existingDl = await prisma.userRole.findFirst({
    where: {
      userId: SAMUEL_ID,
      roleId: disciplineLeadRole.id,
      deletedAt: null,
    },
  });
  if (!existingDl) {
    await prisma.userRole.create({
      data: {
        id: randomUUID(),
        userId: SAMUEL_ID,
        roleId: disciplineLeadRole.id,
        isPrimary: false,
        assignedAt: new Date(),
        assignedBy: ADMIN_USER_ID,
        createdBy: ADMIN_USER_ID,
        updatedBy: ADMIN_USER_ID,
      },
    });
  }
  console.log('✓ Samuel is Architecture Discipline Lead (EM-092)');

  async function createApprovalRequest(opts: {
    categoryId: string;
    title: string;
    requestedBy: string;
    tiers: TierSpec[];
    status: DemoStatus;
    numberPrefix: string;
    counter: number;
  }): Promise<{ requestId: string; requestNumber: string }> {
    const requestNumber = `${opts.numberPrefix}-${String(opts.counter).padStart(4, '0')}`;
    const now = new Date();
    const tierState = buildTierState(opts.tiers, opts.status);
    const terminal = opts.status === 'APPROVED' || opts.status === 'REJECTED';

    const request = await prisma.approvalRequest.create({
      data: {
        id: randomUUID(),
        companyId: COMPANY_ID,
        categoryId: opts.categoryId,
        requestNumber,
        title: opts.title,
        requestedBy: opts.requestedBy,
        status: opts.status as ApprovalRequestStatus,
        currentTier: tierState.currentTier,
        formData: {},
        matchedRuleName: 'HR demo seed',
        submittedAt: now,
        completedAt: terminal ? now : null,
        createdBy: opts.requestedBy,
        updatedBy: opts.requestedBy,
        tiers: {
          create: tierState.tiers.map((tier) => ({
            id: randomUUID(),
            tierOrder: tier.order,
            label: tier.label,
            approverId: tier.approverId,
            resolver: tier.resolver,
            decision: tier.decision,
            comment: tier.comment,
            decidedAt:
              tier.decision !== ApprovalTierDecision.PENDING ? now : null,
          })),
        },
      },
    });

    return { requestId: request.id, requestNumber };
  }

  const standardTiers: TierSpec[] = [
    {
      label: 'Discipline Lead',
      approverId: SAMUEL_ID,
      order: 1,
      resolver: 'DISCIPLINE_LEAD',
    },
    {
      label: 'HR Manager',
      approverId: msDong.id,
      order: 2,
      resolver: 'ROLE:HR Manager',
    },
  ];

  const flightTiers: TierSpec[] = [
    {
      label: 'Discipline Lead',
      approverId: SAMUEL_ID,
      order: 1,
      resolver: 'DISCIPLINE_LEAD',
    },
    {
      label: 'General Manager',
      approverId: mrZheng.id,
      order: 2,
      resolver: 'ROLE:General Manager',
    },
    {
      label: 'HR Manager',
      approverId: msDong.id,
      order: 3,
      resolver: 'ROLE:HR Manager',
    },
  ];

  const msDongOwnTiers: TierSpec[] = [
    {
      label: 'General Manager',
      approverId: mrZheng.id,
      order: 1,
      resolver: 'ROLE:General Manager',
    },
  ];

  // ── Leave ──────────────────────────────────────────────────────────────
  console.log('Seeding leave requests...');
  let leaveCounter = 1;

  async function createLeave(opts: {
    employeeId: string;
    leaveType: LeaveType;
    status: DemoStatus;
    title: string;
    reason: string;
    start: string;
    end: string;
    days: number;
    tiers: TierSpec[];
  }): Promise<void> {
    const ar = await createApprovalRequest({
      categoryId: leaveCategory.id,
      title: opts.title,
      requestedBy: opts.employeeId,
      tiers: opts.tiers,
      status: opts.status,
      numberPrefix: leaveCategory.numberPrefix,
      counter: leaveCounter++,
    });

    const startDate = new Date(opts.start);
    const endDate = new Date(opts.end);
    const terminal = opts.status === 'APPROVED' || opts.status === 'REJECTED';

    await prisma.leaveRequest.create({
      data: {
        id: randomUUID(),
        companyId: COMPANY_ID,
        employeeId: opts.employeeId,
        leaveType: opts.leaveType,
        status: opts.status as LeaveRequestStatus,
        reason: opts.reason,
        startDate,
        endDate,
        days: new Prisma.Decimal(opts.days),
        approvalRequestId: ar.requestId,
        requestNumber: ar.requestNumber,
        submittedAt: new Date(),
        completedAt: terminal ? new Date() : null,
        createdBy: opts.employeeId,
        updatedBy: opts.employeeId,
        periods: {
          create: [
            {
              id: randomUUID(),
              startDate,
              endDate,
              days: new Prisma.Decimal(opts.days),
            },
          ],
        },
      },
    });

    const used = opts.status === 'APPROVED' ? opts.days : 0;
    const pending = ['SUBMITTED', 'IN_REVIEW'].includes(opts.status)
      ? opts.days
      : 0;
    await prisma.leaveBalance.upsert({
      where: {
        companyId_employeeId_year_leaveType: {
          companyId: COMPANY_ID,
          employeeId: opts.employeeId,
          year: 2026,
          leaveType: opts.leaveType,
        },
      },
      create: {
        id: randomUUID(),
        companyId: COMPANY_ID,
        employeeId: opts.employeeId,
        year: 2026,
        leaveType: opts.leaveType,
        entitled: 20,
        used,
        pending,
      },
      update: { used, pending },
    });
  }

  await createLeave({
    employeeId: EMPLOYEES.armias,
    leaveType: LeaveType.ANNUAL,
    status: 'SUBMITTED',
    title: 'Annual Leave - Armias Habtu',
    reason: 'Family visit to Gondar',
    start: '2026-10-05',
    end: '2026-10-09',
    days: 5,
    tiers: standardTiers,
  });
  await createLeave({
    employeeId: EMPLOYEES.dagmawi,
    leaveType: LeaveType.SICK,
    status: 'IN_REVIEW',
    title: 'Sick Leave - Dagmawi Tesfaye',
    reason: 'Medical treatment',
    start: '2026-09-28',
    end: '2026-09-30',
    days: 3,
    tiers: standardTiers,
  });
  await createLeave({
    employeeId: EMPLOYEES.heaven,
    leaveType: LeaveType.ANNUAL,
    status: 'APPROVED',
    title: 'Annual Leave - Heaven Jada',
    reason: 'Annual family vacation',
    start: '2026-09-15',
    end: '2026-09-19',
    days: 5,
    tiers: standardTiers,
  });
  await createLeave({
    employeeId: EMPLOYEES.naod,
    leaveType: LeaveType.ANNUAL,
    status: 'RETURNED',
    title: 'Annual Leave - Naod Kiflu',
    reason: 'Personal travel',
    start: '2026-10-12',
    end: '2026-10-16',
    days: 5,
    tiers: standardTiers,
  });
  await createLeave({
    employeeId: msDong.id,
    leaveType: LeaveType.ANNUAL,
    status: 'SUBMITTED',
    title: 'Annual Leave - Jinxia Dong',
    reason: 'National holiday travel',
    start: '2026-10-01',
    end: '2026-10-03',
    days: 3,
    tiers: msDongOwnTiers,
  });
  console.log(`✓ ${leaveCounter - 1} leave requests seeded`);

  // ── Overtime ───────────────────────────────────────────────────────────
  console.log('Seeding overtime sheets...');
  let otCounter = 1;

  async function createOvertime(opts: {
    employeeId: string;
    month: number;
    year: number;
    status: DemoStatus;
    title: string;
    entries: Array<{
      date: string;
      start: string;
      end: string;
      isHoliday: boolean;
      task: string;
    }>;
  }): Promise<void> {
    const ar = await createApprovalRequest({
      categoryId: overtimeCategory.id,
      title: opts.title,
      requestedBy: opts.employeeId,
      tiers: standardTiers,
      status: opts.status,
      numberPrefix: overtimeCategory.numberPrefix,
      counter: otCounter++,
    });

    let totalRegular = 0;
    let totalNight = 0;
    let totalWeekend = 0;
    let totalHoliday = 0;
    const processed = opts.entries.map((entry) => {
      const hours = calculateOvertimeHours(
        new Date(entry.date),
        entry.start,
        entry.end,
        {
          isHoliday: entry.isHoliday,
          isWorkingDay: !entry.isHoliday && ![0, 6].includes(new Date(entry.date).getUTCDay()),
          isHalfDay: false,
          morningStart: '08:30',
          morningEnd: '12:30',
          afternoonStart: '13:30',
          afternoonEnd: '17:30',
        },
        false,
      );
      totalRegular += hours.regularHours;
      totalNight += hours.nightHours;
      totalWeekend += hours.weekendHours;
      totalHoliday += hours.holidayHours;
      return { ...entry, ...hours };
    });

    const terminal = opts.status === 'APPROVED' || opts.status === 'REJECTED';
    const sheet = await prisma.overtimeSheet.create({
      data: {
        id: randomUUID(),
        companyId: COMPANY_ID,
        sheetNumber: ar.requestNumber,
        employeeId: opts.employeeId,
        month: opts.month,
        year: opts.year,
        status: opts.status as OvertimeSheetStatus,
        totalRegularHours: totalRegular,
        totalNightHours: totalNight,
        totalWeekendHours: totalWeekend,
        totalHolidayHours: totalHoliday,
        approvalRequestId: ar.requestId,
        submittedAt: new Date(),
        completedAt: terminal ? new Date() : null,
        createdBy: opts.employeeId,
        updatedBy: opts.employeeId,
      },
    });

    for (const entry of processed) {
      await prisma.overtimeEntry.create({
        data: {
          id: randomUUID(),
          sheetId: sheet.id,
          date: new Date(entry.date),
          startTime: timeAt(entry.start),
          endTime: timeAt(entry.end),
          isHoliday: entry.isHoliday,
          regularHours: entry.regularHours,
          nightHours: entry.nightHours,
          weekendHours: entry.weekendHours,
          holidayHours: entry.holidayHours,
          taskDescription: entry.task,
        },
      });
    }
  }

  await createOvertime({
    employeeId: EMPLOYEES.hailab,
    month: 9,
    year: 2026,
    status: 'SUBMITTED',
    title: 'Overtime - Hailab Getu - September 2026',
    entries: [
      {
        date: '2026-09-06',
        start: '18:00',
        end: '22:00',
        isHoliday: false,
        task: 'Design review overtime',
      },
      {
        date: '2026-09-07',
        start: '09:00',
        end: '17:00',
        isHoliday: false,
        task: 'Sunday project completion',
      },
      {
        date: '2026-09-13',
        start: '09:00',
        end: '17:00',
        isHoliday: false,
        task: 'Weekend deadline work',
      },
    ],
  });
  await createOvertime({
    employeeId: EMPLOYEES.armias,
    month: 8,
    year: 2026,
    status: 'APPROVED',
    title: 'Overtime - Armias Habtu - August 2026',
    entries: [
      {
        date: '2026-08-20',
        start: '18:00',
        end: '22:00',
        isHoliday: false,
        task: 'Drawing completion',
      },
      {
        date: '2026-08-27',
        start: '18:00',
        end: '22:00',
        isHoliday: false,
        task: 'Client presentation prep',
      },
    ],
  });
  console.log(`✓ ${otCounter - 1} overtime sheets seeded`);

  // ── Flights ────────────────────────────────────────────────────────────
  console.log('Seeding flight applications...');
  let flightCounter = 1;

  async function createFlight(opts: {
    employeeId: string;
    status: DemoStatus;
    title: string;
    destination: string;
    departure: string;
    returnDate: string;
    purpose: string;
  }): Promise<void> {
    const ar = await createApprovalRequest({
      categoryId: flightCategory.id,
      title: opts.title,
      requestedBy: opts.employeeId,
      tiers: flightTiers,
      status: opts.status,
      numberPrefix: flightCategory.numberPrefix,
      counter: flightCounter++,
    });
    const terminal = opts.status === 'APPROVED' || opts.status === 'REJECTED';

    await prisma.flightApplication.create({
      data: {
        id: randomUUID(),
        companyId: COMPANY_ID,
        submittedBy: opts.employeeId,
        tripType: FlightTripType.ROUND_TRIP,
        isInternational: false,
        originCountry: 'Ethiopia',
        originCity: 'Addis Ababa',
        destination: opts.destination,
        departureDate: new Date(opts.departure),
        returnDate: new Date(opts.returnDate),
        purpose: opts.purpose,
        ticketClass: FlightTicketClass.ECONOMY,
        status: opts.status as FlightApplicationStatus,
        applicationNumber: ar.requestNumber,
        approvalRequestId: ar.requestId,
        submittedAt: new Date(),
        completedAt: terminal ? new Date() : null,
        createdBy: opts.employeeId,
        updatedBy: opts.employeeId,
        passengers: {
          create: [
            {
              id: randomUUID(),
              employeeId: opts.employeeId,
            },
          ],
        },
      },
    });
  }

  await createFlight({
    employeeId: EMPLOYEES.naod,
    status: 'SUBMITTED',
    title: 'Flight: Addis Ababa to Dire Dawa - Naod Kiflu',
    destination: 'Dire Dawa',
    departure: '2026-10-10',
    returnDate: '2026-10-14',
    purpose: 'Site inspection for Highway project',
  });
  await createFlight({
    employeeId: EMPLOYEES.heaven,
    status: 'APPROVED',
    title: 'Flight: Addis Ababa to Bahir Dar - Heaven Jada',
    destination: 'Bahir Dar',
    departure: '2026-09-10',
    returnDate: '2026-09-12',
    purpose: 'Client meeting and site review',
  });
  console.log(`✓ ${flightCounter - 1} flight applications seeded`);

  // ── Per diem ───────────────────────────────────────────────────────────
  console.log('Seeding per diem requests...');
  let perDiemCounter = 1;

  async function createPerDiem(opts: {
    employeeId: string;
    status: DemoStatus;
    title: string;
    destination: string;
    start: string;
    end: string;
    days: number;
    notes: string;
  }): Promise<void> {
    let rateRow = await prisma.employeePerDiemRate.findFirst({
      where: {
        companyId: COMPANY_ID,
        employeeId: opts.employeeId,
        deletedAt: null,
      },
    });
    if (!rateRow) {
      rateRow = await prisma.employeePerDiemRate.create({
        data: {
          id: randomUUID(),
          companyId: COMPANY_ID,
          employeeId: opts.employeeId,
          domesticRate: 1000,
          currency: SupportedCurrency.ETB,
          createdBy: ADMIN_USER_ID,
          updatedBy: ADMIN_USER_ID,
        },
      });
    }

    const dailyRate = Number(rateRow.domesticRate ?? 1000);
    const totalAmount = dailyRate * opts.days;
    const ar = await createApprovalRequest({
      categoryId: perDiemCategory.id,
      title: opts.title,
      requestedBy: opts.employeeId,
      tiers: standardTiers,
      status: opts.status,
      numberPrefix: perDiemCategory.numberPrefix,
      counter: perDiemCounter++,
    });
    const terminal = opts.status === 'APPROVED' || opts.status === 'REJECTED';

    await prisma.perDiemRequest.create({
      data: {
        id: randomUUID(),
        companyId: COMPANY_ID,
        employeeId: opts.employeeId,
        employeePerDiemRateId: rateRow.id,
        status: opts.status as PerDiemStatus,
        requestNumber: ar.requestNumber,
        approvalRequestId: ar.requestId,
        startDate: new Date(opts.start),
        endDate: new Date(opts.end),
        destination: opts.destination,
        destinationCategory: 'Domestic',
        days: opts.days,
        dailyRate,
        currency: rateRow.currency,
        totalAmount,
        totalAmountEtb: totalAmount,
        exchangeRate: 1,
        notes: opts.notes,
        submittedAt: new Date(),
        completedAt: terminal ? new Date() : null,
        createdBy: opts.employeeId,
        updatedBy: opts.employeeId,
      },
    });
  }

  await createPerDiem({
    employeeId: EMPLOYEES.dagmawi,
    status: 'SUBMITTED',
    title: 'Per Diem - Dagmawi Tesfaye - October 2026',
    destination: 'Dire Dawa',
    start: '2026-10-10',
    end: '2026-10-14',
    days: 5,
    notes: 'Field work per diem',
  });
  await createPerDiem({
    employeeId: EMPLOYEES.hailab,
    status: 'APPROVED',
    title: 'Per Diem - Hailab Getu - September 2026',
    destination: 'Hawassa',
    start: '2026-09-15',
    end: '2026-09-18',
    days: 4,
    notes: 'Approved site visit',
  });
  console.log(`✓ ${perDiemCounter - 1} per diem requests seeded`);

  // ── Exit permits ───────────────────────────────────────────────────────
  console.log('Seeding exit permits...');
  let exitCounter = 1;

  async function createExitPermit(opts: {
    employeeId: string;
    status: DemoStatus;
    title: string;
    date: string;
    itemName: string;
    issue: string;
  }): Promise<void> {
    const ar = await createApprovalRequest({
      categoryId: exitPermitCategory.id,
      title: opts.title,
      requestedBy: opts.employeeId,
      tiers: standardTiers,
      status: opts.status,
      numberPrefix: exitPermitCategory.numberPrefix,
      counter: exitCounter++,
    });
    const terminal = opts.status === 'APPROVED' || opts.status === 'REJECTED';
    const employee = await prisma.user.findUniqueOrThrow({
      where: { id: opts.employeeId },
      select: { departmentId: true },
    });

    await prisma.exitPermit.create({
      data: {
        id: randomUUID(),
        companyId: COMPANY_ID,
        employeeId: opts.employeeId,
        departmentId: employee.departmentId ?? msDong.departmentId,
        status: opts.status as ExitPermitStatus,
        requestNumber: ar.requestNumber,
        approvalRequestId: ar.requestId,
        direction: ExitDirection.EXIT,
        date: new Date(opts.date),
        submittedAt: new Date(),
        submittedBy: opts.employeeId,
        completedAt: terminal ? new Date() : null,
        createdBy: opts.employeeId,
        updatedBy: opts.employeeId,
        items: {
          create: [
            {
              id: randomUUID(),
              itemName: opts.itemName,
              issue: opts.issue,
              quantity: 1,
              unit: 'set',
            },
          ],
        },
      },
    });
  }

  await createExitPermit({
    employeeId: EMPLOYEES.armias,
    status: 'SUBMITTED',
    title: 'Exit Permit - Armias Habtu',
    date: '2026-10-08',
    itemName: 'A1 drawing rolls (5), USB drive with digital files',
    issue: 'Submitting drawings to client office - Ministry of Works, Addis Ababa',
  });
  await createExitPermit({
    employeeId: EMPLOYEES.naod,
    status: 'APPROVED',
    title: 'Exit Permit - Naod Kiflu',
    date: '2026-09-20',
    itemName: 'Tender documents (3 copies), company stamp',
    issue: 'Delivery of tender documents - Ethiopian Roads Authority',
  });
  console.log(`✓ ${exitCounter - 1} exit permits seeded`);

  const arCount = await prisma.approvalRequest.count({
    where: { companyId: COMPANY_ID, deletedAt: null },
  });
  const tierCount = await prisma.approvalTier.count({
    where: { request: { companyId: COMPANY_ID } },
  });

  console.log('\n✅ HR demo seed complete');
  console.log(
    `  Discipline Lead: Samuel Hailemariam (EM-092) → ${architecture.name}`,
  );
  console.log('  HR Manager: Jinxia Dong (EM-049)');
  console.log('  General Manager: Lintao Zheng (EM-061)');
  console.log('\n  Seeded requests:');
  console.log(`  · ${leaveCounter - 1} leave requests`);
  console.log(`  · ${otCounter - 1} overtime sheets`);
  console.log(`  · ${flightCounter - 1} flight applications`);
  console.log(`  · ${perDiemCounter - 1} per diem requests`);
  console.log(`  · ${exitCounter - 1} exit permits`);
  console.log(`  · approval_request: ${arCount}`);
  console.log(`  · approval_tier: ${tierCount}`);
  console.log('\n  Test accounts:');
  console.log(
    '  · Armias Habtu (EM-010) - leave SUBMITTED, overtime APPROVED, exit SUBMITTED',
  );
  console.log(
    '  · Dagmawi Tesfaye (EM-021) - leave IN_REVIEW, per diem SUBMITTED',
  );
  console.log(
    '  · Hailab Getu (EM-038) - overtime SUBMITTED, per diem APPROVED',
  );
  console.log('  · Heaven Jada (EM-043) - leave APPROVED, flight APPROVED');
  console.log(
    '  · Naod Kiflu (EM-080) - leave RETURNED, flight SUBMITTED, exit APPROVED',
  );
  console.log('  · Ms. Dong (EM-049) - own leave SUBMITTED → goes to GM');
  console.log('\n  Approval chains:');
  console.log('  · Standard: Samuel (DL) → Ms. Dong (HR Manager)');
  console.log(
    '  · Flight: Samuel (DL) → Mr. Zheng (GM) → Ms. Dong (HR Manager)',
  );
  console.log('  · Ms. Dong own: Mr. Zheng (GM)');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
