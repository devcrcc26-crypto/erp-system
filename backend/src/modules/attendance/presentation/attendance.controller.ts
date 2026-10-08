import {
  BadRequestException,
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentCompany } from '../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../shared/types/jwt-payload.type';
import {
  ConfirmAttendanceImportDto,
  CorrectDailyLogDto,
  CreateFieldMovementLogDto,
  GetFlaggedDaysDto,
  ListAttendanceDto,
  ListAttendanceMonthlyApprovalsDto,
  ListFieldMovementLogsDto,
  ResolveAttendanceMissingDto,
  UnlockAttendanceMonthDto,
  UpdateAttendanceIdentityDto,
} from '../application/dtos/attendance.dto';
import {
  AttendanceEmployeeSearchResult,
  AwaitingEnrolmentEmployee,
  AttendanceImportSummary,
  AttendancePreviewResult,
  AttendanceService,
} from '../application/services/attendance.service';

@ApiTags('HR Attendance')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('hr/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('import/preview')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'Preview a Deli e+ attendance Excel import' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async previewImport(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AttendancePreviewResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Only .xlsx files are accepted');
    }
    return this.attendanceService.previewImport(file, companyId, user.userId);
  }

  @Post('import/confirm')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'Confirm and persist a cached attendance preview' })
  async confirmImport(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: ConfirmAttendanceImportDto,
  ): Promise<AttendanceImportSummary> {
    return this.attendanceService.confirmImport(dto, companyId, user.userId);
  }

  @Get('import/history')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'List attendance import batches for the company' })
  importHistory(@CurrentCompany() companyId: string): Promise<unknown> {
    return this.attendanceService.getImportHistory(companyId);
  }

  @Get('employees/search')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({
    summary: 'Search active employees for manual attendance assignment',
  })
  searchEmployees(
    @CurrentCompany() companyId: string,
    @Query('q') query = '',
  ): Promise<AttendanceEmployeeSearchResult[]> {
    return this.attendanceService.searchEmployees(query, companyId);
  }

  @Get('awaiting-enrolment')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({
    summary:
      'Employees marked "Needs enrolment" with no scan in any later import',
  })
  listAwaitingEnrolment(
    @CurrentCompany() companyId: string,
  ): Promise<AwaitingEnrolmentEmployee[]> {
    return this.attendanceService.listAwaitingEnrolment(companyId);
  }

  @Get('identities')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'List attendance device identities' })
  listIdentities(
    @CurrentCompany() companyId: string,
    @Query('status') status?: 'MAPPED' | 'IGNORED',
  ): Promise<unknown> {
    return this.attendanceService.listIdentities(companyId, status);
  }

  @Patch('identities/:id')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'Update an attendance identity mapping' })
  updateIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceIdentityDto,
  ): Promise<unknown> {
    return this.attendanceService.updateIdentity(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Get('imports/:batchId/details')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({
    summary: 'Unmatched and missing rows for an import batch',
  })
  getImportBatchDetails(
    @CurrentCompany() companyId: string,
    @Param('batchId') batchId: string,
  ): Promise<unknown> {
    return this.attendanceService.getImportBatchDetails(batchId, companyId);
  }

  @Post('imports/:batchId/missing/:missingId/resolve')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({
    summary: 'Resolve an employee missing from the attendance file',
  })
  resolveImportMissing(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('batchId') batchId: string,
    @Param('missingId') missingId: string,
    @Body() dto: ResolveAttendanceMissingDto,
  ): Promise<unknown> {
    return this.attendanceService.resolveImportMissing(
      batchId,
      missingId,
      dto,
      companyId,
      user.userId,
    );
  }

  @Get('monthly-approvals')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'List monthly attendance approvals' })
  listMonthlyApprovals(
    @CurrentCompany() companyId: string,
    @Query() query: ListAttendanceMonthlyApprovalsDto,
  ): Promise<unknown> {
    return this.attendanceService.listMonthlyApprovals(query, companyId);
  }

  @Get('monthly-approvals/:month/:year')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'Get monthly attendance approval for a period' })
  getMonthlyApproval(
    @CurrentCompany() companyId: string,
    @Param('month') month: string,
    @Param('year') year: string,
  ): Promise<unknown> {
    return this.attendanceService.getMonthlyApproval(
      parseInt(month, 10),
      parseInt(year, 10),
      companyId,
    );
  }

  @Post('monthly-approvals/:id/review')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'Mark a monthly attendance as reviewed' })
  markAsReviewed(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.attendanceService.markAsReviewed(id, companyId, user.userId);
  }

  @Post('monthly-approvals/:id/approve')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'Approve and lock a monthly attendance period' })
  approveMonth(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.attendanceService.approveMonth(id, companyId, user.userId);
  }

  @Post('monthly-approvals/:id/unlock')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'Unlock an approved monthly attendance period' })
  unlockMonth(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UnlockAttendanceMonthDto,
  ): Promise<unknown> {
    return this.attendanceService.unlockMonth(
      { ...dto, monthlyApprovalId: id },
      companyId,
      user.userId,
    );
  }

  @Post('daily-logs/correct')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'Correct clock times on a daily attendance log' })
  correctDailyLog(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: CorrectDailyLogDto,
  ): Promise<unknown> {
    return this.attendanceService.correctDailyLog(dto, companyId, user.userId);
  }

  @Get('flagged-days/me')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'List unresolved flagged days for the signed-in employee',
  })
  getMyFlaggedDays(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: GetFlaggedDaysDto,
  ): Promise<unknown> {
    return this.attendanceService.getFlaggedDaysForEmployee(
      user.userId,
      query.month,
      query.year,
      companyId,
    );
  }

  @Post('field-movement-logs')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Create a draft field movement / early departure log' })
  createFieldMovementLog(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: CreateFieldMovementLogDto,
  ): Promise<unknown> {
    return this.attendanceService.createFieldMovementLog(
      dto,
      companyId,
      user.userId,
    );
  }

  @Get('field-movement-logs')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List field movement logs' })
  listFieldMovementLogs(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListFieldMovementLogsDto,
  ): Promise<unknown> {
    return this.attendanceService.listFieldMovementLogs(
      query,
      companyId,
      user.userId,
    );
  }

  @Get('field-movement-logs/:id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get a field movement log by id' })
  getFieldMovementLog(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.attendanceService.getFieldMovementLog(
      id,
      companyId,
      user.userId,
    );
  }

  @Post('field-movement-logs/:id/submit')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit a field movement log for approval' })
  submitFieldMovementLog(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.attendanceService.submitFieldMovementLog(
      id,
      companyId,
      user.userId,
    );
  }

  @Patch('field-movement-logs/:id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Cancel a draft or submitted field movement log' })
  cancelFieldMovementLog(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.attendanceService.cancelFieldMovementLog(
      id,
      companyId,
      user.userId,
    );
  }

  @Get()
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'List attendance records (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListAttendanceDto,
  ): Promise<unknown> {
    return this.attendanceService.listRecords(query, companyId, user.userId);
  }

  @Get('me')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get my attendance records for a year' })
  getMyAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query('year') year?: string,
  ): Promise<unknown> {
    const parsedYear = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.attendanceService.getMyAttendance(
      user.userId,
      companyId,
      parsedYear,
    );
  }

  @Get(':employeeId/month/:month/year/:year/daily-logs')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({
    summary: 'Get employee daily logs for a month (HR review)',
  })
  getEmployeeDailyLogs(
    @CurrentCompany() companyId: string,
    @Param('employeeId') employeeId: string,
    @Param('month') month: string,
    @Param('year') year: string,
  ): Promise<unknown> {
    return this.attendanceService.getEmployeeDailyLogs(
      employeeId,
      parseInt(month, 10),
      parseInt(year, 10),
      companyId,
    );
  }

  @Get(':employeeId/year/:year')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'Get an employee attendance year (HR)' })
  getEmployeeAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('employeeId') employeeId: string,
    @Param('year') year: string,
  ): Promise<unknown> {
    void user;
    return this.attendanceService.getMyAttendance(
      employeeId,
      companyId,
      parseInt(year, 10),
    );
  }
}
