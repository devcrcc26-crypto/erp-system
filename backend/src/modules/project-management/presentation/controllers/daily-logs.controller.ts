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
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateDailyLogDto,
  CreateDailyLogEquipmentDto,
  CreateDailyLogIncidentDto,
  CreateDailyLogMaterialDto,
  CreateDailyLogVisitorDto,
  CreateDailyLogWorkforceDto,
  DailyLogListQueryDto,
  UpdateDailyLogDto,
} from '../../application/dtos/pm.dtos';
import { DailyLogsService } from '../../application/services/daily-logs.service';
import { PmModuleAccessGuard } from '../guards/pm-module-access.guard';
import { RequirePmModule } from '../guards/require-pm-module.decorator';

@ApiTags('Daily Logs')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard, PmModuleAccessGuard)
@RequirePmModule('daily_logs')
@Controller('projects/:projectId/daily-logs')
export class DailyLogsController {
  constructor(private readonly dailyLogsService: DailyLogsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List project daily logs' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: DailyLogListQueryDto,
  ): Promise<unknown> {
    return this.dailyLogsService.listDailyLogs(this.ctx(user), projectId, query);
  }

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Create daily log' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateDailyLogDto,
  ): Promise<unknown> {
    return this.dailyLogsService.createDailyLog(this.ctx(user), projectId, dto);
  }

  // Child routes must be registered before the generic :id routes.
  @Post(':id/submit')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit daily log for approval (DRAFT â†?SUBMITTED)' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.dailyLogsService.submitDailyLog(this.ctx(user), projectId, id);
  }

  @Post(':id/approve')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Approve submitted daily log (SUBMITTED â†?APPROVED)' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.dailyLogsService.approveDailyLog(this.ctx(user), projectId, id);
  }

  @Post(':id/recall')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Recall submitted daily log to draft (SUBMITTED â†?DRAFT)' })
  recall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.dailyLogsService.recallDailyLog(this.ctx(user), projectId, id);
  }

  @Post(':id/workforce')
  @DelegatePermissionCheck()
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
  @DelegatePermissionCheck()
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
  @DelegatePermissionCheck()
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
  @DelegatePermissionCheck()
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
  @DelegatePermissionCheck()
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
  @DelegatePermissionCheck()
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
  @DelegatePermissionCheck()
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
  @DelegatePermissionCheck()
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

  @Post(':id/materials')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Add material entry to daily log' })
  addMaterial(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateDailyLogMaterialDto,
  ): Promise<unknown> {
    return this.dailyLogsService.addMaterial(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Delete(':id/materials/:materialId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Remove material entry from daily log' })
  async removeMaterial(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('materialId') materialId: string,
  ): Promise<{ message: string }> {
    await this.dailyLogsService.removeMaterial(
      this.ctx(user),
      projectId,
      id,
      materialId,
    );
    return { message: 'Material entry removed' };
  }

  @Get(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get daily log by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.dailyLogsService.getDailyLog(this.ctx(user), projectId, id);
  }

  @Patch(':id')
  @DelegatePermissionCheck()
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
}
