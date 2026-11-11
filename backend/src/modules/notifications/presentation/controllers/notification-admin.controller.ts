import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
  UpsertNotificationPreferenceDto,
} from '../../application/dtos/notification.dtos';
import { NotificationService } from '../../application/services/notification.service';

@ApiTags('Notification Admin')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller()
export class NotificationAdminController {
  constructor(private readonly notificationService: NotificationService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('notification-templates')
  @RequirePermission('notifications', 'edit')
  @ApiOperation({ summary: 'List notification templates' })
  listTemplates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.notificationService.listTemplates(this.ctx(user), query);
  }

  @Post('notification-templates')
  @RequirePermission('notifications', 'edit')
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNotificationTemplateDto,
  ): Promise<unknown> {
    return this.notificationService.createTemplate(this.ctx(user), dto);
  }

  @Patch('notification-templates/:id')
  @RequirePermission('notifications', 'edit')
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateNotificationTemplateDto,
  ): Promise<unknown> {
    return this.notificationService.updateTemplate(this.ctx(user), id, dto);
  }

  @Delete('notification-templates/:id')
  @RequirePermission('notifications', 'edit')
  async deleteTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.notificationService.deleteTemplate(this.ctx(user), id);
    return { message: 'Template deleted' };
  }

  @Get('notification-preferences')
  @RequirePermission('notifications', 'view')
  @ApiOperation({ summary: 'List current user notification preferences' })
  listPreferences(@CurrentUser() user: AuthenticatedUser): Promise<unknown[]> {
    return this.notificationService.listPreferences(this.ctx(user));
  }

  @Put('notification-preferences')
  @RequirePermission('notifications', 'view')
  @ApiOperation({ summary: 'Upsert a notification preference' })
  upsertPreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertNotificationPreferenceDto,
  ): Promise<unknown> {
    return this.notificationService.upsertPreference(this.ctx(user), dto);
  }
}
