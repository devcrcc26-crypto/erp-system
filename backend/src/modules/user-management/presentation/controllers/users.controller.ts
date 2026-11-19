import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import {
  isEmployeeInTeamScope,
  resolveTeamMemberIds,
} from '../../../../shared/org/team-scope.util';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { UpdateLoginNameDto } from '../../application/dtos/update-login-name.dto';
import {
  AssignUserRoleDto,
  BulkIdCardPdfDto,
  BulkIssueIdCardsDto,
  CreateUserDto,
  SetPrimaryRoleDto,
  UpdateUserDto,
  UsersQueryDto,
} from '../../application/dtos/user-management.dtos';
import { EmployeeIdCardPdfService } from '../../application/services/employee-id-card-pdf.service';
import { UserManagementService } from '../../application/services/user-management.service';
import {
  ReactivateDto,
  RehireDto,
  SeparateEmployeeDto,
  SeparationPreviewDto,
  SetInactiveDto,
  UpdateLeavingDateDto,
} from '../../application/dtos/employment-separation.dtos';
import { EmploymentLifecycleService } from '../../application/services/employment-lifecycle.service';
import { EmploymentSeparationService } from '../../application/services/employment-separation.service';
import { EmployeeProfileRecordsService } from '../../application/services/employee-profile-records.service';
import {
  CreatePositionHistoryDto,
  EducationRecordInputDto,
  PriorEmploymentInputDto,
  UpdatePositionHistoryDto,
} from '../../application/dtos/employee-profile-records.dtos';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly userManagementService: UserManagementService,
    private readonly separationService: EmploymentSeparationService,
    private readonly lifecycle: EmploymentLifecycleService,
    private readonly profileRecords: EmployeeProfileRecordsService,
    private readonly idCardPdfService: EmployeeIdCardPdfService,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':id/employment')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Employment status, periods and current separation' })
  async getEmployment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    await this.assertCanViewUser(user, id);
    return this.separationService.getEmployment(this.ctx(user), id);
  }

  @Post(':id/separation/preview')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({
    summary:
      'Preview a separation: locked payroll months, active contract, pending approvals (no changes)',
  })
  previewSeparation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SeparationPreviewDto,
  ): Promise<unknown> {
    return this.separationService.preview(this.ctx(user), id, dto.leavingDate);
  }

  @Post(':id/separation')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({
    summary:
      'Separate an employee (leaving date = last working day). Future-dated allowed; locked payroll months need confirmLockedPayroll. Optional supporting files.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['leavingDate', 'separationType', 'reason'],
      properties: {
        leavingDate: { type: 'string', example: '2026-10-14' },
        separationType: { type: 'string' },
        reason: { type: 'string' },
        confirmLockedPayroll: { type: 'boolean' },
        handover: { type: 'string', description: 'JSON handover payload (multipart)' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
  separate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SeparateEmployeeDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<unknown> {
    return this.separationService.separate(this.ctx(user), id, dto, files ?? []);
  }

  @Patch(':id/separation')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({
    summary:
      'Update the leaving date on an existing separation (HR and users.edit). Locked payroll months need confirmLockedPayroll.',
  })
  updateLeavingDate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeavingDateDto,
  ): Promise<unknown> {
    return this.separationService.updateLeavingDate(this.ctx(user), id, dto);
  }

  @Get(':id/inactive-periods')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Inactive periods (suspension, long leave, other)' })
  async listInactive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    await this.assertCanViewUser(user, id);
    return this.lifecycle.listInactive(this.ctx(user), id);
  }

  @Post(':id/inactive')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({
    summary:
      'Set an employee inactive (suspension / long leave / other). Pay and login follow the inactivePaid / inactiveCanLogin policies. Optional supporting files.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'fromDate', 'reason'],
      properties: {
        type: { type: 'string' },
        fromDate: { type: 'string', example: '2026-11-01' },
        toDate: { type: 'string', example: '2026-11-10' },
        reason: { type: 'string' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
  setInactive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetInactiveDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<unknown> {
    return this.lifecycle.setInactive(this.ctx(user), id, dto, files ?? []);
  }

  @Get(':id/employment-documents/:documentId/download-url')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Presigned download URL for an inactive/separation attachment',
  })
  async getEmploymentDocumentDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    await this.assertCanViewUser(user, id);
    return this.lifecycle.getEmploymentDocumentDownloadUrl(
      this.ctx(user),
      id,
      documentId,
    );
  }

  @Post(':id/reactivate')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({ summary: 'End the current inactive period' })
  reactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReactivateDto,
  ): Promise<unknown> {
    return this.lifecycle.reactivate(this.ctx(user), id, dto.lastInactiveDate);
  }

  @Post(':id/rehire')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({
    summary:
      'Rehire a separated employee: new employment period + contract; login re-enabled with a temporary password shown once',
  })
  rehire(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RehireDto,
  ): Promise<unknown> {
    return this.lifecycle.rehire(this.ctx(user), id, dto);
  }

  @Delete(':id/separation')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({
    summary:
      'Cancel a separation (allowed while the leaving date is in the future or not inside approved/paid payroll)',
  })
  cancelSeparation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.separationService.cancel(this.ctx(user), id);
  }

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  private canViewAllUsers(user: AuthenticatedUser): Promise<boolean> {
    return this.permissionService.hasPermission(
      user.userId,
      user.companyId,
      'users',
      'view',
    );
  }

  /** HR/admin may print or issue ID cards regardless of issuance status. */
  private async canManageIdCards(user: AuthenticatedUser): Promise<boolean> {
    if (await this.canViewAllUsers(user)) {
      return true;
    }
    return this.permissionService.hasPermission(
      user.userId,
      user.companyId,
      'hr',
      'view',
    );
  }

  /**
   * users.view sees everyone. A supervisor without it may read the profile of
   * anyone below them in the reporting chain (not their own - that is
   * My Profile).
   */
  private async assertCanViewUser(
    user: AuthenticatedUser,
    employeeId: string,
  ): Promise<void> {
    if (await this.canViewAllUsers(user)) {
      return;
    }
    if (
      employeeId !== user.userId &&
      (await isEmployeeInTeamScope(
        this.prisma,
        user.userId,
        user.companyId,
        employeeId,
      ))
    ) {
      return;
    }
    throw new ForbiddenException('You do not have access to this employee');
  }

  @Get()
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'List users (everyone with users.view; a supervisor sees their reports)',
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: UsersQueryDto,
  ): Promise<unknown> {
    const teamIds = (await this.canViewAllUsers(user))
      ? undefined
      : await resolveTeamMemberIds(this.prisma, user.userId, user.companyId);
    if (teamIds && teamIds.length === 0) {
      throw new ForbiddenException('Missing permission: users.view');
    }
    return this.userManagementService.listUsers(this.ctx(user), query, teamIds);
  }

  @Post('id-cards/pdf')
  @RequireAnyPermission(
    { module: 'users', action: 'view' },
    { module: 'hr', action: 'view' },
  )
  @ApiOperation({
    summary:
      'Download a bulk CR80 ID-card PDF (front + back per employee, HR/admin)',
  })
  @ApiProduces('application/pdf')
  async downloadBulkIdCards(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkIdCardPdfDto,
  ): Promise<StreamableFile> {
    const file = await this.idCardPdfService.getBulkPdf(
      this.ctx(user),
      dto.userIds,
    );
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: contentDisposition('attachment', file.filename),
    });
  }

  @Post('id-cards/issue')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({ summary: 'Issue ID cards for multiple employees (HR/admin)' })
  issueIdCardsBulk(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkIssueIdCardsDto,
  ): Promise<{ issued: number }> {
    return this.idCardPdfService.issueIdCardsBulk(this.ctx(user), dto.userIds);
  }

  @Get('org-gaps')
  @RequirePermission('users', 'view')
  @ApiOperation({ summary: 'Org structure gap report (read-only)' })
  async getOrgGaps(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: true; data: Awaited<ReturnType<UserManagementService['getOrgGapReport']>> }> {
    const data = await this.userManagementService.getOrgGapReport(
      user.companyId,
    );
    return { success: true, data };
  }

  @Get('directory')
  @RequireAnyPermission(
    { module: 'projects', action: 'view' },
    { module: 'schedule', action: 'view' },
    { module: 'design_packages', action: 'view' },
    { module: 'users', action: 'view' },
  )
  @ApiOperation({
    summary: 'List users for assignment pickers',
    description:
      'Returns id, name, and email for project team and task assignment UIs. Requires projects.view, not users.view.',
  })
  listDirectory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.userManagementService.listUsersDirectory(this.ctx(user), query);
  }

  @Get(':id/documents')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List employee profile documents' })
  async listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    await this.assertCanViewUser(user, id);
    return this.userManagementService.listUserDocuments(this.ctx(user), id);
  }

  @Post(':id/documents')
  @RequirePermission('users', 'edit')
  @ApiOperation({ summary: 'Upload employee profile documents' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        labels: {
          type: 'string',
          description: 'JSON array of document labels matching file order',
        },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 20, { storage: memoryStorage() }))
  uploadDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('labels') labelsRaw: string | undefined,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<unknown> {
    const labels = this.parseLabels(labelsRaw, files?.length ?? 0);
    return this.userManagementService.uploadUserDocuments(
      this.ctx(user),
      id,
      files ?? [],
      labels,
    );
  }

  @Delete(':id/documents/:documentId')
  @RequirePermission('users', 'edit')
  @ApiOperation({ summary: 'Delete an employee profile document' })
  async deleteDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<{ message: string }> {
    await this.userManagementService.deleteUserDocument(
      this.ctx(user),
      id,
      documentId,
    );
    return { message: 'Document deleted' };
  }

  @Get(':id/documents/:documentId/download-url')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get presigned download URL for a profile document' })
  async getDocumentDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    await this.assertCanViewUser(user, id);
    return this.userManagementService.getUserDocumentDownloadUrl(
      this.ctx(user),
      id,
      documentId,
    );
  }

  @Post(':id/photo')
  @RequirePermission('users', 'edit')
  @ApiOperation({ summary: 'Upload or replace employee profile picture' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<unknown> {
    if (!file) {
      throw new BadRequestException('Photo file is required');
    }
    return this.userManagementService.uploadUserPhoto(this.ctx(user), id, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });
  }

  @Get(':id/photo/download-url')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get presigned download URL for profile picture' })
  async getPhotoDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ url: string; expiresIn: number }> {
    await this.assertCanViewUser(user, id);
    return this.userManagementService.getUserPhotoDownloadUrl(
      this.ctx(user),
      id,
    );
  }

  @Delete(':id/photo')
  @RequirePermission('users', 'edit')
  @ApiOperation({ summary: 'Remove employee profile picture' })
  async deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.userManagementService.deleteUserPhoto(this.ctx(user), id);
    return { message: 'Profile photo removed' };
  }

  @Get(':id/id-card')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Download CR80 employee ID card PDF (HR/admin always; employee only when issued)',
  })
  @ApiProduces('application/pdf')
  async downloadIdCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const isSelf = user.userId === id;
    const isHr = await this.canManageIdCards(user);
    if (!isSelf && !isHr) {
      throw new ForbiddenException('You do not have access to this ID card');
    }
    const file = await this.idCardPdfService.getPdfForUser(this.ctx(user), id, {
      requireIssued: isSelf && !isHr,
    });
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: contentDisposition('attachment', file.filename),
    });
  }

  @Post(':id/issue-id-card')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({ summary: 'Issue the company ID card for an employee (HR/admin)' })
  issueIdCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.idCardPdfService.issueIdCard(this.ctx(user), id);
  }

  @Post(':id/revoke-id-card')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({ summary: 'Revoke the company ID card for an employee (HR/admin)' })
  revokeIdCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.idCardPdfService.revokeIdCard(this.ctx(user), id);
  }

  @Get(':id/education')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List higher-education rows for an employee' })
  async listEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    await this.assertCanReadProfileRecords(user, id);
    return this.profileRecords.listEducation(this.ctx(user), id);
  }

  @Post(':id/education')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({ summary: 'Add a higher-education row' })
  createEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EducationRecordInputDto,
  ): Promise<unknown> {
    return this.profileRecords.createEducation(this.ctx(user), id, dto);
  }

  @Patch(':id/education/:recordId')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({ summary: 'Update a higher-education row' })
  updateEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('recordId') recordId: string,
    @Body() dto: EducationRecordInputDto,
  ): Promise<unknown> {
    return this.profileRecords.updateEducation(this.ctx(user), id, recordId, dto);
  }

  @Delete(':id/education/:recordId')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({ summary: 'Remove a higher-education row' })
  async deleteEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('recordId') recordId: string,
  ): Promise<{ message: string }> {
    await this.profileRecords.deleteEducation(this.ctx(user), id, recordId);
    return { message: 'Education record removed' };
  }

  @Get(':id/prior-employment')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List prior employment rows for an employee' })
  async listPriorEmployment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    await this.assertCanReadProfileRecords(user, id);
    return this.profileRecords.listPriorEmployment(this.ctx(user), id);
  }

  @Post(':id/prior-employment')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({ summary: 'Add a prior-employment row' })
  createPriorEmployment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PriorEmploymentInputDto,
  ): Promise<unknown> {
    return this.profileRecords.createPriorEmployment(this.ctx(user), id, dto);
  }

  @Patch(':id/prior-employment/:recordId')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({ summary: 'Update a prior-employment row' })
  updatePriorEmployment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('recordId') recordId: string,
    @Body() dto: PriorEmploymentInputDto,
  ): Promise<unknown> {
    return this.profileRecords.updatePriorEmployment(this.ctx(user), id, recordId, dto);
  }

  @Delete(':id/prior-employment/:recordId')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({ summary: 'Remove a prior-employment row' })
  async deletePriorEmployment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('recordId') recordId: string,
  ): Promise<{ message: string }> {
    await this.profileRecords.deletePriorEmployment(this.ctx(user), id, recordId);
    return { message: 'Prior employment record removed' };
  }

  @Get(':id/position-history')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Position and salary history (HR, or the employee read-only)',
  })
  async listPositionHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    await this.assertCanReadProfileRecords(user, id);
    return this.profileRecords.listPositionHistory(this.ctx(user), id);
  }

  @Post(':id/position-history')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({
    summary: 'Add a position-history row and close the previously active one',
  })
  createPositionHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreatePositionHistoryDto,
  ): Promise<unknown> {
    return this.profileRecords.createPositionHistory(this.ctx(user), id, dto);
  }

  @Patch(':id/position-history/:recordId')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({ summary: 'Update a position-history row' })
  updatePositionHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('recordId') recordId: string,
    @Body() dto: UpdatePositionHistoryDto,
  ): Promise<unknown> {
    return this.profileRecords.updatePositionHistory(this.ctx(user), id, recordId, dto);
  }

  @Delete(':id/position-history/:recordId')
  @RequireAnyPermission(
    { module: 'users', action: 'edit' },
    { module: 'hr', action: 'edit' },
  )
  @ApiOperation({ summary: 'Remove a position-history row' })
  async deletePositionHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('recordId') recordId: string,
  ): Promise<{ message: string }> {
    await this.profileRecords.deletePositionHistory(this.ctx(user), id, recordId);
    return { message: 'Position history record removed' };
  }

  /**
   * HR (users.view or hr.view), the employee themself, or a supervisor of
   * this employee. Writes stay on users.edit / hr.edit.
   */
  private async assertCanReadProfileRecords(
    user: AuthenticatedUser,
    employeeId: string,
  ): Promise<void> {
    if (user.userId === employeeId) {
      return;
    }
    if (await this.canViewAllUsers(user)) {
      return;
    }
    const canViewHr = await this.permissionService.hasPermission(
      user.userId,
      user.companyId,
      'hr',
      'view',
    );
    if (canViewHr) {
      return;
    }
    await this.assertCanViewUser(user, employeeId);
  }

  @Get(':id')
  @DelegatePermissionCheck()
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    await this.assertCanViewUser(user, id);
    return this.userManagementService.getUser(this.ctx(user), id);
  }

  @Post()
  @RequirePermission('users', 'create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDto,
  ): Promise<unknown> {
    return this.userManagementService.createUser(this.ctx(user), dto);
  }

  @Patch(':id')
  @RequirePermission('users', 'edit')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<unknown> {
    return this.userManagementService.updateUser(this.ctx(user), id, dto);
  }

  @Delete(':id')
  @RequirePermission('users', 'delete')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.userManagementService.deleteUser(this.ctx(user), id);
    return { message: 'User deactivated' };
  }

  @Post(':id/resend-invitation')
  @RequirePermission('users', 'edit')
  resendInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    return this.userManagementService.resendInvitation(this.ctx(user), id);
  }

  @Post(':id/reset-password')
  @RequirePermission('users', 'edit')
  @ApiOperation({
    summary:
      'Admin/HR password reset - returns a temporary password once; forces mustChangePassword',
  })
  resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ temporaryPassword: string; mustChangePassword: true }> {
    return this.userManagementService.adminResetPassword(this.ctx(user), id);
  }

  @Patch(':id/login-name')
  @RequirePermission('users', 'edit')
  @ApiOperation({ summary: 'Update OA login name (HR/admin)' })
  updateLoginName(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLoginNameDto,
  ): Promise<unknown> {
    return this.userManagementService.updateLoginName(
      this.ctx(user),
      id,
      dto.loginName,
    );
  }

  @Post(':id/login-name/use-full-name')
  @RequirePermission('users', 'edit')
  @ApiOperation({
    summary: 'Set login name to the current displayed full name (HR/admin)',
  })
  setLoginNameToFullName(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.userManagementService.setLoginNameToFullName(
      this.ctx(user),
      id,
    );
  }

  @Post(':id/roles')
  @RequirePermission('users', 'edit')
  assignRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignUserRoleDto,
  ): Promise<unknown> {
    return this.userManagementService.assignUserRole(this.ctx(user), id, dto);
  }

  @Patch(':id/primary-role')
  @RequirePermission('users', 'edit')
  @ApiOperation({ summary: 'Set the primary role for a user' })
  setPrimaryRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetPrimaryRoleDto,
  ): Promise<unknown> {
    return this.userManagementService.setPrimaryRole(
      this.ctx(user),
      id,
      dto.roleId,
    );
  }

  @Delete(':id/roles/:roleId')
  @RequirePermission('users', 'edit')
  async revokeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('roleId') roleId: string,
  ): Promise<{ message: string }> {
    await this.userManagementService.revokeUserRole(this.ctx(user), id, roleId);
    return { message: 'Role revoked' };
  }

  private parseLabels(raw: string | undefined, fileCount: number): string[] {
    if (!raw?.trim()) {
      return Array.from({ length: fileCount }, () => '');
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return Array.from({ length: fileCount }, () => '');
      }
      return parsed.map((item) => (typeof item === 'string' ? item : ''));
    } catch {
      return Array.from({ length: fileCount }, () => '');
    }
  }
}

function contentDisposition(
  kind: 'inline' | 'attachment',
  filename: string,
): string {
  const safe = filename.replace(/[^\w.\-]+/g, '_');
  return `${kind}; filename="${safe}"`;
}
