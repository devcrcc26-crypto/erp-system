import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PermissionService } from './permission.service';

describe('PermissionsGuard', () => {
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let permissionService: jest.Mocked<Pick<PermissionService, 'hasPermission'>>;
  let guard: PermissionsGuard;

  const buildContext = (user?: {
    userId: string;
    companyId: string;
  }): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    permissionService = { hasPermission: jest.fn() };
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      permissionService as unknown as PermissionService,
    );
  });

  it('allows public routes', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(permissionService.hasPermission).not.toHaveBeenCalled();
  });

  it('throws when endpoint has no @RequirePermission decorator', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);

    await expect(guard.canActivate(buildContext())).rejects.toMatchObject({
      response: {
        message: 'This endpoint requires explicit permission declaration.',
      },
    });
    expect(permissionService.hasPermission).not.toHaveBeenCalled();
  });

  it('allows @DelegatePermissionCheck when authenticated', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await expect(
      guard.canActivate(
        buildContext({ userId: 'user-1', companyId: 'company-1' }),
      ),
    ).resolves.toBe(true);
    expect(permissionService.hasPermission).not.toHaveBeenCalled();
  });

  it('throws when @DelegatePermissionCheck is used without auth', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await expect(guard.canActivate(buildContext())).rejects.toMatchObject({
      response: { message: 'Authentication required' },
    });
  });

  it('throws ForbiddenException when permission is missing', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ module: 'users', action: 'create' });
    permissionService.hasPermission.mockResolvedValue(false);

    await expect(
      guard.canActivate(
        buildContext({ userId: 'user-1', companyId: 'company-1' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes when any @RequireAnyPermission alternative matches', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([
        { module: 'schedule', action: 'edit' },
        { module: 'engineering_documents', action: 'create' },
      ])
      .mockReturnValueOnce(undefined);
    permissionService.hasPermission
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      guard.canActivate(
        buildContext({ userId: 'user-1', companyId: 'company-1' }),
      ),
    ).resolves.toBe(true);
  });

  it('passes when @RequirePermission is present and role matches', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ module: 'users', action: 'view' });
    permissionService.hasPermission.mockResolvedValue(true);

    await expect(
      guard.canActivate(
        buildContext({ userId: 'user-1', companyId: 'company-1' }),
      ),
    ).resolves.toBe(true);
  });
});
