import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyAssetController } from '../../modules/company-asset/presentation/company-asset.controller';
import { CompanyAssetService } from '../../modules/company-asset/application/services/company-asset.service';
import { CompanyVehicleController } from '../../modules/company-vehicle/presentation/controllers/company-vehicle.controller';
import { ApprovalReassignmentController } from '../../modules/approvals/presentation/controllers/approval-reassignment.controller';
import { PermissionsGuard } from './permissions.guard';
import { PermissionService } from './permission.service';

/**
 * Regression: these write endpoints carried @DelegatePermissionCheck(), which
 * makes PermissionsGuard skip their @RequireAnyPermission(*.edit), and their
 * services had no checks - so any signed-in employee could call them.
 */
type ControllerClass = abstract new (...args: never[]) => object;

const user = { userId: 'u1', companyId: 'c1' };

function contextFor(controller: ControllerClass, handler: string): ExecutionContext {
  const method = (controller.prototype as Record<string, unknown>)[handler];
  if (typeof method !== 'function') {
    throw new Error(`${controller.name}.${handler} not found`);
  }
  return {
    getHandler: () => method,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('write endpoint permissions', () => {
  let hasPermission: jest.Mock;
  let guard: PermissionsGuard;

  beforeEach(() => {
    hasPermission = jest.fn();
    guard = new PermissionsGuard(new Reflector(), {
      hasPermission,
    } as unknown as PermissionService);
  });

  const cases: Array<[ControllerClass, string, string]> = [
    ...['create', 'update', 'updateStatus', 'remove', 'uploadPhoto', 'deletePhoto'].map(
      (handler): [ControllerClass, string, string] => [CompanyVehicleController, handler, 'vehicles'],
    ),
    ...[
      'create',
      'update',
      'updateStatus',
      'remove',
      'issueAssignment',
      'returnAssignment',
      'acknowledgeReturn',
      'uploadPhoto',
      'removePhoto',
    ].map((handler): [ControllerClass, string, string] => [
      CompanyAssetController,
      handler,
      'assets',
    ]),
  ];

  it.each(cases)('%p.%s rejects a user without %s.edit', async (controller, handler) => {
    hasPermission.mockResolvedValue(false);
    await expect(guard.canActivate(contextFor(controller, handler))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it.each(cases)('%p.%s requires only %s.edit', async (controller, handler, module) => {
    hasPermission.mockImplementation(
      (_userId: string, _companyId: string, m: string, action: string) =>
        Promise.resolve(m === module && action === 'edit'),
    );
    await expect(guard.canActivate(contextFor(controller, handler))).resolves.toBe(true);
    for (const call of hasPermission.mock.calls) {
      expect([call[2], call[3]]).toEqual([module, 'edit']);
    }
  });

  it('lets approval tier reassignment through to its service role check', async () => {
    await expect(
      guard.canActivate(contextFor(ApprovalReassignmentController, 'reassign')),
    ).resolves.toBe(true);
    expect(hasPermission).not.toHaveBeenCalled();
  });
});

describe('CompanyAssetService.assertCanInitiateReturn', () => {
  function build(options: { canEdit: boolean; ownAssignment: boolean }): CompanyAssetService {
    const prisma = {
      assetAssignment: {
        findFirst: jest.fn().mockResolvedValue(options.ownAssignment ? { id: 'as1' } : null),
      },
    };
    const permissionService = {
      hasPermission: jest.fn().mockResolvedValue(options.canEdit),
    };
    return new CompanyAssetService(
      prisma as never,
      {} as never,
      permissionService as unknown as PermissionService,
    );
  }

  it('allows the assignee', async () => {
    const service = build({ canEdit: false, ownAssignment: true });
    await expect(service.assertCanInitiateReturn('a1', 'as1', 'c1', 'u1')).resolves.toBeUndefined();
  });

  it('allows an asset manager', async () => {
    const service = build({ canEdit: true, ownAssignment: false });
    await expect(service.assertCanInitiateReturn('a1', 'as1', 'c1', 'u1')).resolves.toBeUndefined();
  });

  it("rejects another employee's assignment", async () => {
    const service = build({ canEdit: false, ownAssignment: false });
    await expect(service.assertCanInitiateReturn('a1', 'as1', 'c1', 'u1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
