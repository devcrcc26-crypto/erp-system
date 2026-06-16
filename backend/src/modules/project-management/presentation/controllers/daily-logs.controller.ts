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
  PmListQueryDto,
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
    @Query() query: PmListQueryDto,
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
}
