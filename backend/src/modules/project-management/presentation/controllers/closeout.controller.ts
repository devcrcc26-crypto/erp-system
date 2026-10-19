import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateWarrantyDto,
  UpdateCloseoutChecklistItemDto,
  UpdateCloseoutDto,
  UpdateWarrantyDto,
} from '../../application/dtos/pm.dtos';
import { CloseoutService } from '../../application/services/closeout.service';
import { PmModuleAccessGuard } from '../guards/pm-module-access.guard';
import { RequirePmModule } from '../guards/require-pm-module.decorator';

@ApiTags('Closeout')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard, PmModuleAccessGuard)
@RequirePmModule('closeout')
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

  @Post('warranties')
  @RequirePermission('closeout', 'create')
  @ApiOperation({ summary: 'Add warranty record' })
  addWarranty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateWarrantyDto,
  ): Promise<unknown> {
    return this.closeoutService.addWarranty(this.ctx(user), projectId, dto);
  }

  @Patch('warranties/:warrantyId')
  @RequirePermission('closeout', 'edit')
  @ApiOperation({ summary: 'Update warranty record' })
  updateWarranty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('warrantyId') warrantyId: string,
    @Body() dto: UpdateWarrantyDto,
  ): Promise<unknown> {
    return this.closeoutService.updateWarranty(
      this.ctx(user),
      projectId,
      warrantyId,
      dto,
    );
  }

  @Delete('warranties/:warrantyId')
  @RequirePermission('closeout', 'delete')
  @ApiOperation({ summary: 'Remove warranty record' })
  async removeWarranty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('warrantyId') warrantyId: string,
  ): Promise<{ message: string }> {
    await this.closeoutService.removeWarranty(
      this.ctx(user),
      projectId,
      warrantyId,
    );
    return { message: 'Warranty removed' };
  }
}
