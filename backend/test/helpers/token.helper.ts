import { INestApplication } from '@nestjs/common';
import { TokenService } from '../../src/modules/auth/application/services/token.service';
import { EmailVerificationPurpose } from '../../src/shared/prisma/prisma-enums';
import { PrismaService } from '../../src/shared/prisma/prisma.service';

/**
 * Inserts a known activation token for e2e tests (replaces any active tokens).
 */
export async function issueActivationToken(
  app: INestApplication,
  userId: string,
): Promise<string> {
  const tokenService = app.get(TokenService);
  const prisma = app.get(PrismaService);
  const token = tokenService.generateEmailVerificationToken();
  const tokenHash = await tokenService.hashToken(token);

  await prisma.emailVerificationToken.updateMany({
    where: {
      userId,
      purpose: EmailVerificationPurpose.ACCOUNT_ACTIVATION,
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });

  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      purpose: EmailVerificationPurpose.ACCOUNT_ACTIVATION,
      expiresAt: tokenService.getEmailVerificationExpiryDate(),
    },
  });

  return token;
}

/**
 * Inserts a known password-reset token for e2e tests (replaces any active tokens).
 */
export async function issuePasswordResetToken(
  app: INestApplication,
  userId: string,
): Promise<string> {
  const tokenService = app.get(TokenService);
  const prisma = app.get(PrismaService);
  const token = tokenService.generatePasswordResetToken();
  const tokenHash = await tokenService.hashToken(token);

  await prisma.passwordResetToken.updateMany({
    where: {
      userId,
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: tokenService.getPasswordResetExpiryDate(),
    },
  });

  return token;
}
