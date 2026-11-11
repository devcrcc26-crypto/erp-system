import { WorkflowEventPhase } from './enums/workflow-event-phase.enum';
import { EdvStatus } from './enums/edv-status.enum';
import { CommentStatus } from './enums/comment-status.enum';
import { DesignPackageProjectedStatus } from './enums/design-package-projected-status.enum';

export type WorkflowEntityType =
  | 'EngineeringDocumentVersion'
  | 'DesignPackage'
  | 'TaskDiscipline'
  | 'ReviewSession'
  | 'ReviewComment'
  | 'Submittal';

export interface WorkflowStateSnapshot {
  readonly edvStatus?: EdvStatus;
  readonly packageProjectedStatus?: DesignPackageProjectedStatus;
  readonly commentStatus?: CommentStatus;
  readonly revisionLabel?: string;
}

/** Append-only event log row contract - no update/delete ever. */
export interface WorkflowEventLogEntry {
  readonly id: string;
  readonly companyId: string;
  readonly entityType: WorkflowEntityType;
  readonly entityId: string;
  readonly actorId: string;
  readonly action: string;
  readonly phase: WorkflowEventPhase;
  readonly beforeState: WorkflowStateSnapshot;
  readonly afterState: WorkflowStateSnapshot;
  readonly reason?: string;
  readonly correlationId?: string;
  readonly correctsEventId?: string;
  readonly createdAt: Date;
}

/**
 * INTENT - written inside $transaction; rolled back with tx failure.
 * COMMITTED - written post-commit; confirms durable state.
 * CORRECTION - append-only fix; references correctsEventId; reason required.
 */
export interface WorkflowEventModel {
  readonly phases: typeof WorkflowEventPhase;
  readonly intentRule: 'same_transaction_as_edv_write';
  readonly committedRule: 'post_commit_only';
  readonly correctionRule: 'append_only_with_correctsEventId';
  readonly forbidden: readonly [
    'committed_without_successful_commit',
    'edv_committed_without_intent_in_tx',
    'update_or_delete_log_rows',
  ];
}

export const WORKFLOW_EVENT_MODEL: WorkflowEventModel = {
  phases: WorkflowEventPhase,
  intentRule: 'same_transaction_as_edv_write',
  committedRule: 'post_commit_only',
  correctionRule: 'append_only_with_correctsEventId',
  forbidden: [
    'committed_without_successful_commit',
    'edv_committed_without_intent_in_tx',
    'update_or_delete_log_rows',
  ],
};

export interface IntentEventDraft
  extends Omit<WorkflowEventLogEntry, 'id' | 'createdAt' | 'phase'> {
  readonly phase: WorkflowEventPhase.INTENT;
}

export interface CommittedEventDraft
  extends Omit<WorkflowEventLogEntry, 'id' | 'createdAt' | 'phase'> {
  readonly phase: WorkflowEventPhase.COMMITTED;
}

export interface CorrectionEventDraft
  extends Omit<WorkflowEventLogEntry, 'id' | 'createdAt' | 'phase'> {
  readonly phase: WorkflowEventPhase.CORRECTION;
  readonly correctsEventId: string;
  readonly reason: string;
}
