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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  AddDesignPackageItemDto,
  BatchApproveEdvsDto,
  BatchReturnEdvsDto,
  CreateDesignPackageDependencyDto,
  CreateDesignPackageDto,
  LockPackageEdvsDto,
  SubmitPackageForReviewDto,
  ApproveReviewSessionDto,
  ReturnPackageForReworkDto,
  UpdateDesignPackageDto,
} from '../../application/dtos/engineering-document.dtos';
import { DesignPackagesService } from '../../application/services/design-packages.service';

@ApiTags('Design Packages')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('projects/:projectId/task-disciplines/:taskDisciplineId/design-packages')
export class DesignPackagesController {
  constructor(private readonly designPackagesService: DesignPackagesService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'List design packages for a discipline' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
  ): Promise<unknown> {
    return this.designPackagesService.list(
      this.ctx(user),
      projectId,
      taskDisciplineId,
    );
  }

  @Post()
  @RequirePermission('schedule', 'create')
  @ApiOperation({ summary: 'Create design package' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Body() dto: CreateDesignPackageDto,
  ): Promise<unknown> {
    return this.designPackagesService.create(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      dto,
    );
  }

  @Get(':packageId')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'Get design package' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
  ): Promise<unknown> {
    return this.designPackagesService.getById(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
    );
  }

  @Patch(':packageId')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Update design package' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
    @Body() dto: UpdateDesignPackageDto,
  ): Promise<unknown> {
    return this.designPackagesService.update(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
      dto,
    );
  }

  @Delete(':packageId')
  @RequirePermission('schedule', 'delete')
  @ApiOperation({ summary: 'Soft-delete design package' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
  ): Promise<{ message: string }> {
    await this.designPackagesService.delete(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
    );
    return { message: 'Design package deleted' };
  }

  @Post(':packageId/items')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Add EDV to design package' })
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
    @Body() dto: AddDesignPackageItemDto,
  ): Promise<unknown> {
    return this.designPackagesService.addItem(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
      dto,
    );
  }

  @Delete(':packageId/items/:itemId')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Remove item from design package' })
  async removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
    @Param('itemId') itemId: string,
  ): Promise<{ message: string }> {
    await this.designPackagesService.removeItem(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
      itemId,
    );
    return { message: 'Design package item removed' };
  }

  @Get(':packageId/dependencies')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'List design package dependencies' })
  listDependencies(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
  ): Promise<unknown> {
    return this.designPackagesService.listDependencies(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
    );
  }

  @Post(':packageId/dependencies')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Create design package dependency' })
  addDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
    @Body() dto: CreateDesignPackageDependencyDto,
  ): Promise<unknown> {
    return this.designPackagesService.addDependency(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
      dto,
    );
  }

  @Delete(':packageId/dependencies/:dependencyId')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Delete design package dependency' })
  async removeDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
    @Param('dependencyId') dependencyId: string,
  ): Promise<{ message: string }> {
    await this.designPackagesService.removeDependency(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
      dependencyId,
    );
    return { message: 'Design package dependency removed' };
  }

  @Post(':packageId/lock-edvs')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'Lock all EDVs in package via WorkflowKernel' })
  lockEdvs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
    @Body() dto: LockPackageEdvsDto,
  ): Promise<unknown> {
    return this.designPackagesService.lockPackageEdvs(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
      dto,
    );
  }

  @Post(':packageId/batch-approve')
  @RequirePermission('schedule', 'approve')
  @ApiOperation({ summary: 'Batch approve EDVs in package via WorkflowKernel' })
  batchApprove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
    @Body() dto: BatchApproveEdvsDto,
  ): Promise<unknown> {
    return this.designPackagesService.batchApproveEdvs(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
      dto,
    );
  }

  @Post(':packageId/batch-return')
  @RequirePermission('schedule', 'approve')
  @ApiOperation({ summary: 'Batch return EDVs in package via WorkflowKernel' })
  batchReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
    @Body() dto: BatchReturnEdvsDto,
  ): Promise<unknown> {
    return this.designPackagesService.batchReturnEdvs(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
      dto,
    );
  }

  @Post(':packageId/submit-for-review')
  @RequirePermission('schedule', 'create')
  @ApiOperation({ summary: 'Submit package for review — opens session + frozen snapshot' })
  submitForReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
    @Body() dto: SubmitPackageForReviewDto,
  ): Promise<unknown> {
    return this.designPackagesService.submitForReview(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
      dto,
    );
  }

  @Post(':packageId/review-sessions/:reviewSessionId/approve')
  @RequirePermission('schedule', 'approve')
  @ApiOperation({ summary: 'Approve review session at current tier' })
  approveReviewSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
    @Param('reviewSessionId') reviewSessionId: string,
    @Body() dto: ApproveReviewSessionDto,
  ): Promise<unknown> {
    return this.designPackagesService.approveReviewSession(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
      reviewSessionId,
      dto,
    );
  }

  @Post(':packageId/return-for-rework')
  @RequirePermission('schedule', 'approve')
  @ApiOperation({ summary: 'Return package for rework — closes session, EDVs to DRAFT' })
  returnForRework(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('packageId') packageId: string,
    @Body() dto: ReturnPackageForReworkDto,
  ): Promise<unknown> {
    return this.designPackagesService.returnForRework(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      packageId,
      dto,
    );
  }
}
