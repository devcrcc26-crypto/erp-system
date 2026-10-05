import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
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
  CreatePayrollRunDto,
  SubmitPayrollRunDto,
  UpdatePayrollEntryDto,
} from '../../application/dtos/payroll.dtos';
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
    private readonly payrollPayslipService: PayrollPayslipService,
    private readonly permissionService: PermissionService,
  ) {}

  private ctx(user: AuthenticatedUser): { userId: string; companyId: string } {
    return { userId: user.userId, companyId: user.companyId };
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
    return this.payrollRunService.getRun(id, user.companyId, {
      maskBank: !canCreate,
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
  @ApiOperation({ summary: 'Recalculate all entries (preserves bonus top-ups)' })
  recalculate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.recalculate(id, this.ctx(user));
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
    });
  }

  @Post('runs/:id/approve')
  @RequireAnyPermission({ module: 'payroll', action: 'approve' })
  @ApiOperation({ summary: 'HR Manager approve (SUBMITTED → APPROVED)' })
  approveRun(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.approveRun(id, this.ctx(user));
  }

  @Post('runs/:id/gm-approve')
  @RequireAnyPermission({ module: 'payroll', action: 'approve' })
  @ApiOperation({ summary: 'GM approve (APPROVED → GM_APPROVED)' })
  gmApproveRun(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payrollRunService.gmApproveRun(id, this.ctx(user));
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
      'Download payroll run as Excel (HR salary sheet layout). Requires payroll.export plus run list access.',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportExcel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
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

    const file = await this.payrollExcelExportService.exportRun(
      id,
      user.companyId,
    );
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}

function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
