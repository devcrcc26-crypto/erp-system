import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import { CurrentCompany } from '../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../shared/permissions/permissions.guard';
import { AuthenticatedUser } from '../../shared/types/jwt-payload.type';
import {
  HR_ON_BEHALF_MODULE_CODES,
  HrOnBehalfModuleCode,
} from '../hr-shared/application/services/hr-approval-chain.service';
import {
  OnBehalfEligibleEmployee,
  OnBehalfService,
} from './on-behalf.service';

export class OnBehalfChainQueryDto {
  @ApiProperty({ description: 'Employee the request would be filed for' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ enum: HR_ON_BEHALF_MODULE_CODES })
  @IsIn(HR_ON_BEHALF_MODULE_CODES)
  module!: HrOnBehalfModuleCode;
}

@ApiTags('HR On Behalf')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@DelegatePermissionCheck()
@Controller('hr/on-behalf')
export class OnBehalfController {
  constructor(private readonly onBehalfService: OnBehalfService) {}

  @Get('eligible-employees')
  @ApiOperation({
    summary:
      'Employees the caller may submit HR requests on behalf of (empty when none)',
  })
  eligibleEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<OnBehalfEligibleEmployee[]> {
    return this.onBehalfService.getEligibleEmployees(user.userId, companyId);
  }

  @Get('is-in-chain')
  @ApiOperation({
    summary:
      "Whether the caller holds a tier in the approval chain for the employee's request",
  })
  isInChain(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: OnBehalfChainQueryDto,
  ): Promise<{ isInChain: boolean; tierLabel: string | null }> {
    return this.onBehalfService.isInApprovalChain(
      user.userId,
      query.employeeId,
      companyId,
      query.module,
    );
  }
}
