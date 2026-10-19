import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  StreamableFile,
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
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { canManageUserImport } from '../../application/utils/user-import-access.util';
import {
  ImportCommitResponseDto,
  ImportPreviewResponseDto,
  ImportUsersOptionsDto,
} from '../../application/dtos/user-import.dtos';
import { UserImportService } from '../../application/services/user-import.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('users/import')
export class UsersImportController {
  constructor(
    private readonly userImportService: UserImportService,
    private readonly permissionService: PermissionService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  private async assertCanManageUserImport(user: AuthenticatedUser): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      user.userId,
      user.companyId,
    );
    if (!canManageUserImport(roleNames)) {
      throw new ForbiddenException(
        'Only HR management roles can manage user imports',
      );
    }
  }

  @Get('template')
  @RequirePermission('users', 'create')
  @ApiOperation({ summary: 'Download user import Excel template' })
  async downloadTemplate(): Promise<StreamableFile> {
    const buffer = await this.userImportService.buildTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="user-import-template.xlsx"',
    });
  }

  @Post('preview')
  @RequirePermission('users', 'create')
  @ApiOperation({ summary: 'Validate an import file without creating users' })
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
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportPreviewResponseDto> {
    await this.assertCanManageUserImport(user);
    return this.userImportService.previewImport(this.ctx(user), file);
  }

  @Post()
  @RequirePermission('users', 'create')
  @ApiOperation({ summary: 'Import users from an Excel file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        sendInvitations: { type: 'boolean', default: true },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async import(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() options: ImportUsersOptionsDto,
  ): Promise<ImportCommitResponseDto> {
    await this.assertCanManageUserImport(user);
    return this.userImportService.commitImport(
      this.ctx(user),
      file,
      options.sendInvitations !== false,
    );
  }
}
