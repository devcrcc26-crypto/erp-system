import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  WORKFLOW_COMMITTED_QUEUE,
  WorkflowCommittedJobPayload,
} from '../constants/workflow-queue.constants';
import { WorkflowCommittedService } from '../services/workflow-committed.service';

@Processor(WORKFLOW_COMMITTED_QUEUE)
export class WorkflowCommittedProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowCommittedProcessor.name);

  constructor(private readonly workflowCommittedService: WorkflowCommittedService) {
    super();
  }

  async process(job: Job<WorkflowCommittedJobPayload>): Promise<void> {
    const { companyId, correlationId } = job.data;
    await this.workflowCommittedService.commitByCorrelation(
      companyId,
      correlationId,
    );
    this.logger.debug(`Processed committed job correlation=${correlationId}`);
  }
}
