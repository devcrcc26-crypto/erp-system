import { PrismaClient } from '@prisma/client';
import { resolveSeedAdminPassword } from '../src/shared/script-guards/seed-admin-password';
import { seedPmDemoData } from './seed-pm-demo';

const prisma = new PrismaClient();

/**
 * Seeds PM demo/test data against an already-initialized database.
 * Run `npx prisma db seed` first so company, roles, and admin user exist.
 */
async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@company.local';

  const admin = await prisma.user.findFirst({
    where: { email: adminEmail, deletedAt: null },
    select: {
      id: true,
      companyId: true,
      branchId: true,
      departmentId: true,
      positionId: true,
    },
  });

  if (!admin) {
    throw new Error(
      `Admin user ${adminEmail} not found. Run npx prisma db seed first.`,
    );
  }

  const branch = await prisma.branch.findFirst({
    where: { companyId: admin.companyId, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const department = await prisma.department.findFirst({
    where: { companyId: admin.companyId, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const position = await prisma.position.findFirst({
    where: { companyId: admin.companyId, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!branch || !department || !position) {
    throw new Error(
      'Company reference data missing. Run npx prisma db seed first.',
    );
  }

  const roles = await prisma.role.findMany({
    where: { companyId: admin.companyId, deletedAt: null },
    select: { id: true, name: true },
  });
  const roleMap = new Map(roles.map((role) => [role.name, role.id]));

  const defaultPassword = resolveSeedAdminPassword();

  await seedPmDemoData({
    prisma,
    companyId: admin.companyId,
    branchId: admin.branchId ?? branch.id,
    departmentId: admin.departmentId ?? department.id,
    positionId: admin.positionId ?? position.id,
    adminUserId: admin.id,
    roleMap,
    defaultPassword,
  });

  console.log('PM test data seeded successfully.');
}

main()
  .catch((error: unknown) => {
    console.error('PM test seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
