import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { ExpenseClaimImportPreviewResponseDto } from '../../application/dtos/expense-claim-import.dtos';
import {
  AddExpenseClaimItemDto,
  CreateExpenseClaimDto,
  ListExpenseClaimsDto,
  MarkExpenseClaimPaidDto,
  UpdateExpenseClaimDto,
  UpdateExpenseClaimItemDto,
} from '../../application/dtos/expense-claim.dtos';
import { ExpenseClaimImportService } from '../../application/services/expense-claim-import.service';
import { ExpenseClaimService } from '../../application/services/expense-claim.service';

async function parseDto<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
): Promise<T> {
  const dto = plainToInstance(cls, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException({
      message: 'Validation failed',
      details: errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      })),
    });
  }
  return dto;
}

/** Receipt uploads for one line item: `files` (several), or legacy `file`. */
type ReceiptUploads = {
  files?: Express.Multer.File[];
  file?: Express.Multer.File[];
};

const MAX_RECEIPTS_PER_ITEM = 10;

const RECEIPT_FILES_INTERCEPTOR = FileFieldsInterceptor(
  [
    { name: 'files', maxCount: MAX_RECEIPTS_PER_ITEM },
    { name: 'file', maxCount: 1 },
  ],
  { storage: memoryStorage() },
);

/** All files sent for one item — they all become receipts of that item. */
function receiptFiles(uploads: ReceiptUploads | undefined): Express.Multer.File[] {
  return [...(uploads?.files ?? []), ...(uploads?.file ?? [])];
}

@ApiTags('HR Expense Claims')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'expense-claim', action: 'view' },
  { module: 'expense-claim', action: 'create' },
)
@Controller('hr/expense-claims')
export class ExpenseClaimController {
  constructor(
    private readonly expenseClaimService: ExpenseClaimService,
    private readonly expenseClaimImportService: ExpenseClaimImportService,
  ) {}

  private importCtx(user: AuthenticatedUser): {
    companyId: string;
    userId: string;
  } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Create a draft expense claim (no items yet)' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(CreateExpenseClaimDto, body);
    return this.expenseClaimService.createDraft(dto, companyId, user.userId);
  }

  @Get()
  @ApiOperation({
    summary: 'List expense claims (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListExpenseClaimsDto,
  ): Promise<unknown> {
    return this.expenseClaimService.listClaims(query, companyId, user.userId);
  }

  @Get(':id/items/import/template')
  @ApiOperation({
    summary: 'Download item import template for one expense claim',
  })
  async downloadClaimImportTemplate(): Promise<StreamableFile> {
    const buffer = await this.expenseClaimImportService.buildClaimTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition:
        'attachment; filename="expense-claim-items-import-template.xlsx"',
    });
  }

  @Post(':id/items/import/preview')
  @ApiOperation({
    summary: 'Validate item import for one expense claim without writing',
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
  previewClaimImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ExpenseClaimImportPreviewResponseDto> {
    return this.expenseClaimImportService.previewClaimImport(
      id,
      this.importCtx(user),
      file,
    );
  }

  @Post(':id/items/import')
  @ApiOperation({
    summary: 'Import expense line items into one DRAFT claim',
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
  commitClaimImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    return this.expenseClaimImportService.commitClaimImport(
      id,
      this.importCtx(user),
      file,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an expense claim with items and approval tiers' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.expenseClaimService.getClaim(id, companyId, user.userId);
  }

  @Patch(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update a draft or returned claim header' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateExpenseClaimDto, body);
    return this.expenseClaimService.updateClaim(id, dto, companyId, user.userId);
  }

  @Post(':id/items')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Add a line item with one or more receipt files (all stored on this one item)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['category', 'description', 'expenseDate', 'amount', 'currency'],
      properties: {
        category: { type: 'string' },
        description: { type: 'string' },
        expenseDate: { type: 'string', format: 'date' },
        amount: { type: 'number' },
        currency: { type: 'string', enum: ['ETB', 'USD', 'CNY'] },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(RECEIPT_FILES_INTERCEPTOR)
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() uploads?: ReceiptUploads,
  ): Promise<unknown> {
    const dto = await parseDto(AddExpenseClaimItemDto, body);
    return this.expenseClaimService.addItem(
      id,
      dto,
      receiptFiles(uploads),
      companyId,
      user.userId,
    );
  }

  @Patch(':id/items/:itemId')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Update a line item; uploaded files replace its receipts',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        description: { type: 'string' },
        expenseDate: { type: 'string', format: 'date' },
        amount: { type: 'number' },
        currency: { type: 'string', enum: ['ETB', 'USD', 'CNY'] },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(RECEIPT_FILES_INTERCEPTOR)
  async updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() uploads?: ReceiptUploads,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateExpenseClaimItemDto, body);
    return this.expenseClaimService.updateItem(
      id,
      itemId,
      dto,
      receiptFiles(uploads),
      companyId,
      user.userId,
    );
  }

  @Delete(':id/items/:itemId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Remove a line item from a draft claim' })
  deleteItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<unknown> {
    return this.expenseClaimService.deleteItem(
      id,
      itemId,
      companyId,
      user.userId,
    );
  }

  @Post(':id/submit')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit a draft claim for approval' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.expenseClaimService.submitClaim(id, companyId, user.userId);
  }

  @Patch(':id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Cancel a draft or submitted claim (owner only)' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.expenseClaimService.cancelClaim(id, companyId, user.userId);
  }

  @Post(':id/mark-paid')
  @RequireAnyPermission({ module: 'expense-claim', action: 'manage' })
  @ApiOperation({
    summary: 'Mark an approved expense claim as paid (HR / finance)',
  })
  async markPaid(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(MarkExpenseClaimPaidDto, body);
    return this.expenseClaimService.markAsPaid(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Delete(':id')
  @RequireAnyPermission({ module: 'expense-claim', action: 'manage' })
  @ApiOperation({ summary: 'Soft-delete an expense claim (HR only)' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.expenseClaimService.deleteClaim(id, companyId, user.userId);
    return { message: 'Expense claim deleted' };
  }
}
