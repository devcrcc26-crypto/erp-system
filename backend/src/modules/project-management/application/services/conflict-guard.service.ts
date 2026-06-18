import { ConflictException, Injectable } from '@nestjs/common';
import { EdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import { EdvWithDiscipline } from '../../infrastructure/repositories/epc-workflow.repository';

export interface BatchTransitionPlan {
  readonly edvId: string;
  readonly from: EdvStatus;
  readonly to: EdvStatus;
}

/**
 * V1 conflict guards for EDV workflow mutations (Wave 2 minimum).
 */
@Injectable()
export class ConflictGuardService {
  /**
   * Ensures all EDVs exist and match expected count for batch operations.
   */
  assertBatchEdvsResolved(
    requestedIds: readonly string[],
    loaded: readonly EdvWithDiscipline[],
  ): void {
    if (loaded.length !== requestedIds.length) {
      throw new ConflictException('One or more EDV rows not found for batch');
    }

    const loadedIds = new Set(loaded.map((e) => e.id));
    for (const id of requestedIds) {
      if (!loadedIds.has(id)) {
        throw new ConflictException(`EDV ${id} not found for batch operation`);
      }
    }
  }

  /**
   * Validates batch transition plan before any write — all-or-nothing.
   */
  assertBatchTransitionPlan(
    loaded: readonly EdvWithDiscipline[],
    targetStatus: EdvStatus,
    allowedFromStatuses: readonly EdvStatus[],
  ): BatchTransitionPlan[] {
    const plan: BatchTransitionPlan[] = [];

    for (const edv of loaded) {
      const from = edv.status as EdvStatus;
      if (!allowedFromStatuses.includes(from)) {
        throw new ConflictException(
          `EDV ${edv.id} status ${from} cannot transition to ${targetStatus}`,
        );
      }
      if (from === EdvStatus.LOCKED) {
        throw new ConflictException(`EDV ${edv.id} is LOCKED and immutable`);
      }
      plan.push({ edvId: edv.id, from, to: targetStatus });
    }

    return plan;
  }

  /**
   * Package lock requires every item EDV to be APPROVED.
   */
  assertPackageLockEligible(
    edvStatuses: readonly EdvStatus[],
    packageId: string,
  ): void {
    if (edvStatuses.length === 0) {
      throw new ConflictException(
        `Design package ${packageId} has no EDV items to lock`,
      );
    }

    for (const status of edvStatuses) {
      if (status !== EdvStatus.APPROVED) {
        throw new ConflictException(
          `All EDVs must be APPROVED before lock on package ${packageId}`,
        );
      }
    }
  }
}
