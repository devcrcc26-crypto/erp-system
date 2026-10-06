import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  ListMyAnnouncementsDto,
  MarkAnnouncementsReadDto,
} from '../../application/dtos/announcement.dtos';
import { AnnouncementService } from '../../application/services/announcement.service';

/**
 * Recipient side. Every signed-in user may call these; the service only ever
 * returns announcements the caller received (403 otherwise).
 */
@ApiTags('Announcements')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@DelegatePermissionCheck()
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementService) {}

  private ctx(user: AuthenticatedUser) {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @ApiOperation({ summary: 'My announcements (pinned first, then newest)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMyAnnouncementsDto) {
    return this.announcements.listMine(this.ctx(user), query);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Unread count, urgent banner, acknowledgement modal, What’s new and latest items',
  })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.announcements.summary(this.ctx(user));
  }

  @Post('read')
  @ApiOperation({ summary: 'Mark several received announcements read (What’s new modal)' })
  markManyRead(@CurrentUser() user: AuthenticatedUser, @Body() dto: MarkAnnouncementsReadDto) {
    return this.announcements.markManyRead(this.ctx(user), dto.ids);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A received announcement (403 when not a recipient)' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.getMine(this.ctx(user), id);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a received announcement read' })
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.markRead(this.ctx(user), id);
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Record "I have read and understood"' })
  acknowledge(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.acknowledge(this.ctx(user), id);
  }

  @Get(':id/attachments/:documentId/download-url')
  @ApiOperation({ summary: 'Presigned download URL for an attachment of a received announcement' })
  attachmentUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.announcements.getMyAttachmentUrl(this.ctx(user), id, documentId);
  }
}
