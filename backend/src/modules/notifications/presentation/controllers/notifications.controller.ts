import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  ListNotificationsQueryDto,
  MarkNotificationsReadForRouteDto,
  SendNotificationDto,
} from '../../application/dtos/notification.dtos';
import { NotificationService } from '../../application/services/notification.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @ApiOperation({ summary: 'List in-app notifications for current user' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<unknown> {
    return this.notificationService.listInbox(
      this.ctx(user),
      query,
      query.unreadOnly === true,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ count: number }> {
    return this.notificationService.getUnreadCount(this.ctx(user));
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all in-app notifications as read' })
  markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ updated: number }> {
    return this.notificationService.markAllRead(this.ctx(user));
  }

  @Patch('read-for-route')
  @ApiOperation({
    summary:
      'Mark unread in-app notifications whose link matches the current route',
  })
  markReadForRoute(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkNotificationsReadForRouteDto,
  ): Promise<{ updated: number }> {
    return this.notificationService.markReadForRoute(
      this.ctx(user),
      dto.path,
    );
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.notificationService.markRead(this.ctx(user), id);
  }

  @Post('send')
  @UseGuards(PermissionsGuard)
  @RequirePermission('notifications', 'edit')
  @ApiOperation({ summary: 'Send a notification to a user (admin/system)' })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendNotificationDto,
  ): Promise<{ inAppId?: string; emailQueued: boolean }> {
    return this.notificationService.send(this.ctx(user), dto);
  }
}
