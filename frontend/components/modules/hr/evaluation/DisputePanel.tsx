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
        decision === 'ACCEPTED' ? 'Result accepted' : 'Escalated to HR',
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
    <div>
      {contextHolder}

      {finalScore != null && (
        <Alert
          type={
            status === 'DISPUTED' || status === 'ESCALATED'
              ? 'warning'
              : 'success'
          }
          message={
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>
                Final Score:{' '}
                <strong style={{ fontSize: 18 }}>
                  {Number(finalScore).toFixed(1)} / 5.0
                </strong>
              </span>
              {evaluation.employeeRespondBy && status === 'RESULT_SHARED' && (
                <span style={{ fontSize: 12 }}>
                  Respond by:{' '}
                  {new Date(evaluation.employeeRespondBy).toLocaleDateString()}
                </span>
              )}
            </div>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {isEmployee && status === 'RESULT_SHARED' && (
        <div
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <h4 style={{ margin: '0 0 12px' }}>Do you agree with this result?</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                style={{ marginBottom: 8 }}
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
      )}

      {isEmployee &&
        (status === 'DL_UPHELD' || status === 'DL_ADJUSTED') && (
          <div
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <h4 style={{ margin: '0 0 8px' }}>
              Discipline Lead has responded to your dispute
            </h4>
            {activeDispute && (
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
                style={{ marginBottom: 12 }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                  style={{ marginBottom: 8 }}
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
        )}

      {isDisciplineLead && status === 'DISPUTED' && (
        <div
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <h4 style={{ margin: '0 0 12px' }}>Respond to Dispute</h4>
          {activeDispute && (
            <Alert
              type="warning"
              message="Employee's dispute reason:"
              description={activeDispute.reason}
              style={{ marginBottom: 12 }}
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label
                style={{ fontSize: 13, display: 'block', marginBottom: 6 }}
              >
                Decision
              </label>
              <Select
                value={dlDecision}
                onChange={(val) => setDlDecision(val)}
                style={{ width: '100%' }}
                options={[
                  { value: 'UPHELD', label: 'Uphold original score' },
                  { value: 'ADJUSTED', label: 'Adjust score' },
                ]}
              />
            </div>
            {dlDecision === 'ADJUSTED' && (
              <div>
                <label
                  style={{ fontSize: 13, display: 'block', marginBottom: 6 }}
                >
                  New Score (1–5)
                </label>
                <InputNumber
                  min={1}
                  max={5}
                  step={0.1}
                  value={dlScore}
                  onChange={(val) => setDlScore(val)}
                  style={{ width: '100%' }}
                />
              </div>
            )}
            <div>
              <label
                style={{ fontSize: 13, display: 'block', marginBottom: 6 }}
              >
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
      )}

      {isHR && status === 'ESCALATED' && (
        <div
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <h4 style={{ margin: '0 0 12px' }}>HR Final Decision</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label
                style={{ fontSize: 13, display: 'block', marginBottom: 6 }}
              >
                Decision
              </label>
              <Select
                value={hrDecision}
                onChange={(val) => setHrDecision(val)}
                style={{ width: '100%' }}
                options={[
                  { value: 'UPHELD', label: 'Uphold existing score' },
                  { value: 'ADJUSTED', label: 'Adjust final score' },
                ]}
              />
            </div>
            {hrDecision === 'ADJUSTED' && (
              <div>
                <label
                  style={{ fontSize: 13, display: 'block', marginBottom: 6 }}
                >
                  Final Score (1–5)
                </label>
                <InputNumber
                  min={1}
                  max={5}
                  step={0.1}
                  value={hrScore}
                  onChange={(val) => setHrScore(val)}
                  style={{ width: '100%' }}
                />
              </div>
            )}
            <div>
              <label
                style={{ fontSize: 13, display: 'block', marginBottom: 6 }}
              >
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
      )}

      {disputes.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ marginBottom: 12 }}>Dispute History</h4>
          <Timeline
            items={[
              {
                color: 'red',
                children: (
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      Employee disputed result
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      {activeDispute?.reason}
                    </div>
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
                          <div style={{ fontWeight: 500 }}>
                            Discipline Lead{' '}
                            {activeDispute.dlDecision === 'ADJUSTED'
                              ? 'adjusted score'
                              : 'upheld original score'}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--color-text-tertiary)',
                            }}
                          >
                            {activeDispute.dlComment}
                          </div>
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
                          <div style={{ fontWeight: 500 }}>
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
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--color-text-tertiary)',
                            }}
                          >
                            {activeDispute.hrComment}
                          </div>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      )}
    </div>
  );
}
