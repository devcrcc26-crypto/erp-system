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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import {
  AddConsumablesRequisitionItemDto,
  CreateConsumablesRequisitionDto,
  ListConsumablesRequisitionsDto,
  UpdateConsumablesRequisitionDto,
  UpdateConsumablesRequisitionItemDto,
} from '../../application/dtos/consumables-requisition.dtos';
import { ConsumablesRequisitionImportPreviewResponseDto } from '../../application/dtos/consumables-requisition-import.dtos';
import { ConsumablesRequisitionPdfService } from '../../application/services/consumables-requisition-pdf.service';
import { ConsumablesRequisitionImportService } from '../../application/services/consumables-requisition-import.service';
import { ConsumablesRequisitionService } from '../../application/services/consumables-requisition.service';

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

@ApiTags('HR Consumables Requisitions')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'consumables', action: 'view' },
  { module: 'consumables', action: 'create' },
)
@Controller('hr/consumables')
export class ConsumablesRequisitionController {
  constructor(
    private readonly consumablesRequisitionService: ConsumablesRequisitionService,
    private readonly consumablesRequisitionPdfService: ConsumablesRequisitionPdfService,
    private readonly consumablesRequisitionImportService: ConsumablesRequisitionImportService,
  ) {}

  private importCtx(user: AuthenticatedUser): {
    companyId: string;
    userId: string;
  } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Create a draft consumables requisition (no items yet)',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(CreateConsumablesRequisitionDto, body);
    return this.consumablesRequisitionService.createDraft(
      dto,
      companyId,
      user.userId,
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'List consumables requisitions (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListConsumablesRequisitionsDto,
  ): Promise<unknown> {
    return this.consumablesRequisitionService.listRequisitions(
      query,
      companyId,
      user.userId,
    );
  }

  @Get(':id/items/import/template')
  @ApiOperation({
    summary: 'Download item import template for one consumables requisition',
  })
  async downloadRequisitionImportTemplate(): Promise<StreamableFile> {
    const buffer =
      await this.consumablesRequisitionImportService.buildRequisitionTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition:
        'attachment; filename="consumables-requisition-items-import-template.xlsx"',
    });
  }

  @Post(':id/items/import/preview')
  @ApiOperation({
    summary:
      'Validate item import for one consumables requisition without writing',
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
  previewRequisitionImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ConsumablesRequisitionImportPreviewResponseDto> {
    return this.consumablesRequisitionImportService.previewRequisitionImport(
      id,
      this.importCtx(user),
      file,
    );
  }

  @Post(':id/items/import')
  @ApiOperation({
    summary:
      'Import consumables line items into one DRAFT or RETURNED requisition',
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
  commitRequisitionImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    return this.consumablesRequisitionImportService.commitRequisitionImport(
      id,
      this.importCtx(user),
      file,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a consumables requisition with items and approval tiers',
  })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.consumablesRequisitionService.getRequisition(
      id,
      companyId,
      user.userId,
    );
  }

  @Patch(':id')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Update header fields of a draft or returned requisition',
  })
  async updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateConsumablesRequisitionDto, body);
    return this.consumablesRequisitionService.updateDraft(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Post(':id/items')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Add a line item (max 20) to a draft or returned requisition',
  })
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(AddConsumablesRequisitionItemDto, body);
    return this.consumablesRequisitionService.addItem(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Patch(':id/items/:itemId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update a line item' })
  async updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = await parseDto(UpdateConsumablesRequisitionItemDto, body);
    return this.consumablesRequisitionService.updateItem(
      id,
      itemId,
      dto,
      companyId,
      user.userId,
    );
  }

  @Delete(':id/items/:itemId')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Remove a line item from a draft or returned requisition',
  })
  deleteItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<unknown> {
    return this.consumablesRequisitionService.deleteItem(
      id,
      itemId,
      companyId,
      user.userId,
    );
  }

  @Post(':id/submit')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Submit a draft requisition (1-tier HR Officer, or direct APPROVED for HR+; optional file attachments)',
  })
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
    return this.consumablesRequisitionService.submitRequisition(
      id,
      files ?? [],
      companyId,
      user.userId,
    );
  }

  @Patch(':id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Cancel a draft or submitted requisition (owner only)',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.consumablesRequisitionService.cancelRequisition(
      id,
      companyId,
      user.userId,
    );
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download consumables requisition as PDF' })
  @ApiProduces('application/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ): Promise<StreamableFile> {
    const file = await this.consumablesRequisitionPdfService.getPdf(id, companyId);
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
