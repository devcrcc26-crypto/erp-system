import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
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
import { PayrollRunService } from '../../application/services/payroll-run.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';

@ApiTags('Payroll')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payrollRunService: PayrollRunService,
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
}
