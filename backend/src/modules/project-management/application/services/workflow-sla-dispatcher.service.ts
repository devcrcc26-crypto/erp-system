import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import { WORKFLOW_SLA_QUEUE } from '../constants/workflow-queue.constants';
import { ReviewSlaService } from './review-sla.service';

/**
 * Schedules SLA escalation post-commit (BullMQ or inline fallback).
 */
@Injectable()
export class WorkflowSlaDispatcher {
  private readonly logger = new Logger(WorkflowSlaDispatcher.name);

  constructor(
    private readonly reviewSla: ReviewSlaService,
    @Optional()
    @InjectQueue(WORKFLOW_SLA_QUEUE)
    private readonly queue?: Queue,
  ) {}

  /**
   * Enqueues hourly SLA escalation work.
   */
  async dispatchHourlyEscalation(): Promise<void> {
    if (this.queue) {
      await this.queue.add(
        'hourly-escalation',
        {},
        {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
      return;
    }

    this.logger.debug('Redis queue unavailable - running SLA escalation synchronously');
    await this.reviewSla.runHourlyEscalation();
  }
}
