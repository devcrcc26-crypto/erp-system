import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
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
} from '../../application/dtos/payroll.dtos';
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
    );
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
      'Recalculate all entries (preserves bonus top-ups and added freelancers). Allowed until PAID; resets an approved run to DRAFT.',
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
      'Override paid days on an entry in a DRAFT or REVIEWED run and recalculate its figures (HR only, audited)',
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
  @RequireAnyPermission({ module: 'payroll', action: 'approve' })
  @ApiOperation({
    summary:
      'Create a correction draft for a GM_APPROVED/PAID regular run (HR Manager / System Administrator)',
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

  @Patch('runs/:id/unlock')
  @RequireAnyPermission({ module: 'payroll', action: 'approve' })
  @ApiOperation({
    summary:
      'Unlock a GM_APPROVED/PAID regular run back to DRAFT and void payslips (HR Manager / System Administrator)',
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
