import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { ListHrEmployeesForSiteAssignmentDto } from '../../application/dtos/site-assignment.dtos';
import { SiteAssignmentService } from '../../application/services/site-assignment.service';

@ApiTags('HR Site Assignments')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('hr/employees')
export class SiteAssignmentHrEmployeesController {
  constructor(private readonly siteAssignmentService: SiteAssignmentService) {}

  @Get()
  @RequireAnyPermission({ module: 'site-assignment', action: 'create' })
  @ApiOperation({
    summary:
      'Employees for site assignment pickers (direct reports or supervisor list)',
  })
  listForSiteAssignment(
    @CurrentCompany() companyId: string,
    @Query() query: ListHrEmployeesForSiteAssignmentDto,
  ): Promise<unknown> {
    return this.siteAssignmentService.listEmployeesForSiteAssignment(
      companyId,
      query,
    );
  }
}
