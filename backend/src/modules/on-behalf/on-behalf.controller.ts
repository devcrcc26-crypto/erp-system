import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
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
  InitiableEmployee,
  OnBehalfEligibleEmployee,
  OnBehalfService,
} from './on-behalf.service';
import {
  INITIATOR_REQUEST_TYPES,
  type InitiatorRequestType,
  type RequestInitiator,
} from '../../shared/policy/policy-definitions';

function toOptionalBoolean({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1';
  }
  return Boolean(value);
}

export class InitiableEmployeesQueryDto {
  @ApiProperty({ enum: INITIATOR_REQUEST_TYPES })
  @IsIn(INITIATOR_REQUEST_TYPES)
  module!: InitiatorRequestType;

  @ApiPropertyOptional({
    description:
      'When true, only approver-only employees (site-assignment on-behalf). When omitted, HR-process employees only.',
  })
  @Transform(toOptionalBoolean)
  @IsOptional()
  @IsBoolean()
  approverOnly?: boolean;

  @ApiPropertyOptional({
    description:
      'Site assignment only: list HR-process employees who report to this supervisor (on-behalf target).',
  })
  @IsOptional()
  @IsUUID()
  crewSupervisorId?: string;
}

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

  @Get('initiable-employees')
  @ApiOperation({
    summary:
      'Site assignment / WFH / flight / business trip: who the caller may file for (allowedInitiators), and whether they may file for themselves',
  })
  async initiableEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: InitiableEmployeesQueryDto,
  ): Promise<{
    allowed: RequestInitiator[];
    selfAllowed: boolean;
    employees: InitiableEmployee[];
  }> {
    const [allowed, employees] = await Promise.all([
      this.onBehalfService.allowedInitiators(companyId, query.module),
      this.onBehalfService.getInitiableEmployees(user.userId, companyId, query.module, {
        approverOnly: query.approverOnly === true,
        crewSupervisorId: query.crewSupervisorId,
      }),
    ]);
    return { allowed, selfAllowed: allowed.includes('SELF'), employees };
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
  ): Promise<{
    isInChain: boolean;
    tierLabel: string | null;
    autoApproveAllowed: boolean;
  }> {
    return this.onBehalfService.isInApprovalChain(
      user.userId,
      query.employeeId,
      companyId,
      query.module,
    );
  }
}
