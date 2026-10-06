/**
 * Upserts WORK_FROM_HOME approval category without clearing other categories.
 * Usage: npx ts-node --transpile-only prisma/scripts/upsert-work-from-home-category.ts
 */
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found');
    }
    const admin = await prisma.user.findFirst({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true },
    });
    const actor = admin?.id ?? '00000000-0000-4000-8000-000000000001';
    const data = {
      name: 'Work From Home',
      description:
        'Employee request to work from home on a specific date. Approval chain is Employee → Discipline Lead only.',
      icon: 'HomeOutlined',
      module: 'HR',
      formSchema: {
        fields: [
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true },
        ],
      },
      approvalRules: [
        {
          name: 'Employee → Discipline Lead only',
          tiers: [
            { label: 'Discipline Lead', resolver: 'DISCIPLINE_LEAD', order: 1 },
          ],
        },
      ],
      numberPrefix: 'WFH',
      isActive: true,
      isUserRequestable: true,
      allowAttachments: true,
      sortOrder: 12,
      updatedBy: actor,
      deletedAt: null,
      deletedBy: null,
    };

    await prisma.approvalCategory.upsert({
      where: {
        companyId_code: { companyId: company.id, code: 'WORK_FROM_HOME' },
      },
      create: {
        companyId: company.id,
        code: 'WORK_FROM_HOME',
        createdBy: actor,
        ...data,
      },
      update: data,
    });
    console.log(`WORK_FROM_HOME category upserted for company ${company.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
