/**
 * Seeds the CRCC Standard work schedule (Sunday off, Sat half day).
 * Does not seed public holidays - HR adds those from the UI.
 *
 * Usage:
 *   npx ts-node --transpile-only prisma/seed/work-schedules.seed.ts
 *
 * Also invoked from prisma/seed.ts after the admin user exists.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

export interface SeedWorkSchedulesContext {
  prisma: PrismaClient;
  companyId: string;
  actorUserId: string;
}

interface SeedDay {
  dayOfWeek: number;
  isWorkingDay: boolean;
  isHalfDay: boolean;
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
  totalHours: number;
}

const CRCC_STANDARD_DAYS: SeedDay[] = [
  {
    dayOfWeek: 0,
    isWorkingDay: false,
    isHalfDay: false,
    morningStart: null,
    morningEnd: null,
    afternoonStart: null,
    afternoonEnd: null,
    totalHours: 0,
  },
  {
    dayOfWeek: 1,
    isWorkingDay: true,
    isHalfDay: false,
    morningStart: '08:30',
    morningEnd: '12:30',
    afternoonStart: '13:30',
    afternoonEnd: '17:30',
    totalHours: 8,
  },
  {
    dayOfWeek: 2,
    isWorkingDay: true,
    isHalfDay: false,
    morningStart: '08:30',
    morningEnd: '12:30',
    afternoonStart: '13:30',
    afternoonEnd: '17:30',
    totalHours: 8,
  },
  {
    dayOfWeek: 3,
    isWorkingDay: true,
    isHalfDay: false,
    morningStart: '08:30',
    morningEnd: '12:30',
    afternoonStart: '13:30',
    afternoonEnd: '17:30',
    totalHours: 8,
  },
  {
    dayOfWeek: 4,
    isWorkingDay: true,
    isHalfDay: false,
    morningStart: '08:30',
    morningEnd: '12:30',
    afternoonStart: '13:30',
    afternoonEnd: '17:30',
    totalHours: 8,
  },
  {
    dayOfWeek: 5,
    isWorkingDay: true,
    isHalfDay: false,
    morningStart: '08:30',
    morningEnd: '12:30',
    afternoonStart: '13:30',
    afternoonEnd: '17:30',
    totalHours: 8,
  },
  {
    dayOfWeek: 6,
    isWorkingDay: true,
    isHalfDay: true,
    morningStart: '08:30',
    morningEnd: '12:30',
    afternoonStart: null,
    afternoonEnd: null,
    totalHours: 4,
  },
];

const CRCC_STANDARD_NAME = 'CRCC Standard';

/**
 * Idempotently seeds the company default CRCC Standard work schedule.
 */
export async function seedWorkSchedules(
  ctx: SeedWorkSchedulesContext,
): Promise<void> {
  const existing = await ctx.prisma.workSchedule.findFirst({
    where: {
      companyId: ctx.companyId,
      name: CRCC_STANDARD_NAME,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (existing) {
    console.log(`  Work schedule "${CRCC_STANDARD_NAME}" already exists.`);
    return;
  }

  const otherDefault = await ctx.prisma.workSchedule.findFirst({
    where: {
      companyId: ctx.companyId,
      isDefault: true,
      deletedAt: null,
    },
    select: { id: true },
  });

  await ctx.prisma.workSchedule.create({
    data: {
      id: randomUUID(),
      companyId: ctx.companyId,
      name: CRCC_STANDARD_NAME,
      description:
        'Company default: Sunday off, Monday–Friday 08:30–17:30 with lunch break, Saturday half day.',
      isDefault: otherDefault ? false : true,
      isActive: true,
      createdBy: ctx.actorUserId,
      updatedBy: ctx.actorUserId,
      days: {
        create: CRCC_STANDARD_DAYS.map((day) => ({
          id: randomUUID(),
          dayOfWeek: day.dayOfWeek,
          isWorkingDay: day.isWorkingDay,
          isHalfDay: day.isHalfDay,
          morningStart: day.morningStart,
          morningEnd: day.morningEnd,
          afternoonStart: day.afternoonStart,
          afternoonEnd: day.afternoonEnd,
          totalHours: new Prisma.Decimal(day.totalHours),
        })),
      },
    },
  });

  console.log(`  Seeded work schedule "${CRCC_STANDARD_NAME}".`);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found. Run the main seed first.');
    }

    const admin = await prisma.user.findFirst({
      where: {
        companyId: company.id,
        deletedAt: null,
        userRoles: {
          some: {
            isPrimary: true,
            role: { name: 'System Administrator' },
          },
        },
      },
      select: { id: true },
    });
    if (!admin) {
      throw new Error('No System Administrator found for the company.');
    }

    await seedWorkSchedules({
      prisma,
      companyId: company.id,
      actorUserId: admin.id,
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
