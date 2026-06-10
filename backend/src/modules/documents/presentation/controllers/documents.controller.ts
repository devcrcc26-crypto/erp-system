import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  UpdateDocumentDto,
  UploadDocumentVersionDto,
} from '../../application/dtos/document.dtos';
import { DocumentService } from '../../application/services/document.service';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentService: DocumentService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get(':id/download-url')
  @RequirePermission('documents', 'view')
  @ApiOperation({ summary: 'Get presigned download URL' })
  getDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ url: string; expiresIn: number }> {
    return this.documentService.getDownloadUrl(this.ctx(user), id);
  }

  @Get(':id/versions')
  @RequirePermission('documents', 'view')
  listVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown[]> {
    return this.documentService.listVersions(this.ctx(user), id);
  }

  @Post(':id/versions')
  @RequirePermission('documents', 'create')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        changeNote: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentVersionDto,
  ): Promise<unknown> {
    return this.documentService.uploadVersion(this.ctx(user), id, file, dto);
  }

  @Get(':id')
  @RequirePermission('documents', 'view')
  @ApiOperation({ summary: 'Get document metadata' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.documentService.getDocument(this.ctx(user), id);
  }

  @Patch(':id')
  @RequirePermission('documents', 'edit')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ): Promise<unknown> {
    return this.documentService.updateDocument(this.ctx(user), id, dto);
  }

  @Delete(':id')
  @RequirePermission('documents', 'delete')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.documentService.deleteDocument(this.ctx(user), id);
    return { message: 'Document deleted' };
  }
}

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('document-folders')
export class DocumentUploadController {
  constructor(private readonly documentService: DocumentService) {}

  @Post(':folderId/documents')
  @RequirePermission('documents', 'create')
  @ApiOperation({ summary: 'Upload a document to a folder' })
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
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('folderId') folderId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<unknown> {
    return this.documentService.uploadDocument(
      { companyId: user.companyId, userId: user.userId },
      folderId,
      file,
    );
  }
}
