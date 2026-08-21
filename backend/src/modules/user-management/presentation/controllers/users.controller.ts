import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  AssignUserRoleDto,
  CreateUserDto,
  SetPrimaryRoleDto,
  UpdateUserDto,
  UsersQueryDto,
} from '../../application/dtos/user-management.dtos';
import { UserManagementService } from '../../application/services/user-management.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly userManagementService: UserManagementService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('users', 'view')
  @ApiOperation({ summary: 'List users' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: UsersQueryDto,
  ): Promise<unknown> {
    return this.userManagementService.listUsers(this.ctx(user), query);
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
  @RequirePermission('users', 'view')
  @ApiOperation({ summary: 'List employee profile documents' })
  listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
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
  @RequirePermission('users', 'view')
  @ApiOperation({ summary: 'Get presigned download URL for a profile document' })
  getDocumentDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    return this.userManagementService.getUserDocumentDownloadUrl(
      this.ctx(user),
      id,
      documentId,
    );
  }

  @Get(':id')
  @RequirePermission('users', 'view')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
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
