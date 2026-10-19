import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { UpdatePmModuleEnabledDto } from '../../application/dtos/pm-module-settings.dtos';
import {
  PmModuleEnabledDto,
  PmModuleSettingsService,
} from '../../application/services/pm-module-settings.service';

@ApiTags('Module settings')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('modules/project-management')
export class PmModuleSettingsController {
  constructor(private readonly pmModuleSettings: PmModuleSettingsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('enabled')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Whether project management is enabled for the company' })
  getEnabled(@CurrentUser() user: AuthenticatedUser): Promise<PmModuleEnabledDto> {
    return this.pmModuleSettings.resolve(user.companyId);
  }

  @Patch('enabled')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Enable or disable project management (System Administrator only)',
  })
  updateEnabled(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePmModuleEnabledDto,
  ): Promise<PmModuleEnabledDto> {
    return this.pmModuleSettings.updateEnabled(this.ctx(user), dto.enabled);
  }
}
