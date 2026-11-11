import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { HrReportQueryDto } from '../../application/dtos/hr-report.dtos';
import {
  HrReport,
  HrReportService,
} from '../../application/services/hr-report.service';

/**
 * Mounted under `hr/` rather than `reports/` so it is not swallowed by the
 * `GET /reports/:id` route on ReportsController.
 */
@ApiTags('HR Reports')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequirePermission('hr', 'view')
@Controller('hr/reports')
export class HrReportController {
  constructor(private readonly hrReportService: HrReportService) {}

  @Get()
  @ApiOperation({
    summary:
      'HR report for a period: headcount, leave, overtime, travel and contracts',
  })
  getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: HrReportQueryDto,
  ): Promise<HrReport> {
    return this.hrReportService.getHrReport(
      { companyId: user.companyId, userId: user.userId },
      query,
    );
  }
}
