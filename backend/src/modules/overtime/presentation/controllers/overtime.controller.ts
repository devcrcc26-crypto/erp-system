import {
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
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { OvertimeImportPreviewResponseDto } from '../../application/dtos/overtime-import.dtos';
import {
  ListOvertimeSheetsDto,
  OpenOvertimeSheetDto,
  PreviewOvertimeEntryDto,
  SelectableOvertimeWindowsQueryDto,
  UpsertOvertimeEntryDto,
} from '../../application/dtos/overtime.dtos';
import { OvertimeImportService } from '../../application/services/overtime-import.service';
import { OvertimeEntryService } from '../../application/services/overtime-entry.service';
import { OvertimeService } from '../../application/services/overtime.service';

@ApiTags('HR Overtime')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'overtime', action: 'manage' },
  { module: 'overtime', action: 'view' },
)
@Controller('hr/overtime')
export class OvertimeController {
  constructor(
    private readonly overtimeService: OvertimeService,
    private readonly overtimeImportService: OvertimeImportService,
    private readonly overtimeEntryService: OvertimeEntryService,
  ) {}

  private importCtx(user: AuthenticatedUser): {
    companyId: string;
    userId: string;
  } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @ApiOperation({
    summary:
      'List overtime sheets (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListOvertimeSheetsDto,
  ): Promise<unknown> {
    return this.overtimeService.listSheets(query, companyId, user.userId);
  }

  @Get('current')
  @ApiOperation({
    summary: 'Get or create the current month overtime sheet for the caller',
  })
  current(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.overtimeService.getCurrentSheet(companyId, user.userId);
  }

  @Post('sheets')
  @RequireAnyPermission({ module: 'overtime', action: 'create' })
  @ApiOperation({
    summary:
      'Open or create a month sheet for the caller, or on behalf of an eligible employee',
  })
  openSheet(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: OpenOvertimeSheetDto,
  ): Promise<unknown> {
    return this.overtimeService.openSheet(dto, companyId, user.userId);
  }

  @Post('preview-entry')
  @ApiOperation({
    summary:
      'Preview overtime hour buckets for a date/time using the employee work schedule and public holidays',
  })
  previewEntry(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: PreviewOvertimeEntryDto,
  ): Promise<unknown> {
    return this.overtimeEntryService.previewEntry(
      dto,
      companyId,
      user.userId,
    );
  }

  @Get('selectable-windows')
  @ApiOperation({
    summary:
      'Selectable same-day overtime time windows for an employee on a date (15-minute pickers)',
  })
  selectableWindows(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: SelectableOvertimeWindowsQueryDto,
  ): Promise<unknown> {
    return this.overtimeEntryService.getSelectableWindows(
      query,
      companyId,
      user.userId,
    );
  }

  @Get(':id/entries/import/template')
  @ApiOperation({
    summary: 'Download entry import template for one overtime sheet',
  })
  async downloadSheetImportTemplate(): Promise<StreamableFile> {
    const buffer = await this.overtimeImportService.buildSheetTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition:
        'attachment; filename="overtime-sheet-entries-import-template.xlsx"',
    });
  }

  @Post(':id/entries/import/preview')
  @ApiOperation({
    summary: 'Validate entry import for one overtime sheet without writing',
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
  previewSheetImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<OvertimeImportPreviewResponseDto> {
    return this.overtimeImportService.previewSheetImport(
      id,
      this.importCtx(user),
      file,
    );
  }

  @Post(':id/entries/import')
  @ApiOperation({
    summary: 'Import overtime entries into one DRAFT/RETURNED sheet',
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
  commitSheetImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    return this.overtimeImportService.commitSheetImport(
      id,
      this.importCtx(user),
      file,
    );
  }

  @Get(':id')
  @RequireAnyPermission(
    { module: 'overtime', action: 'manage' },
    { module: 'overtime', action: 'view' },
    { module: 'overtime', action: 'create' },
  )
  @ApiOperation({ summary: 'Get an overtime sheet with entries and tiers' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.overtimeService.getSheet(id, companyId, user.userId);
  }

  @Post(':id/entries')
  @RequireAnyPermission({ module: 'overtime', action: 'edit' })
  @ApiOperation({ summary: 'Add an overtime entry to a draft/returned sheet' })
  addEntry(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpsertOvertimeEntryDto,
  ): Promise<unknown> {
    return this.overtimeService.addEntry(id, dto, companyId, user.userId);
  }

  @Patch(':id/entries/:entryId')
  @RequireAnyPermission({ module: 'overtime', action: 'edit' })
  @ApiOperation({ summary: 'Update an overtime entry' })
  updateEntry(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpsertOvertimeEntryDto,
  ): Promise<unknown> {
    return this.overtimeService.updateEntry(
      id,
      entryId,
      dto,
      companyId,
      user.userId,
    );
  }

  @Post(':id/entries/:entryId/attachments')
  @RequireAnyPermission({ module: 'overtime', action: 'edit' })
  @ApiOperation({ summary: 'Upload attachments for an overtime entry' })
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
  @UseInterceptors(
    FilesInterceptor('files', 10, { storage: memoryStorage() }),
  )
  addEntryAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<unknown> {
    return this.overtimeService.addEntryAttachments(
      id,
      entryId,
      companyId,
      user.userId,
      files ?? [],
    );
  }

  @Delete(':id/entries/:entryId/attachments/:documentId')
  @RequireAnyPermission({ module: 'overtime', action: 'edit' })
  @ApiOperation({ summary: 'Remove an attachment from an overtime entry' })
  removeEntryAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Param('documentId') documentId: string,
  ): Promise<unknown> {
    return this.overtimeService.removeEntryAttachment(
      id,
      entryId,
      documentId,
      companyId,
      user.userId,
    );
  }

  @Delete(':id/entries/:entryId')
  @RequireAnyPermission({ module: 'overtime', action: 'delete' })
  @ApiOperation({ summary: 'Delete an overtime entry' })
  deleteEntry(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
  ): Promise<unknown> {
    return this.overtimeService.deleteEntry(
      id,
      entryId,
      companyId,
      user.userId,
    );
  }

  @Post(':id/submit')
  @RequireAnyPermission({ module: 'overtime', action: 'create' })
  @ApiOperation({ summary: 'Submit an overtime sheet for approval' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.overtimeService.submitSheet(id, companyId, user.userId);
  }

  @Patch(':id/cancel')
  @RequireAnyPermission({ module: 'overtime', action: 'create' })
  @ApiOperation({ summary: 'Cancel a draft or submitted overtime sheet' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.overtimeService.cancelSheet(id, companyId, user.userId);
  }

  @Delete(':id')
  @RequireAnyPermission({ module: 'overtime', action: 'delete' })
  @ApiOperation({ summary: 'Soft-delete an overtime sheet (HR only)' })
  async deleteSheet(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.overtimeService.deleteSheet(id, companyId, user.userId);
    return { message: 'Overtime sheet deleted' };
  }
}
