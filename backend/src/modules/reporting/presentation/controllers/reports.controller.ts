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
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateReportDefinitionDto,
  CreateReportScheduleDto,
  ExportReportQueryDto,
  UpdateReportDefinitionDto,
  UpdateReportScheduleDto,
} from '../../application/dtos/reporting.dtos';
import { ReportingService } from '../../application/services/reporting.service';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportingService: ReportingService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'List report definitions' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.reportingService.listReports(this.ctx(user), query);
  }

  @Post()
  @RequirePermission('reports', 'create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportDefinitionDto,
  ): Promise<unknown> {
    return this.reportingService.createReport(this.ctx(user), dto);
  }

  @Get(':id')
  @RequirePermission('reports', 'view')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.reportingService.getReport(this.ctx(user), id);
  }

  @Patch(':id')
  @RequirePermission('reports', 'edit')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateReportDefinitionDto,
  ): Promise<unknown> {
    return this.reportingService.updateReport(this.ctx(user), id, dto);
  }

  @Delete(':id')
  @RequirePermission('reports', 'edit')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.reportingService.deleteReport(this.ctx(user), id);
    return { message: 'Report deleted' };
  }

  @Post(':id/execute')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'Execute report and return data' })
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.reportingService.executeReport(this.ctx(user), id);
  }

  @Post(':id/export')
  @RequirePermission('reports', 'export')
  @ApiOperation({ summary: 'Export report as JSON or CSV' })
  export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ExportReportQueryDto,
  ): Promise<{ filename: string; format: string; content: unknown }> {
    return this.reportingService.exportReport(
      this.ctx(user),
      id,
      query.format,
    );
  }

  @Get(':id/schedules')
  @RequirePermission('reports', 'view')
  listSchedules(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown[]> {
    return this.reportingService.listSchedules(this.ctx(user), id);
  }

  @Post(':id/schedules')
  @RequirePermission('reports', 'edit')
  createSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateReportScheduleDto,
  ): Promise<unknown> {
    return this.reportingService.createSchedule(this.ctx(user), id, dto);
  }

  @Patch(':id/schedules/:scheduleId')
  @RequirePermission('reports', 'edit')
  updateSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: UpdateReportScheduleDto,
  ): Promise<unknown> {
    return this.reportingService.updateSchedule(
      this.ctx(user),
      id,
      scheduleId,
      dto,
    );
  }

  @Delete(':id/schedules/:scheduleId')
  @RequirePermission('reports', 'edit')
  async deleteSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
  ): Promise<{ message: string }> {
    await this.reportingService.deleteSchedule(this.ctx(user), id, scheduleId);
    return { message: 'Schedule deleted' };
  }
}
