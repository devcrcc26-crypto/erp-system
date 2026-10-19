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
  ListPerDiemSettlementsDto,
  RecordCashReturnedDto,
  SubmitPerDiemSettlementDto,
} from '../../application/dtos/per-diem-settlement.dtos';
import { PerDiemSettlementService } from '../../application/services/per-diem-settlement.service';

@ApiTags('HR Per Diem Settlements')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'per-diem', action: 'view' },
  { module: 'per-diem', action: 'create' },
)
@Controller('hr/per-diem/settlements')
export class PerDiemSettlementController {
  constructor(
    private readonly perDiemSettlementService: PerDiemSettlementService,
  ) {}

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit a per diem settlement for own approved advances' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: SubmitPerDiemSettlementDto,
  ): Promise<unknown> {
    return this.perDiemSettlementService.submitSettlement(
      dto,
      companyId,
      user.userId,
    );
  }

  @Get('unsettled-advances')
  @ApiOperation({
    summary: 'List the caller’s approved per diem advances that are not yet settled',
  })
  unsettled(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown[]> {
    return this.perDiemSettlementService.listUnsettledAdvances(
      companyId,
      user.userId,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List per diem settlements (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListPerDiemSettlementsDto,
  ): Promise<unknown> {
    return this.perDiemSettlementService.listSettlements(
      query,
      companyId,
      user.userId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a per diem settlement with linked advances and approval tiers' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.perDiemSettlementService.getSettlement(
      id,
      companyId,
      user.userId,
    );
  }

  @Patch(':id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Cancel a settlement and release its advances (requester only)' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.perDiemSettlementService.cancelSettlement(
      id,
      companyId,
      user.userId,
    );
  }

  @Patch(':id/cash-returned')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Record the cash-returned receipt (hr.edit, approved, balance to company)',
  })
  recordCashReturned(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: RecordCashReturnedDto,
  ): Promise<unknown> {
    return this.perDiemSettlementService.recordCashReturned(
      id,
      dto,
      companyId,
      user.userId,
    );
  }
}
