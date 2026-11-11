import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../shared/permissions/require-any-permission.decorator';
import type { AuthenticatedUser } from '../../../shared/types/jwt-payload.type';
import { BackdatingPolicyService } from '../application/services/backdating-policy.service';

@ApiTags('HR Backdating')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'hr', action: 'view' },
  { module: 'leave', action: 'create' },
  { module: 'leave', action: 'view' },
)
@Controller('hr/backdating')
export class BackdatingPolicyController {
  constructor(private readonly backdating: BackdatingPolicyService) {}

  @Get('earliest-allowed-date')
  @ApiOperation({
    summary:
      'Earliest allowed date for site assignment, WFH, field movement, overtime',
  })
  async earliestAllowedDate(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('employeeId') employeeId: string,
  ): Promise<{
    earliestDate: string;
    actorKind: string;
    requiresLateReasonWhenBeforeCurrentMonth: boolean;
  }> {
    return this.backdating.getEarliestAllowedDateForEmployee(
      companyId,
      user.userId,
      employeeId,
    );
  }
}
