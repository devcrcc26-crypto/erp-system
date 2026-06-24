import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  BatchLockPackagesDto,
  TriggerRevisionDto,
} from '../../application/dtos/engineering-document.dtos';
import { DecisionTraceService } from '../../application/services/decision-trace.service';
import { DesignPackagesService } from '../../application/services/design-packages.service';
import { RevisionOrchestratorService } from '../../application/services/revision-orchestrator.service';
import { WorkflowKernelService } from '../../application/services/workflow-kernel.service';

@ApiTags('Engineering Batch')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('projects/:projectId')
export class EngineeringBatchController {
  constructor(
    private readonly designPackagesService: DesignPackagesService,
    private readonly decisionTraceService: DecisionTraceService,
    private readonly revisionOrchestrator: RevisionOrchestratorService,
    private readonly workflowKernel: WorkflowKernelService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Post('engineering-documents/batch-lock')
  @RequirePermission('schedule', 'approve')
  @ApiOperation({ summary: 'Lock all EDVs in multiple design packages' })
  batchLock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: BatchLockPackagesDto,
  ): Promise<unknown> {
    return this.designPackagesService.batchLockPackages(
      this.ctx(user),
      projectId,
      dto,
    );
  }

  @Get('engineering-documents/:id/decision-trace')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'Decision trace lineage for engineering document' })
  decisionTrace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') engineeringDocumentId: string,
  ): Promise<unknown> {
    return this.decisionTraceService.buildForEngineeringDocument(
      this.ctx(user),
      engineeringDocumentId,
    );
  }

  @Post('engineering-documents/:id/trigger-revision')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Trigger external revision loop - new DRAFT EDV from LOCKED' })
  triggerRevision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') engineeringDocumentId: string,
    @Body() dto: TriggerRevisionDto,
  ): Promise<unknown> {
    return this.workflowKernel.execute({
      type: 'TriggerRevision',
      companyId: user.companyId,
      actorId: user.userId,
      engineeringDocumentId,
      triggerSource: dto.triggerSource,
      triggerEntityId: dto.triggerEntityId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  @Post('revision-triggers/:triggerId/process')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Process PENDING external review trigger' })
  processRevisionTrigger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('triggerId') triggerId: string,
  ): Promise<unknown> {
    return this.revisionOrchestrator.processExternalReviewTrigger(
      this.ctx(user),
      triggerId,
    );
  }
}
