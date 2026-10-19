import {
  Controller,
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
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { PurchaseRequestImportPreviewResponseDto } from '../../application/dtos/purchase-request-import.dtos';
import { PurchaseRequestImportService } from '../../application/services/purchase-request-import.service';

@ApiTags('HR Purchase Request Import')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'purchase-request', action: 'manage' },
)
@Controller('hr/purchase-requests/import')
export class PurchaseRequestImportController {
  constructor(
    private readonly purchaseRequestImportService: PurchaseRequestImportService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('template')
  @ApiOperation({
    summary:
      'Download purchase request items import Excel template (company-wide)',
  })
  async downloadTemplate(): Promise<StreamableFile> {
    const buffer =
      await this.purchaseRequestImportService.buildCompanyTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition:
        'attachment; filename="purchase-request-import-template.xlsx"',
    });
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Validate a purchase request import file without writing',
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
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<PurchaseRequestImportPreviewResponseDto> {
    return this.purchaseRequestImportService.previewCompanyImport(
      this.ctx(user),
      file,
    );
  }

  @Post()
  @ApiOperation({
    summary:
      'Import purchase request items from Excel into DRAFT requests (no auto-submit)',
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
  import(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    return this.purchaseRequestImportService.commitCompanyImport(
      this.ctx(user),
      file,
    );
  }
}
