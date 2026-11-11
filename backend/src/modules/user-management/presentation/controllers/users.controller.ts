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
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  CreateUserDto,
  SetPrimaryRoleDto,
  UpdateUserDto,
  UsersQueryDto,
} from '../../application/dtos/user-management.dtos';
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

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly userManagementService: UserManagementService,
    private readonly separationService: EmploymentSeparationService,
    private readonly lifecycle: EmploymentLifecycleService,
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
      'Separate an employee (leaving date = last working day). Future-dated allowed; locked payroll months need confirmLockedPayroll.',
  })
  separate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SeparateEmployeeDto,
  ): Promise<unknown> {
    return this.separationService.separate(this.ctx(user), id, dto);
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
      'Set an employee inactive (suspension / long leave / other). Pay and login follow the inactivePaid / inactiveCanLogin policies.',
  })
  setInactive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetInactiveDto,
  ): Promise<unknown> {
    return this.lifecycle.setInactive(this.ctx(user), id, dto);
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
