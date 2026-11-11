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
import { canManageBusinessTripImport } from '../../application/utils/business-trip-import-access.util';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { BusinessTripImportPreviewResponseDto } from '../../application/dtos/business-trip-import.dtos';
import { BusinessTripImportService } from '../../application/services/business-trip-import.service';

@ApiTags('HR Business Trip Import')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission({ module: 'business-trip', action: 'manage' })
@Controller('hr/business-trips/import')
export class BusinessTripImportController {
  constructor(
    private readonly businessTripImportService: BusinessTripImportService,
    private readonly permissionService: PermissionService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  private async assertCanManageBusinessTripImport(user: AuthenticatedUser): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      user.userId,
      user.companyId,
    );
    if (!canManageBusinessTripImport(roleNames)) {
      throw new ForbiddenException(
        'Only HR management roles can manage business trip imports',
      );
    }
  }

  @Get('template')
  @ApiOperation({
    summary:
      'Download business trip passengers import Excel template (company-wide)',
  })
  async downloadTemplate(): Promise<StreamableFile> {
    const buffer =
      await this.businessTripImportService.buildCompanyTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition:
        'attachment; filename="business-trip-import-template.xlsx"',
    });
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Validate a business trip import file without writing',
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
  ): Promise<BusinessTripImportPreviewResponseDto> {
    await this.assertCanManageBusinessTripImport(user);
    return this.businessTripImportService.previewCompanyImport(
      this.ctx(user),
      file,
    );
  }

  @Post()
  @ApiOperation({
    summary:
      'Import business trip passengers from Excel into DRAFT trips (no auto-submit)',
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
    await this.assertCanManageBusinessTripImport(user);
    return this.businessTripImportService.commitCompanyImport(
      this.ctx(user),
      file,
    );
  }
}
