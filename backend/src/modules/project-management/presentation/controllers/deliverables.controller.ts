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
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateDeliverableDto,
  DeliverableListQueryDto,
  UpdateDeliverableDto,
} from '../../application/dtos/pm.dtos';
import { DeliverableService } from '../../application/services/deliverable.service';
import { PmModuleAccessGuard } from '../guards/pm-module-access.guard';
import { RequirePmModule } from '../guards/require-pm-module.decorator';

@ApiTags('Deliverables')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard, PmModuleAccessGuard)
@RequirePmModule('deliverables')
@Controller('projects/:projectId/deliverables')
export class DeliverablesController {
  constructor(private readonly deliverableService: DeliverableService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List project deliverables' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: DeliverableListQueryDto,
  ): Promise<unknown> {
    return this.deliverableService.listDeliverables(
      this.ctx(user),
      projectId,
      query,
    );
  }

  @Get(':deliverableId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get deliverable by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('deliverableId') deliverableId: string,
  ): Promise<unknown> {
    return this.deliverableService.getDeliverable(
      this.ctx(user),
      projectId,
      deliverableId,
    );
  }

  @Post()
  @RequirePermission('schedule', 'create')
  @ApiOperation({ summary: 'Create deliverable' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateDeliverableDto,
  ): Promise<unknown> {
    return this.deliverableService.createDeliverable(
      this.ctx(user),
      projectId,
      dto,
    );
  }

  @Patch(':deliverableId')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Update deliverable' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('deliverableId') deliverableId: string,
    @Body() dto: UpdateDeliverableDto,
  ): Promise<unknown> {
    return this.deliverableService.updateDeliverable(
      this.ctx(user),
      projectId,
      deliverableId,
      dto,
    );
  }

  @Delete(':deliverableId')
  @RequirePermission('schedule', 'delete')
  @ApiOperation({ summary: 'Delete deliverable' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('deliverableId') deliverableId: string,
  ): Promise<{ message: string }> {
    await this.deliverableService.deleteDeliverable(
      this.ctx(user),
      projectId,
      deliverableId,
    );
    return { message: 'Deliverable deleted' };
  }
}
