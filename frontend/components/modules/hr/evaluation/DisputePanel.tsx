'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Select,
  Timeline,
  message,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import {
  useAcceptResult,
  useDLRespondToDispute,
  useDisputeResult,
  useEmployeeRespondToDL,
  useHRDecideDispute,
  useSubmitDisciplineLeadAssessment,
} from '@/lib/query/evaluation';
import type { EmployeeEvaluation } from '@/lib/api/evaluation.types';
import {
  EVALUATION_STATUS_BADGE,
  EVALUATION_STATUS_LABELS,
  getScoreColor,
  getScoreLabel,
} from '@/lib/utils/evaluation-status';
import AssessmentForm from './AssessmentForm';

interface DisputePanelProps {
  evaluation: EmployeeEvaluation;
  isHR: boolean;
  isDisciplineLead: boolean;
  isEmployee: boolean;
}

export default function DisputePanel({
  evaluation,
  isHR,
  isDisciplineLead,
  isEmployee,
}: DisputePanelProps): React.ReactNode {
  const [disputeReason, setDisputeReason] = useState('');
  const [dlDecision, setDlDecision] = useState<'UPHELD' | 'ADJUSTED'>('UPHELD');
  const [dlComment, setDlComment] = useState('');
  const [hrDecision, setHrDecision] = useState<'UPHELD' | 'ADJUSTED'>('UPHELD');
  const [hrComment, setHrComment] = useState('');
  const [hrScore, setHrScore] = useState<number | null>(null);
  const [escalationReason, setEscalationReason] = useState('');
  const [messageApi, contextHolder] = message.useMessage();

  const disputeMutation = useDisputeResult(evaluation.id);
  const acceptMutation = useAcceptResult(evaluation.id);
  const dlRespondMutation = useDLRespondToDispute(evaluation.id);
  const submitDLAdjustment = useSubmitDisciplineLeadAssessment(evaluation.id);
  const employeeRespondMutation = useEmployeeRespondToDL(evaluation.id);
  const hrDecideMutation = useHRDecideDispute(evaluation.id);

  const disputes = evaluation.disputes ?? [];
  const activeDispute = disputes[0];
  const finalScore = evaluation.adjustedScore ?? evaluation.finalScore;
  const status = evaluation.status;
  const sections = evaluation.cycle?.template?.sections ?? [];
  const dlAssessment = evaluation.assessments?.find(
    (a) => a.stage === 'DISCIPLINE_LEAD',
  );
  const respondBy =
    evaluation.employeeRespondBy && status === 'RESULT_SHARED'
      ? new Date(evaluation.employeeRespondBy).toLocaleDateString()
      : null;

  async function handleDispute(): Promise<void> {
    if (!disputeReason.trim()) {
      void messageApi.warning('Please provide a reason for your dispute');
      return;
    }
    try {
      await disputeMutation.mutateAsync({ reason: disputeReason });
      setDisputeReason('');
      void messageApi.success('Dispute submitted');
    } catch {
      void messageApi.error('Failed to submit dispute');
    }
  }

  async function handleAccept(): Promise<void> {
    try {
      await acceptMutation.mutateAsync();
      void messageApi.success('Result accepted');
    } catch {
      void messageApi.error('Failed to accept result');
    }
  }

  async function handleDLRespond(): Promise<void> {
    if (!dlComment.trim()) {
      void messageApi.warning('Please provide a comment');
      return;
    }
    try {
      await dlRespondMutation.mutateAsync({
        decision: 'UPHELD',
        comment: dlComment,
      });
      void messageApi.success('Response submitted');
    } catch {
      void messageApi.error('Failed to submit response');
    }
  }

  async function handleEmployeeRespond(
    decision: 'ACCEPTED' | 'ESCALATED',
  ): Promise<void> {
    if (decision === 'ESCALATED' && !escalationReason.trim()) {
      void messageApi.warning('Please provide a reason for escalation');
      return;
    }
    try {
      await employeeRespondMutation.mutateAsync({
        decision,
        escalationReason:
          decision === 'ESCALATED' ? escalationReason : undefined,
      });
      void messageApi.success(
        decision === 'ACCEPTED' ? 'Decision accepted' : 'Escalated to HR',
      );
    } catch {
      void messageApi.error('Failed to submit response');
    }
  }

  async function handleHRDecide(): Promise<void> {
    if (!hrComment.trim()) {
      void messageApi.warning('Please provide a comment');
      return;
    }
    try {
      await hrDecideMutation.mutateAsync({
        decision: hrDecision,
        comment: hrComment,
        adjustedScore:
          hrDecision === 'ADJUSTED' ? (hrScore ?? undefined) : undefined,
      });
      void messageApi.success('Decision submitted');
    } catch {
      void messageApi.error('Failed to submit decision');
    }
  }

  return (
    <div className="erp-dispute-panel">
      {contextHolder}

      <div className="erp-evaluation-section-card erp-dispute-score-section">
        <div className="erp-evaluation-section-header">
          <div className="min-w-0">
            <span className="erp-users-cell-strong">Final Result</span>
            <span className="erp-users-email ml-2">结果</span>
          </div>
          <StatusBadge
            label={EVALUATION_STATUS_LABELS[status]}
            variant={EVALUATION_STATUS_BADGE[status]}
          />
        </div>
        <div className="erp-dispute-score-body">
          {finalScore != null ? (
            <div className="erp-dispute-score-main">
              <p className="erp-dispute-score-label">Final Score</p>
              <p
                className="erp-dispute-score-value"
                style={{ color: getScoreColor(Number(finalScore)) }}
              >
                {Number(finalScore).toFixed(1)}
                <span className="erp-dispute-score-max"> / 5.0</span>
              </p>
              <p className="erp-users-email m-0 mt-1">
                {getScoreLabel(Number(finalScore))}
              </p>
            </div>
          ) : (
            <p className="erp-users-email m-0">No final score available yet.</p>
          )}
          {respondBy ? (
            <div className="erp-dispute-deadline">
              <ExclamationCircleOutlined />
              <span>
                Respond by <strong>{respondBy}</strong>
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {isEmployee && status === 'RESULT_SHARED' ? (
        <div className="erp-evaluation-section-card">
          <div className="erp-evaluation-section-header">
            <span className="erp-users-cell-strong">
              Do you agree with this result?
            </span>
          </div>
          <div className="erp-dispute-action-body">
            <div className="erp-dispute-path erp-dispute-path--accept">
              <p className="erp-dispute-path-label">Accept</p>
              <p className="erp-dispute-path-desc">
                Confirm this score and close the evaluation.
              </p>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => void handleAccept()}
                loading={acceptMutation.isPending}
                className="erp-dispute-path-btn"
              >
                Accept Result
              </Button>
            </div>

            <div className="erp-dispute-path-divider">
              <span>or</span>
            </div>

            <div className="erp-dispute-path erp-dispute-path--dispute">
              <p className="erp-dispute-path-label">Dispute</p>
              <p className="erp-dispute-path-desc">
                Explain why you disagree. Your Discipline Lead will review.
              </p>
              <Input.TextArea
                rows={3}
                placeholder="Reason for dispute (required)"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="erp-dispute-textarea"
              />
              <Button
                danger
                icon={<CloseOutlined />}
                onClick={() => void handleDispute()}
                loading={disputeMutation.isPending}
                className="erp-dispute-path-btn"
              >
                Dispute Result
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isEmployee &&
      (status === 'DL_UPHELD' || status === 'DL_ADJUSTED') ? (
        <div className="erp-evaluation-section-card">
          <div className="erp-evaluation-section-header">
            <span className="erp-users-cell-strong">
              Discipline Lead response
            </span>
          </div>
          <div className="erp-dispute-action-body">
            {activeDispute ? (
              <Alert
                type={
                  activeDispute.dlDecision === 'ADJUSTED' ? 'info' : 'warning'
                }
                showIcon
                title={
                  activeDispute.dlDecision === 'ADJUSTED'
                    ? `Score adjusted to ${
                        activeDispute.dlAdjustedScore != null
                          ? Number(activeDispute.dlAdjustedScore).toFixed(1)
                          : '-'
                      }`
                    : 'Score upheld - no change'
                }
                description={activeDispute.dlComment}
              />
            ) : null}

            <div className="erp-dispute-path erp-dispute-path--accept">
              <p className="erp-dispute-path-label">Accept decision</p>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => void handleEmployeeRespond('ACCEPTED')}
                loading={employeeRespondMutation.isPending}
                className="erp-dispute-path-btn"
              >
                Accept Decision
              </Button>
            </div>

            <div className="erp-dispute-path-divider">
              <span>or</span>
            </div>

            <div className="erp-dispute-path erp-dispute-path--dispute">
              <p className="erp-dispute-path-label">Escalate to HR</p>
              <Input.TextArea
                rows={3}
                placeholder="Reason for escalation to HR (required)"
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                className="erp-dispute-textarea"
              />
              <Button
                danger
                onClick={() => void handleEmployeeRespond('ESCALATED')}
                loading={employeeRespondMutation.isPending}
                className="erp-dispute-path-btn"
              >
                Escalate to HR
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isDisciplineLead && status === 'DISPUTED' ? (
        <div className="erp-evaluation-section-card">
          <div className="erp-evaluation-section-header">
            <span className="erp-users-cell-strong">Respond to Dispute</span>
          </div>
          <div className="erp-dispute-action-body">
            {activeDispute ? (
              <Alert
                type="warning"
                showIcon
                title="Employee's dispute reason"
                description={activeDispute.reason}
              />
            ) : null}
            <div className="erp-dispute-field">
              <label className="erp-dispute-field-label">Decision</label>
              <Select
                value={dlDecision}
                onChange={(val) => setDlDecision(val)}
                className="w-full"
                options={[
                  { value: 'UPHELD', label: 'Uphold original score' },
                  {
                    value: 'ADJUSTED',
                    label: 'Adjust score (re-open assessment form)',
                  },
                ]}
              />
            </div>

            {dlDecision === 'UPHELD' ? (
              <>
                <div className="erp-dispute-field">
                  <label className="erp-dispute-field-label">
                    Comment (required)
                  </label>
                  <Input.TextArea
                    rows={3}
                    value={dlComment}
                    onChange={(e) => setDlComment(e.target.value)}
                    placeholder="Explain why the original score stands..."
                    className="erp-dispute-textarea"
                  />
                </div>
                <div className="erp-dispute-footer">
                  <Button
                    type="primary"
                    onClick={() => void handleDLRespond()}
                    loading={dlRespondMutation.isPending}
                  >
                    Uphold Score
                  </Button>
                </div>
              </>
            ) : (
              <div className="erp-dispute-adjust-form">
                <Alert
                  type="info"
                  showIcon
                  style={{ margin: '0 16px 16px' }}
                  title="Re-open Discipline Lead assessment"
                  description="Update criterion scores below, then resubmit. The consolidated final score will replace the previous result."
                />
                {sections.length > 0 ? (
                  <div className="px-4 pb-4">
                    <AssessmentForm
                      sections={sections}
                      stage="DISCIPLINE_LEAD"
                      existingAssessment={dlAssessment}
                      hideTitle
                      allowResubmit
                      submitLabel="Resubmit Adjusted Assessment"
                      readOnly={false}
                      disabled={false}
                      onSubmit={async (scores, comment) => {
                        await submitDLAdjustment.mutateAsync({
                          scores,
                          comment,
                        });
                        void messageApi.success(
                          'Assessment adjusted and dispute resolved',
                        );
                      }}
                    />
                  </div>
                ) : (
                  <p className="erp-users-email px-4 pb-4">
                    Assessment template sections are not available.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {isHR && status === 'ESCALATED' ? (
        <div className="erp-evaluation-section-card">
          <div className="erp-evaluation-section-header">
            <span className="erp-users-cell-strong">HR Final Decision</span>
          </div>
          <div className="erp-dispute-action-body">
            <div className="erp-dispute-field">
              <label className="erp-dispute-field-label">Decision</label>
              <Select
                value={hrDecision}
                onChange={(val) => setHrDecision(val)}
                className="w-full"
                options={[
                  { value: 'UPHELD', label: 'Uphold existing score' },
                  { value: 'ADJUSTED', label: 'Adjust final score' },
                ]}
              />
            </div>
            {hrDecision === 'ADJUSTED' ? (
              <div className="erp-dispute-field">
                <label className="erp-dispute-field-label">
                  Final Score (1–5)
                </label>
                <InputNumber
                  min={1}
                  max={5}
                  step={0.1}
                  value={hrScore}
                  onChange={(val) => setHrScore(val)}
                  className="w-full"
                />
              </div>
            ) : null}
            <div className="erp-dispute-field">
              <label className="erp-dispute-field-label">
                Comment (required)
              </label>
              <Input.TextArea
                rows={3}
                value={hrComment}
                onChange={(e) => setHrComment(e.target.value)}
                placeholder="HR final decision explanation..."
                className="erp-dispute-textarea"
              />
            </div>
            <div className="erp-dispute-footer">
              <Button
                type="primary"
                onClick={() => void handleHRDecide()}
                loading={hrDecideMutation.isPending}
              >
                Submit Final Decision
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {disputes.length > 0 ? (
        <div className="erp-evaluation-section-card">
          <div className="erp-evaluation-section-header">
            <span className="erp-users-cell-strong">Dispute History</span>
          </div>
          <div className="erp-dispute-history-body">
            <Timeline
              items={[
                {
                  color: 'red',
                  content: (
                    <div>
                      <p className="erp-users-cell-strong m-0">
                        Employee disputed result
                      </p>
                      <p className="erp-users-email m-0 mt-0.5">
                        {activeDispute?.reason}
                      </p>
                    </div>
                  ),
                },
                ...(activeDispute?.dlDecision
                  ? [
                      {
                        color:
                          activeDispute.dlDecision === 'ADJUSTED'
                            ? 'blue'
                            : 'orange',
                        content: (
                          <div>
                            <p className="erp-users-cell-strong m-0">
                              Discipline Lead{' '}
                              {activeDispute.dlDecision === 'ADJUSTED'
                                ? 'adjusted score'
                                : 'upheld original score'}
                            </p>
                            <p className="erp-users-email m-0 mt-0.5">
                              {activeDispute.dlComment}
                            </p>
                          </div>
                        ),
                      },
                    ]
                  : []),
                ...(activeDispute?.hrDecision
                  ? [
                      {
                        color: 'green',
                        content: (
                          <div>
                            <p className="erp-users-cell-strong m-0">
                              HR final decision:{' '}
                              {activeDispute.hrDecision === 'ADJUSTED'
                                ? `Score adjusted to ${
                                    activeDispute.hrFinalScore != null
                                      ? Number(
                                          activeDispute.hrFinalScore,
                                        ).toFixed(1)
                                      : '-'
                                  }`
                                : 'Score upheld'}
                            </p>
                            <p className="erp-users-email m-0 mt-0.5">
                              {activeDispute.hrComment}
                            </p>
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
