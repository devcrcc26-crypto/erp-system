import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { PermissionService } from '../../../shared/permissions/permission.service';
import { PermissionsGuard } from '../../../shared/permissions/permissions.guard';
import { isEmployeeInTeamScope } from '../../../shared/org/team-scope.util';
import { PrismaService } from '../../../shared/prisma/prisma.service';
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
  constructor(
    private readonly workScheduleService: WorkScheduleService,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('preview-days')
  @RequireAnyPermission(
    { module: 'work-schedule', action: 'view' },
    { module: 'leave', action: 'create' },
    { module: 'leave', action: 'edit' },
    { module: 'leave', action: 'manage' },
  )
  @ApiOperation({
    summary:
      'Preview working-day weights for leave periods (weekends, half days, holidays). Non-HR may only preview self.',
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
      "Current user's active work schedule (assignment, else company default); null when none exists. Any signed-in employee may load their own.",
  })
  mySchedule(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.workScheduleService.getMySchedule(user.userId, companyId);
  }

  @Get('employees/:employeeId')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Current work schedule and assignment history for an employee (work-schedule.view, or their supervisor)',
  })
  async employeeSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('employeeId') employeeId: string,
  ): Promise<unknown> {
    const allowed =
      (await this.permissionService.hasPermission(
        user.userId,
        companyId,
        'work-schedule',
        'view',
      )) ||
      (employeeId !== user.userId &&
        (await isEmployeeInTeamScope(this.prisma, user.userId, companyId, employeeId)));
    if (!allowed) {
      throw new ForbiddenException("You do not have access to this employee's schedule");
    }
    return this.workScheduleService.getEmployeeSchedule(employeeId, companyId);
  }

  @Get()
  @RequireAnyPermission({ module: 'work-schedule', action: 'view' })
  @ApiOperation({ summary: 'List work schedules' })
  list(@CurrentCompany() companyId: string): Promise<unknown[]> {
    return this.workScheduleService.listSchedules(companyId);
  }

  @Get(':id')
  @RequireAnyPermission({ module: 'work-schedule', action: 'view' })
  @ApiOperation({ summary: 'Get a work schedule with weekday breakdown' })
  get(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.workScheduleService.getSchedule(id, companyId);
  }

  @Post()
  @RequirePermission('work-schedule', 'edit')
  @ApiOperation({ summary: 'Create a work schedule' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: CreateWorkScheduleDto,
  ): Promise<unknown> {
    return this.workScheduleService.createSchedule(dto, companyId, user.userId);
  }

  @Patch(':id')
  @RequirePermission('work-schedule', 'edit')
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
  @RequirePermission('work-schedule', 'edit')
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
  @RequirePermission('work-schedule', 'edit')
  @ApiOperation({ summary: 'Set a work schedule as the company default' })
  setDefault(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.workScheduleService.setDefault(id, companyId, user.userId);
  }

  @Post(':id/assign')
  @RequirePermission('work-schedule', 'edit')
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
