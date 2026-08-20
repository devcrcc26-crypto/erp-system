import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { LeavePolicyService } from '../../application/services/leave-policy.service';

@ApiTags('HR Leave Policies')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'hr', action: 'view' },
  { module: 'users', action: 'view' },
  { module: 'users', action: 'create' },
  { module: 'users', action: 'edit' },
)
@Controller('hr/leave-policies')
export class LeavePolicyController {
  constructor(private readonly leavePolicyService: LeavePolicyService) {}

  @Get()
  @ApiOperation({ summary: 'List active leave policies for employee assignment' })
  list(@CurrentCompany() companyId: string): Promise<unknown[]> {
    return this.leavePolicyService.listActivePolicies(companyId);
  }
}
