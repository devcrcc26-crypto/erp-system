/**
 * Non-destructive: upserts the PER_DIEM approval category only.
 * Employee per diem rates are managed per employee via employee_per_diem_rate.
 * Usage: npx ts-node --transpile-only prisma/seed-per-diem-category-and-rates.ts
 */
import { PrismaClient } from '@prisma/client';

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
    const companyId = company.id;

    const actor = await prisma.user.findFirst({
      where: {
        companyId,
        deletedAt: null,
        userRoles: {
          some: { role: { name: 'System Administrator' }, deletedAt: null },
        },
      },
      select: { id: true },
    });
    if (!actor) {
      throw new Error('No System Administrator user found for this company');
    }
    const actorUserId = actor.id;

    await prisma.approvalCategory.upsert({
      where: { companyId_code: { companyId, code: 'PER_DIEM' } },
      create: {
        companyId,
        code: 'PER_DIEM',
        name: 'Per Diem Request',
        description:
          'Daily allowance request for domestic or international business travel.',
        module: 'HR',
        numberPrefix: 'PD',
        icon: 'WalletOutlined',
        sortOrder: 75,
        formSchema: { fields: [] },
        approvalRules: [],
        isActive: true,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        name: 'Per Diem Request',
        description:
          'Daily allowance request for domestic or international business travel.',
        module: 'HR',
        numberPrefix: 'PD',
        icon: 'WalletOutlined',
        sortOrder: 75,
        isActive: true,
        deletedAt: null,
        deletedBy: null,
        updatedBy: actorUserId,
      },
    });
    console.log('  PER_DIEM approval category upserted');

    await prisma.approvalCategory.upsert({
      where: { companyId_code: { companyId, code: 'PER_DIEM_SETTLEMENT' } },
      create: {
        companyId,
        code: 'PER_DIEM_SETTLEMENT',
        name: 'Per Diem Settlement',
        description:
          'Settle approved per diem advances against the actual days travelled. Balance is in ETB.',
        module: 'HR',
        numberPrefix: 'PS',
        icon: 'WalletOutlined',
        sortOrder: 76,
        formSchema: { fields: [] },
        approvalRules: [],
        isActive: true,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        name: 'Per Diem Settlement',
        description:
          'Settle approved per diem advances against the actual days travelled. Balance is in ETB.',
        module: 'HR',
        numberPrefix: 'PS',
        icon: 'WalletOutlined',
        sortOrder: 76,
        isActive: true,
        deletedAt: null,
        deletedBy: null,
        updatedBy: actorUserId,
      },
    });
    console.log('  PER_DIEM_SETTLEMENT approval category upserted');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
