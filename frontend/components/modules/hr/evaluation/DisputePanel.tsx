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
  useAcceptResult,
  useDLRespondToDispute,
  useDisputeResult,
  useEmployeeRespondToDL,
  useHRDecideDispute,
} from '@/lib/query/evaluation';
import type { EmployeeEvaluation } from '@/lib/api/evaluation.types';
import { getScoreColor, getScoreLabel } from '@/lib/utils/evaluation-status';

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
  const [dlScore, setDlScore] = useState<number | null>(null);
  const [hrDecision, setHrDecision] = useState<'UPHELD' | 'ADJUSTED'>('UPHELD');
  const [hrComment, setHrComment] = useState('');
  const [hrScore, setHrScore] = useState<number | null>(null);
  const [escalationReason, setEscalationReason] = useState('');
  const [messageApi, contextHolder] = message.useMessage();

  const disputeMutation = useDisputeResult(evaluation.id);
  const acceptMutation = useAcceptResult(evaluation.id);
  const dlRespondMutation = useDLRespondToDispute(evaluation.id);
  const employeeRespondMutation = useEmployeeRespondToDL(evaluation.id);
  const hrDecideMutation = useHRDecideDispute(evaluation.id);

  const disputes = evaluation.disputes ?? [];
  const activeDispute = disputes[0];
  const finalScore = evaluation.adjustedScore ?? evaluation.finalScore;
  const status = evaluation.status;

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
        decision: dlDecision,
        comment: dlComment,
        adjustedScore:
          dlDecision === 'ADJUSTED' ? (dlScore ?? undefined) : undefined,
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

      {finalScore != null ? (
        <div className="erp-dispute-score-card">
          <div>
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
          {evaluation.employeeRespondBy && status === 'RESULT_SHARED' ? (
            <p className="erp-users-email m-0">
              Respond by{' '}
              {new Date(evaluation.employeeRespondBy).toLocaleDateString()}
            </p>
          ) : null}
        </div>
      ) : null}

      {isEmployee && status === 'RESULT_SHARED' ? (
        <div className="erp-dispute-action-card">
          <h4 className="erp-dispute-action-title">
            Do you agree with this result?
          </h4>
          <div className="erp-dispute-action-body">
            <Button
              type="primary"
              onClick={() => void handleAccept()}
              loading={acceptMutation.isPending}
            >
              Accept Result
            </Button>
            <div>
              <Input.TextArea
                rows={3}
                placeholder="Reason for dispute (required)"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="mb-2"
              />
              <Button
                danger
                onClick={() => void handleDispute()}
                loading={disputeMutation.isPending}
              >
                Dispute Result
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isEmployee &&
      (status === 'DL_UPHELD' || status === 'DL_ADJUSTED') ? (
        <div className="erp-dispute-action-card">
          <h4 className="erp-dispute-action-title">
            Discipline Lead has responded to your dispute
          </h4>
          {activeDispute ? (
            <Alert
              type={
                activeDispute.dlDecision === 'ADJUSTED' ? 'info' : 'warning'
              }
              message={
                activeDispute.dlDecision === 'ADJUSTED'
                  ? `Score adjusted to ${
                      activeDispute.dlAdjustedScore != null
                        ? Number(activeDispute.dlAdjustedScore).toFixed(1)
                        : '—'
                    }`
                  : 'Score upheld — no change'
              }
              description={activeDispute.dlComment}
              className="mb-3"
            />
          ) : null}
          <div className="erp-dispute-action-body">
            <Button
              type="primary"
              onClick={() => void handleEmployeeRespond('ACCEPTED')}
              loading={employeeRespondMutation.isPending}
            >
              Accept Decision
            </Button>
            <div>
              <Input.TextArea
                rows={2}
                placeholder="Reason for escalation to HR (required)"
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                className="mb-2"
              />
              <Button
                danger
                onClick={() => void handleEmployeeRespond('ESCALATED')}
                loading={employeeRespondMutation.isPending}
              >
                Escalate to HR
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isDisciplineLead && status === 'DISPUTED' ? (
        <div className="erp-dispute-action-card">
          <h4 className="erp-dispute-action-title">Respond to Dispute</h4>
          {activeDispute ? (
            <Alert
              type="warning"
              message="Employee's dispute reason"
              description={activeDispute.reason}
              className="mb-3"
            />
          ) : null}
          <div className="erp-dispute-action-body">
            <div>
              <label className="erp-dispute-field-label">Decision</label>
              <Select
                value={dlDecision}
                onChange={(val) => setDlDecision(val)}
                className="w-full"
                options={[
                  { value: 'UPHELD', label: 'Uphold original score' },
                  { value: 'ADJUSTED', label: 'Adjust score' },
                ]}
              />
            </div>
            {dlDecision === 'ADJUSTED' ? (
              <div>
                <label className="erp-dispute-field-label">
                  New Score (1–5)
                </label>
                <InputNumber
                  min={1}
                  max={5}
                  step={0.1}
                  value={dlScore}
                  onChange={(val) => setDlScore(val)}
                  className="w-full"
                />
              </div>
            ) : null}
            <div>
              <label className="erp-dispute-field-label">
                Comment (required)
              </label>
              <Input.TextArea
                rows={3}
                value={dlComment}
                onChange={(e) => setDlComment(e.target.value)}
                placeholder="Explain your decision..."
              />
            </div>
            <Button
              type="primary"
              onClick={() => void handleDLRespond()}
              loading={dlRespondMutation.isPending}
            >
              Submit Response
            </Button>
          </div>
        </div>
      ) : null}

      {isHR && status === 'ESCALATED' ? (
        <div className="erp-dispute-action-card">
          <h4 className="erp-dispute-action-title">HR Final Decision</h4>
          <div className="erp-dispute-action-body">
            <div>
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
              <div>
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
            <div>
              <label className="erp-dispute-field-label">
                Comment (required)
              </label>
              <Input.TextArea
                rows={3}
                value={hrComment}
                onChange={(e) => setHrComment(e.target.value)}
                placeholder="HR final decision explanation..."
              />
            </div>
            <Button
              type="primary"
              onClick={() => void handleHRDecide()}
              loading={hrDecideMutation.isPending}
            >
              Submit Final Decision
            </Button>
          </div>
        </div>
      ) : null}

      {disputes.length > 0 ? (
        <div className="erp-dispute-history">
          <h4 className="erp-dispute-action-title">Dispute History</h4>
          <Timeline
            items={[
              {
                color: 'red',
                children: (
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
                      children: (
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
                      children: (
                        <div>
                          <p className="erp-users-cell-strong m-0">
                            HR final decision:{' '}
                            {activeDispute.hrDecision === 'ADJUSTED'
                              ? `Score adjusted to ${
                                  activeDispute.hrFinalScore != null
                                    ? Number(
                                        activeDispute.hrFinalScore,
                                      ).toFixed(1)
                                    : '—'
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
      ) : null}
    </div>
  );
}
