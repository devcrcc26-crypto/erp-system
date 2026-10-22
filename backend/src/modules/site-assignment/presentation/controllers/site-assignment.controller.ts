import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  ListSiteAssignmentsDto,
  ShortenSiteAssignmentDto,
  CreateSiteAssignmentDto,
} from '../../application/dtos/site-assignment.dtos';
import { SiteAssignmentService } from '../../application/services/site-assignment.service';

@ApiTags('HR Site Assignments')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('hr/site-assignments')
export class SiteAssignmentController {
  constructor(
    private readonly siteAssignmentService: SiteAssignmentService,
  ) {}

  @Post()
  @RequireAnyPermission({ module: 'site-assignment', action: 'create' })
  @ApiOperation({ summary: 'Create a site assignment (immediately active)' })
  async submit(
    @Body() dto: CreateSiteAssignmentDto,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.siteAssignmentService.submitRequest(dto, companyId, user.userId);
  }

  @Get()
  @RequireAnyPermission({ module: 'site-assignment', action: 'view' })
  @ApiOperation({ summary: 'List site assignments' })
  async list(
    @Query() query: ListSiteAssignmentsDto,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.siteAssignmentService.listRequests(
      query,
      companyId,
      user.userId,
    );
  }

  @Get('employee/:employeeId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Site assignments for employee profile' })
  async listForEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.siteAssignmentService.listForEmployee(
      employeeId,
      companyId,
      user.userId,
    );
  }

  @Get(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Site assignment detail' })
  async getOne(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.siteAssignmentService.getDetail(id, companyId, user.userId);
  }

  @Get(':id/overtime-impact')
  @RequirePermission('site-assignment', 'manage')
  @ApiOperation({
    summary:
      'HR: overtime entries a cancel (no endDate) or shorten (endDate) would affect',
  })
  async overtimeImpact(
    @Param('id') id: string,
    @Query('endDate') endDate: string | undefined,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    if (endDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new BadRequestException('endDate must be YYYY-MM-DD');
    }
    return this.siteAssignmentService.getOvertimeImpact(
      id,
      companyId,
      user.userId,
      endDate,
    );
  }

  @Post(':id/cancel')
  @RequireAnyPermission({ module: 'site-assignment', action: 'create' })
  @ApiOperation({ summary: 'Employee cancel (SUBMITTED only)' })
  async cancelSubmitted(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.siteAssignmentService.cancelSubmitted(
      id,
      companyId,
      user.userId,
    );
  }

  @Post(':id/cancel-approved')
  @RequirePermission('site-assignment', 'manage')
  @ApiOperation({ summary: 'HR cancel an approved assignment' })
  async cancelApproved(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.siteAssignmentService.cancelApproved(
      id,
      companyId,
      user.userId,
      reason,
    );
  }

  @Post(':id/shorten')
  @RequirePermission('site-assignment', 'manage')
  @ApiOperation({ summary: 'HR shorten approved assignment end date' })
  async shorten(
    @Param('id') id: string,
    @Body() dto: ShortenSiteAssignmentDto,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.siteAssignmentService.shortenApproved(
      id,
      dto,
      companyId,
      user.userId,
    );
  }
}
