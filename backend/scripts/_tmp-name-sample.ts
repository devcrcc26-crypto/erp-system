import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const rows = await prisma.user.findMany({
    take: 12,
    where: { deletedAt: null },
    select: {
      firstName: true,
      middleName: true,
      lastName: true,
      chineseName: true,
      loginName: true,
    },
    orderBy: { lastName: 'asc' },
  });
  console.log(JSON.stringify(rows, null, 2));

  const all = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      firstName: true,
      middleName: true,
      lastName: true,
      loginName: true,
    },
  });
  const withLast = all.filter((row) => (row.lastName ?? '').trim().length > 0).length;
  const withMiddle = all.filter((row) => (row.middleName ?? '').trim().length > 0).length;
  const threePartLogin = all.filter((row) => (row.loginName ?? '').trim().split(/\s+/).length >= 3);
  const loginDiffers = all.filter((row) => {
    const built = [row.firstName, row.middleName, row.lastName]
      .map((part) => (part ?? '').trim())
      .filter((part) => part.length > 0)
      .join(' ')
      .toLowerCase();
    const login = (row.loginName ?? '').trim().toLowerCase();
    return login.length > 0 && login !== built;
  });
  console.log(
    JSON.stringify({
      total: all.length,
      withMiddle,
      withLast,
      threePartLogin: threePartLogin.length,
      loginDiffers: loginDiffers.length,
      differSamples: loginDiffers.slice(0, 8).map((row) => ({
        firstName: row.firstName,
        middleName: row.middleName,
        lastName: row.lastName,
        loginName: row.loginName,
      })),
      threeSamples: threePartLogin.slice(0, 5).map((row) => ({
        firstName: row.firstName,
        middleName: row.middleName,
        lastName: row.lastName,
        loginName: row.loginName,
      })),
    }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
