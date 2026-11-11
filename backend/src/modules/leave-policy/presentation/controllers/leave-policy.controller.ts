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
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateLeavePolicyDto,
  RefreshLeaveBalancesDto,
  UpdateLeavePolicyDto,
} from '../../application/dtos/leave-policy.dtos';
import { LeavePolicyService } from '../../application/services/leave-policy.service';

@ApiTags('HR Leave Policies')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('hr/leave-policies')
export class LeavePolicyController {
  constructor(private readonly leavePolicyService: LeavePolicyService) {}

  @Get('active')
  @RequireAnyPermission(
    { module: 'leave', action: 'manage' },
    { module: 'users', action: 'view' },
    { module: 'users', action: 'create' },
    { module: 'users', action: 'edit' },
  )
  @ApiOperation({
    summary: 'List active leave policies for employee assignment',
  })
  listActive(@CurrentCompany() companyId: string): Promise<unknown[]> {
    return this.leavePolicyService.listActivePolicies(companyId);
  }

  @Get()
  @RequirePermission('leave', 'manage')
  @ApiOperation({ summary: 'List leave policies with rules and employee counts' })
  list(@CurrentCompany() companyId: string): Promise<unknown[]> {
    return this.leavePolicyService.listPolicies(companyId);
  }

  @Post('refresh-balances')
  @RequirePermission('leave', 'manage')
  @ApiOperation({ summary: 'Manually refresh leave balances for a year' })
  refreshBalances(
    @CurrentCompany() companyId: string,
    @Body() dto: RefreshLeaveBalancesDto,
  ): Promise<{ refreshed: number }> {
    const year = dto.year ?? new Date().getFullYear();
    return this.leavePolicyService.refreshAllBalances(companyId, year);
  }

  @Get(':id')
  @RequirePermission('leave', 'manage')
  @ApiOperation({ summary: 'Get a leave policy with rules' })
  get(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.leavePolicyService.getPolicy(id, companyId);
  }

  @Post()
  @RequirePermission('leave', 'manage')
  @ApiOperation({ summary: 'Create a leave policy with rules' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: CreateLeavePolicyDto,
  ): Promise<unknown> {
    return this.leavePolicyService.createPolicy(dto, companyId, user.userId);
  }

  @Patch(':id')
  @RequirePermission('leave', 'manage')
  @ApiOperation({ summary: 'Update a leave policy and replace rules' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeavePolicyDto,
  ): Promise<unknown> {
    return this.leavePolicyService.updatePolicy(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermission('leave', 'manage')
  @ApiOperation({ summary: 'Soft-delete a leave policy' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.leavePolicyService.deletePolicy(id, companyId, user.userId);
    return { message: 'Leave policy deleted' };
  }
}
