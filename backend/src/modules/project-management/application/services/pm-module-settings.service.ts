import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../../audit/application/services/audit.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { isSystemAdministrator } from '../../../../shared/permissions/system-admin.util';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  PM_MODULE_SETTINGS_KEY,
  PM_MODULE_SETTINGS_MODULE,
  PM_MODULE_SETTINGS_SETTING_ID,
} from '../../domain/pm-module-settings.const';

export interface PmModuleEnabledDto {
  enabled: boolean;
  source: 'COMPANY_SETTING' | 'ENV_DEFAULT';
}

type SettingsCtx = { companyId: string; userId: string };

/**
 * Resolves and updates the company-level project-management module toggle.
 */
@Injectable()
export class PmModuleSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly permissionService: PermissionService,
    private readonly audit: AuditService,
  ) {}

  /** Env default when no company row exists (default false). */
  envDefaultEnabled(): boolean {
    const raw = this.config.get<string>('PM_MODULE_ENABLED', 'false');
    return raw === 'true' || raw === '1';
  }

  /**
   * Whether PM APIs and UI should be active for this company.
   */
  async isEnabled(companyId: string): Promise<boolean> {
    const resolved = await this.resolve(companyId);
    return resolved.enabled;
  }

  async resolve(companyId: string): Promise<PmModuleEnabledDto> {
    const row = await this.prisma.companySetting.findFirst({
      where: activeOnly({
        companyId,
        module: PM_MODULE_SETTINGS_MODULE,
        key: PM_MODULE_SETTINGS_KEY,
      }),
      select: { value: true },
    });

    if (!row) {
      return {
        enabled: this.envDefaultEnabled(),
        source: 'ENV_DEFAULT',
      };
    }

    return {
      enabled: row.value === 'true',
      source: 'COMPANY_SETTING',
    };
  }

  /**
   * System Administrator only — persists toggle and writes audit log.
   */
  async updateEnabled(
    ctx: SettingsCtx,
    enabled: boolean,
  ): Promise<PmModuleEnabledDto> {
    await this.assertSystemAdministrator(ctx);

    const before = await this.resolve(ctx.companyId);

    const row = await this.prisma.companySetting.upsert({
      where: {
        companyId_module_key: {
          companyId: ctx.companyId,
          module: PM_MODULE_SETTINGS_MODULE,
          key: PM_MODULE_SETTINGS_KEY,
        },
      },
      create: {
        companyId: ctx.companyId,
        module: PM_MODULE_SETTINGS_MODULE,
        key: PM_MODULE_SETTINGS_KEY,
        value: enabled ? 'true' : 'false',
        dataType: 'BOOLEAN',
        isPublic: true,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      update: {
        value: enabled ? 'true' : 'false',
        dataType: 'BOOLEAN',
        isPublic: true,
        updatedBy: ctx.userId,
      },
    });

    await this.audit.create({
      userId: ctx.userId,
      companyId: ctx.companyId,
      module: PM_MODULE_SETTINGS_MODULE,
      action: 'UPDATE',
      recordType: 'CompanySetting',
      recordId: row.id,
      recordReference: PM_MODULE_SETTINGS_SETTING_ID,
      beforeValue: { enabled: before.enabled, source: before.source },
      afterValue: { enabled, source: 'COMPANY_SETTING' },
    });

    return { enabled, source: 'COMPANY_SETTING' };
  }

  private async assertSystemAdministrator(ctx: SettingsCtx): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (!isSystemAdministrator(roleNames)) {
      throw new ForbiddenException(
        'Only System Administrator can change project management module settings',
      );
    }
  }
}
