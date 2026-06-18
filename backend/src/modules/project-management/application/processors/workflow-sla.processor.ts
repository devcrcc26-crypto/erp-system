import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WORKFLOW_SLA_QUEUE } from '../constants/workflow-queue.constants';
import { ReviewSlaService } from '../services/review-sla.service';

@Processor(WORKFLOW_SLA_QUEUE)
export class WorkflowSlaProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowSlaProcessor.name);

  constructor(private readonly reviewSla: ReviewSlaService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.reviewSla.runHourlyEscalation();
  }
}
