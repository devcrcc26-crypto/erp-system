import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PmModuleSettingsService } from './pm-module-settings.service';

describe('PmModuleSettingsService', () => {
  const companyId = 'company-1';
  const adminUserId = 'admin-1';
  const employeeUserId = 'user-2';

  function buildService(options: {
    envDefault?: boolean;
    storedValue?: string | null;
    roleNames?: string[];
  }): {
    service: PmModuleSettingsService;
    prisma: {
      companySetting: {
        findFirst: jest.Mock;
        upsert: jest.Mock;
      };
    };
    audit: { create: jest.Mock };
  } {
    const prisma = {
      companySetting: {
        findFirst: jest.fn(async () =>
          options.storedValue == null
            ? null
            : { value: options.storedValue, id: 'setting-1' },
        ),
        upsert: jest.fn(async () => ({ id: 'setting-1' })),
      },
    };
    const config = {
      get: jest.fn((_key: string, defaultValue: string) =>
        options.envDefault ? 'true' : defaultValue,
      ),
    } as unknown as ConfigService;
    const permissionService = {
      getUserRoleNames: jest.fn(async () => options.roleNames ?? ['Employee']),
    };
    const audit = { create: jest.fn(async () => undefined) };

    const service = new PmModuleSettingsService(
      prisma as never,
      config,
      permissionService as never,
      audit as never,
    );

    return { service, prisma, audit };
  }

  it('defaults to env PM_MODULE_ENABLED when no company row exists', async () => {
    const off = buildService({ envDefault: false, storedValue: null });
    expect(await off.service.isEnabled(companyId)).toBe(false);

    const on = buildService({ envDefault: true, storedValue: null });
    expect(await on.service.isEnabled(companyId)).toBe(true);
  });

  it('allows System Administrator to update the toggle with audit', async () => {
    const { service, audit } = buildService({
      storedValue: 'false',
      roleNames: ['System Administrator'],
    });

    const result = await service.updateEnabled(
      { companyId, userId: adminUserId },
      true,
    );

    expect(result.enabled).toBe(true);
    expect(audit.create).toHaveBeenCalled();
  });

  it('rejects non-admin updates', async () => {
    const { service } = buildService({
      storedValue: 'false',
      roleNames: ['Employee'],
    });

    await expect(
      service.updateEnabled({ companyId, userId: employeeUserId }, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
