import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { PmListQueryDto } from '../../application/dtos/pm.dtos';
import { IssuesService } from '../../application/services/issues.service';

/**
 * Company-scoped issue routes (no project path param).
 */
@ApiTags('Issues')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('issues')
export class MyIssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('my')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'List issues relevant to the current user across projects',
  })
  listMy(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.issuesService.listMyIssues(this.ctx(user), query);
  }

  @Get('all')
  @RequirePermission('projects', 'view')
  @ApiOperation({
    summary: 'List all issues across projects (portfolio access)',
  })
  listAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.issuesService.listAllIssues(this.ctx(user), query);
  }

  @Get('my/projects')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'List projects where the current user has relevant issues',
  })
  listMyProjects(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.issuesService.listMyIssueProjects(this.ctx(user));
  }
}
