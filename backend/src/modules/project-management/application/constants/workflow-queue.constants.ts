export const WORKFLOW_COMMITTED_QUEUE = 'workflow-committed';
export const WORKFLOW_SLA_QUEUE = 'workflow-sla';

export interface WorkflowCommittedJobPayload {
  readonly companyId: string;
  readonly correlationId: string;
}
