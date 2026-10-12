'use client';

import './evaluation-v2.css';

import { Button, Spin, Tabs, message } from 'antd';
import type { TabsProps } from 'antd';
import { LockOutlined, ShareAltOutlined } from '@ant-design/icons';
import { ArrowLeft, CalendarDays, FileText, Users } from 'lucide-react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
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
  EVALUATION_STATUS_BADGE,
  EVALUATION_STATUS_LABELS,
  getQuarterLabel,
  getQuarterPeriodLabel,
  getScoreColor,
  getScoreLabel,
} from '@/lib/utils/evaluation-status';
import { formatUserName } from '@/lib/utils/user-display';
import AssessmentForm from './AssessmentForm';
import DisputePanel from './DisputePanel';
import EvaluationListAvatar from './EvaluationListAvatar';

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

const STAGE_ORDER = ['SELF', 'TEAM_LEAD', 'DISCIPLINE_LEAD'] as const;
const STAGE_LABELS = ['Self', 'Team Lead', 'DL'] as const;

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
      <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-detail-page erp-evaluation-v2">
        <div className="erp-evaluation-loading">
          <Spin size="large" />
        </div>
      </div>
    );
  }

  const evaluation = evaluationQuery.data;
  if (!evaluation) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-detail-page erp-evaluation-v2">
        <div className="erp-pro-card p-6">
          <p className="erp-users-email m-0">Evaluation not found.</p>
          <Link href="/hr/evaluations" className="erp-evaluation-back mt-3">
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            Back to evaluations
          </Link>
        </div>
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
  const dlAssessment = assessments.find(
    (a) => a.stage === 'DISCIPLINE_LEAD',
  );

  const finalScore = evaluation.adjustedScore ?? evaluation.finalScore;
  const employeeName =
    formatUserName(evaluation.employee);
  const stagesDone = STAGE_ORDER.filter((stage) =>
    assessments.some((a) => a.stage === stage && a.submittedAt !== null),
  ).length;

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
          hideTitle
          onSubmit={async (scores, comment) => {
            await submitSelf.mutateAsync({ scores, comment });
          }}
          readOnly={!selfEditable}
          disabled={!isEmployee}
        />
      ),
    });
  }

  if (isEmployee || isTeamLead || isDisciplineLead || isHR) {
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
          hideTitle
          onSubmit={async (scores, comment) => {
            await submitTeamLead.mutateAsync({ scores, comment });
          }}
          readOnly={!teamLeadEditable}
          disabled={!isTeamLead}
        />
      ),
    });
  }

  if (isEmployee || isDisciplineLead || isHR) {
    const dlEditable =
      isDisciplineLead &&
      (evaluation.status === 'TEAM_LEAD_ASSESSED' ||
        evaluation.status === 'DISPUTED');
    tabs.push({
      key: 'discipline-lead',
      label: 'Discipline Lead Assessment',
      children: (
        <AssessmentForm
          sections={sections}
          stage="DISCIPLINE_LEAD"
          existingAssessment={dlAssessment}
          hideTitle
          allowResubmit={evaluation.status === 'DISPUTED'}
          submitLabel={
            evaluation.status === 'DISPUTED'
              ? 'Resubmit Adjusted Assessment'
              : undefined
          }
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

  let defaultTab = tabs[0]?.key;
  if (
    isEmployee &&
    (evaluation.status === 'PENDING' ||
      evaluation.status === 'SELF_ASSESSED') &&
    tabs.some((t) => t.key === 'self')
  ) {
    defaultTab = 'self';
  } else if (
    isTeamLead &&
    evaluation.status === 'SELF_ASSESSED' &&
    tabs.some((t) => t.key === 'team-lead')
  ) {
    defaultTab = 'team-lead';
  } else if (
    isDisciplineLead &&
    (evaluation.status === 'TEAM_LEAD_ASSESSED' ||
      evaluation.status === 'DISPUTED') &&
    tabs.some((t) => t.key === 'discipline-lead')
  ) {
    defaultTab = 'discipline-lead';
  } else if (
    RESULT_STATUSES.includes(evaluation.status) &&
    tabs.some((t) => t.key === 'result')
  ) {
    defaultTab = 'result';
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-evaluation-page erp-evaluation-detail-page erp-evaluation-v2">
      {contextHolder}

      <section className="erp-evaluation-detail-hero">
        <div className="erp-evaluation-hero-top">
          <div className="min-w-0">
            <Link href="/hr/evaluations" className="erp-evaluation-back">
              <ArrowLeft size={14} strokeWidth={2} aria-hidden />
              All evaluations
            </Link>
            <div className="erp-evaluation-hero-identity">
              <EvaluationListAvatar
                firstName={evaluation.employee.firstName}
                lastName={evaluation.employee.lastName}
                userId={evaluation.employee.id}
              />
              <div className="min-w-0">
                <div className="erp-evaluation-hero-title-row">
                  <h2 className="erp-evaluation-hero-title">{employeeName}</h2>
                  {evaluation.employee.employeeId ? (
                    <span className="erp-users-id-chip">
                      {evaluation.employee.employeeId}
                    </span>
                  ) : null}
                  <StatusBadge
                    label={EVALUATION_STATUS_LABELS[evaluation.status]}
                    variant={EVALUATION_STATUS_BADGE[evaluation.status]}
                  />
                </div>
                <p className="erp-evaluation-detail-meta">
                  <span>
                    <CalendarDays size={14} strokeWidth={2} aria-hidden />
                    {getQuarterLabel(
                      evaluation.cycle.quarter,
                      evaluation.cycle.year,
                    )}{' '}
                    ·{' '}
                    {getQuarterPeriodLabel(
                      evaluation.cycle.quarter,
                      evaluation.cycle.year,
                    )}
                  </span>
                  {evaluation.teamLead ? (
                    <span>
                      <Users size={14} strokeWidth={2} aria-hidden />
                      Team Lead:{' '}
                      <strong>
                        {evaluation.teamLead.firstName}{' '}
                        {evaluation.teamLead.lastName}
                      </strong>
                    </span>
                  ) : null}
                  {evaluation.disciplineLead ? (
                    <span>
                      <Users size={14} strokeWidth={2} aria-hidden />
                      Discipline Lead:{' '}
                      <strong>
                        {evaluation.disciplineLead.firstName}{' '}
                        {evaluation.disciplineLead.lastName}
                      </strong>
                    </span>
                  ) : null}
                  {evaluation.cycle.template?.name ? (
                    <span>
                      <FileText size={14} strokeWidth={2} aria-hidden />
                      Template:{' '}
                      <strong>{evaluation.cycle.template.name}</strong>
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          </div>

          <div className="erp-evaluation-hero-actions">
            {finalScore != null ? (
              <div className="erp-evaluation-detail-score">
                <div
                  className="erp-evaluation-score"
                  style={{ color: getScoreColor(Number(finalScore)) }}
                >
                  {Number(finalScore).toFixed(1)}
                </div>
                <div className="erp-evaluation-score-label">
                  {getScoreLabel(Number(finalScore))}
                </div>
              </div>
            ) : null}

            {isDisciplineLead &&
            evaluation.status === 'DISCIPLINE_ASSESSED' ? (
              <Button
                type="primary"
                icon={<ShareAltOutlined />}
                onClick={() => void handleShareResult()}
                loading={shareResult.isPending}
              >
                Share Result
              </Button>
            ) : null}

            {isHR &&
            (evaluation.status === 'ACCEPTED' ||
              evaluation.status === 'HR_DECIDED') ? (
              <Button
                type="primary"
                icon={<LockOutlined />}
                onClick={() => void handleLock()}
                loading={lockEval.isPending}
              >
                Lock & File
              </Button>
            ) : null}
          </div>
        </div>

        <div className="erp-evaluation-hero-stages">
          <p className="erp-evaluation-fact-label mb-2">
            Assessment progress · {stagesDone}/{STAGE_ORDER.length}
          </p>
          <div className="erp-evaluation-stage-bar">
            {STAGE_ORDER.map((stage) => {
              const done = assessments.some(
                (a) => a.stage === stage && a.submittedAt !== null,
              );
              return (
                <div
                  key={stage}
                  className={`erp-evaluation-stage-seg${
                    done ? ' erp-evaluation-stage-seg--done' : ''
                  }`}
                />
              );
            })}
          </div>
          <div className="erp-evaluation-stage-labels">
            {STAGE_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </section>

      <div className="erp-pro-card erp-evaluation-detail-card">
        {sections.length === 0 ? (
          <div className="p-6">
            <p className="erp-users-email m-0">
              Evaluation template sections are not available for this cycle.
            </p>
          </div>
        ) : (
          <Tabs
            items={tabs}
            defaultActiveKey={defaultTab}
            className="erp-evaluation-detail-tabs"
          />
        )}
      </div>
    </div>
  );
}
