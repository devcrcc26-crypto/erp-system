import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateDocumentFolderDto,
  DocumentFolderListQueryDto,
  ProjectDocumentListQueryDto,
  UpdateDocumentFolderDto,
} from '../../application/dtos/document.dtos';
import { DocumentService } from '../../application/services/document.service';
import { DocumentPermissionService } from '../../application/services/document-permission.service';

@ApiTags('Document Folders')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('document-folders')
export class DocumentFoldersController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly documentPermissionService: DocumentPermissionService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('documents', 'view')
  @ApiOperation({ summary: 'List document folders' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DocumentFolderListQueryDto,
  ): Promise<unknown> {
    return this.documentService.listFolders(this.ctx(user), query);
  }

  @Get('project/:projectId/documents')
  @RequirePermission('documents', 'view')
  @ApiOperation({
    summary: 'Search all documents in a project folder tree',
    description:
      'Project document browser - search by title, folder path, engineering document metadata, discipline, source type, file type, and upload date.',
  })
  listProjectDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: ProjectDocumentListQueryDto,
  ): Promise<unknown> {
    return this.documentService.listProjectDocuments(
      this.ctx(user),
      projectId,
      query,
    );
  }

  @Get(':id')
  @RequirePermission('documents', 'view')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.documentService.getFolder(this.ctx(user), id);
  }

  @Post()
  @RequirePermission('documents', 'create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDocumentFolderDto,
  ): Promise<unknown> {
    return this.documentService.createFolder(this.ctx(user), dto);
  }

  @Patch(':id')
  @RequirePermission('documents', 'edit')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentFolderDto,
  ): Promise<unknown> {
    return this.documentService.updateFolder(this.ctx(user), id, dto);
  }

  @Delete(':id')
  @RequirePermission('documents', 'delete')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.documentService.deleteFolder(this.ctx(user), id);
    return { message: 'Folder deleted' };
  }

  @Get(':id/documents')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List documents in a folder' })
  async listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') folderId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    await this.documentPermissionService.assertCanViewFolder(
      user.userId,
      user.companyId,
      folderId,
    );
    return this.documentService.listDocuments(this.ctx(user), folderId, query);
  }
}
