/**
 * Authenticate Samuel via LoginHandler without starting the HTTP server.
 *
 * Usage:
 *   $env:SEED_MODE='true'
 *   $env:DATABASE_URL='postgresql://postgres:postgres@localhost:5433/pwf_fresh?schema=public'
 *   $env:SAMUEL_PASSWORD='<his password>'
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/verify-samuel-login.ts
 *
 * If SAMUEL_PASSWORD is unset, verifies user lookup + emailVerified + rejects a wrong password.
 */
import {
  assertLocalhostSeedGuards,
} from './lib/localhost-seed-guard';

const SAMUEL_EMAIL = 'samuelhailemariam4@gmail.com';

async function main(): Promise<void> {
  assertLocalhostSeedGuards({ requireDatabase: 'pwf_fresh' });

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { LoginHandler } = await import(
    '../src/modules/auth/application/commands/login.handler'
  );
  const { LoginCommand } = await import(
    '../src/modules/auth/application/commands/login.command'
  );
  const { AUTH_REPOSITORY } = await import(
    '../src/modules/auth/domain/repositories/auth.repository.interface'
  );
  const { PasswordService } = await import(
    '../src/modules/auth/application/services/password.service'
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const authRepository = app.get(AUTH_REPOSITORY);
    const passwordService = app.get(PasswordService);
    const loginHandler = app.get(LoginHandler);

    const user = await authRepository.findActiveUserByEmail(SAMUEL_EMAIL);
    if (!user) {
      throw new Error(`Active user not found for ${SAMUEL_EMAIL}`);
    }
    if (!user.emailVerifiedAt) {
      throw new Error('Samuel emailVerifiedAt is null - login would be forbidden');
    }
    if (!user.passwordHash) {
      throw new Error('Samuel has no password hash');
    }

    console.log(`Found Samuel: ${user.id} (${user.employeeId ?? 'no emp'})`);
    console.log(`emailVerifiedAt: ${user.emailVerifiedAt.toISOString()}`);
    console.log(`passwordHash prefix: ${user.passwordHash.slice(0, 7)}…`);

    const password = process.env.SAMUEL_PASSWORD;
    if (!password) {
      let rejected = false;
      try {
        await loginHandler.execute(
          new LoginCommand(
            SAMUEL_EMAIL,
            '__definitely-wrong-password__',
            'verify-samuel-login',
            '127.0.0.1',
          ),
        );
      } catch (error: unknown) {
        rejected = true;
        console.log(
          `Wrong-password path OK (${error instanceof Error ? error.name : 'error'})`,
        );
      }
      if (!rejected) {
        throw new Error('LoginHandler accepted a wrong password');
      }
      const selfCheck = await passwordService.verify(
        '___nope___',
        user.passwordHash,
      );
      if (selfCheck) {
        throw new Error('PasswordService.verify unexpectedly returned true');
      }
      console.log(
        'PARTIAL AUTH CHECK PASSED (set SAMUEL_PASSWORD for full login confirmation)',
      );
      return;
    }

    const valid = await passwordService.verify(password, user.passwordHash);
    if (!valid) {
      throw new Error('SAMUEL_PASSWORD does not match stored password hash');
    }

    const tokens = await loginHandler.execute(
      new LoginCommand(
        SAMUEL_EMAIL,
        password,
        'verify-samuel-login',
        '127.0.0.1',
      ),
    );
    console.log('FULL LOGIN OK');
    console.log(`  sessionId: ${tokens.sessionId}`);
    console.log(`  expiresIn: ${tokens.expiresIn}`);
    console.log(`  accessToken length: ${tokens.accessToken.length}`);
    console.log(`  user.companyName: ${tokens.user.companyName}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('verify-samuel-login failed:', error);
  process.exit(1);
});
