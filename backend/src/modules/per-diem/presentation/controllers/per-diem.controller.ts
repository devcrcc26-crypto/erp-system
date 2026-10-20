import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreatePerDiemDisbursementDto,
  CreatePerDiemRequestSettlementDto,
  ListPerDiemRequestsDto,
  MarkPerDiemPaidDto,
  SetApprovedRateDto,
  SubmitPerDiemRequestDto,
} from '../../application/dtos/per-diem.dtos';
import { PerDiemService } from '../../application/services/per-diem.service';

@ApiTags('HR Per Diem')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'per-diem', action: 'view' },
  { module: 'per-diem', action: 'create' },
)
@Controller('hr/per-diem')
export class PerDiemController {
  constructor(private readonly perDiemService: PerDiemService) {}

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit a per diem request (authenticated user, own record)' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: SubmitPerDiemRequestDto,
  ): Promise<unknown> {
    return this.perDiemService.submitRequest(dto, companyId, user.userId);
  }

  @Get()
  @ApiOperation({
    summary: 'List per diem requests (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListPerDiemRequestsDto,
  ): Promise<unknown> {
    return this.perDiemService.listRequests(query, companyId, user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a per diem request with approval tiers' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.perDiemService.getRequest(id, companyId, user.userId);
  }

  @Patch(':id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Cancel a draft or submitted per diem request (employee or on-behalf submitter)',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.perDiemService.cancelRequest(id, companyId, user.userId);
  }

  @Post(':id/mark-paid')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Mark an approved advance as paid (requires per-diem.edit or hr.edit)',
  })
  markPaid(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: MarkPerDiemPaidDto,
  ): Promise<unknown> {
    return this.perDiemService.markPaid(id, dto, companyId, user.userId);
  }

  @Post(':id/disbursements')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Record a cash disbursement against an approved/active per diem request (requires per-diem.manage)',
  })
  addDisbursement(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: CreatePerDiemDisbursementDto,
  ): Promise<unknown> {
    return this.perDiemService.addDisbursement(id, dto, companyId, user.userId);
  }

  @Patch(':id/approved-rate')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Set the approved daily rate on a pending per diem request (approver action)',
  })
  setApprovedRate(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: SetApprovedRateDto,
  ): Promise<unknown> {
    return this.perDiemService.setApprovedRate(id, dto.approvedDailyRate, companyId);
  }

  @Post(':id/settle')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Settle an active per diem request by computing earned vs. disbursed amounts (requires per-diem.manage)',
  })
  settle(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: CreatePerDiemRequestSettlementDto,
  ): Promise<unknown> {
    return this.perDiemService.settleRequest(id, dto, companyId, user.userId);
  }
}
