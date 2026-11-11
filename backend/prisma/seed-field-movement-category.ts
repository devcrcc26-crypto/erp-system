/**
 * Upserts FIELD_MOVEMENT_LOG approval category without clearing existing categories.
 * Usage: npx ts-node --transpile-only prisma/seed-field-movement-category.ts
 */
import { PrismaClient, type Prisma } from '@prisma/client';

const CATEGORY = {
  code: 'FIELD_MOVEMENT_LOG',
  name: 'Field Movement / Early Departure Log',
  description:
    'Explain missing clock-ins, missing clock-outs, or early departures flagged in monthly attendance.',
  module: 'HR',
  numberPrefix: 'FM',
  icon: 'clock-circle',
  sortOrder: 150,
  formSchema: {
    fields: [
      { name: 'month', label: 'Month', type: 'number', required: true },
      { name: 'year', label: 'Year', type: 'number', required: true },
      {
        name: 'entryCount',
        label: 'Days Explained',
        type: 'number',
        required: true,
      },
    ],
  },
  approvalRules: [
    {
      name: 'Default',
      tiers: [
        {
          label: 'Department Head',
          resolver: 'ROLE',
          role: 'DEPARTMENT_HEAD',
          order: 1,
        },
        {
          label: 'HR Officer',
          resolver: 'ROLE',
          role: 'HR',
          order: 2,
        },
      ],
    },
  ],
} as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found');
    }

    const actor =
      (await prisma.user.findFirst({
        where: { companyId: company.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })) ??
      (await prisma.user.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }));
    if (!actor) {
      throw new Error('No user found to act as category creator');
    }

    const data = {
      name: CATEGORY.name,
      description: CATEGORY.description,
      icon: CATEGORY.icon,
      module: CATEGORY.module,
      formSchema: CATEGORY.formSchema as unknown as Prisma.InputJsonValue,
      approvalRules: CATEGORY.approvalRules as unknown as Prisma.InputJsonValue,
      numberPrefix: CATEGORY.numberPrefix,
      isActive: true,
      allowAttachments: false,
      sortOrder: CATEGORY.sortOrder,
      updatedBy: actor.id,
      deletedAt: null,
      deletedBy: null,
    };

    const existing = await prisma.approvalCategory.findFirst({
      where: { companyId: company.id, code: CATEGORY.code },
      select: { id: true, deletedAt: true },
    });

    const result = await prisma.approvalCategory.upsert({
      where: {
        companyId_code: { companyId: company.id, code: CATEGORY.code },
      },
      create: {
        companyId: company.id,
        code: CATEGORY.code,
        createdBy: actor.id,
        ...data,
      },
      update: data,
    });

    console.log(
      existing
        ? `Updated FIELD_MOVEMENT_LOG category ${result.id} (company ${company.id})`
        : `Created FIELD_MOVEMENT_LOG category ${result.id} (company ${company.id})`,
    );

    const codes = await prisma.approvalCategory.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { code: true },
      orderBy: { sortOrder: 'asc' },
    });
    console.log(
      'Active categories:',
      codes.map((row) => row.code).join(', '),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
