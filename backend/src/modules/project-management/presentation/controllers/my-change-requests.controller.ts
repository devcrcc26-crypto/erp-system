import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { PmListQueryDto } from '../../application/dtos/pm.dtos';
import { ProjectChangeRequestService } from '../../application/services/project-change-request.service';

/**
 * Company-scoped change request routes (no project path param).
 */
@ApiTags('Change Requests')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('change-requests')
export class MyChangeRequestsController {
  constructor(
    private readonly changeRequestService: ProjectChangeRequestService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('my')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'List change requests relevant to the current user across projects',
  })
  listMy(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.changeRequestService.listMyChangeRequests(this.ctx(user), query);
  }

  @Get('all')
  @RequirePermission('projects', 'view')
  @ApiOperation({
    summary: 'List all change requests across projects (portfolio access)',
  })
  listAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.changeRequestService.listAllChangeRequests(this.ctx(user), query);
  }

  @Get('my/projects')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'List projects where the current user can raise change requests',
  })
  listMyProjects(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.changeRequestService.listMyChangeRequestProjects(this.ctx(user));
  }
}
