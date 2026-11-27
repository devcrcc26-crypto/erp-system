import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  AddPayrollFreelancersDto,
  ApprovePayrollRunDto,
  CreatePayrollCorrectionDto,
  CreatePayrollRunDto,
  SubmitPayrollRunDto,
  UpdatePayrollCompanySettingsDto,
  UpdatePayrollEntryDaysDto,
  UpdatePayrollEntryDto,
  UpdatePayrollRunDto,
  ReplacePayrollOtAdjustmentsDto,
  UpsertPayrollOtAdjustmentDto,
  CreatePayrollAdjustmentLineDto,
  CreatePayrollCorrectionLineDto,
  RecordPayrollReceiptDto,
  CreatePayrollAdjustmentTypeDto,
  ReopenPayrollRunDto,
  UpdatePayrollAdjustmentTypeDto,
  WaivePayrollReconciliationDto,
} from '../../application/dtos/payroll.dtos';
import { PayrollAdjustmentService } from '../../application/services/payroll-adjustment.service';
import { PayrollOtAdjustmentService } from '../../application/services/payroll-ot-adjustment.service';
import {
  PayrollBankLetterPreview,
  PayrollBankLetterService,
} from '../../application/services/payroll-bank-letter.service';
import {
  PayrollCompanySettings,
  PayrollCompanySettingsService,
} from '../../application/services/payroll-company-settings.service';
import { PayrollExcelExportService } from '../../application/services/payroll-excel-export.service';
import { PayrollPayslipService } from '../../application/services/payroll-payslip.service';
import { PayrollRunService } from '../../application/services/payroll-run.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PAYROLL_OVERSIGHT_MODULE } from '../../../../shared/permissions/permission.types';

@ApiTags('Payroll')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payrollRunService: PayrollRunService,
    private readonly payrollExcelExportService: PayrollExcelExportService,
    private readonly payrollBankLetterService: PayrollBankLetterService,
    private readonly payrollPayslipService: PayrollPayslipService,
    private readonly payrollCompanySettingsService: PayrollCompanySettingsService,
    private readonly permissionService: PermissionService,
    private readonly payrollOtAdjustmentService: PayrollOtAdjustmentService,
    private readonly payrollAdjustmentService: PayrollAdjustmentService,
  ) {}

  private ctx(user: AuthenticatedUser): { userId: string; companyId: string } {
    return { userId: user.userId, companyId: user.companyId };
  }

  @Get('company-settings')
  @RequireAnyPermission(
    { module: 'payroll', action: 'edit' },
    { module: 'payroll', action: 'create' },
    { module: 'company_settings', action: 'view' },
  )
  @ApiOperation({
    summary:
      'Get payroll company settings (tax form letterhead, bank letter). Missing keys use defaults.',
  })
  async getCompanySettings(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PayrollCompanySettings> {
    return this.payrollCompanySettingsService.getSettings(user.companyId);
  }

  @Patch('company-settings')
  @RequireAnyPermission(
    { module: 'payroll', action: 'edit' },
    { module: 'company_settings', action: 'edit' },
  )
  @ApiOperation({
    summary: 'Update payroll company settings (HR / admin). Stored as company_setting module=payroll.',
  })
  async updateCompanySettings(
    @Body() dto: UpdatePayrollCompanySettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PayrollCompanySettings> {
    return this.payrollCompanySettingsService.updateSettings(
      user.companyId,
      user.userId,
      dto,
    );
  }

  @Get('runs')
  @RequireAnyPermission(
    { module: 'payroll', action: 'create' },
    { module: 'payroll', action: 'approve' },
    { module: 'payroll', action: 'edit' },
    // Read-only: Managing Director sees runs; bank details stay masked.
    { module: PAYROLL_OVERSIGHT_MODULE, action: 'view' },
  )
  @ApiOperation({ summary: 'List payroll runs (HR payroll staff)' })
  listRuns(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.payrollRunService.listRuns(user.companyId);
  }

  @Get('runs/:id')
  @RequireAnyPermission(
    { module: 'payroll', action: 'create' },
    { module: 'payroll', action: 'approve' },
    { module: 'payroll', action: 'edit' },
    // Read-only: Managing Director sees runs; bank details stay masked.
    { module: PAYROLL_OVERSIGHT_MODULE, action: 'view' },
  )
  @ApiOperation({ summary: 'Get payroll run detail' })
  async getRun(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    const canCreate = await this.permissionService.hasPermission(
      user.userId,
      user.companyId,
      'payroll',
      'create',
    );
    const canEdit = await this.permissionService.hasPermission(
      user.userId,
      user.companyId,
      'payroll',
      'edit',
    );
    return this.payrollRunService.getRun(id, user.companyId, {
      maskBank: !canCreate,
      includeOverrides: canEdit,
    });
  }

  @Post('runs')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({ summary: 'Create (or reuse cancelled) payroll run and generate' })
  createRun(
    @Body() dto: CreatePayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.createRun(
      dto.month,
      dto.year,
      this.ctx(user),
      dto.notes,
      dto.considerAttendance,
    );
  }

  @Patch('runs/:id')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({
    summary:
      'Change run settings (consider attendance, notes) on a DRAFT / REVIEWED run. Changing attendance recalculates the run (audited).',
  })
  updateRun(
    @Param('id') id: string,
    @Body() dto: UpdatePayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.updateRunSettings(id, dto, this.ctx(user));
  }

  @Post('runs/:id/generate')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({ summary: 'Generate missing entries for a run' })
  generateEntries(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.generateEntries(id, this.ctx(user));
  }

  @Post('runs/:id/recalculate')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({
    summary:
      'Recalculate all entries (keeps adjustment lines, manual OT and added freelancers). DRAFT / REVIEWED / SUBMITTED only; an approved run must be reopened.',
  })
  recalculate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.recalculate(id, this.ctx(user));
  }

  @Get('runs/:id/freelancers/available')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({ summary: 'Freelancers that can be added to this run' })
  listAvailableFreelancers(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.listAvailableFreelancers(id, this.ctx(user));
  }

  @Post('runs/:id/freelancers')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({
    summary:
      'Add freelancers to an unpaid run (freelancers are never added automatically). Resets an approved run to DRAFT.',
  })
  addFreelancers(
    @Param('id') id: string,
    @Body() dto: AddPayrollFreelancersDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.addFreelancers(id, dto.employeeIds, this.ctx(user));
  }

  @Delete('runs/:id/entries/:entryId')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({
    summary: 'Remove a freelancer entry from an unpaid run. Resets an approved run to DRAFT.',
  })
  removeFreelancerEntry(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.removeFreelancerEntry(id, entryId, this.ctx(user));
  }

  @Patch('runs/:id/entries/:entryId/days')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({
    summary:
      'Override paid days on an entry in a DRAFT or REVIEWED run and recalculate its figures (HR only, audited). Optional periodId sets days for one salary period in a multi-contract month.',
  })
  overrideEntryDays(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpdatePayrollEntryDaysDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.overrideEntryDays(id, entryId, dto, this.ctx(user));
  }

  @Get('runs/:id/entries/:entryId/audit')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({ summary: 'Override history of an entry, newest first (HR only)' })
  getEntryAudit(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.getEntryAudit(id, entryId, user.companyId);
  }

  @Get('runs/:id/ot-adjustments')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({
    summary:
      'Manual (paper-based) OT adjustments on a run, optionally for one employee (payroll managers)',
  })
  listOtAdjustments(
    @Param('id') id: string,
    @Query('employeeId') employeeId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollOtAdjustmentService.list(id, user.companyId, employeeId || undefined);
  }

  @Get('runs/:id/ot-adjustments/breakdown')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({
    summary: 'System OT, manual OT and combined totals per category for one employee',
  })
  otBreakdown(
    @Param('id') id: string,
    @Query('employeeId') employeeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollOtAdjustmentService.breakdown(id, employeeId, user.companyId);
  }

  @Post('runs/:id/ot-adjustments')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({
    summary:
      'Create or update the manual OT adjustment for an employee + OT category and reprice the entry (DRAFT / REVIEWED runs, audited)',
  })
  upsertOtAdjustment(
    @Param('id') id: string,
    @Body() dto: UpsertPayrollOtAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollOtAdjustmentService.upsert(id, dto, this.ctx(user));
  }

  @Put('runs/:id/ot-adjustments')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({
    summary:
      'Replace all manual OT adjustments for one employee in a single reprice (spreadsheet UI; DRAFT / REVIEWED, audited)',
  })
  replaceOtAdjustments(
    @Param('id') id: string,
    @Body() dto: ReplacePayrollOtAdjustmentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollOtAdjustmentService.replaceForEmployee(
      id,
      dto,
      this.ctx(user),
    );
  }

  @Delete('runs/:id/ot-adjustments/:adjustmentId')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({ summary: 'Remove a manual OT adjustment and reprice the entry (audited)' })
  removeOtAdjustment(
    @Param('id') id: string,
    @Param('adjustmentId') adjustmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollOtAdjustmentService.remove(id, adjustmentId, this.ctx(user));
  }

  @Post('runs/:id/mark-reviewed')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({ summary: 'Mark DRAFT run as REVIEWED' })
  markReviewed(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.markReviewed(id, this.ctx(user));
  }

  @Post('runs/:id/submit')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({ summary: 'Submit REVIEWED run for HR approval' })
  submitRun(
    @Param('id') id: string,
    @Body() dto: SubmitPayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.submitRun(id, this.ctx(user), {
      acknowledgeFlags: dto.acknowledgeFlags,
      confirmEmploymentReview: dto.confirmEmploymentReview,
    });
  }

  @Get('runs/:id/employment-review')
  @RequireAnyPermission(
    { module: 'payroll', action: 'create' },
    { module: 'payroll', action: 'approve' },
    { module: 'payroll', action: 'edit' },
  )
  @ApiOperation({
    summary:
      'Entries to review before submit/approve: contract ended, login disabled, leaver final month, inactive in month',
  })
  employmentReview(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.employmentReviewEntries(id, user.companyId);
  }

  @Post('runs/:id/approve')
  @RequireAnyPermission({ module: 'payroll', action: 'approve' })
  @ApiOperation({ summary: 'HR Manager approve (SUBMITTED → APPROVED)' })
  approveRun(
    @Param('id') id: string,
    @Body() dto: ApprovePayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.approveRun(id, this.ctx(user), {
      confirmEmploymentReview: dto.confirmEmploymentReview,
    });
  }

  @Post('runs/:id/gm-approve')
  @RequireAnyPermission({ module: 'payroll', action: 'approve' })
  @ApiOperation({ summary: 'GM approve (APPROVED → GM_APPROVED)' })
  gmApproveRun(
    @Param('id') id: string,
    @Body() dto: ApprovePayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.gmApproveRun(id, this.ctx(user), {
      confirmEmploymentReview: dto.confirmEmploymentReview,
    });
  }

  @Post('runs/:id/mark-paid')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({ summary: 'Mark GM_APPROVED run as PAID' })
  markPaid(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.markPaid(id, this.ctx(user));
  }

  @Post('runs/:id/return-to-draft')
  @RequireAnyPermission({ module: 'payroll', action: 'approve' })
  @ApiOperation({
    summary:
      'Return a SUBMITTED run (regular or correction) to DRAFT with a reason shown in History',
  })
  returnToDraft(
    @Param('id') id: string,
    @Body() dto: ReopenPayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.returnToDraft(id, dto.reason, this.ctx(user));
  }

  @Post('runs/:id/withdraw')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({
    summary: 'Submitter withdraws a SUBMITTED run (regular or correction) back to DRAFT',
  })
  withdrawRun(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.withdrawRun(id, this.ctx(user));
  }

  @Post('runs/:id/cancel')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({ summary: 'Cancel a run (reusable month)' })
  cancelRun(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.cancelRun(id, this.ctx(user));
  }

  @Post('runs/:id/correction')
  @RequireAnyPermission(
    { module: 'payroll', action: 'edit' },
    { module: 'payroll', action: 'create' },
  )
  @ApiOperation({
    summary:
      'Create a correction draft for a GM_APPROVED/PAID regular run (HR Manager / Local HR Manager / System Administrator)',
  })
  createCorrection(
    @Param('id') id: string,
    @Body() dto: CreatePayrollCorrectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.createCorrectionRun(
      id,
      this.ctx(user),
      dto.note,
    );
  }

  @Post('runs/:id/reopen')
  @RequireAnyPermission({ module: 'payroll', action: 'approve' })
  @ApiOperation({
    summary:
      'Reopen an APPROVED / GM_APPROVED run: it becomes SUPERSEDED (kept, with the reason), its claimed inputs are released and a new DRAFT version is calculated. Paid runs are locked.',
  })
  reopenRun(
    @Param('id') id: string,
    @Body() dto: ReopenPayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.reopenRun(id, dto.reason, this.ctx(user));
  }

  @Get('runs/:id/warnings')
  @RequireAnyPermission(
    { module: 'payroll', action: 'create' },
    { module: 'payroll', action: 'approve' },
    { module: 'payroll', action: 'edit' },
  )
  @ApiOperation({
    summary:
      'Follow-ups for a run: pending OT, OT approved after calculation, open reconciliation items, deductions over one third of wage',
  })
  runWarnings(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.getRunWarnings(id, user.companyId);
  }

  @Get('runs/:id/remittance')
  @RequireAnyPermission(
    { module: 'payroll', action: 'create' },
    { module: 'payroll', action: 'approve' },
    { module: 'payroll', action: 'edit' },
  )
  @ApiOperation({
    summary:
      'Income tax and pension to declare for a run: its own totals plus correction differences it carries (labelled lines)',
  })
  runRemittance(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.getRunRemittance(id, user.companyId);
  }

  @Get('runs/:id/history')
  @RequireAnyPermission(
    { module: 'payroll', action: 'create' },
    { module: 'payroll', action: 'approve' },
    { module: 'payroll', action: 'edit' },
  )
  @ApiOperation({
    summary: 'All versions of the run period (incl. superseded) and related corrections',
  })
  runHistory(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.getRunHistory(id, user.companyId);
  }

  @Get('runs/:id/correction-lines')
  @RequireAnyPermission(
    { module: 'payroll', action: 'create' },
    { module: 'payroll', action: 'approve' },
    { module: 'payroll', action: 'edit' },
  )
  @ApiOperation({ summary: 'Correction run: paid vs corrected amount per payroll component' })
  correctionLines(
    @Param('id') id: string,
    @Query('employeeId') employeeId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.getCorrectionLines(id, user.companyId, employeeId || undefined);
  }

  @Get('runs/:id/adjustments')
  @RequireAnyPermission(
    { module: 'payroll', action: 'create' },
    { module: 'payroll', action: 'approve' },
    { module: 'payroll', action: 'edit' },
  )
  @ApiOperation({ summary: 'Adjustment lines in a run' })
  listAdjustmentLines(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollAdjustmentService.listRunLines(id, user.companyId);
  }

  @Post('runs/:id/adjustments')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({
    summary:
      'Add an adjustment line (optionally settling a reconciliation item) and reprice the entry (DRAFT / REVIEWED / SUBMITTED, audited)',
  })
  addAdjustmentLine(
    @Param('id') id: string,
    @Body() dto: CreatePayrollAdjustmentLineDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollAdjustmentService.addLine(id, dto, this.ctx(user));
  }

  @Post('runs/:id/correction-adjustments')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({
    summary:
      'Add a manual correction line (missed bonus, severance, arrears, other) to an employee of a correction run; taxable lines reprice tax and pension (DRAFT / REVIEWED / SUBMITTED, audited)',
  })
  addCorrectionLine(
    @Param('id') id: string,
    @Body() dto: CreatePayrollCorrectionLineDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollAdjustmentService.addCorrectionLine(id, dto, this.ctx(user));
  }

  @Delete('runs/:id/adjustments/:lineId')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({ summary: 'Remove an adjustment line and reprice the entry (audited)' })
  removeAdjustmentLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollAdjustmentService.removeLine(id, lineId, this.ctx(user));
  }

  @Get('runs/:id/reconciliations/:reconciliationId/suggestion')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({
    summary:
      'Suggested settlement for a reconciliation item in this run (recoveries stay within one third of the monthly wage)',
  })
  settlementSuggestion(
    @Param('id') id: string,
    @Param('reconciliationId') reconciliationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollAdjustmentService.suggestSettlement(id, reconciliationId, user.companyId);
  }

  @Get('reconciliations')
  @RequireAnyPermission(
    { module: 'payroll', action: 'create' },
    { module: 'payroll', action: 'approve' },
    { module: 'payroll', action: 'edit' },
  )
  @ApiOperation({
    summary:
      'Reconciliation items (open + waived by default; status=all for every item including settled)',
  })
  listReconciliations(
    @Query('status') status: string | undefined,
    @Query('employeeId') employeeId: string | undefined,
    @Query('correctionRunId') correctionRunId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollAdjustmentService.listReconciliations(user.companyId, {
      status: status === 'all' ? 'all' : 'open',
      employeeIds: employeeId ? [employeeId] : undefined,
      correctionRunId: correctionRunId || undefined,
    });
  }

  @Post('reconciliations/:id/waive')
  @RequireAnyPermission({ module: 'payroll', action: 'approve' })
  @ApiOperation({ summary: 'Waive what is still owed on a reconciliation item (reason required)' })
  waiveReconciliation(
    @Param('id') id: string,
    @Body() dto: WaivePayrollReconciliationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollAdjustmentService.waive(id, dto.reason, this.ctx(user));
  }

  @Post('reconciliations/:id/receipt')
  @RequireAnyPermission({ module: 'payroll', action: 'approve' })
  @ApiOperation({
    summary:
      'Record money received from an employee against an item owed to the company (amount, date, reference); settles the item',
  })
  recordReconciliationReceipt(
    @Param('id') id: string,
    @Body() dto: RecordPayrollReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollAdjustmentService.recordReceipt(id, dto, this.ctx(user));
  }

  @Post('reconciliations/:id/unwaive')
  @RequireAnyPermission({ module: 'payroll', action: 'approve' })
  @ApiOperation({
    summary: 'Undo a waive and reopen the reconciliation item for settlement',
  })
  unwaiveReconciliation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollAdjustmentService.unwaive(id, this.ctx(user));
  }

  @Get('adjustment-types')
  @RequireAnyPermission(
    { module: 'payroll', action: 'create' },
    { module: 'payroll', action: 'approve' },
    { module: 'payroll', action: 'edit' },
  )
  @ApiOperation({ summary: 'Payroll adjustment types (settings)' })
  listAdjustmentTypes(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.payrollAdjustmentService.listTypes(user.companyId);
  }

  @Post('adjustment-types')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({ summary: 'Create a payroll adjustment type' })
  createAdjustmentType(
    @Body() dto: CreatePayrollAdjustmentTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollAdjustmentService.createType(dto, this.ctx(user));
  }

  @Patch('adjustment-types/:id')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({
    summary: 'Edit a payroll adjustment type (Taxable bonus / Net bonus: names and active only)',
  })
  updateAdjustmentType(
    @Param('id') id: string,
    @Body() dto: UpdatePayrollAdjustmentTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollAdjustmentService.updateType(id, dto, this.ctx(user));
  }

  @Patch('runs/:id/unlock')
  @RequireAnyPermission(
    { module: 'payroll', action: 'edit' },
    { module: 'payroll', action: 'create' },
  )
  @ApiOperation({
    summary:
      'Retired: use POST runs/:id/reopen for approved runs. Paid runs are locked (create a correction run).',
  })
  unlockRun(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.unlockRun(id, this.ctx(user));
  }

  @Patch('entries/:id')
  @RequireAnyPermission({ module: 'payroll', action: 'edit' })
  @ApiOperation({ summary: 'Edit bonus top-up / notes on an entry' })
  updateEntry(
    @Param('id') id: string,
    @Body() dto: UpdatePayrollEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.updateEntry(id, dto, this.ctx(user));
  }

  @Get('my-payslips')
  @RequireAnyPermission(
    { module: 'payroll', action: 'view' },
    { module: 'payroll', action: 'create' },
    { module: 'payroll', action: 'approve' },
  )
  @ApiOperation({ summary: 'Released payslips for the signed-in employee' })
  listMyPayslips(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.payrollPayslipService.listMine(this.ctx(user));
  }

  @Get('employees/:employeeId/payslips')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({
    summary: 'Generated payslips for an employee, including unreleased (HR)',
  })
  listEmployeePayslips(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollPayslipService.listForHr(employeeId, this.ctx(user));
  }

  @Get('employees/:employeeId/ot-manual')
  @RequireAnyPermission(
    { module: 'overtime', action: 'view' },
    { module: 'overtime', action: 'create' },
    { module: 'overtime', action: 'manage' },
    { module: 'hr', action: 'view' },
    { module: 'payroll', action: 'view' },
    { module: 'payroll', action: 'create' },
  )
  @ApiOperation({
    summary:
      'Manual (paper) OT lines for an employee profile OT tab. Self, or hr.view / overtime.manage. Hours from save; amounts after run APPROVED.',
  })
  listEmployeeOtManual(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollOtAdjustmentService.listProfileManualLines(
      employeeId,
      this.ctx(user),
    );
  }

  @Post('runs/:id/payslips/generate')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({
    summary: 'Generate payslips for a GM_APPROVED or PAID run (idempotent)',
  })
  generatePayslips(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollPayslipService.generate(id, this.ctx(user));
  }

  @Post('runs/:id/payslips/release')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({ summary: 'Release generated payslips and notify employees' })
  releasePayslips(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollPayslipService.release(id, this.ctx(user));
  }

  @Get('runs/:id/payslips/zip')
  @RequireAnyPermission({ module: 'payroll', action: 'create' })
  @ApiOperation({ summary: 'Download every generated payslip PDF as a ZIP' })
  @ApiProduces('application/zip')
  async downloadPayslipZip(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const file = await this.payrollPayslipService.getZip(id, this.ctx(user));
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: contentDisposition('attachment', file.filename),
    });
  }

  @Get('payslips/:id/pdf')
  @RequireAnyPermission(
    { module: 'payroll', action: 'view' },
    { module: 'payroll', action: 'create' },
    { module: 'payroll', action: 'approve' },
  )
  @ApiOperation({
    summary:
      'Download a payslip PDF. Employees only after release; payroll.create or payroll.approve any time after generation.',
  })
  @ApiProduces('application/pdf')
  async downloadPayslipPdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const file = await this.payrollPayslipService.getPdf(id, this.ctx(user));
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: contentDisposition('inline', file.filename),
    });
  }

  @Get('runs/:id/export/excel')
  @RequireAnyPermission({ module: 'payroll', action: 'export' })
  @ApiOperation({
    summary:
      'Download payroll run as Excel (HR salary sheet layout). Requires payroll.export plus run list access. Streams the file to avoid buffering the whole workbook in memory.',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportExcel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    await this.assertRunListAccess(user);
    await this.payrollExcelExportService.streamExcelExport(
      id,
      user.companyId,
      user.userId,
      res,
    );
  }

  @Get('runs/:id/export/bank-letter/preview')
  @RequireAnyPermission({ module: 'payroll', action: 'export' })
  @ApiOperation({
    summary:
      'Preview the bank letter (counts, total, employees without bank accounts) without generating it. Requires GM_APPROVED or PAID.',
  })
  async previewBankLetter(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PayrollBankLetterPreview> {
    await this.assertRunListAccess(user);
    return this.payrollBankLetterService.preview(id, user.companyId);
  }

  @Get('runs/:id/export/bank-letter')
  @RequireAnyPermission({ module: 'payroll', action: 'export' })
  @ApiOperation({
    summary:
      'Download the salary bank letter (.docx). Requires GM_APPROVED or PAID. ' +
      'Reference and skipped accounts are returned in X-Payroll-Bank-Letter-Ref and X-Payroll-Excluded-Accounts headers.',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  async exportBankLetter(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    await this.assertRunListAccess(user);

    const file = await this.payrollBankLetterService.generate(
      id,
      user.companyId,
      user.userId,
    );
    res.setHeader('X-Payroll-Bank-Letter-Ref', headerSafe(file.refNo));
    res.setHeader(
      'X-Payroll-Excluded-Accounts',
      headerSafe(file.excludedEmployees.map((e) => e.name).join('; ')),
    );
    res.setHeader(
      'X-Payroll-Excluded-Count',
      String(file.excludedEmployees.length),
    );
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: contentDisposition('attachment', file.filename),
    });
  }

  /**
   * Export endpoints also require payroll run list access (create, approve or edit).
   */
  private async assertRunListAccess(user: AuthenticatedUser): Promise<void> {
    const [canCreate, canApprove, canEdit] = await Promise.all([
      this.permissionService.hasPermission(
        user.userId,
        user.companyId,
        'payroll',
        'create',
      ),
      this.permissionService.hasPermission(
        user.userId,
        user.companyId,
        'payroll',
        'approve',
      ),
      this.permissionService.hasPermission(
        user.userId,
        user.companyId,
        'payroll',
        'edit',
      ),
    ]);
    if (!canCreate && !canApprove && !canEdit) {
      throw new ForbiddenException(
        'Missing permission (any of): payroll.create, payroll.approve, payroll.edit',
      );
    }
  }
}

/** Replaces characters that are illegal in HTTP header values. */
function headerSafe(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '?');
}

function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
