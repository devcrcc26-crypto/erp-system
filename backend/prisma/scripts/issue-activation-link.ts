import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { EmailVerificationPurpose } from '../../src/shared/prisma/prisma-enums';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.argv[2];
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

  if (!email) {
    throw new Error(
      'Usage: ts-node prisma/scripts/issue-activation-link.ts <email>',
    );
  }

  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null, isActive: true },
  });

  if (!user) {
    throw new Error(`Active user not found for ${email}`);
  }

  if (user.emailVerifiedAt) {
    console.log(`User ${email} is already verified.`);
    return;
  }

  await prisma.emailVerificationToken.updateMany({
    where: {
      userId: user.id,
      purpose: EmailVerificationPurpose.ACCOUNT_ACTIVATION,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });

  const token = randomBytes(48).toString('hex');
  const tokenHash = await bcrypt.hash(token, 12);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash,
      purpose: EmailVerificationPurpose.ACCOUNT_ACTIVATION,
      expiresAt,
    },
  });

  const url = new URL('/activate', frontendUrl);
  url.searchParams.set('token', token);

  console.log('Activation link issued (valid 24 hours):');
  console.log(url.toString());
  console.log('');
  console.log(
    'Note: With MAIL_HOST=localhost, email does not reach Gmail. Use this URL directly.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
