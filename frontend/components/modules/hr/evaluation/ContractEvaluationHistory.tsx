'use client';

import { Collapse, Empty, Spin, Tabs, Tag } from 'antd';
import type {
  EmployeeEvaluation,
  EvaluationAssessment,
  EvaluationSection,
  EvaluationStage,
} from '@/lib/api/evaluation.types';
import { useContractEvaluationHistory } from '@/lib/query/evaluation';
import {
  EVALUATION_STATUS_COLORS,
  EVALUATION_STATUS_LABELS,
  getQuarterLabel,
  getScoreColor,
  getScoreLabel,
} from '@/lib/utils/evaluation-status';
import EvaluationTrendChart from './EvaluationTrendChart';

interface ContractEvaluationHistoryProps {
  contractId: string;
  employeeName: string;
}

const STAGE_LABELS: Record<EvaluationStage, string> = {
  SELF: 'Self',
  TEAM_LEAD: 'Team Lead',
  DISCIPLINE_LEAD: 'Discipline Lead',
  HR: 'HR',
};

const STAGE_COLORS: Record<EvaluationStage, string> = {
  SELF: 'blue',
  TEAM_LEAD: 'cyan',
  DISCIPLINE_LEAD: 'purple',
  HR: 'green',
};

function AssessmentBreakdown({
  assessment,
  sections,
}: {
  assessment: EvaluationAssessment;
  sections: EvaluationSection[];
}): React.ReactNode {
  return (
    <div>
      {assessment.overallAvg != null && (
        <div
          style={{
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13 }}>Overall:</span>
          <span
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: getScoreColor(Number(assessment.overallAvg)),
            }}
          >
            {Number(assessment.overallAvg).toFixed(1)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {getScoreLabel(Number(assessment.overallAvg))}
          </span>
        </div>
      )}

      {sections.map((section) => {
        const sectionScores = assessment.scores.filter((s) =>
          section.criteria.some((c) => c.id === s.criteriaId),
        );
        const scoredItems = sectionScores.filter((s) => s.score !== null);
        const sectionAvg =
          scoredItems.length > 0
            ? scoredItems.reduce((sum, s) => sum + (s.score ?? 0), 0) /
              scoredItems.length
            : null;

        return (
          <div key={section.id} style={{ marginBottom: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <span style={{ fontWeight: 500, fontSize: 12 }}>
                {section.name}
              </span>
              {sectionAvg !== null && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: getScoreColor(sectionAvg),
                  }}
                >
                  {sectionAvg.toFixed(1)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {section.criteria.map((criterion) => {
                const score = sectionScores.find(
                  (s) => s.criteriaId === criterion.id,
                );
                return (
                  <div
                    key={criterion.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '4px 8px',
                      background: 'var(--color-bg-tertiary)',
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {criterion.name}
                    </span>
                    {score ? (
                      score.score !== null ? (
                        <span
                          style={{
                            fontWeight: 600,
                            color: getScoreColor(score.score),
                          }}
                        >
                          {score.score} / 5
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>
                          N/A
                        </span>
                      )
                    ) : (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>
                        -
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {assessment.comment && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            background: 'var(--color-bg-secondary)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            fontStyle: 'italic',
          }}
        >
          &ldquo;{assessment.comment}&rdquo;
        </div>
      )}
    </div>
  );
}

function EvaluationCard({
  evaluation,
}: {
  evaluation: EmployeeEvaluation;
}): React.ReactNode {
  const finalScore = evaluation.adjustedScore ?? evaluation.finalScore;
  const sections = evaluation.cycle?.template?.sections ?? [];
  const assessments = evaluation.assessments ?? [];
  const disputes = evaluation.disputes ?? [];

  const assessmentTabs = assessments.map((a) => ({
    key: a.stage,
    label: (
      <span>
        <Tag
          color={STAGE_COLORS[a.stage]}
          style={{ margin: 0, marginRight: 4 }}
        >
          {STAGE_LABELS[a.stage]}
        </Tag>
        {a.overallAvg != null && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: getScoreColor(Number(a.overallAvg)),
            }}
          >
            {Number(a.overallAvg).toFixed(1)}
          </span>
        )}
      </span>
    ),
    children: <AssessmentBreakdown assessment={a} sections={sections} />,
  }));

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Tag color={EVALUATION_STATUS_COLORS[evaluation.status]}>
            {EVALUATION_STATUS_LABELS[evaluation.status]}
          </Tag>
          {disputes.length > 0 && <Tag color="warning">Disputed</Tag>}
        </div>
        {finalScore != null && (
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: getScoreColor(Number(finalScore)),
                lineHeight: 1,
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
      </div>

      {assessmentTabs.length > 0 ? (
        <Tabs items={assessmentTabs} size="small" />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No assessments submitted yet"
        />
      )}
    </div>
  );
}

export default function ContractEvaluationHistory({
  contractId,
  employeeName,
}: ContractEvaluationHistoryProps): React.ReactNode {
  const historyQuery = useContractEvaluationHistory(contractId);

  if (historyQuery.isLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  const evaluations = historyQuery.data ?? [];

  if (evaluations.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="No completed evaluations for this contract period"
      />
    );
  }

  return (
    <div>
      <div className="erp-pro-card erp-evaluation-trend-card">
        <div className="erp-pro-card-body">
          <h4 className="mb-3 mt-0 text-[13px] font-semibold text-[#374151]">
            Performance Trend - {employeeName}
          </h4>
          <EvaluationTrendChart evaluations={evaluations} />
        </div>
      </div>

      <Collapse
        accordion
        items={evaluations.map((ev) => {
          const score = ev.adjustedScore ?? ev.finalScore;
          return {
            key: ev.id,
            label: (
              <div className="flex w-full items-center justify-between gap-3 pr-2">
                <span className="erp-users-cell-strong">
                  {getQuarterLabel(ev.cycle.quarter, ev.cycle.year)}
                </span>
                <div className="flex items-center gap-2">
                  {score != null ? (
                    <span
                      className="font-bold"
                      style={{ color: getScoreColor(Number(score)) }}
                    >
                      {Number(score).toFixed(1)}
                    </span>
                  ) : null}
                  <Tag
                    color={EVALUATION_STATUS_COLORS[ev.status]}
                    style={{ margin: 0 }}
                  >
                    {EVALUATION_STATUS_LABELS[ev.status]}
                  </Tag>
                </div>
              </div>
            ),
            children: <EvaluationCard evaluation={ev} />,
          };
        })}
      />
    </div>
  );
}
