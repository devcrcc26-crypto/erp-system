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
import { CurrentCompany } from '../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../shared/permissions/require-any-permission.decorator';
import { RequirePermission } from '../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../shared/types/jwt-payload.type';
import {
  CancelWorkFromHomeRequestDto,
  CreateWorkFromHomeDayDto,
  ListWorkFromHomeDaysDto,
  PreviewWorkFromHomeRangeDto,
  RequestWorkFromHomeDayDto,
  UpdateWorkFromHomeDayDto,
  UpdateWorkFromHomeRequestDto,
} from '../application/dtos/work-from-home-day.dto';
import { WorkFromHomeDayService } from '../application/services/work-from-home-day.service';

@ApiTags('HR Work From Home')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('hr/attendance/work-from-home')
export class WorkFromHomeDayController {
  constructor(private readonly service: WorkFromHomeDayService) {}

  @Get()
  @RequireAnyPermission({ module: 'wfh', action: 'view' })
  @ApiOperation({ summary: 'List work-from-home days (wfh.manage holders)' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListWorkFromHomeDaysDto,
  ): Promise<unknown[]> {
    return this.service.listForAssigner(
      companyId,
      user.userId,
      query.month,
      query.year,
    );
  }

  @Get('assignable-employees')
  @RequireAnyPermission({ module: 'wfh', action: 'view' })
  @ApiOperation({
    summary: 'Employees eligible for work-from-home (HR direct assign or request)',
  })
  listAssignable(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.service.listAssignableEmployees(user.userId, companyId);
  }

  @Post('preview')
  @RequireAnyPermission({ module: 'wfh', action: 'create' })
  @ApiOperation({
    summary:
      'Preview a work-from-home range: working days to create and skipped days with the reason',
  })
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: PreviewWorkFromHomeRangeDto,
  ): Promise<unknown> {
    return this.service.previewRange(dto, companyId, user.userId);
  }

  @Post('requests/:approvalRequestId/cancel')
  @RequireAnyPermission({ module: 'wfh', action: 'create' })
  @ApiOperation({
    summary:
      'Cancel a work-from-home request (pending: employee / filer / HR; approved: HR - removes its day rows)',
  })
  cancelRequest(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('approvalRequestId') approvalRequestId: string,
    @Body() dto: CancelWorkFromHomeRequestDto,
  ): Promise<unknown> {
    return this.service.cancelRequest(
      approvalRequestId,
      dto,
      companyId,
      user.userId,
    );
  }

  @Patch('requests/:approvalRequestId')
  @RequireAnyPermission({ module: 'wfh', action: 'create' })
  @ApiOperation({
    summary:
      'Edit your own returned work-from-home request; saving resubmits it (chain restarts)',
  })
  updateRequest(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('approvalRequestId') approvalRequestId: string,
    @Body() dto: UpdateWorkFromHomeRequestDto,
  ): Promise<unknown> {
    return this.service.updateRequest(
      approvalRequestId,
      dto,
      companyId,
      user.userId,
    );
  }

  @Post('request')
  @RequireAnyPermission({ module: 'wfh', action: 'create' })
  @ApiOperation({
    summary:
      'Submit a work-from-home request for a date range (Reports to → HR Officer)',
  })
  request(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: RequestWorkFromHomeDayDto,
  ): Promise<unknown> {
    return this.service.submitRequest(dto, companyId, user.userId);
  }

  @Post()
  @RequirePermission('wfh', 'manage')
  @ApiOperation({ summary: 'Assign work-from-home days directly (wfh.manage)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: CreateWorkFromHomeDayDto,
  ): Promise<unknown> {
    return this.service.create(dto, companyId, user.userId);
  }

  @Patch(':id')
  @RequirePermission('wfh', 'manage')
  @ApiOperation({ summary: 'Update a work-from-home day' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkFromHomeDayDto,
  ): Promise<unknown> {
    return this.service.update(id, dto, companyId, user.userId);
  }

  @Delete(':id')
  @RequirePermission('wfh', 'manage')
  @ApiOperation({ summary: 'Soft-delete a work-from-home day' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.service.remove(id, companyId, user.userId);
  }
}
