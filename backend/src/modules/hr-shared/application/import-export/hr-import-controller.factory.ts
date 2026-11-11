import {
  Controller,
  Get,
  Inject,
  Post,
  StreamableFile,
  Type,
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
  type ApiBodyOptions,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import type { RequiredPermission } from '../../../../shared/permissions/require-permission.decorator';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  ImportCommitResponseDto,
  ImportPreviewResponseDto,
} from '../dtos/hr-import.dtos';
import { MAX_IMPORT_FILE_BYTES } from './import-column-schema';

export interface ImportActorContext {
  companyId: string;
  userId: string;
}

/** Contract every module import service fulfils. */
export interface HrModuleImportService {
  buildTemplate(): Promise<Buffer>;
  previewImport(
    ctx: ImportActorContext,
    file: Express.Multer.File,
  ): Promise<ImportPreviewResponseDto>;
  commitImport(
    ctx: ImportActorContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto>;
}

const uploadInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMPORT_FILE_BYTES },
});

const fileBody: ApiBodyOptions = {
  schema: {
    type: 'object',
    properties: { file: { type: 'string', format: 'binary' } },
    required: ['file'],
  },
};

/**
 * Builds the standard three-endpoint import controller for an HR module:
 *
 * - `GET  {route}/template` - downloads the Excel template for the schema
 * - `POST {route}/preview`  - validates an upload without writing anything
 * - `POST {route}`          - creates DRAFT records and reports per-row results
 *
 * The module supplies its own route, Swagger tag, template file name, the
 * guards' permission set, and the service class that implements the import.
 */
export function createHrImportController(options: {
  route: string;
  tag: string;
  templateFileName: string;
  entityLabel: string;
  permissions: RequiredPermission[];
  service: Type<HrModuleImportService>;
}): Type<unknown> {
  const { route, tag, templateFileName, entityLabel, permissions, service } =
    options;

  @ApiTags(tag)
  @ApiBearerAuth()
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission(...permissions)
  @Controller(route)
  class HrImportController {
    constructor(
      @Inject(service)
      private readonly importService: HrModuleImportService,
    ) {}

    @Get('template')
    @ApiOperation({ summary: `Download the ${entityLabel} import template` })
    async downloadTemplate(): Promise<StreamableFile> {
      const buffer = await this.importService.buildTemplate();
      return new StreamableFile(buffer, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        disposition: `attachment; filename="${templateFileName}"`,
      });
    }

    @Post('preview')
    @ApiOperation({
      summary: `Validate a ${entityLabel} import file without writing`,
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody(fileBody)
    @UseInterceptors(uploadInterceptor)
    preview(
      @CurrentUser() user: AuthenticatedUser,
      @UploadedFile() file: Express.Multer.File,
    ): Promise<ImportPreviewResponseDto> {
      return this.importService.previewImport(ctxOf(user), file);
    }

    @Post()
    @ApiOperation({
      summary: `Import ${entityLabel} records from Excel as DRAFT (no auto-submit)`,
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody(fileBody)
    @UseInterceptors(uploadInterceptor)
    import(
      @CurrentUser() user: AuthenticatedUser,
      @UploadedFile() file: Express.Multer.File,
    ): Promise<ImportCommitResponseDto> {
      return this.importService.commitImport(ctxOf(user), file);
    }
  }

  Object.defineProperty(HrImportController, 'name', {
    value: `${tag.replace(/\W+/g, '')}ImportController`,
  });

  return HrImportController;
}

function ctxOf(user: AuthenticatedUser): ImportActorContext {
  return { companyId: user.companyId, userId: user.userId };
}
