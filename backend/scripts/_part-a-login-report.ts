import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

function normalizeFullName(parts: {
  firstName: string;
  middleName: string | null;
  lastName: string;
}): string {
  return [parts.firstName, parts.middleName, parts.lastName]
    .filter((p) => Boolean(p && String(p).trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .normalize('NFC');
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        passwordHash: true,
        emailVerifiedAt: true,
      },
    });
    const map = new Map<string, string[]>();
    for (const u of users) {
      const n = normalizeFullName(u);
      if (!n) continue;
      const list = map.get(n) ?? [];
      list.push(u.id);
      map.set(n, list);
    }
    const dups = [...map.entries()].filter(([, ids]) => ids.length > 1);
    console.log(
      JSON.stringify(
        {
          totalUsers: users.length,
          withEmail: users.filter((u) => u.email).length,
          withoutEmail: users.filter((u) => !u.email).length,
          emailVerified: users.filter((u) => u.emailVerifiedAt).length,
          withPassword: users.filter((u) => Boolean(u.passwordHash)).length,
          duplicateNormalizedFullNameGroups: dups.length,
          duplicateUsers: dups.reduce((s, [, ids]) => s + ids.length, 0),
          duplicates: dups.map(([, ids]) => ({
            count: ids.length,
            userIds: ids,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
