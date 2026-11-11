import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { PmListQueryDto } from '../../application/dtos/pm.dtos';
import { RfisService } from '../../application/services/rfis.service';

/**
 * Company-scoped RFI routes (no project path param).
 */
@ApiTags('RFIs')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('rfis')
export class MyRfisController {
  constructor(private readonly rfisService: RfisService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('my')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'List RFIs relevant to the current user across projects',
  })
  listMy(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.rfisService.listMyRfis(this.ctx(user), query);
  }

  @Get('all')
  @RequirePermission('projects', 'view')
  @ApiOperation({
    summary: 'List all RFIs across projects (portfolio access)',
  })
  listAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.rfisService.listAllRfis(this.ctx(user), query);
  }

  @Get('my/projects')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'List projects where the current user can raise RFIs',
  })
  listMyProjects(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.rfisService.listMyRfiProjects(this.ctx(user));
  }
}
