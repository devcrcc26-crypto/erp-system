import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateDashboardWidgetDto,
  UpdateDashboardWidgetDto,
} from '../../application/dtos/reporting.dtos';
import {
  DashboardService,
  HrDashboardStats,
  MyDashboardStats,
  PortfolioDashboardStats,
} from '../../application/services/dashboard.service';
import {
  DashboardOperationalStats,
  DashboardOperationalStatsService,
} from '../../application/services/dashboard-operational-stats.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly operationalStatsService: DashboardOperationalStatsService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('stats')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Role-adapted operational dashboard aggregates (cached 60s, Addis Ababa calendar)',
  })
  operationalStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DashboardOperationalStats> {
    return this.operationalStatsService.getStats(this.ctx(user));
  }

  @Get('portfolio')
  @RequirePermission('projects', 'view')
  @ApiOperation({
    summary: 'Company-wide portfolio dashboard aggregates across PM modules',
  })
  portfolio(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PortfolioDashboardStats> {
    return this.dashboardService.getPortfolioDashboard(this.ctx(user));
  }

  @Get('my')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'FK-scoped dashboard counts and recent activity for current user',
  })
  myDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MyDashboardStats> {
    return this.dashboardService.getMyDashboard(this.ctx(user));
  }

  @Get('hr')
  @RequirePermission('hr', 'view')
  @ApiOperation({ summary: 'HR dashboard aggregates' })
  hrDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<HrDashboardStats> {
    return this.dashboardService.getHrDashboard(this.ctx(user));
  }

  @Get('widgets')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'List dashboard widgets for current user roles' })
  listForUser(@CurrentUser() user: AuthenticatedUser): Promise<unknown[]> {
    return this.dashboardService.listForUser(this.ctx(user));
  }

  @Get('widgets/all')
  @RequirePermission('reports', 'edit')
  @ApiOperation({ summary: 'List all dashboard widgets (admin)' })
  listAll(@CurrentUser() user: AuthenticatedUser): Promise<unknown[]> {
    return this.dashboardService.listAll(this.ctx(user));
  }

  @Post('widgets')
  @RequirePermission('reports', 'edit')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDashboardWidgetDto,
  ): Promise<unknown> {
    return this.dashboardService.create(this.ctx(user), dto);
  }

  @Patch('widgets/:id')
  @RequirePermission('reports', 'edit')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDashboardWidgetDto,
  ): Promise<unknown> {
    return this.dashboardService.update(this.ctx(user), id, dto);
  }

  @Delete('widgets/:id')
  @RequirePermission('reports', 'edit')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.dashboardService.delete(this.ctx(user), id);
    return { message: 'Widget deleted' };
  }
}
