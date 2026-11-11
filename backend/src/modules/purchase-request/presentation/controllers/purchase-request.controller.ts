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
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { PurchaseRequestImportPreviewResponseDto } from '../../application/dtos/purchase-request-import.dtos';
import {
  AddPurchaseRequestItemDto,
  CreatePurchaseRequestDto,
  ListPurchaseRequestsDto,
  UpdatePurchaseRequestDto,
  UpdatePurchaseRequestItemDto,
} from '../../application/dtos/purchase-request.dtos';
import { PurchaseRequestImportService } from '../../application/services/purchase-request-import.service';
import { PurchaseRequestPdfService } from '../../application/services/purchase-request-pdf.service';
import { PurchaseRequestService } from '../../application/services/purchase-request.service';

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

@ApiTags('HR Purchase Requests')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'purchase-request', action: 'view' },
  { module: 'purchase-request', action: 'create' },
)
@Controller('hr/purchase-requests')
export class PurchaseRequestController {
  constructor(
    private readonly purchaseRequestService: PurchaseRequestService,
    private readonly purchaseRequestImportService: PurchaseRequestImportService,
    private readonly purchaseRequestPdfService: PurchaseRequestPdfService,
  ) {}

  private importCtx(user: AuthenticatedUser): {
    companyId: string;
    userId: string;
  } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Create a draft purchase request (no items yet)' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(CreatePurchaseRequestDto, body);
    return this.purchaseRequestService.createDraft(dto, companyId, user.userId);
  }

  @Get()
  @ApiOperation({
    summary:
      'List purchase requests (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListPurchaseRequestsDto,
  ): Promise<unknown> {
    return this.purchaseRequestService.listRequests(
      query,
      companyId,
      user.userId,
    );
  }

  @Get(':id/items/import/template')
  @ApiOperation({
    summary: 'Download item import template for one purchase request',
  })
  async downloadRequestImportTemplate(): Promise<StreamableFile> {
    const buffer =
      await this.purchaseRequestImportService.buildRequestTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition:
        'attachment; filename="purchase-request-items-import-template.xlsx"',
    });
  }

  @Post(':id/items/import/preview')
  @ApiOperation({
    summary: 'Validate item import for one purchase request without writing',
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
  previewRequestImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<PurchaseRequestImportPreviewResponseDto> {
    return this.purchaseRequestImportService.previewRequestImport(
      id,
      this.importCtx(user),
      file,
    );
  }

  @Post(':id/items/import')
  @ApiOperation({
    summary: 'Import purchase line items into one DRAFT or RETURNED request',
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
  commitRequestImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    return this.purchaseRequestImportService.commitRequestImport(
      id,
      this.importCtx(user),
      file,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a purchase request with items and approval tiers',
  })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.purchaseRequestService.getRequest(id, companyId, user.userId);
  }

  @Patch(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update header fields of a draft or returned request' })
  async updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(UpdatePurchaseRequestDto, body);
    return this.purchaseRequestService.updateDraft(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Post(':id/items')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Add a line item to a draft or returned request (optional item image)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        itemName: { type: 'string' },
        modelSpec: { type: 'string' },
        description: { type: 'string' },
        quantity: { type: 'number' },
        unit: { type: 'string' },
        unitPrice: { type: 'number' },
        currency: { type: 'string', enum: ['ETB'], default: 'ETB' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 20, { storage: memoryStorage() }))
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<unknown> {
    const dto = await parseDto(AddPurchaseRequestItemDto, body);
    return this.purchaseRequestService.addItem(
      id,
      dto,
      files ?? [],
      companyId,
      user.userId,
    );
  }

  @Patch(':id/items/:itemId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update a line item and/or replace its image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        itemName: { type: 'string' },
        modelSpec: { type: 'string' },
        description: { type: 'string' },
        quantity: { type: 'number' },
        unit: { type: 'string' },
        unitPrice: { type: 'number' },
        currency: { type: 'string', enum: ['ETB'], default: 'ETB' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<unknown> {
    const dto = await parseDto(UpdatePurchaseRequestItemDto, body);
    return this.purchaseRequestService.updateItem(
      id,
      itemId,
      dto,
      file,
      companyId,
      user.userId,
    );
  }

  @Delete(':id/items/:itemId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Remove a line item from a draft or returned request' })
  deleteItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<unknown> {
    return this.purchaseRequestService.deleteItem(
      id,
      itemId,
      companyId,
      user.userId,
    );
  }

  @Post(':id/submit')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit a draft request for approval (with optional file attachments)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 20, { storage: memoryStorage() }))
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<unknown> {
    return this.purchaseRequestService.submitRequest(
      id,
      files ?? [],
      companyId,
      user.userId,
    );
  }

  @Patch(':id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Cancel a draft or submitted request (owner only)' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.purchaseRequestService.cancelRequest(id, companyId, user.userId);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download purchase request as PDF' })
  @ApiProduces('application/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ): Promise<StreamableFile> {
    const file = await this.purchaseRequestPdfService.getPdf(id, companyId);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: contentDisposition('inline', file.filename),
    });
  }
}

function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
