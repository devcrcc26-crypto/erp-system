import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateDailyLogDto,
  CreateDailyLogEquipmentDto,
  CreateDailyLogIncidentDto,
  CreateDailyLogVisitorDto,
  CreateDailyLogWorkforceDto,
  DailyLogListQueryDto,
  UpdateDailyLogDto,
} from '../../application/dtos/pm.dtos';
import { DailyLogsService } from '../../application/services/daily-logs.service';

@ApiTags('Daily Logs')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('projects/:projectId/daily-logs')
export class DailyLogsController {
  constructor(private readonly dailyLogsService: DailyLogsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('daily_logs', 'view')
  @ApiOperation({ summary: 'List project daily logs' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: DailyLogListQueryDto,
  ): Promise<unknown> {
    return this.dailyLogsService.listDailyLogs(this.ctx(user), projectId, query);
  }

  @Post()
  @RequirePermission('daily_logs', 'create')
  @ApiOperation({ summary: 'Create daily log' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateDailyLogDto,
  ): Promise<unknown> {
    return this.dailyLogsService.createDailyLog(this.ctx(user), projectId, dto);
  }

  @Get(':id')
  @RequirePermission('daily_logs', 'view')
  @ApiOperation({ summary: 'Get daily log by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.dailyLogsService.getDailyLog(this.ctx(user), projectId, id);
  }

  @Patch(':id')
  @RequirePermission('daily_logs', 'edit')
  @ApiOperation({ summary: 'Update daily log' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDailyLogDto,
  ): Promise<unknown> {
    return this.dailyLogsService.updateDailyLog(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermission('daily_logs', 'delete')
  @ApiOperation({ summary: 'Delete daily log' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.dailyLogsService.deleteDailyLog(this.ctx(user), projectId, id);
    return { message: 'Daily log deleted' };
  }

  @Post(':id/workforce')
  @RequirePermission('daily_logs', 'edit')
  @ApiOperation({ summary: 'Add workforce entry to daily log' })
  addWorkforce(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateDailyLogWorkforceDto,
  ): Promise<unknown> {
    return this.dailyLogsService.addWorkforce(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Delete(':id/workforce/:workforceId')
  @RequirePermission('daily_logs', 'edit')
  @ApiOperation({ summary: 'Remove workforce entry from daily log' })
  async removeWorkforce(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('workforceId') workforceId: string,
  ): Promise<{ message: string }> {
    await this.dailyLogsService.removeWorkforce(
      this.ctx(user),
      projectId,
      id,
      workforceId,
    );
    return { message: 'Workforce entry removed' };
  }

  @Post(':id/equipment')
  @RequirePermission('daily_logs', 'edit')
  @ApiOperation({ summary: 'Add equipment entry to daily log' })
  addEquipment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateDailyLogEquipmentDto,
  ): Promise<unknown> {
    return this.dailyLogsService.addEquipment(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Delete(':id/equipment/:equipmentId')
  @RequirePermission('daily_logs', 'edit')
  @ApiOperation({ summary: 'Remove equipment entry from daily log' })
  async removeEquipment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('equipmentId') equipmentId: string,
  ): Promise<{ message: string }> {
    await this.dailyLogsService.removeEquipment(
      this.ctx(user),
      projectId,
      id,
      equipmentId,
    );
    return { message: 'Equipment entry removed' };
  }

  @Post(':id/visitors')
  @RequirePermission('daily_logs', 'edit')
  @ApiOperation({ summary: 'Add visitor entry to daily log' })
  addVisitor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateDailyLogVisitorDto,
  ): Promise<unknown> {
    return this.dailyLogsService.addVisitor(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Delete(':id/visitors/:visitorId')
  @RequirePermission('daily_logs', 'edit')
  @ApiOperation({ summary: 'Remove visitor entry from daily log' })
  async removeVisitor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('visitorId') visitorId: string,
  ): Promise<{ message: string }> {
    await this.dailyLogsService.removeVisitor(
      this.ctx(user),
      projectId,
      id,
      visitorId,
    );
    return { message: 'Visitor entry removed' };
  }

  @Post(':id/incidents')
  @RequirePermission('daily_logs', 'edit')
  @ApiOperation({ summary: 'Add incident entry to daily log' })
  addIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateDailyLogIncidentDto,
  ): Promise<unknown> {
    return this.dailyLogsService.addIncident(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Delete(':id/incidents/:incidentId')
  @RequirePermission('daily_logs', 'edit')
  @ApiOperation({ summary: 'Remove incident entry from daily log' })
  async removeIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('incidentId') incidentId: string,
  ): Promise<{ message: string }> {
    await this.dailyLogsService.removeIncident(
      this.ctx(user),
      projectId,
      id,
      incidentId,
    );
    return { message: 'Incident entry removed' };
  }
}
