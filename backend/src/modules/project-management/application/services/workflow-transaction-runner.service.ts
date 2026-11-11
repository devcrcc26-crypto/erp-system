import { Injectable } from '@nestjs/common';
import {
  EpcWorkflowRepository,
  PrismaTx,
} from '../../infrastructure/repositories/epc-workflow.repository';
import { WorkflowCommittedDispatcher } from './workflow-committed-dispatcher.service';

export interface PhaseABMeta {
  readonly companyId: string;
  readonly correlationId: string;
}

/**
 * Wraps Phase A+B transactions with post-commit COMMITTED event dispatch.
 */
@Injectable()
export class WorkflowTransactionRunner {
  constructor(
    private readonly epcWorkflowRepository: EpcWorkflowRepository,
    private readonly committedDispatcher: WorkflowCommittedDispatcher,
  ) {}

  /**
   * Executes work in a transaction then schedules COMMITTED mirror events.
   */
  async runPhaseAB<T>(
    work: (tx: PrismaTx) => Promise<T>,
    meta: PhaseABMeta,
  ): Promise<T> {
    const result = await this.epcWorkflowRepository.runPhaseAB(work);
    await this.committedDispatcher.dispatch(meta.companyId, meta.correlationId);
    return result;
  }

  /**
   * Transaction without post-commit dispatch (reconciliation, tests).
   */
  async runPhaseABOnly<T>(work: (tx: PrismaTx) => Promise<T>): Promise<T> {
    return this.epcWorkflowRepository.runPhaseAB(work);
  }
}
