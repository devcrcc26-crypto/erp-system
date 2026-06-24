import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkflowSlaDispatcher } from '../../application/services/workflow-sla-dispatcher.service';

/**
 * Hourly SLA escalation scheduler - enqueues BullMQ jobs when Redis is enabled.
 */
@Injectable()
export class ReviewSlaCron {
  private readonly logger = new Logger(ReviewSlaCron.name);

  constructor(private readonly workflowSlaDispatcher: WorkflowSlaDispatcher) {}

  @Cron(CronExpression.EVERY_HOUR)
  async scheduleHourlyEscalation(): Promise<void> {
    await this.workflowSlaDispatcher.dispatchHourlyEscalation();
    this.logger.debug('Scheduled hourly SLA escalation');
  }
}
