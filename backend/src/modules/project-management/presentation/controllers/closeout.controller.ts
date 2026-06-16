import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  UpdateCloseoutChecklistItemDto,
  UpdateCloseoutDto,
} from '../../application/dtos/pm.dtos';
import { CloseoutService } from '../../application/services/closeout.service';

@ApiTags('Closeout')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('projects/:projectId/closeout')
export class CloseoutController {
  constructor(private readonly closeoutService: CloseoutService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('closeout', 'view')
  @ApiOperation({ summary: 'Get project closeout detail' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.closeoutService.getCloseout(this.ctx(user), projectId);
  }

  @Post()
  @RequirePermission('closeout', 'create')
  @ApiOperation({ summary: 'Initialize project closeout' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.closeoutService.createCloseout(this.ctx(user), projectId);
  }

  @Patch()
  @RequirePermission('closeout', 'edit')
  @ApiOperation({ summary: 'Update project closeout' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateCloseoutDto,
  ): Promise<unknown> {
    return this.closeoutService.updateCloseout(this.ctx(user), projectId, dto);
  }

  @Patch('checklist/:itemId')
  @RequirePermission('closeout', 'edit')
  @ApiOperation({ summary: 'Toggle closeout checklist item' })
  updateChecklistItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCloseoutChecklistItemDto,
  ): Promise<unknown> {
    return this.closeoutService.updateChecklistItem(
      this.ctx(user),
      projectId,
      itemId,
      dto,
    );
  }
}
