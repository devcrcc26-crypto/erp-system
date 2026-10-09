import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import {
  isLocalDatabaseHost,
  resolveSeedAdminPassword,
  seedAdminPasswordSourceLabel,
} from '../../src/shared/script-guards/seed-admin-password';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

function databaseHost(): string | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const email = process.argv[2];
  const passwordArg = process.argv[3];
  const firstName = process.argv[4] ?? 'Samuel';
  const lastName = process.argv[5] ?? 'Hailemariam';

  if (!email) {
    throw new Error(
      'Usage: ts-node prisma/scripts/create-admin-user.ts <email> [password] [firstName] [lastName]',
    );
  }

  let password: string;
  if (passwordArg) {
    password = passwordArg;
  } else if (isLocalDatabaseHost(databaseHost())) {
    password = resolveSeedAdminPassword();
  } else {
    console.error(
      'Refused: password argument or SEED_ADMIN_PASSWORD is required when DATABASE_URL is not localhost.',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    await prisma.user.updateMany({
      where: { email: 'admin@company.local', companyId: COMPANY_ID },
      data: { emailVerifiedAt: new Date() },
    });

    const adminRole = await prisma.role.findFirst({
      where: {
        companyId: COMPANY_ID,
        name: 'System Administrator',
        deletedAt: null,
      },
    });

    if (!adminRole) {
      throw new Error('System Administrator role not found. Run prisma db seed first.');
    }

    const branch = await prisma.branch.findFirst({
      where: { companyId: COMPANY_ID, deletedAt: null },
    });
    const department = await prisma.department.findFirst({
      where: { companyId: COMPANY_ID, deletedAt: null },
    });
    const position = await prisma.position.findFirst({
      where: { companyId: COMPANY_ID, deletedAt: null },
    });

    const passwordHash = await bcrypt.hash(password, 12);
    const actorId = SYSTEM_USER_ID;

    const user = await prisma.user.upsert({
      where: {
        companyId_email: { companyId: COMPANY_ID, email },
      },
      update: {
        firstName,
        lastName,
        passwordHash,
        emailVerifiedAt: new Date(),
        isActive: true,
        deletedAt: null,
        updatedBy: actorId,
      },
      create: {
        companyId: COMPANY_ID,
        branchId: branch?.id ?? null,
        departmentId: department?.id ?? null,
        positionId: position?.id ?? null,
        firstName,
        lastName,
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
        isActive: true,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: user.id, roleId: adminRole.id },
      },
      update: {
        deletedAt: null,
        updatedBy: actorId,
      },
      create: {
        userId: user.id,
        roleId: adminRole.id,
        assignedBy: actorId,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });

    console.log('System Administrator created/updated successfully.');
    console.log(`  Email   : ${email}`);
    console.log(
      `  Password: ${passwordArg ? '(from argv)' : seedAdminPasswordSourceLabel()}`,
    );
    console.log(`  User ID : ${user.id}`);
    console.log(`  Role    : System Administrator`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
