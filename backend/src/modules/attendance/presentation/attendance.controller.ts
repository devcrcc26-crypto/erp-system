import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
  SubmitFieldMovementLogDto,
  GetFlaggedDaysDto,
  ListAttendanceDto,
  ListAttendanceMonthlyApprovalsDto,
  ListFieldMovementLogsDto,
  ListScanReviewsDto,
  ResolveAttendanceMissingDto,
  ReviewScanFlagDto,
  UnlockAttendanceMonthDto,
  UpdateAttendanceIdentityDto,
  UnignoreAttendancePreviewRowDto,
  UpsertFieldMovementDraftEntriesDto,
  RemoveFieldMovementDraftDayDto,
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
  @RequireAnyPermission({ module: 'attendance', action: 'create' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'create' })
  @ApiOperation({ summary: 'Confirm and persist a cached attendance preview' })
  async confirmImport(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: ConfirmAttendanceImportDto,
  ): Promise<AttendanceImportSummary> {
    return this.attendanceService.confirmImport(dto, companyId, user.userId);
  }

  @Post('import/preview/unignore')
  @RequireAnyPermission({ module: 'attendance', action: 'create' })
  @ApiOperation({
    summary:
      'Remove a previously ignored identity from the import preview so it can be assigned',
  })
  unignorePreviewRow(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: UnignoreAttendancePreviewRowDto,
  ): Promise<unknown> {
    return this.attendanceService.unignorePreviewRow(
      dto,
      companyId,
      user.userId,
    );
  }

  @Get('import/history')
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
  @ApiOperation({ summary: 'List attendance import batches for the company' })
  importHistory(@CurrentCompany() companyId: string): Promise<unknown> {
    return this.attendanceService.getImportHistory(companyId);
  }

  @Get('employees/search')
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
  @ApiOperation({ summary: 'List attendance device identities' })
  listIdentities(
    @CurrentCompany() companyId: string,
    @Query('status') status?: 'MAPPED' | 'IGNORED',
  ): Promise<unknown> {
    return this.attendanceService.listIdentities(companyId, status);
  }

  @Patch('identities/:id')
  @RequireAnyPermission({ module: 'attendance', action: 'edit' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'create' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
  @ApiOperation({ summary: 'List monthly attendance approvals' })
  listMonthlyApprovals(
    @CurrentCompany() companyId: string,
    @Query() query: ListAttendanceMonthlyApprovalsDto,
  ): Promise<unknown> {
    return this.attendanceService.listMonthlyApprovals(query, companyId);
  }

  @Get('monthly-approvals/:month/:year')
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'approve' })
  @ApiOperation({ summary: 'Mark a monthly attendance as reviewed' })
  markAsReviewed(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.attendanceService.markAsReviewed(id, companyId, user.userId);
  }

  @Post('monthly-approvals/:id/approve')
  @RequireAnyPermission({ module: 'attendance', action: 'approve' })
  @ApiOperation({ summary: 'Approve and lock a monthly attendance period' })
  approveMonth(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.attendanceService.approveMonth(id, companyId, user.userId);
  }

  @Post('monthly-approvals/:id/unlock')
  @RequireAnyPermission({ module: 'attendance', action: 'approve' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'edit' })
  @ApiOperation({ summary: 'Correct clock times on a daily attendance log' })
  correctDailyLog(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: CorrectDailyLogDto,
  ): Promise<unknown> {
    return this.attendanceService.correctDailyLog(dto, companyId, user.userId);
  }

  @Get('scan-reviews')
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
  @ApiOperation({
    summary:
      'SCAN_ONLY schedules: scans after the latest scan time for a month, with per-employee counts',
  })
  listScanReviews(
    @CurrentCompany() companyId: string,
    @Query() query: ListScanReviewsDto,
  ): Promise<unknown> {
    return this.attendanceService.listScanReviews(query, companyId);
  }

  @Patch('scan-reviews/:dailyLogId')
  @RequireAnyPermission({ module: 'attendance', action: 'edit' })
  @ApiOperation({
    summary: 'Excuse or mark late a SCAN_AFTER_DEADLINE flag (no pay effect)',
  })
  reviewScanFlag(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('dailyLogId', ParseUUIDPipe) dailyLogId: string,
    @Body() dto: ReviewScanFlagDto,
  ): Promise<unknown> {
    return this.attendanceService.reviewScanFlag(
      dailyLogId,
      dto,
      companyId,
      user.userId,
    );
  }

  @Get('flagged-days/me')
  @DelegatePermissionCheck()
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
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

  @Get('flagged-days/employee/:employeeId')
  @DelegatePermissionCheck()
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
  @ApiOperation({
    summary: 'Unresolved flagged days for an employee (HR only)',
  })
  getEmployeeFlaggedDays(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: GetFlaggedDaysDto,
  ): Promise<unknown> {
    return this.attendanceService.getFlaggedDaysOnBehalf(
      user.userId,
      employeeId,
      query.month,
      query.year,
      companyId,
    );
  }

  @Post('field-movement-logs')
  @DelegatePermissionCheck()
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
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

  @Post('field-movement-logs/draft-entries')
  @DelegatePermissionCheck()
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
  @ApiOperation({
    summary:
      'Upsert draft field-movement entries for a month (progressive explain)',
  })
  upsertFieldMovementDraftEntries(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: UpsertFieldMovementDraftEntriesDto,
  ): Promise<unknown> {
    return this.attendanceService.upsertFieldMovementDraftEntries(
      dto,
      companyId,
      user.userId,
    );
  }

  @Post('field-movement-logs/draft-entries/remove-day')
  @DelegatePermissionCheck()
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
  @ApiOperation({
    summary: 'Remove one day from the month draft field-movement log',
  })
  removeFieldMovementDraftDay(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: RemoveFieldMovementDraftDayDto,
  ): Promise<unknown> {
    return this.attendanceService.removeFieldMovementDraftDay(
      dto,
      companyId,
      user.userId,
    );
  }

  @Get('field-movement-logs')
  @DelegatePermissionCheck()
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
  @ApiOperation({ summary: 'Submit a field movement log for approval' })
  submitFieldMovementLog(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: SubmitFieldMovementLogDto,
  ): Promise<unknown> {
    return this.attendanceService.submitFieldMovementLog(
      id,
      companyId,
      user.userId,
      dto,
    );
  }

  @Patch('field-movement-logs/:id/cancel')
  @DelegatePermissionCheck()
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
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
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
  @ApiOperation({
    summary: 'Get employee daily logs for a month (HR review)',
  })
  async getEmployeeDailyLogs(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('employeeId') employeeId: string,
    @Param('month') month: string,
    @Param('year') year: string,
  ): Promise<unknown> {
    await this.attendanceService.assertCanViewEmployeeAttendance(
      user.userId,
      employeeId,
      companyId,
    );
    return this.attendanceService.getEmployeeDailyLogs(
      employeeId,
      parseInt(month, 10),
      parseInt(year, 10),
      companyId,
    );
  }

  @Get(':employeeId/year/:year')
  @RequireAnyPermission({ module: 'attendance', action: 'view' })
  @ApiOperation({ summary: 'Get an employee attendance year (HR)' })
  async getEmployeeAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('employeeId') employeeId: string,
    @Param('year') year: string,
  ): Promise<unknown> {
    // attendance.view is held by every employee (own attendance); opening
    // someone else's needs HR or a supervisor relationship.
    await this.attendanceService.assertCanViewEmployeeAttendance(
      user.userId,
      employeeId,
      companyId,
    );
    return this.attendanceService.getMyAttendance(
      employeeId,
      companyId,
      parseInt(year, 10),
    );
  }
}
