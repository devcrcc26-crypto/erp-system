import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
  ListAttendanceDto,
} from '../application/dtos/attendance.dto';
import {
  AttendanceEmployeeSearchResult,
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
