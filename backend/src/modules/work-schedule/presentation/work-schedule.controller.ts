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
import { CurrentCompany } from '../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../shared/permissions/require-any-permission.decorator';
import { RequirePermission } from '../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../shared/types/jwt-payload.type';
import { AssignScheduleDto } from '../application/dtos/assign-schedule.dto';
import {
  CreateWorkScheduleDto,
  UpdateWorkScheduleDto,
} from '../application/dtos/create-work-schedule.dto';
import { PreviewDaysDto } from '../application/dtos/preview-days.dto';
import { WorkScheduleService } from '../application/services/work-schedule.service';

@ApiTags('HR Work Schedules')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('hr/work-schedules')
export class WorkScheduleController {
  constructor(private readonly workScheduleService: WorkScheduleService) {}

  @Post('preview-days')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Preview working-day weights for leave periods (weekends, half days, holidays). Any authenticated user; non-HR may only preview self.',
  })
  previewDays(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: PreviewDaysDto,
  ): Promise<unknown> {
    return this.workScheduleService.previewDays(dto, companyId, user.userId);
  }

  @Get('my')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      "Current user's active work schedule (assignment, else company default). Any authenticated user; null when none exists.",
  })
  mySchedule(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.workScheduleService.getMySchedule(user.userId, companyId);
  }

  @Get('employees/:employeeId')
  @RequireAnyPermission(
    { module: 'hr', action: 'view' },
    { module: 'users', action: 'view' },
  )
  @ApiOperation({
    summary: 'Current work schedule and assignment history for an employee',
  })
  employeeSchedule(
    @CurrentCompany() companyId: string,
    @Param('employeeId') employeeId: string,
  ): Promise<unknown> {
    return this.workScheduleService.getEmployeeSchedule(employeeId, companyId);
  }

  @Get()
  @RequireAnyPermission(
    { module: 'hr', action: 'view' },
    { module: 'users', action: 'view' },
  )
  @ApiOperation({ summary: 'List work schedules' })
  list(@CurrentCompany() companyId: string): Promise<unknown[]> {
    return this.workScheduleService.listSchedules(companyId);
  }

  @Get(':id')
  @RequirePermission('hr', 'view')
  @ApiOperation({ summary: 'Get a work schedule with weekday breakdown' })
  get(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.workScheduleService.getSchedule(id, companyId);
  }

  @Post()
  @RequirePermission('hr', 'view')
  @ApiOperation({ summary: 'Create a work schedule' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: CreateWorkScheduleDto,
  ): Promise<unknown> {
    return this.workScheduleService.createSchedule(dto, companyId, user.userId);
  }

  @Patch(':id')
  @RequirePermission('hr', 'view')
  @ApiOperation({ summary: 'Update a work schedule' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkScheduleDto,
  ): Promise<unknown> {
    return this.workScheduleService.updateSchedule(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermission('hr', 'view')
  @ApiOperation({
    summary:
      'Delete a work schedule and move its employees to the company default (the default itself cannot be deleted; to keep a schedule on record instead, PATCH isActive:false)',
  })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{
    movedEmployees: number;
    defaultScheduleId: string;
    defaultScheduleName: string;
  }> {
    return this.workScheduleService.removeSchedule(id, companyId, user.userId);
  }

  @Post(':id/set-default')
  @RequirePermission('hr', 'view')
  @ApiOperation({ summary: 'Set a work schedule as the company default' })
  setDefault(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.workScheduleService.setDefault(id, companyId, user.userId);
  }

  @Post(':id/assign')
  @RequirePermission('hr', 'view')
  @ApiOperation({ summary: 'Assign a work schedule to an employee' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: AssignScheduleDto,
  ): Promise<unknown> {
    return this.workScheduleService.assignToEmployee(
      id,
      dto,
      companyId,
      user.userId,
    );
  }
}
