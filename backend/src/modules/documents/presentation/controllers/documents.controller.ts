import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  DocumentDownloadUrlQueryDto,
  UpdateDocumentDto,
  UploadDocumentVersionDto,
} from '../../application/dtos/document.dtos';
import { DocumentService } from '../../application/services/document.service';
import { DocumentPermissionService } from '../../application/services/document-permission.service';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly documentPermissionService: DocumentPermissionService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('versions/:versionId/download-url')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get presigned download URL for a document version' })
  async getVersionDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('versionId') versionId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    await this.documentPermissionService.assertCanViewDocumentVersion(
      user.userId,
      user.companyId,
      versionId,
    );
    return this.documentService.getVersionDownloadUrl(this.ctx(user), versionId);
  }

  @Get(':id/download-url')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Get presigned download URL',
    description:
      'Pass `expiresIn` (seconds, max 3600) for a longer-lived URL, e.g. in-browser preview.',
  })
  async getDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: DocumentDownloadUrlQueryDto,
  ): Promise<{ url: string; expiresIn: number }> {
    await this.documentPermissionService.assertCanViewDocument(
      user.userId,
      user.companyId,
      id,
    );
    return this.documentService.getDownloadUrl(
      this.ctx(user),
      id,
      query.expiresIn,
    );
  }

  @Get(':id/versions')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List document versions' })
  async listVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown[]> {
    await this.documentPermissionService.assertCanViewDocument(
      user.userId,
      user.companyId,
      id,
    );
    return this.documentService.listVersions(this.ctx(user), id);
  }

  @Post(':id/versions')
  @DelegatePermissionCheck()
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
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get document metadata' })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    await this.documentPermissionService.assertCanViewDocument(
      user.userId,
      user.companyId,
      id,
    );
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
  constructor(
    private readonly documentService: DocumentService,
    private readonly documentPermissionService: DocumentPermissionService,
  ) {}

  @Post(':folderId/documents')
  @DelegatePermissionCheck()
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
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('folderId') folderId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<unknown> {
    await this.documentPermissionService.assertCanUpload(
      user.userId,
      user.companyId,
      folderId,
    );
    return this.documentService.uploadDocument(
      { companyId: user.companyId, userId: user.userId },
      folderId,
      file,
    );
  }
}
