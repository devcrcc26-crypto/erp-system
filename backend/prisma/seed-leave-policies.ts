/**
 * Seeds sample leave policies (ANNUAL / MATERNITY / SICK rules) for the first company.
 * Idempotent by policy name within the company.
 *
 * Usage:
 *   npx ts-node --transpile-only prisma/seed-leave-policies.ts
 *
 * Also invoked from prisma/seed.ts after the admin user exists.
 */
import { LeaveType, Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

export interface SeedLeavePoliciesContext {
  prisma: PrismaClient;
  companyId: string;
  actorUserId: string;
}

interface SampleRule {
  leaveType: LeaveType;
  baseDays: number;
  isProgressive?: boolean;
  incrementDays?: number;
  incrementEveryYears?: number;
  minimumServiceMonths?: number;
  maxDaysCap?: number;
  maxCarryForwardDays?: number;
  requiresReceipt?: boolean;
}

interface SamplePolicy {
  name: string;
  description: string;
  governedBy: string;
  isActive: boolean;
  rules: SampleRule[];
}

const SAMPLE_POLICIES: SamplePolicy[] = [
  {
    name: 'Standard Staff',
    description:
      'Default progressive leave for permanent office and project staff.',
    governedBy: 'Company HR Handbook / Labour Proclamation',
    isActive: true,
    rules: [
      {
        leaveType: LeaveType.ANNUAL,
        baseDays: 16,
        isProgressive: true,
        incrementDays: 1,
        incrementEveryYears: 2,
        maxDaysCap: 20,
        minimumServiceMonths: 0,
        // No carry-forward cap: the full unused balance moves to the next year.
      },
      {
        leaveType: LeaveType.MATERNITY,
        baseDays: 90,
        minimumServiceMonths: 0,
      },
      {
        leaveType: LeaveType.SICK,
        baseDays: 30,
        requiresReceipt: true,
      },
    ],
  },
  {
    name: 'Site Workers',
    description:
      'Flat annual entitlement for site-based craft and labour roles.',
    governedBy: 'Site HR Policy',
    isActive: true,
    rules: [
      {
        leaveType: LeaveType.ANNUAL,
        baseDays: 14,
        isProgressive: false,
        minimumServiceMonths: 3,
        maxCarryForwardDays: 5,
      },
      {
        leaveType: LeaveType.MATERNITY,
        baseDays: 90,
        minimumServiceMonths: 6,
      },
      {
        leaveType: LeaveType.SICK,
        baseDays: 20,
        requiresReceipt: true,
      },
    ],
  },
  {
    name: 'Management',
    description:
      'Enhanced progressive leave for managers and department heads.',
    governedBy: 'Executive Compensation & Benefits Policy',
    isActive: true,
    rules: [
      {
        leaveType: LeaveType.ANNUAL,
        baseDays: 20,
        isProgressive: true,
        incrementDays: 1,
        incrementEveryYears: 2,
        maxDaysCap: 30,
        minimumServiceMonths: 0,
        maxCarryForwardDays: 10,
      },
      {
        leaveType: LeaveType.MATERNITY,
        baseDays: 90,
        minimumServiceMonths: 0,
      },
      {
        leaveType: LeaveType.SICK,
        baseDays: 45,
        requiresReceipt: true,
      },
    ],
  },
  {
    name: 'Probation Entry',
    description:
      'Reduced annual leave until probation completes; sick leave requires a receipt.',
    governedBy: 'Probation & Onboarding Policy',
    isActive: true,
    rules: [
      {
        leaveType: LeaveType.ANNUAL,
        baseDays: 8,
        isProgressive: false,
        minimumServiceMonths: 6,
        maxCarryForwardDays: 0,
      },
      {
        leaveType: LeaveType.MATERNITY,
        baseDays: 90,
        minimumServiceMonths: 12,
      },
      {
        leaveType: LeaveType.SICK,
        baseDays: 15,
        requiresReceipt: true,
      },
    ],
  },
];

function toRuleCreateData(
  leavePolicyId: string,
  rule: SampleRule,
): Prisma.LeavePolicyRuleCreateManyInput {
  const isProgressive = Boolean(rule.isProgressive);
  return {
    id: randomUUID(),
    leavePolicyId,
    leaveType: rule.leaveType,
    baseDays: new Prisma.Decimal(rule.baseDays),
    isProgressive,
    incrementDays:
      isProgressive && rule.incrementDays != null
        ? new Prisma.Decimal(rule.incrementDays)
        : null,
    incrementEveryYears: isProgressive
      ? (rule.incrementEveryYears ?? null)
      : null,
    minimumServiceMonths: rule.minimumServiceMonths ?? 0,
    maxDaysCap:
      rule.maxDaysCap != null ? new Prisma.Decimal(rule.maxDaysCap) : null,
    maxCarryForwardDays:
      rule.maxCarryForwardDays != null
        ? new Prisma.Decimal(rule.maxCarryForwardDays)
        : null,
    requiresReceipt: Boolean(rule.requiresReceipt),
  };
}

/**
 * Upserts sample leave policies for a company (match by name).
 */
export async function seedLeavePolicies(
  ctx: SeedLeavePoliciesContext,
): Promise<void> {
  const { prisma, companyId, actorUserId } = ctx;
  let created = 0;
  let updated = 0;

  for (const sample of SAMPLE_POLICIES) {
    const existing = await prisma.leavePolicy.findFirst({
      where: {
        companyId,
        name: sample.name,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.leavePolicyRule.deleteMany({
          where: { leavePolicyId: existing.id },
        });
        await tx.leavePolicyRule.createMany({
          data: sample.rules.map((rule) =>
            toRuleCreateData(existing.id, rule),
          ),
        });
        await tx.leavePolicy.update({
          where: { id: existing.id },
          data: {
            description: sample.description,
            governedBy: sample.governedBy,
            isActive: sample.isActive,
            updatedBy: actorUserId,
            deletedAt: null,
            deletedBy: null,
          },
        });
      });
      updated += 1;
      continue;
    }

    const policyId = randomUUID();
    await prisma.leavePolicy.create({
      data: {
        id: policyId,
        companyId,
        name: sample.name,
        description: sample.description,
        governedBy: sample.governedBy,
        isActive: sample.isActive,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        rules: {
          create: sample.rules.map((rule) => {
            const row = toRuleCreateData(policyId, rule);
            const { leavePolicyId: _omit, ...createData } = row;
            return createData;
          }),
        },
      },
    });
    created += 1;
  }

  console.log(
    `  Leave policies seeded: ${created} created, ${updated} updated (${SAMPLE_POLICIES.length} total)`,
  );
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
      throw new Error('No company found - run the main seed first');
    }

    const actor = await prisma.user.findFirst({
      where: {
        companyId: company.id,
        deletedAt: null,
        userRoles: {
          some: {
            deletedAt: null,
            role: { name: 'System Administrator', deletedAt: null },
          },
        },
      },
      select: { id: true },
    });
    if (!actor) {
      throw new Error('No System Administrator user found for this company');
    }

    await seedLeavePolicies({
      prisma,
      companyId: company.id,
      actorUserId: actor.id,
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('Leave policy seed failed:', error);
    process.exit(1);
  });
}
