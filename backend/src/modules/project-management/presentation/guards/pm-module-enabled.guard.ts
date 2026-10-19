import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { isSystemAdministrator } from '../../../../shared/permissions/system-admin.util';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { PmModuleSettingsService } from '../../application/services/pm-module-settings.service';

/**
 * Returns 404 when PM is disabled company-wide (System Administrator bypass).
 */
@Injectable()
export class PmModuleEnabledGuard implements CanActivate {
  constructor(
    private readonly pmModuleSettings: PmModuleSettingsService,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new NotFoundException();
    }

    const enabled = await this.pmModuleSettings.isEnabled(user.companyId);
    if (enabled) {
      return true;
    }

    const roleNames = await this.permissionService.getUserRoleNames(
      user.userId,
      user.companyId,
    );
    if (isSystemAdministrator(roleNames)) {
      return true;
    }

    throw new NotFoundException();
  }
}
