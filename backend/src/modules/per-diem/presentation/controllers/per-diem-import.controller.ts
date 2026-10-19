import {
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
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { canManagePerDiemImport } from '../../application/utils/per-diem-import-access.util';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { PerDiemImportPreviewResponseDto } from '../../application/dtos/per-diem-import.dtos';
import { PerDiemImportService } from '../../application/services/per-diem-import.service';

@ApiTags('HR Per Diem Import')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission({ module: 'per-diem', action: 'manage' })
@Controller('hr/per-diem/import')
export class PerDiemImportController {
  constructor(
    private readonly perDiemImportService: PerDiemImportService,
    private readonly permissionService: PermissionService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  private async assertCanManagePerDiemImport(user: AuthenticatedUser): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      user.userId,
      user.companyId,
    );
    if (!canManagePerDiemImport(roleNames)) {
      throw new ForbiddenException(
        'Only HR management roles can manage per diem imports',
      );
    }
  }

  @Get('template')
  @ApiOperation({ summary: 'Download per diem request import Excel template' })
  async downloadTemplate(): Promise<StreamableFile> {
    const buffer = await this.perDiemImportService.buildTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="per-diem-import-template.xlsx"',
    });
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Validate a per diem import file without submitting',
  })
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
  ): Promise<PerDiemImportPreviewResponseDto> {
    await this.assertCanManagePerDiemImport(user);
    return this.perDiemImportService.previewImport(this.ctx(user), file);
  }

  @Post()
  @ApiOperation({
    summary:
      'Import per diem requests from Excel (submit on behalf of employees)',
  })
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
  async import(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    await this.assertCanManagePerDiemImport(user);
    return this.perDiemImportService.commitImport(this.ctx(user), file);
  }
}
