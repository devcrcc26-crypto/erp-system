'use client';

import { useState } from 'react';
import { Button, Input, message } from 'antd';
import ScoreInput from './ScoreInput';
import type {
  EvaluationAssessment,
  EvaluationCriteria,
  EvaluationSection,
  EvaluationStage,
} from '@/lib/api/evaluation.types';

export interface AssessmentScoreState {
  criteriaId: string;
  score: number | null;
  comment: string;
}

interface AssessmentFormProps {
  sections: EvaluationSection[];
  stage: EvaluationStage;
  existingAssessment?: EvaluationAssessment;
  onSubmit: (
    scores: AssessmentScoreState[],
    comment: string,
  ) => Promise<void>;
  disabled?: boolean;
  readOnly?: boolean;
  label?: string;
}

const STAGE_LABELS: Record<EvaluationStage, string> = {
  SELF: 'Self Assessment',
  TEAM_LEAD: 'Team Lead Assessment',
  DISCIPLINE_LEAD: 'Discipline Lead Assessment',
  HR: 'HR Assessment',
};

export default function AssessmentForm({
  sections,
  stage,
  existingAssessment,
  onSubmit,
  disabled,
  readOnly,
  label,
}: AssessmentFormProps): React.ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const [overallComment, setOverallComment] = useState(
    existingAssessment?.comment ?? '',
  );
  const [messageApi, contextHolder] = message.useMessage();

  const [scores, setScores] = useState<AssessmentScoreState[]>(() =>
    sections.flatMap((section) =>
      section.criteria.map((criterion) => {
        const existing = existingAssessment?.scores?.find(
          (s) => s.criteriaId === criterion.id,
        );
        return {
          criteriaId: criterion.id,
          score: existing?.score ?? null,
          comment: existing?.comment ?? '',
        };
      }),
    ),
  );

  function updateScore(criteriaId: string, score: number | null): void {
    setScores((prev) =>
      prev.map((s) => (s.criteriaId === criteriaId ? { ...s, score } : s)),
    );
  }

  function updateCriteriaComment(criteriaId: string, comment: string): void {
    setScores((prev) =>
      prev.map((s) =>
        s.criteriaId === criteriaId ? { ...s, comment } : s,
      ),
    );
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      await onSubmit(scores, overallComment);
      void messageApi.success('Assessment submitted successfully');
    } catch {
      void messageApi.error('Failed to submit assessment');
    } finally {
      setSubmitting(false);
    }
  }

  function getSectionAvg(criteria: EvaluationCriteria[]): number | null {
    const criteriaScores = scores.filter(
      (s) =>
        criteria.some((c) => c.id === s.criteriaId) && s.score !== null,
    );
    if (criteriaScores.length === 0) {
      return null;
    }
    const sum = criteriaScores.reduce((acc, s) => acc + (s.score ?? 0), 0);
    return Math.round((sum / criteriaScores.length) * 10) / 10;
  }

  return (
    <div>
      {contextHolder}
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{label ?? STAGE_LABELS[stage]}</h3>
        {existingAssessment?.submittedAt && (
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Submitted:{' '}
            {new Date(existingAssessment.submittedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {sections.map((section) => {
        const sectionAvg = getSectionAvg(section.criteria);
        return (
          <div
            key={section.id}
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <div>
                <span style={{ fontWeight: 600 }}>{section.name}</span>
                {section.nameZh && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {section.nameZh}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  Weight: {Number(section.weight)}%
                </span>
                {sectionAvg !== null && (
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color:
                        sectionAvg >= 4
                          ? '#52c41a'
                          : sectionAvg >= 3
                            ? '#1677ff'
                            : '#fa8c16',
                    }}
                  >
                    Avg: {sectionAvg}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {section.criteria.map((criterion) => {
                const scoreState = scores.find(
                  (s) => s.criteriaId === criterion.id,
                );
                return (
                  <div key={criterion.id}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>
                          {criterion.name}
                          {criterion.nameZh && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 11,
                                color: 'var(--color-text-tertiary)',
                              }}
                            >
                              {criterion.nameZh}
                            </span>
                          )}
                        </div>
                        {criterion.description && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--color-text-tertiary)',
                              marginTop: 2,
                            }}
                          >
                            {criterion.description}
                          </div>
                        )}
                      </div>
                      <ScoreInput
                        value={scoreState?.score}
                        onChange={(val) => updateScore(criterion.id, val)}
                        disabled={disabled || readOnly}
                      />
                    </div>
                    {!readOnly && (
                      <Input
                        placeholder="Comment (optional)"
                        value={scoreState?.comment}
                        onChange={(e) =>
                          updateCriteriaComment(criterion.id, e.target.value)
                        }
                        size="small"
                        style={{ marginTop: 6 }}
                        disabled={disabled}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ marginBottom: 16 }}>
        <label
          style={{
            display: 'block',
            marginBottom: 6,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Overall Comment
        </label>
        <Input.TextArea
          rows={3}
          value={overallComment}
          onChange={(e) => setOverallComment(e.target.value)}
          placeholder="Overall comments about this employee's performance..."
          disabled={disabled || readOnly}
          maxLength={1000}
          showCount
        />
      </div>

      {!readOnly && (
        <Button
          type="primary"
          onClick={() => void handleSubmit()}
          loading={submitting}
          disabled={disabled}
        >
          Submit Assessment
        </Button>
      )}
    </div>
  );
}
