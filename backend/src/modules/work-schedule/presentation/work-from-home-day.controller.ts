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
import { DelegatePermissionCheck } from '../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../shared/permissions/permissions.guard';
import { AuthenticatedUser } from '../../../shared/types/jwt-payload.type';
import {
  CancelWorkFromHomeRequestDto,
  CreateWorkFromHomeDayDto,
  ListWorkFromHomeDaysDto,
  PreviewWorkFromHomeRangeDto,
  RequestWorkFromHomeDayDto,
  UpdateWorkFromHomeDayDto,
} from '../application/dtos/work-from-home-day.dto';
import { WorkFromHomeDayService } from '../application/services/work-from-home-day.service';

@ApiTags('HR Work From Home')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@DelegatePermissionCheck()
@Controller('hr/attendance/work-from-home')
export class WorkFromHomeDayController {
  constructor(private readonly service: WorkFromHomeDayService) {}

  @Get()
  @ApiOperation({ summary: 'List work-from-home days (HR or Discipline Lead)' })
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
  @ApiOperation({
    summary:
      'Employees the current user may assign WFH to (HR: all; Discipline Lead: their reports)',
  })
  listAssignable(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.service.listAssignableEmployees(user.userId, companyId);
  }

  @Post('preview')
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

  @Post('request')
  @ApiOperation({
    summary:
      'Submit a work-from-home request for a date range (Employee → Discipline Lead)',
  })
  request(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: RequestWorkFromHomeDayDto,
  ): Promise<unknown> {
    return this.service.submitRequest(dto, companyId, user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Assign a work-from-home day (HR or Discipline Lead)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: CreateWorkFromHomeDayDto,
  ): Promise<unknown> {
    return this.service.create(dto, companyId, user.userId);
  }

  @Patch(':id')
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
  @ApiOperation({ summary: 'Soft-delete a work-from-home day' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.service.remove(id, companyId, user.userId);
  }
}
