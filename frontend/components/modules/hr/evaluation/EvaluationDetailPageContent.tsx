'use client';

import { Button, Spin, Tabs, Tag, message } from 'antd';
import type { TabsProps } from 'antd';
import { LockOutlined, ShareAltOutlined } from '@ant-design/icons';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useCurrentUser } from '@/lib/query/profile';
import {
  useEvaluation,
  useLockEvaluation,
  useShareResult,
  useSubmitDisciplineLeadAssessment,
  useSubmitSelfAssessment,
  useSubmitTeamLeadAssessment,
} from '@/lib/query/evaluation';
import type { EvaluationStatus } from '@/lib/api/evaluation.types';
import {
  EVALUATION_STATUS_COLORS,
  EVALUATION_STATUS_LABELS,
  getQuarterLabel,
  getScoreColor,
  getScoreLabel,
} from '@/lib/utils/evaluation-status';
import AssessmentForm from './AssessmentForm';
import DisputePanel from './DisputePanel';

interface EvaluationDetailPageContentProps {
  evaluationId: string;
}

const RESULT_STATUSES: EvaluationStatus[] = [
  'RESULT_SHARED',
  'ACCEPTED',
  'DISPUTED',
  'DL_UPHELD',
  'DL_ADJUSTED',
  'ESCALATED',
  'HR_DECIDED',
  'LOCKED',
];

export default function EvaluationDetailPageContent({
  evaluationId,
}: EvaluationDetailPageContentProps): React.ReactNode {
  const evaluationQuery = useEvaluation(evaluationId);
  const currentUser = useCurrentUser();
  const canViewHr = useCanViewHr();
  const [messageApi, contextHolder] = message.useMessage();

  const submitSelf = useSubmitSelfAssessment(evaluationId);
  const submitTeamLead = useSubmitTeamLeadAssessment(evaluationId);
  const submitDL = useSubmitDisciplineLeadAssessment(evaluationId);
  const shareResult = useShareResult(evaluationId);
  const lockEval = useLockEvaluation(evaluationId);

  if (evaluationQuery.isLoading || currentUser.isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const evaluation = evaluationQuery.data;
  if (!evaluation) {
    return (
      <div style={{ padding: 24 }}>
        <p>Evaluation not found.</p>
      </div>
    );
  }

  const currentUserId = currentUser.data?.id ?? '';
  const isEmployee = evaluation.employeeId === currentUserId;
  const isTeamLead = evaluation.teamLeadId === currentUserId;
  const isDisciplineLead = evaluation.disciplineLeadId === currentUserId;
  const isHR = canViewHr;

  const sections = evaluation.cycle?.template?.sections ?? [];
  const assessments = evaluation.assessments ?? [];

  const selfAssessment = assessments.find((a) => a.stage === 'SELF');
  const teamLeadAssessment = assessments.find((a) => a.stage === 'TEAM_LEAD');
  const dlAssessment = assessments.find((a) => a.stage === 'DISCIPLINE_LEAD');

  const finalScore = evaluation.adjustedScore ?? evaluation.finalScore;

  async function handleShareResult(): Promise<void> {
    try {
      await shareResult.mutateAsync();
      void messageApi.success('Result shared with employee');
    } catch {
      void messageApi.error('Failed to share result');
    }
  }

  async function handleLock(): Promise<void> {
    try {
      await lockEval.mutateAsync();
      void messageApi.success('Evaluation locked and filed');
    } catch {
      void messageApi.error('Failed to lock evaluation');
    }
  }

  const tabs: NonNullable<TabsProps['items']> = [];

  if (isEmployee || isDisciplineLead || isHR) {
    const selfEditable =
      isEmployee &&
      (evaluation.status === 'PENDING' ||
        evaluation.status === 'SELF_ASSESSED');
    tabs.push({
      key: 'self',
      label: 'Self Assessment',
      children: (
        <AssessmentForm
          sections={sections}
          stage="SELF"
          existingAssessment={selfAssessment}
          onSubmit={async (scores, comment) => {
            await submitSelf.mutateAsync({ scores, comment });
          }}
          readOnly={!selfEditable}
          disabled={!isEmployee}
        />
      ),
    });
  }

  if (isTeamLead || isDisciplineLead || isHR) {
    const teamLeadEditable =
      isTeamLead &&
      (evaluation.status === 'SELF_ASSESSED' ||
        evaluation.status === 'TEAM_LEAD_ASSESSED');
    tabs.push({
      key: 'team-lead',
      label: 'Team Lead Assessment',
      children: (
        <AssessmentForm
          sections={sections}
          stage="TEAM_LEAD"
          existingAssessment={teamLeadAssessment}
          onSubmit={async (scores, comment) => {
            await submitTeamLead.mutateAsync({ scores, comment });
          }}
          readOnly={!teamLeadEditable}
          disabled={!isTeamLead}
        />
      ),
    });
  }

  if (isDisciplineLead || isHR) {
    const dlEditable =
      isDisciplineLead && evaluation.status === 'TEAM_LEAD_ASSESSED';
    tabs.push({
      key: 'discipline-lead',
      label: 'Discipline Lead Assessment',
      children: (
        <AssessmentForm
          sections={sections}
          stage="DISCIPLINE_LEAD"
          existingAssessment={dlAssessment}
          onSubmit={async (scores, comment) => {
            await submitDL.mutateAsync({ scores, comment });
          }}
          readOnly={!dlEditable}
          disabled={!isDisciplineLead}
        />
      ),
    });
  }

  if (RESULT_STATUSES.includes(evaluation.status)) {
    tabs.push({
      key: 'result',
      label: 'Result & Dispute',
      children: (
        <DisputePanel
          evaluation={evaluation}
          isHR={isHR}
          isDisciplineLead={isDisciplineLead}
          isEmployee={isEmployee}
        />
      ),
    });
  }

  return (
    <div className="erp-pro-list-page">
      {contextHolder}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0 }}>
              {evaluation.employee.firstName} {evaluation.employee.lastName}
            </h2>
            <Tag style={{ margin: 0 }}>
              {evaluation.employee.employeeId ?? '—'}
            </Tag>
            <Tag color={EVALUATION_STATUS_COLORS[evaluation.status]}>
              {EVALUATION_STATUS_LABELS[evaluation.status]}
            </Tag>
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--color-text-tertiary)',
              marginTop: 4,
            }}
          >
            {getQuarterLabel(evaluation.cycle.quarter, evaluation.cycle.year)}{' '}
            Evaluation
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {finalScore != null && (
            <div
              style={{
                textAlign: 'center',
                padding: '8px 16px',
                background: 'var(--color-bg-secondary)',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: getScoreColor(Number(finalScore)),
                }}
              >
                {Number(finalScore).toFixed(1)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {getScoreLabel(Number(finalScore))}
              </div>
            </div>
          )}

          {isDisciplineLead &&
            evaluation.status === 'DISCIPLINE_ASSESSED' && (
              <Button
                icon={<ShareAltOutlined />}
                onClick={() => void handleShareResult()}
                loading={shareResult.isPending}
              >
                Share Result with Employee
              </Button>
            )}

          {isHR &&
            (evaluation.status === 'ACCEPTED' ||
              evaluation.status === 'HR_DECIDED') && (
              <Button
                type="primary"
                icon={<LockOutlined />}
                onClick={() => void handleLock()}
                loading={lockEval.isPending}
              >
                Lock & File
              </Button>
            )}
        </div>
      </div>

      {sections.length === 0 ? (
        <p style={{ color: 'var(--color-text-tertiary)' }}>
          Evaluation template sections are not available for this cycle.
        </p>
      ) : (
        <Tabs items={tabs} defaultActiveKey={tabs[0]?.key} />
      )}
    </div>
  );
}
