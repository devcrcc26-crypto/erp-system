import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { PmListQueryDto } from '../../application/dtos/pm.dtos';
import { RisksService } from '../../application/services/risks.service';

/**
 * Company-scoped risk routes (no project path param).
 */
@ApiTags('Risks')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('risks')
export class MyRisksController {
  constructor(private readonly risksService: RisksService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('my')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'List risks relevant to the current user across projects',
  })
  listMy(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.risksService.listMyRisks(this.ctx(user), query);
  }

  @Get('all')
  @RequirePermission('projects', 'view')
  @ApiOperation({
    summary: 'List all risks across projects (portfolio access)',
  })
  listAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.risksService.listAllRisks(this.ctx(user), query);
  }

  @Get('my/projects')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'List projects where the current user has relevant risks',
  })
  listMyProjects(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.risksService.listMyRiskProjects(this.ctx(user));
  }
}
