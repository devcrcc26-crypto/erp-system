/**
 * Wipes and reseeds HR module test data (leave, overtime, flight, business trip)
 * with 10 realistic records per module, each carrying a full approval chain that
 * reflects its final status.
 *
 * Run: npx ts-node --transpile-only prisma/seeds/hr-test-data.seed.ts
 */
import { randomUUID } from 'crypto';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
  BusinessTripStatus,
  FlightApplicationStatus,
  FlightTicketClass,
  FlightTripType,
  LeaveRequestStatus,
  LeaveType,
  OvertimeSheetStatus,
  Prisma,
  PrismaClient,
  User,
} from '@prisma/client';
import { calculateOvertimeHours } from '../../src/modules/overtime/application/utils/overtime-hours.util';

const prisma = new PrismaClient();

/** Status values shared structurally across the four HR request statuses. */
type HrRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

type UserWithDisciplineLeader = User & {
  engineeringDiscipline: { leader: User | null } | null;
};

interface ChainContext {
  xiaomingLi: User;
  jinxia: User;
  davidWu: User;
}

interface TierDraft {
  order: number;
  label: string;
  approverId: string;
  resolver: string;
  decision: ApprovalTierDecision;
  comment: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Approval chain helpers
// ────────────────────────────────────────────────────────────────────────────

function buildTierDecisions(
  tiers: { order: number; label: string; approverId: string; resolver: string }[],
  finalStatus: HrRequestStatus,
): { currentTier: number; tiers: TierDraft[] } {
  if (finalStatus === 'APPROVED') {
    return {
      currentTier: tiers[tiers.length - 1].order,
      tiers: tiers.map((t) => ({
        ...t,
        decision: ApprovalTierDecision.APPROVED,
        comment: 'Approved.',
      })),
    };
  }
  if (finalStatus === 'REJECTED') {
    return {
      currentTier: tiers[0].order,
      tiers: tiers.map((t, i) => ({
        ...t,
        decision:
          i === 0 ? ApprovalTierDecision.REJECTED : ApprovalTierDecision.PENDING,
        comment: i === 0 ? 'Not authorized for this period.' : null,
      })),
    };
  }
  if (finalStatus === 'RETURNED') {
    return {
      currentTier: tiers[0].order,
      tiers: tiers.map((t, i) => ({
        ...t,
        decision:
          i === 0 ? ApprovalTierDecision.RETURNED : ApprovalTierDecision.PENDING,
        comment: i === 0 ? 'Please provide additional details.' : null,
      })),
    };
  }
  if (finalStatus === 'IN_REVIEW') {
    return {
      currentTier: tiers[1]?.order ?? tiers[0].order,
      tiers: tiers.map((t, i) => ({
        ...t,
        decision:
          i === 0 ? ApprovalTierDecision.APPROVED : ApprovalTierDecision.PENDING,
        comment: i === 0 ? 'Approved at discipline level.' : null,
      })),
    };
  }
  // SUBMITTED / DRAFT / CANCELLED - nothing decided yet.
  return {
    currentTier: tiers[0].order,
    tiers: tiers.map((t) => ({
      ...t,
      decision: ApprovalTierDecision.PENDING,
      comment: null,
    })),
  };
}

/**
 * Builds a Discipline Lead → HR Officer → (optional) General Manager approval
 * request whose tier decisions already reflect the requested final status.
 */
async function createApprovalChain(
  ctx: ChainContext,
  params: {
    employeeId: string;
    categoryCode: string;
    title: string;
    status: HrRequestStatus;
    companyId: string;
    /** When provided, the General Manager tier is only added when days > 3. */
    days?: number;
  },
): Promise<{ id: string; requestNumber: string }> {
  const { employeeId, categoryCode, title, status, companyId, days } = params;

  const employee = (await prisma.user.findUnique({
    where: { id: employeeId },
    include: { engineeringDiscipline: { include: { leader: true } } },
  })) as UserWithDisciplineLeader | null;

  const disciplineLead = employee?.engineeringDiscipline?.leader;
  const includeGm =
    categoryCode === 'LEAVE_REQUEST'
      ? false
      : days !== undefined
        ? days > 3
        : true;

  const draftTiers = [
    {
      order: 1,
      label: 'Discipline Lead',
      approverId: disciplineLead?.id ?? ctx.xiaomingLi.id,
      resolver: 'DISCIPLINE_LEAD',
    },
    {
      order: 2,
      label: 'HR Officer',
      approverId: ctx.jinxia.id,
      resolver: 'ROLE:HR Officer',
    },
    ...(includeGm
      ? [
          {
            order: 3,
            label: 'General Manager',
            approverId: ctx.davidWu.id,
            resolver: 'ROLE:General Manager',
          },
        ]
      : []),
  ].filter(
    (tier, index, self) =>
      self.findIndex((t) => t.approverId === tier.approverId) === index,
  );

  const category = await prisma.approvalCategory.findFirst({
    where: { code: categoryCode, companyId },
  });
  if (!category) {
    throw new Error(
      `Approval category "${categoryCode}" not found for company ${companyId}`,
    );
  }

  const seq = await prisma.$queryRaw<
    Array<{ nextval: bigint | number }>
  >`SELECT nextval('approval_request_number_seq') as nextval`;
  const requestNumber = `${category.numberPrefix}-${String(
    Number(seq[0]?.nextval ?? 1),
  ).padStart(4, '0')}`;

  const tierDecisions = buildTierDecisions(draftTiers, status);

  const approvalRequest = await prisma.approvalRequest.create({
    data: {
      companyId,
      categoryId: category.id,
      requestNumber,
      title,
      status: status as ApprovalRequestStatus,
      requestedBy: employeeId,
      currentTier: tierDecisions.currentTier,
      submittedAt: new Date(),
      completedAt: ['APPROVED', 'REJECTED'].includes(status) ? new Date() : null,
      createdBy: employeeId,
      updatedBy: employeeId,
      tiers: {
        create: tierDecisions.tiers.map((t) => ({
          id: randomUUID(),
          tierOrder: t.order,
          label: t.label,
          approverId: t.approverId,
          resolver: t.resolver,
          decision: t.decision,
          comment: t.comment,
          decidedAt: t.decision !== ApprovalTierDecision.PENDING ? new Date() : null,
        })),
      },
    },
  });

  return { id: approvalRequest.id, requestNumber: approvalRequest.requestNumber };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4 - Leave requests
// ────────────────────────────────────────────────────────────────────────────

async function seedLeaveRequests(
  ctx: ChainContext,
  companyId: string,
  weiChen: User,
  otherEmployees: User[],
): Promise<void> {
  console.log('Seeding leave requests...');

  const leaveData: Array<{
    employee: User;
    type: LeaveType;
    start: string;
    end: string;
    days: number;
    reason: string;
    status: HrRequestStatus;
  }> = [
    { employee: weiChen, type: LeaveType.ANNUAL, start: '2026-08-10', end: '2026-08-12', days: 3, reason: 'Family visit', status: 'APPROVED' },
    { employee: weiChen, type: LeaveType.SICK, start: '2026-07-15', end: '2026-07-16', days: 2, reason: 'Medical appointment', status: 'APPROVED' },
    { employee: weiChen, type: LeaveType.ANNUAL, start: '2026-09-01', end: '2026-09-05', days: 5, reason: 'Extended family trip', status: 'IN_REVIEW' },
    { employee: otherEmployees[0], type: LeaveType.ANNUAL, start: '2026-08-18', end: '2026-08-20', days: 3, reason: 'Personal holiday', status: 'APPROVED' },
    { employee: otherEmployees[0], type: LeaveType.EMERGENCY, start: '2026-07-28', end: '2026-07-28', days: 1, reason: 'Family emergency', status: 'APPROVED' },
    { employee: otherEmployees[1], type: LeaveType.SICK, start: '2026-08-05', end: '2026-08-07', days: 3, reason: 'Flu recovery', status: 'RETURNED' },
    { employee: otherEmployees[1], type: LeaveType.ANNUAL, start: '2026-09-10', end: '2026-09-15', days: 5, reason: 'Summer holiday', status: 'SUBMITTED' },
    { employee: otherEmployees[2], type: LeaveType.UNPAID, start: '2026-08-25', end: '2026-08-29', days: 5, reason: 'Personal reasons', status: 'REJECTED' },
    { employee: otherEmployees[2], type: LeaveType.ANNUAL, start: '2026-10-01', end: '2026-10-03', days: 3, reason: 'National holiday extension', status: 'SUBMITTED' },
    { employee: otherEmployees[3], type: LeaveType.ANNUAL, start: '2026-08-11', end: '2026-08-15', days: 5, reason: 'Vacation', status: 'APPROVED' },
  ];

  for (const leave of leaveData) {
    const approvalRequest = await createApprovalChain(ctx, {
      employeeId: leave.employee.id,
      categoryCode: 'LEAVE_REQUEST',
      title: `${leave.type} leave - ${leave.start} to ${leave.end}`,
      status: leave.status,
      companyId,
      days: leave.days,
    });

    await prisma.leaveRequest.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber: approvalRequest.requestNumber,
        employeeId: leave.employee.id,
        leaveType: leave.type,
        startDate: new Date(leave.start),
        endDate: new Date(leave.end),
        days: new Prisma.Decimal(leave.days),
        reason: leave.reason,
        status: leave.status as LeaveRequestStatus,
        approvalRequestId: approvalRequest.id,
        submittedAt: new Date(),
        completedAt: ['APPROVED', 'REJECTED'].includes(leave.status)
          ? new Date()
          : null,
        createdBy: leave.employee.id,
        updatedBy: leave.employee.id,
      },
    });

    const used = leave.status === 'APPROVED' ? leave.days : 0;
    const pending = ['SUBMITTED', 'IN_REVIEW'].includes(leave.status)
      ? leave.days
      : 0;

    await prisma.leaveBalance.upsert({
      where: {
        companyId_employeeId_year_leaveType: {
          companyId,
          employeeId: leave.employee.id,
          year: 2026,
          leaveType: leave.type,
        },
      },
      create: {
        id: randomUUID(),
        companyId,
        employeeId: leave.employee.id,
        year: 2026,
        leaveType: leave.type,
        entitled: 20,
        used,
        pending,
      },
      update: {
        used: { increment: used },
        pending: { increment: pending },
      },
    });
  }

  console.log('✓ Leave requests seeded');
}

// ────────────────────────────────────────────────────────────────────────────
// Step 5 - Overtime sheets
// ────────────────────────────────────────────────────────────────────────────

interface OvertimeEntrySeed {
  date: string;
  start: string;
  end: string;
  isHoliday: boolean;
  task: string;
}

interface OvertimeSheetSeed {
  employee: User;
  month: number;
  year: number;
  status: HrRequestStatus;
  entries: OvertimeEntrySeed[];
}

async function seedOvertimeSheets(
  ctx: ChainContext,
  companyId: string,
  weiChen: User,
  otherEmployees: User[],
): Promise<void> {
  console.log('Seeding overtime sheets...');

  const overtimeSheets: OvertimeSheetSeed[] = [
    {
      employee: weiChen, month: 7, year: 2026, status: 'APPROVED',
      entries: [
        { date: '2026-07-27', start: '18:00', end: '21:00', isHoliday: false, task: 'Structural drawing revisions' },
        { date: '2026-07-28', start: '20:00', end: '23:00', isHoliday: false, task: 'Foundation calculation review' },
        { date: '2026-07-26', start: '09:00', end: '17:00', isHoliday: false, task: 'Site inspection report' },
      ],
    },
    {
      employee: weiChen, month: 6, year: 2026, status: 'APPROVED',
      entries: [
        { date: '2026-06-15', start: '18:00', end: '22:00', isHoliday: false, task: 'Client deliverable preparation' },
        { date: '2026-06-20', start: '08:00', end: '12:00', isHoliday: true, task: 'Emergency coordination meeting' },
      ],
    },
    {
      employee: otherEmployees[0], month: 7, year: 2026, status: 'IN_REVIEW',
      entries: [
        { date: '2026-07-22', start: '18:00', end: '21:00', isHoliday: false, task: 'Design package review' },
        { date: '2026-07-25', start: '19:00', end: '22:00', isHoliday: false, task: 'Drawing revisions for submission' },
      ],
    },
    {
      employee: otherEmployees[0], month: 6, year: 2026, status: 'APPROVED',
      entries: [
        { date: '2026-06-10', start: '17:00', end: '21:00', isHoliday: false, task: 'Project deadline preparation' },
      ],
    },
    {
      employee: otherEmployees[1], month: 7, year: 2026, status: 'SUBMITTED',
      entries: [
        { date: '2026-07-30', start: '18:00', end: '22:00', isHoliday: false, task: 'Technical specification update' },
        { date: '2026-07-31', start: '20:00', end: '23:00', isHoliday: false, task: 'Final review before submission' },
      ],
    },
    {
      employee: otherEmployees[1], month: 6, year: 2026, status: 'RETURNED',
      entries: [
        { date: '2026-06-28', start: '18:00', end: '20:00', isHoliday: false, task: 'Report compilation' },
      ],
    },
    {
      employee: otherEmployees[2], month: 7, year: 2026, status: 'APPROVED',
      entries: [
        { date: '2026-07-14', start: '18:00', end: '22:00', isHoliday: false, task: 'Coordination meeting preparation' },
        { date: '2026-07-20', start: '09:00', end: '13:00', isHoliday: false, task: 'Weekend site inspection' },
      ],
    },
    {
      employee: otherEmployees[2], month: 5, year: 2026, status: 'APPROVED',
      entries: [
        { date: '2026-05-25', start: '19:00', end: '23:00', isHoliday: false, task: 'Deadline submission preparation' },
      ],
    },
    {
      employee: otherEmployees[3], month: 7, year: 2026, status: 'REJECTED',
      entries: [
        { date: '2026-07-10', start: '18:00', end: '20:00', isHoliday: false, task: 'Additional design work' },
      ],
    },
    {
      employee: otherEmployees[3], month: 6, year: 2026, status: 'APPROVED',
      entries: [
        { date: '2026-06-22', start: '17:00', end: '21:00', isHoliday: false, task: 'Client presentation preparation' },
        { date: '2026-06-23', start: '09:00', end: '13:00', isHoliday: false, task: 'Follow-up documentation' },
      ],
    },
  ];

  for (const sheet of overtimeSheets) {
    const approvalRequest = await createApprovalChain(ctx, {
      employeeId: sheet.employee.id,
      categoryCode: 'OVERTIME_APPLICATION',
      title: `Overtime sheet - ${sheet.year}-${String(sheet.month).padStart(2, '0')}`,
      status: sheet.status,
      companyId,
    });

    const processedEntries = sheet.entries.map((entry) => {
      const date = new Date(`${entry.date}T00:00:00.000Z`);
      const dayOfWeek = date.getUTCDay();
      const isHalfDay = dayOfWeek === 6;
      const isWorkingDay = dayOfWeek !== 0;
      const hours = calculateOvertimeHours(date, entry.start, entry.end, {
        isHoliday: entry.isHoliday,
        isWorkingDay,
        isHalfDay,
        morningStart: '08:30',
        morningEnd: '12:30',
        afternoonStart: isWorkingDay && !isHalfDay ? '13:30' : null,
        afternoonEnd: isWorkingDay && !isHalfDay ? '17:30' : null,
      });
      return { ...entry, ...hours };
    });

    const totalRegular = processedEntries.reduce((s, e) => s + e.regularHours, 0);
    const totalNight = processedEntries.reduce((s, e) => s + e.nightHours, 0);
    const totalWeekend = processedEntries.reduce((s, e) => s + e.weekendHours, 0);
    const totalHoliday = processedEntries.reduce((s, e) => s + e.holidayHours, 0);

    const seq = await prisma.$queryRaw<
      Array<{ nextval: bigint | number }>
    >`SELECT nextval('overtime_sheet_number_seq') as nextval`;
    const sheetNumber = `OT-${String(Number(seq[0]?.nextval ?? 1)).padStart(4, '0')}`;

    const overtimeSheet = await prisma.overtimeSheet.create({
      data: {
        id: randomUUID(),
        companyId,
        sheetNumber,
        employeeId: sheet.employee.id,
        month: sheet.month,
        year: sheet.year,
        status: sheet.status as OvertimeSheetStatus,
        totalRegularHours: totalRegular,
        totalNightHours: totalNight,
        totalWeekendHours: totalWeekend,
        totalHolidayHours: totalHoliday,
        approvalRequestId: approvalRequest.id,
        submittedAt: new Date(),
        completedAt: ['APPROVED', 'REJECTED'].includes(sheet.status)
          ? new Date()
          : null,
        createdBy: sheet.employee.id,
        updatedBy: sheet.employee.id,
      },
    });

    for (const entry of processedEntries) {
      await prisma.overtimeEntry.create({
        data: {
          id: randomUUID(),
          sheetId: overtimeSheet.id,
          date: new Date(entry.date),
          startTime: new Date(`1970-01-01T${entry.start}:00Z`),
          endTime: new Date(`1970-01-01T${entry.end}:00Z`),
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

  console.log('✓ Overtime sheets seeded');
}

// ────────────────────────────────────────────────────────────────────────────
// Step 6 - Flight applications
// ────────────────────────────────────────────────────────────────────────────

async function seedFlightApplications(
  ctx: ChainContext,
  companyId: string,
  weiChen: User,
  xiaomingLi: User,
  otherEmployees: User[],
): Promise<void> {
  console.log('Seeding flight applications...');

  const flightData: Array<{
    submittedBy: User;
    tripType: FlightTripType;
    isInternational: boolean;
    originCountry: string;
    originCity: string;
    destination: string;
    departureDate: string;
    returnDate: string | null;
    purpose: string;
    ticketClass: FlightTicketClass;
    /** COMPLETED is a seed-only label - written to the DB as APPROVED. */
    status: HrRequestStatus | 'COMPLETED';
    passengers: User[];
  }> = [
    { submittedBy: weiChen, tripType: FlightTripType.ROUND_TRIP, isInternational: false, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destination: 'Hawassa', departureDate: '2026-08-10', returnDate: '2026-08-12', purpose: 'Site inspection for structural works', ticketClass: FlightTicketClass.ECONOMY, status: 'COMPLETED', passengers: [weiChen] },
    { submittedBy: weiChen, tripType: FlightTripType.ROUND_TRIP, isInternational: false, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destination: 'Dire Dawa', departureDate: '2026-09-05', returnDate: '2026-09-07', purpose: 'Client coordination meeting', ticketClass: FlightTicketClass.ECONOMY, status: 'APPROVED', passengers: [weiChen] },
    { submittedBy: xiaomingLi, tripType: FlightTripType.ROUND_TRIP, isInternational: false, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destination: 'Bahir Dar', departureDate: '2026-08-20', returnDate: '2026-08-22', purpose: 'Project progress review', ticketClass: FlightTicketClass.ECONOMY, status: 'APPROVED', passengers: [xiaomingLi, weiChen] },
    { submittedBy: otherEmployees[0], tripType: FlightTripType.ONE_WAY, isInternational: false, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destination: 'Mekelle', departureDate: '2026-09-15', returnDate: null, purpose: 'Northern site assignment', ticketClass: FlightTicketClass.ECONOMY, status: 'IN_REVIEW', passengers: [otherEmployees[0]] },
    { submittedBy: otherEmployees[1], tripType: FlightTripType.ROUND_TRIP, isInternational: false, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destination: 'Jimma', departureDate: '2026-08-28', returnDate: '2026-08-30', purpose: 'Technical survey', ticketClass: FlightTicketClass.ECONOMY, status: 'SUBMITTED', passengers: [otherEmployees[1]] },
    { submittedBy: otherEmployees[2], tripType: FlightTripType.ROUND_TRIP, isInternational: false, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destination: 'Gondar', departureDate: '2026-07-20', returnDate: '2026-07-22', purpose: 'Design coordination', ticketClass: FlightTicketClass.ECONOMY, status: 'APPROVED', passengers: [otherEmployees[2]] },
    { submittedBy: otherEmployees[2], tripType: FlightTripType.ROUND_TRIP, isInternational: false, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destination: 'Hawassa', departureDate: '2026-10-05', returnDate: '2026-10-07', purpose: 'Follow-up site visit', ticketClass: FlightTicketClass.ECONOMY, status: 'RETURNED', passengers: [otherEmployees[2]] },
    { submittedBy: otherEmployees[3], tripType: FlightTripType.ROUND_TRIP, isInternational: false, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destination: 'Adama', departureDate: '2026-08-15', returnDate: '2026-08-16', purpose: 'Client site inspection', ticketClass: FlightTicketClass.ECONOMY, status: 'APPROVED', passengers: [otherEmployees[3]] },
    { submittedBy: weiChen, tripType: FlightTripType.ROUND_TRIP, isInternational: false, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destination: 'Arba Minch', departureDate: '2026-09-22', returnDate: '2026-09-24', purpose: 'Southern region survey', ticketClass: FlightTicketClass.ECONOMY, status: 'REJECTED', passengers: [weiChen] },
    { submittedBy: xiaomingLi, tripType: FlightTripType.ROUND_TRIP, isInternational: false, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destination: 'Dessie', departureDate: '2026-10-10', returnDate: '2026-10-12', purpose: 'Infrastructure assessment', ticketClass: FlightTicketClass.ECONOMY, status: 'SUBMITTED', passengers: [xiaomingLi] },
  ];

  for (const flight of flightData) {
    const dbStatus: HrRequestStatus =
      flight.status === 'COMPLETED' ? 'APPROVED' : flight.status;

    const approvalRequest = await createApprovalChain(ctx, {
      employeeId: flight.submittedBy.id,
      categoryCode: 'FLIGHT_APPLICATION',
      title: `Flight ${flight.originCity} to ${flight.destination} - ${flight.departureDate}`,
      status: dbStatus,
      companyId,
    });

    const seq = await prisma.$queryRaw<
      Array<{ nextval: bigint | number }>
    >`SELECT nextval('flight_application_number_seq') as nextval`;
    const applicationNumber = `FA-${String(Number(seq[0]?.nextval ?? 1)).padStart(4, '0')}`;

    const flightApp = await prisma.flightApplication.create({
      data: {
        id: randomUUID(),
        companyId,
        applicationNumber,
        submittedBy: flight.submittedBy.id,
        tripType: flight.tripType,
        isInternational: flight.isInternational,
        originCountry: flight.originCountry,
        originCity: flight.originCity,
        destination: flight.destination,
        departureDate: new Date(flight.departureDate),
        returnDate: flight.returnDate ? new Date(flight.returnDate) : null,
        purpose: flight.purpose,
        ticketClass: flight.ticketClass,
        status: dbStatus as FlightApplicationStatus,
        approvalRequestId: approvalRequest.id,
        submittedAt: new Date(),
        completedAt: ['APPROVED', 'REJECTED'].includes(dbStatus) ? new Date() : null,
        createdBy: flight.submittedBy.id,
        updatedBy: flight.submittedBy.id,
      },
    });

    for (const passenger of flight.passengers) {
      await prisma.flightPassenger.create({
        data: {
          id: randomUUID(),
          applicationId: flightApp.id,
          employeeId: passenger.id,
          acknowledgementStatus: flight.status === 'COMPLETED' ? 'ACKNOWLEDGED' : 'PENDING',
          acknowledgedAt: flight.status === 'COMPLETED' ? new Date() : null,
        },
      });
    }
  }

  console.log('✓ Flight applications seeded');
}

// ────────────────────────────────────────────────────────────────────────────
// Step 7 - Business trips
// ────────────────────────────────────────────────────────────────────────────

async function seedBusinessTrips(
  ctx: ChainContext,
  companyId: string,
  weiChen: User,
  xiaomingLi: User,
  otherEmployees: User[],
): Promise<void> {
  console.log('Seeding business trips...');

  const businessTripData: Array<{
    submittedBy: User;
    tripType: FlightTripType;
    originCountry: string;
    originCity: string;
    destinationCountry: string;
    destinationCity: string;
    departureDate: string;
    returnDate: string;
    purpose: string;
    hostOrganization: string;
    hostContact: string;
    expectedOutcomes: string;
    ticketClass: FlightTicketClass;
    estimatedFlightCost: number;
    estimatedAccommodationCost: number;
    estimatedPerDiem: number;
    estimatedOtherCost: number;
    status: HrRequestStatus;
    passengers: User[];
  }> = [
    { submittedBy: weiChen, tripType: FlightTripType.ROUND_TRIP, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destinationCountry: 'Kenya', destinationCity: 'Nairobi', departureDate: '2026-08-15', returnDate: '2026-08-20', purpose: 'Client meeting for structural design review', hostOrganization: 'Nairobi Engineering Consultants', hostContact: 'John Kamau +254 700 000 000', expectedOutcomes: 'Finalize structural design approval', ticketClass: FlightTicketClass.ECONOMY, estimatedFlightCost: 15000, estimatedAccommodationCost: 8000, estimatedPerDiem: 5000, estimatedOtherCost: 2000, status: 'APPROVED', passengers: [weiChen] },
    { submittedBy: xiaomingLi, tripType: FlightTripType.ROUND_TRIP, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destinationCountry: 'UAE', destinationCity: 'Dubai', departureDate: '2026-09-10', returnDate: '2026-09-14', purpose: 'International construction expo and supplier meetings', hostOrganization: 'Dubai Construction Expo', hostContact: 'Ahmed Al-Mansouri +971 50 000 0000', expectedOutcomes: 'Source new materials and equipment suppliers', ticketClass: FlightTicketClass.BUSINESS, estimatedFlightCost: 35000, estimatedAccommodationCost: 20000, estimatedPerDiem: 12000, estimatedOtherCost: 5000, status: 'APPROVED', passengers: [xiaomingLi, weiChen] },
    { submittedBy: weiChen, tripType: FlightTripType.ROUND_TRIP, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destinationCountry: 'Egypt', destinationCity: 'Cairo', departureDate: '2026-10-05', returnDate: '2026-10-09', purpose: 'Technical training on advanced structural analysis', hostOrganization: 'Cairo Institute of Engineering', hostContact: 'Dr. Mohamed Hassan +20 2 000 0000', expectedOutcomes: 'Complete advanced structural analysis certification', ticketClass: FlightTicketClass.ECONOMY, estimatedFlightCost: 18000, estimatedAccommodationCost: 10000, estimatedPerDiem: 6000, estimatedOtherCost: 3000, status: 'IN_REVIEW', passengers: [weiChen] },
    { submittedBy: otherEmployees[0], tripType: FlightTripType.ROUND_TRIP, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destinationCountry: 'South Africa', destinationCity: 'Johannesburg', departureDate: '2026-09-20', returnDate: '2026-09-25', purpose: 'Project management best practices conference', hostOrganization: 'African PM Institute', hostContact: 'Sarah Ndlovu +27 11 000 0000', expectedOutcomes: 'Implement new PM methodologies', ticketClass: FlightTicketClass.ECONOMY, estimatedFlightCost: 28000, estimatedAccommodationCost: 15000, estimatedPerDiem: 8000, estimatedOtherCost: 2000, status: 'SUBMITTED', passengers: [otherEmployees[0]] },
    { submittedBy: otherEmployees[1], tripType: FlightTripType.ROUND_TRIP, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destinationCountry: 'Tanzania', destinationCity: 'Dar es Salaam', departureDate: '2026-08-25', returnDate: '2026-08-28', purpose: 'East Africa infrastructure development forum', hostOrganization: 'EA Development Forum', hostContact: 'James Mwangi +255 22 000 0000', expectedOutcomes: 'Network with regional contractors', ticketClass: FlightTicketClass.ECONOMY, estimatedFlightCost: 22000, estimatedAccommodationCost: 12000, estimatedPerDiem: 7000, estimatedOtherCost: 1500, status: 'APPROVED', passengers: [otherEmployees[1]] },
    { submittedBy: otherEmployees[1], tripType: FlightTripType.ROUND_TRIP, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destinationCountry: 'Rwanda', destinationCity: 'Kigali', departureDate: '2026-10-15', returnDate: '2026-10-18', purpose: 'Smart city development workshop', hostOrganization: 'Rwanda Development Board', hostContact: 'Grace Uwimana +250 788 000 000', expectedOutcomes: 'Explore smart infrastructure partnerships', ticketClass: FlightTicketClass.ECONOMY, estimatedFlightCost: 20000, estimatedAccommodationCost: 11000, estimatedPerDiem: 6500, estimatedOtherCost: 2000, status: 'RETURNED', passengers: [otherEmployees[1]] },
    { submittedBy: otherEmployees[2], tripType: FlightTripType.ROUND_TRIP, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destinationCountry: 'China', destinationCity: 'Beijing', departureDate: '2026-09-01', returnDate: '2026-09-07', purpose: 'Parent company annual technical review', hostOrganization: 'CCECC Headquarters', hostContact: 'Zhang Wei +86 10 000 0000', expectedOutcomes: 'Align on annual technical standards', ticketClass: FlightTicketClass.BUSINESS, estimatedFlightCost: 60000, estimatedAccommodationCost: 25000, estimatedPerDiem: 15000, estimatedOtherCost: 5000, status: 'APPROVED', passengers: [otherEmployees[2], xiaomingLi] },
    { submittedBy: otherEmployees[2], tripType: FlightTripType.ROUND_TRIP, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destinationCountry: 'Djibouti', destinationCity: 'Djibouti City', departureDate: '2026-11-10', returnDate: '2026-11-13', purpose: 'Port infrastructure project assessment', hostOrganization: 'Djibouti Port Authority', hostContact: 'Hassan Omar +253 21 000 000', expectedOutcomes: 'Assess feasibility of port expansion project', ticketClass: FlightTicketClass.ECONOMY, estimatedFlightCost: 12000, estimatedAccommodationCost: 8000, estimatedPerDiem: 5000, estimatedOtherCost: 1000, status: 'SUBMITTED', passengers: [otherEmployees[2]] },
    { submittedBy: otherEmployees[3], tripType: FlightTripType.ROUND_TRIP, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destinationCountry: 'Nigeria', destinationCity: 'Lagos', departureDate: '2026-08-30', returnDate: '2026-09-03', purpose: 'West Africa construction market exploration', hostOrganization: 'Lagos Chamber of Commerce', hostContact: 'Chukwudi Obi +234 1 000 0000', expectedOutcomes: 'Identify new market opportunities in West Africa', ticketClass: FlightTicketClass.ECONOMY, estimatedFlightCost: 32000, estimatedAccommodationCost: 18000, estimatedPerDiem: 10000, estimatedOtherCost: 3000, status: 'REJECTED', passengers: [otherEmployees[3]] },
    { submittedBy: otherEmployees[3], tripType: FlightTripType.ROUND_TRIP, originCountry: 'Ethiopia', originCity: 'Addis Ababa', destinationCountry: 'Morocco', destinationCity: 'Casablanca', departureDate: '2026-11-20', returnDate: '2026-11-25', purpose: 'North Africa infrastructure summit', hostOrganization: 'Maghreb Construction Council', hostContact: 'Karim Benali +212 5 000 0000', expectedOutcomes: 'Establish partnerships for North Africa expansion', ticketClass: FlightTicketClass.ECONOMY, estimatedFlightCost: 25000, estimatedAccommodationCost: 14000, estimatedPerDiem: 8000, estimatedOtherCost: 2000, status: 'SUBMITTED', passengers: [otherEmployees[3]] },
  ];

  for (const trip of businessTripData) {
    const approvalRequest = await createApprovalChain(ctx, {
      employeeId: trip.submittedBy.id,
      categoryCode: 'BUSINESS_TRIP',
      title: `Business trip ${trip.originCity}, ${trip.originCountry} to ${trip.destinationCity}, ${trip.destinationCountry} - ${trip.departureDate}`,
      status: trip.status,
      companyId,
    });

    const seq = await prisma.$queryRaw<
      Array<{ nextval: bigint | number }>
    >`SELECT nextval('business_trip_number_seq') as nextval`;
    const tripNumber = `BT-${String(Number(seq[0]?.nextval ?? 1)).padStart(4, '0')}`;

    const businessTrip = await prisma.businessTrip.create({
      data: {
        id: randomUUID(),
        companyId,
        tripNumber,
        submittedBy: trip.submittedBy.id,
        tripType: trip.tripType,
        originCountry: trip.originCountry,
        originCity: trip.originCity,
        destinationCountry: trip.destinationCountry,
        destinationCity: trip.destinationCity,
        departureDate: new Date(trip.departureDate),
        returnDate: new Date(trip.returnDate),
        purpose: trip.purpose,
        hostOrganization: trip.hostOrganization,
        hostContactName: trip.hostContact.split(' +')[0]?.trim() || null,
        hostContactPhone: trip.hostContact.includes('+')
          ? trip.hostContact.slice(trip.hostContact.indexOf('+')).trim()
          : null,
        expectedOutcomes: trip.expectedOutcomes,
        estimatedAccommodationCost: trip.estimatedAccommodationCost,
        estimatedPerDiem: trip.estimatedPerDiem,
        estimatedOtherCost: trip.estimatedOtherCost,
        status: trip.status as BusinessTripStatus,
        approvalRequestId: approvalRequest.id,
        submittedAt: new Date(),
        completedAt: ['APPROVED', 'REJECTED'].includes(trip.status)
          ? new Date()
          : null,
        createdBy: trip.submittedBy.id,
        updatedBy: trip.submittedBy.id,
      },
    });

    for (const passenger of trip.passengers) {
      await prisma.businessTripPassenger.create({
        data: {
          id: randomUUID(),
          tripId: businessTrip.id,
          employeeId: passenger.id,
          visaRequired: true,
          visaStatus: trip.status === 'APPROVED' ? 'APPLIED' : 'NOT_APPLIED',
          acknowledgementStatus: 'PENDING',
        },
      });
    }
  }

  console.log('✓ Business trips seeded');
}

// ────────────────────────────────────────────────────────────────────────────
// Wipe
// ────────────────────────────────────────────────────────────────────────────

async function wipeHrData(companyId: string): Promise<void> {
  console.log('Wiping existing HR data...');

  const categoryScope = {
    category: {
      companyId,
      code: {
        in: ['LEAVE_REQUEST', 'OVERTIME_APPLICATION', 'FLIGHT_APPLICATION', 'BUSINESS_TRIP'],
      },
    },
  };

  await prisma.approvalResponse.deleteMany({ where: { request: categoryScope } });
  await prisma.approvalComment.deleteMany({ where: { request: categoryScope } });
  await prisma.approvalTier.deleteMany({ where: { request: categoryScope } });
  await prisma.approvalRequest.deleteMany({ where: categoryScope });

  await prisma.leaveBalance.deleteMany({ where: { companyId } });
  await prisma.leaveRequest.deleteMany({ where: { companyId } });
  await prisma.overtimeEntry.deleteMany({ where: { sheet: { companyId } } });
  await prisma.overtimeSheet.deleteMany({ where: { companyId } });
  await prisma.flightPassenger.deleteMany({ where: { application: { companyId } } });
  await prisma.flightApplication.deleteMany({ where: { companyId } });
  await prisma.businessTripPassenger.deleteMany({ where: { trip: { companyId } } });
  await prisma.businessTrip.deleteMany({ where: { companyId } });

  console.log('Wipe complete.');
}

// ────────────────────────────────────────────────────────────────────────────
// Runner
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Starting HR test data seed...');

  const weiChen = (await prisma.user.findFirst({
    where: { firstName: { contains: 'Wei' }, lastName: { contains: 'Chen' } },
    include: {
      engineeringDiscipline: { include: { leader: true } },
    },
  })) as UserWithDisciplineLeader | null;
  if (!weiChen) throw new Error('Wei Chen not found');

  const xiaomingLi = await prisma.user.findFirst({
    where: { firstName: { contains: 'Xiaoming' } },
  });
  if (!xiaomingLi) throw new Error('Xiaoming Li not found');

  const jinxia = await prisma.user.findFirst({
    where: { firstName: { contains: 'Jinxia' } },
  });
  if (!jinxia) throw new Error('Jinxia not found');

  const davidWu = await prisma.user.findFirst({
    where: { firstName: { contains: 'David' }, lastName: { contains: 'Wu' } },
  });
  if (!davidWu) throw new Error('David Wu not found');

  if (!weiChen.engineeringDiscipline?.leader) {
    throw new Error('Wei Chen has no discipline leader');
  }

  const companyId = weiChen.companyId;

  const otherEmployees = await prisma.user.findMany({
    where: {
      companyId,
      deletedAt: null,
      isActive: true,
      id: { notIn: [weiChen.id, xiaomingLi.id, jinxia.id, davidWu.id] },
      engineeringDisciplineId: { not: null },
    },
    take: 5,
  });
  if (otherEmployees.length < 4) {
    throw new Error(
      `Need at least 4 other employees with an engineering discipline assigned, found ${otherEmployees.length}`,
    );
  }

  const ctx: ChainContext = { xiaomingLi, jinxia, davidWu };

  await wipeHrData(companyId);

  await seedLeaveRequests(ctx, companyId, weiChen, otherEmployees);
  await seedOvertimeSheets(ctx, companyId, weiChen, otherEmployees);
  await seedFlightApplications(ctx, companyId, weiChen, xiaomingLi, otherEmployees);
  await seedBusinessTrips(ctx, companyId, weiChen, xiaomingLi, otherEmployees);

  console.log('\n✓ HR test data seed complete');
  console.log('  Leave requests:    10');
  console.log('  Overtime sheets:   10');
  console.log('  Flight apps:       10');
  console.log('  Business trips:    10');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
