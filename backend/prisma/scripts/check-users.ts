import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      emailVerifiedAt: true,
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
