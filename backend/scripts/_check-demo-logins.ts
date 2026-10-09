import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const withEmail = await prisma.user.count({
      where: { deletedAt: null, email: { not: null } },
    });
    const total = await prisma.user.count({ where: { deletedAt: null } });
    console.log({ total, withEmail });

    const chinese = await prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { chineseName: { not: null } },
          { nationality: 'CHINESE' },
        ],
      },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        chineseName: true,
        employeeId: true,
        passwordHash: true,
        emailVerifiedAt: true,
        isActive: true,
      },
      orderBy: { employeeId: 'asc' },
      take: 40,
    });
    console.log('chinese-or-named', chinese.length);
    for (const u of chinese) {
      console.log({
        employeeId: u.employeeId,
        name: `${u.firstName} ${u.lastName}`,
        chineseName: u.chineseName,
        email: u.email,
        hasPassword: Boolean(u.passwordHash),
        verified: Boolean(u.emailVerifiedAt),
      });
    }

    const eyuel = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        firstName: 'Eyuel',
        lastName: 'Tilahun',
      },
      select: {
        id: true,
        email: true,
        employeeId: true,
        passwordHash: true,
        emailVerifiedAt: true,
        isActive: true,
        userRoles: {
          select: { role: { select: { name: true } }, isPrimary: true },
        },
      },
    });
    console.log('eyuel-detail', eyuel);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
