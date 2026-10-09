import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MustChangePasswordGuard } from './must-change-password.guard';
import { PrismaService } from '../prisma/prisma.service';

describe('MustChangePasswordGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(false),
  } as unknown as Reflector;

  const prisma = {
    user: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;

  const guard = new MustChangePasswordGuard(reflector, prisma);

  function ctx(method: string, path: string, userId?: string) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          path,
          user: userId ? { userId } : undefined,
        }),
      }),
    };
  }

  it('allows change-password when mustChangePassword is true', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      mustChangePassword: true,
    });
    await expect(
      guard.canActivate(
        ctx('POST', '/auth/change-password', 'u1') as never,
      ),
    ).resolves.toBe(true);
  });

  it('blocks other endpoints when mustChangePassword is true', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      mustChangePassword: true,
    });
    await expect(
      guard.canActivate(ctx('GET', '/users', 'u1') as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows other endpoints when flag is false', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      mustChangePassword: false,
    });
    await expect(
      guard.canActivate(ctx('GET', '/users', 'u1') as never),
    ).resolves.toBe(true);
  });
});
