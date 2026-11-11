import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { UpsertDocumentAccessDto } from '../../application/dtos/document.dtos';
import { DocumentService } from '../../application/services/document.service';

@ApiTags('Document Access')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('document-folders/:folderId/access')
export class DocumentAccessController {
  constructor(private readonly documentService: DocumentService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('documents', 'edit')
  @ApiOperation({ summary: 'List folder access rules by role' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('folderId') folderId: string,
  ): Promise<unknown[]> {
    return this.documentService.listFolderAccess(this.ctx(user), folderId);
  }

  @Put()
  @RequirePermission('documents', 'edit')
  @ApiOperation({ summary: 'Upsert folder access rule for a role' })
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('folderId') folderId: string,
    @Body() dto: UpsertDocumentAccessDto,
  ): Promise<unknown> {
    return this.documentService.upsertFolderAccess(
      this.ctx(user),
      folderId,
      dto,
    );
  }

  @Delete(':accessId')
  @RequirePermission('documents', 'edit')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('folderId') folderId: string,
    @Param('accessId') accessId: string,
  ): Promise<{ message: string }> {
    await this.documentService.deleteFolderAccess(
      this.ctx(user),
      folderId,
      accessId,
    );
    return { message: 'Access rule deleted' };
  }
}
