import { BadRequestException, Injectable } from '@nestjs/common';
import { EdvStatus as PrismaEdvStatus, Prisma } from '@prisma/client';
import { EdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import { EpcWorkflowAction } from '../../domain/contracts/enums/epc-workflow-action.enum';
import {
  EpcWorkflowRepository,
  PrismaTx,
} from '../../infrastructure/repositories/epc-workflow.repository';
import { PermissionResolverService } from './permission-resolver.service';
import { StatusWriteGateService } from './status-write-gate.service';

export interface PhaseATransitionResult {
  readonly edvId: string;
  readonly from: EdvStatus;
  readonly to: EdvStatus;
  readonly intentEventId: string;
}

/**
 * Applies EDV status transitions inside a workflow transaction (Phase A writes).
 */
@Injectable()
export class EdvTransitionService {
  constructor(
    private readonly epcWorkflowRepository: EpcWorkflowRepository,
    private readonly statusWriteGate: StatusWriteGateService,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  /**
   * Persists EDV transitions with permission, write-gate, and INTENT events.
   */
  async applyInTx(
    tx: PrismaTx,
    input: {
      companyId: string;
      actorId: string;
      correlationId: string;
      projectId: string;
      currentAssigneeUserId?: string;
      permissionActionOverride?: EpcWorkflowAction;
      designPackageId?: string;
      transitions: readonly {
        engineeringDocumentVersionId: string;
        targetStatus: EdvStatus;
        reason?: string;
      }[];
    },
  ): Promise<PhaseATransitionResult[]> {
    const results: PhaseATransitionResult[] = [];

    for (const transition of input.transitions) {
      const edv = await this.epcWorkflowRepository.findEdvWithDiscipline(
        tx,
        input.companyId,
        transition.engineeringDocumentVersionId,
      );
      if (!edv) {
        throw new BadRequestException(
          `EDV ${transition.engineeringDocumentVersionId} not found`,
        );
      }

      const from = edv.status as EdvStatus;
      const to = transition.targetStatus;

      this.statusWriteGate.assertTransition({ from, to });

      await this.permissionResolver.assertEdvTransitionAllowed({
        companyId: input.companyId,
        userId: input.actorId,
        projectId: input.projectId,
        edv,
        targetStatus: to as PrismaEdvStatus,
        currentAssigneeUserId: input.currentAssigneeUserId,
        actionOverride: input.permissionActionOverride,
        designPackageId: input.designPackageId,
      });

      const beforeState: Prisma.InputJsonValue = {
        edvStatus: from,
        revisionLabel: edv.revisionLabel,
      };

      await this.epcWorkflowRepository.updateEdvStatus(
        tx,
        edv.id,
        to as PrismaEdvStatus,
        input.actorId,
      );

      const afterState: Prisma.InputJsonValue = {
        edvStatus: to,
        revisionLabel: edv.revisionLabel,
      };

      const intentEvent = await this.epcWorkflowRepository.appendIntentEvent(tx, {
        companyId: input.companyId,
        actorId: input.actorId,
        entityId: edv.id,
        action: `TRANSITION_${from}_TO_${to}`,
        beforeState,
        afterState,
        reason: transition.reason,
        correlationId: input.correlationId,
      });

      results.push({
        edvId: edv.id,
        from,
        to,
        intentEventId: intentEvent.id,
      });
    }

    await this.epcWorkflowRepository.markPackagesProjectionPending(
      tx,
      input.companyId,
      results.map((r) => r.edvId),
    );

    return results;
  }
}
