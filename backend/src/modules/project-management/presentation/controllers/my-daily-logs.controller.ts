import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { PmListQueryDto } from '../../application/dtos/pm.dtos';
import { DailyLogsService } from '../../application/services/daily-logs.service';

/**
 * Company-scoped daily log routes (no project path param).
 */
@ApiTags('Daily Logs')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('daily-logs')
export class MyDailyLogsController {
  constructor(private readonly dailyLogsService: DailyLogsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('my')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'List daily logs relevant to the current user across projects',
  })
  listMy(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.dailyLogsService.listMyDailyLogs(this.ctx(user), query);
  }

  @Get('all')
  @RequirePermission('projects', 'view')
  @ApiOperation({
    summary: 'List all daily logs across projects (portfolio access)',
  })
  listAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.dailyLogsService.listAllDailyLogs(this.ctx(user), query);
  }

  @Get('my/projects')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'List projects where the current user has relevant daily logs',
  })
  listMyProjects(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.dailyLogsService.listMyDailyLogProjects(this.ctx(user));
  }
}
