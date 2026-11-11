import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  AudiencePreviewDto,
  CreateAnnouncementDto,
  ListAnnouncementsDto,
  ListRecipientsDto,
  PublishAnnouncementDto,
  UpdateAnnouncementDto,
} from '../../application/dtos/announcement.dtos';
import {
  AnnouncementService,
  UploadedAnnouncementFile,
} from '../../application/services/announcement.service';

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/**
 * HR / System Administrator management. The guard admits anyone who can
 * create, edit or publish announcements; AnnouncementService enforces the
 * finer rules (drafts vs publish, SYSTEM_UPDATE = System Administrator only).
 */
@ApiTags('Announcements (HR)')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'announcements', action: 'create' },
  { module: 'announcements', action: 'edit' },
  { module: 'announcements', action: 'approve' },
)
@Controller('hr/announcements')
export class AnnouncementsAdminController {
  constructor(private readonly announcements: AnnouncementService) {}

  private ctx(user: AuthenticatedUser) {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @ApiOperation({ summary: 'All announcements with read / acknowledged counts' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListAnnouncementsDto) {
    return this.announcements.listManaged(this.ctx(user), query);
  }

  @Get('audience-options')
  @ApiOperation({ summary: 'Departments, disciplines, roles and employees for the audience picker' })
  audienceOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.announcements.audienceOptions(this.ctx(user));
  }

  @Post('audience-preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Live recipient count for an audience' })
  audiencePreview(@CurrentUser() user: AuthenticatedUser, @Body() dto: AudiencePreviewDto) {
    return this.announcements.audiencePreview(this.ctx(user), dto);
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAnnouncementDto) {
    return this.announcements.create(this.ctx(user), dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Announcement with stats, audience labels and attachments' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.getManaged(this.ctx(user), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit (after publish: content, pin and expiry only)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcements.update(this.ctx(user), id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a draft' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.announcements.remove(this.ctx(user), id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish now, or schedule with a future publishAt' })
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishAnnouncementDto,
  ) {
    return this.announcements.publish(this.ctx(user), id, dto);
  }

  @Post(':id/unschedule')
  @HttpCode(200)
  @ApiOperation({ summary: 'Move a scheduled announcement back to draft' })
  unschedule(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.unschedule(this.ctx(user), id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hide from employees (statistics are kept)' })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.archive(this.ctx(user), id);
  }

  @Get(':id/recipients')
  @ApiOperation({ summary: 'Recipients with read / acknowledged times' })
  recipients(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListRecipientsDto,
  ) {
    return this.announcements.listRecipients(this.ctx(user), id, query);
  }

  @Post(':id/remind-unread')
  @HttpCode(200)
  @ApiOperation({ summary: 'One in-app reminder to everyone who has not read it' })
  remindUnread(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.remindUnread(this.ctx(user), id);
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Read statistics as Excel' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const file = await this.announcements.exportStats(this.ctx(user), id);
    return new StreamableFile(file.buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    });
  }

  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload attachments (field "files")' })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_BYTES },
    }),
  )
  uploadAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: UploadedAnnouncementFile[] = [],
  ) {
    return this.announcements.uploadAttachments(this.ctx(user), id, files);
  }

  @Delete(':id/attachments/:documentId')
  @ApiOperation({ summary: 'Remove an attachment' })
  deleteAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.announcements.deleteAttachment(this.ctx(user), id, documentId);
  }

  @Get(':id/attachments/:documentId/download-url')
  @ApiOperation({ summary: 'Presigned download URL (any status)' })
  attachmentUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.announcements.getManagedAttachmentUrl(this.ctx(user), id, documentId);
  }
}
