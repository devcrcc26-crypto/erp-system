/**
 * Non-destructive: upserts the PER_DIEM approval category and seeds the
 * default per diem destination rates. Does NOT touch existing approval data.
 * Usage: npx ts-node --transpile-only prisma/seed-per-diem-category-and-rates.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const DEFAULT_RATES: Array<{
  destinationCategory: string;
  dailyRate: number;
  currency: 'ETB' | 'USD' | 'CNY';
}> = [
  { destinationCategory: 'Domestic', dailyRate: 500, currency: 'ETB' },
  { destinationCategory: 'East Africa', dailyRate: 30, currency: 'USD' },
  { destinationCategory: 'Other Africa', dailyRate: 50, currency: 'USD' },
  { destinationCategory: 'Middle East', dailyRate: 60, currency: 'USD' },
  { destinationCategory: 'Asia', dailyRate: 70, currency: 'USD' },
  { destinationCategory: 'Europe', dailyRate: 80, currency: 'USD' },
  { destinationCategory: 'Americas', dailyRate: 80, currency: 'USD' },
];

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
        allowAttachments: true,
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

    let seeded = 0;
    for (const rate of DEFAULT_RATES) {
      await prisma.perDiemRate.upsert({
        where: {
          companyId_destinationCategory: {
            companyId,
            destinationCategory: rate.destinationCategory,
          },
        },
        create: {
          id: randomUUID(),
          companyId,
          destinationCategory: rate.destinationCategory,
          dailyRate: rate.dailyRate,
          currency: rate.currency,
          isActive: true,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
        update: {
          dailyRate: rate.dailyRate,
          currency: rate.currency,
          isActive: true,
          deletedAt: null,
          deletedBy: null,
          updatedBy: actorUserId,
        },
      });
      seeded += 1;
    }
    console.log(`  Per diem rates seeded: ${seeded}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
