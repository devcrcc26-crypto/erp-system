import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  WORKFLOW_COMMITTED_QUEUE,
  WorkflowCommittedJobPayload,
} from '../constants/workflow-queue.constants';
import { WorkflowCommittedService } from './workflow-committed.service';

/**
 * Schedules COMMITTED event writes post-transaction (BullMQ or inline fallback).
 */
@Injectable()
export class WorkflowCommittedDispatcher {
  private readonly logger = new Logger(WorkflowCommittedDispatcher.name);

  constructor(
    private readonly workflowCommittedService: WorkflowCommittedService,
    @Optional()
    @InjectQueue(WORKFLOW_COMMITTED_QUEUE)
    private readonly queue?: Queue<WorkflowCommittedJobPayload>,
  ) {}

  /**
   * Dispatches committed-event processing after successful Phase A+B transaction.
   */
  async dispatch(companyId: string, correlationId: string): Promise<void> {
    const payload: WorkflowCommittedJobPayload = { companyId, correlationId };

    if (this.queue) {
      await this.queue.add('commit', payload, {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
      return;
    }

    this.logger.debug(
      'Redis queue unavailable - committing workflow events synchronously',
    );
    await this.workflowCommittedService.commitByCorrelation(
      companyId,
      correlationId,
    );
  }
}
