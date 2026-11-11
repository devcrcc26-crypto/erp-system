import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreatePerDiemDisbursementDto,
  CreatePerDiemRequestSettlementDto,
  FormalizeRequestSettlementBalanceDto,
  ListPerDiemRequestsDto,
  SetApprovedRateDto,
  SubmitPerDiemRequestDto,
  UpdatePerDiemRequestDto,
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

  @Get('request-settlements')
  @ApiOperation({
    summary:
      'List request-level per diem settlements (company-wide for per-diem.manage; own otherwise)',
  })
  listRequestSettlements(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListPerDiemRequestsDto,
  ): Promise<unknown> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.perDiemService.listRequestSettlements(
      page,
      limit,
      companyId,
      user.userId,
    );
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

  @Patch(':id')
  // Ownership and DRAFT/RETURNED status are enforced in the service.
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Edit your own draft or returned per diem request (saves only; resubmit from Approvals)',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePerDiemRequestDto,
  ): Promise<unknown> {
    return this.perDiemService.updateRequest(id, dto, companyId, user.userId);
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

  @Post(':id/disbursements/:disbursementId/attachments')
  @DelegatePermissionCheck()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload a receipt attachment for a disbursement (requires per-diem.manage)',
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadDisbursementAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('disbursementId') disbursementId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<unknown> {
    return this.perDiemService.uploadDisbursementAttachment(
      id,
      disbursementId,
      file,
      companyId,
      user.userId,
    );
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
    return this.perDiemService.setApprovedRate(
      id,
      dto.approvedDailyRate,
      companyId,
      user.userId,
    );
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

  @Post(':id/settlement/formalize-balance')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Formalize settlement balance payment (to employee or cash returned to company)',
  })
  formalizeSettlementBalance(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: FormalizeRequestSettlementBalanceDto,
  ): Promise<unknown> {
    return this.perDiemService.formalizeRequestSettlementBalance(
      id,
      dto,
      companyId,
      user.userId,
    );
  }
}
