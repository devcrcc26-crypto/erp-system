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
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreatePunchItemDto,
  PmListQueryDto,
  UpdatePunchItemDto,
} from '../../application/dtos/pm.dtos';
import { PunchItemsService } from '../../application/services/punch-items.service';
import { PmModuleAccessGuard } from '../guards/pm-module-access.guard';
import { RequirePmModule } from '../guards/require-pm-module.decorator';

@ApiTags('Punch Items')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, PmModuleAccessGuard)
@RequirePmModule('punch_items')
@Controller('projects/:projectId/punch-items')
export class PunchItemsController {
  constructor(private readonly punchItemsService: PunchItemsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('punch_items', 'view')
  @ApiOperation({ summary: 'List project punch items' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.punchItemsService.listPunchItems(
      this.ctx(user),
      projectId,
      query,
    );
  }

  @Post()
  @RequirePermission('punch_items', 'create')
  @ApiOperation({ summary: 'Create punch item' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreatePunchItemDto,
  ): Promise<unknown> {
    return this.punchItemsService.createPunchItem(
      this.ctx(user),
      projectId,
      dto,
    );
  }

  @Get(':id')
  @RequirePermission('punch_items', 'view')
  @ApiOperation({ summary: 'Get punch item by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.punchItemsService.getPunchItem(this.ctx(user), projectId, id);
  }

  @Patch(':id')
  @RequirePermission('punch_items', 'edit')
  @ApiOperation({ summary: 'Update punch item' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePunchItemDto,
  ): Promise<unknown> {
    return this.punchItemsService.updatePunchItem(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermission('punch_items', 'delete')
  @ApiOperation({ summary: 'Delete punch item' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.punchItemsService.deletePunchItem(this.ctx(user), projectId, id);
    return { message: 'Punch item deleted' };
  }
}
