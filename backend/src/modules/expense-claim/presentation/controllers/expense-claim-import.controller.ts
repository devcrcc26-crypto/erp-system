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
import { ExpenseClaimImportPreviewResponseDto } from '../../application/dtos/expense-claim-import.dtos';
import { ExpenseClaimImportService } from '../../application/services/expense-claim-import.service';

@ApiTags('HR Expense Claim Import')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'hr', action: 'create' },
  { module: 'hr', action: 'view' },
  { module: 'expense-claim', action: 'create' },
)
@Controller('hr/expense-claims/import')
export class ExpenseClaimImportController {
  constructor(
    private readonly expenseClaimImportService: ExpenseClaimImportService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('template')
  @ApiOperation({
    summary: 'Download expense claim items import Excel template (company-wide)',
  })
  async downloadTemplate(): Promise<StreamableFile> {
    const buffer = await this.expenseClaimImportService.buildCompanyTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition:
        'attachment; filename="expense-claim-import-template.xlsx"',
    });
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Validate an expense claim import file without writing',
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
  ): Promise<ExpenseClaimImportPreviewResponseDto> {
    return this.expenseClaimImportService.previewCompanyImport(
      this.ctx(user),
      file,
    );
  }

  @Post()
  @ApiOperation({
    summary:
      'Import expense claim items from Excel into DRAFT claims (no auto-submit)',
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
    return this.expenseClaimImportService.commitCompanyImport(
      this.ctx(user),
      file,
    );
  }
}
