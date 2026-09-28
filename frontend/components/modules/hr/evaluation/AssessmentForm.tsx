'use client';

import { useMemo, useState } from 'react';
import { Button, Input, message } from 'antd';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ScoreInput from './ScoreInput';
import type {
  EvaluationAssessment,
  EvaluationCriteria,
  EvaluationSection,
  EvaluationStage,
} from '@/lib/api/evaluation.types';

export interface AssessmentScoreState {
  criteriaId: string;
  score: number | null | undefined;
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
  hideTitle?: boolean;
  /** Allow editing/resubmitting even if an assessment was previously submitted. */
  allowResubmit?: boolean;
  submitLabel?: string;
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
  hideTitle = false,
  allowResubmit = false,
  submitLabel,
}: AssessmentFormProps): React.ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const [submittedLocally, setSubmittedLocally] = useState(
    allowResubmit ? false : Boolean(existingAssessment?.submittedAt),
  );
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
          score: existing ? (existing.score ?? null) : undefined,
          comment: existing?.comment ?? '',
        };
      }),
    ),
  );

  const totalCriteria = scores.length;
  const scoredCount = useMemo(
    () => scores.filter((s) => s.score !== undefined).length,
    [scores],
  );

  function updateScore(
    criteriaId: string,
    score: number | null | undefined,
  ): void {
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
      await onSubmit(
        scores.map((s) => ({
          ...s,
          score: s.score === undefined ? null : s.score,
        })),
        overallComment,
      );
      setSubmittedLocally(true);
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
        criteria.some((c) => c.id === s.criteriaId) &&
        typeof s.score === 'number',
    );
    if (criteriaScores.length === 0) {
      return null;
    }
    const sum = criteriaScores.reduce(
      (acc, s) => acc + (typeof s.score === 'number' ? s.score : 0),
      0,
    );
    return Math.round((sum / criteriaScores.length) * 10) / 10;
  }

  const submittedAt = existingAssessment?.submittedAt;
  const isSubmitted = allowResubmit
    ? submittedLocally
    : submittedLocally || Boolean(submittedAt);
  const isLocked = Boolean(disabled || readOnly || isSubmitted);

  return (
    <div className="erp-assessment-form">
      {contextHolder}

      {!hideTitle ? (
        <div className="erp-assessment-form-head">
          <h3 className="erp-assessment-form-title">
            {label ?? STAGE_LABELS[stage]}
          </h3>
          {submittedAt ? (
            <span className="erp-users-email">
              Submitted {new Date(submittedAt).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      ) : null}

      {isLocked || isSubmitted ? (
        <div className="erp-assessment-banner">
          {isSubmitted ? (
            <>
              <StatusBadge label="Submitted" variant="success" />
              <span className="erp-users-email">
                {submittedAt
                  ? `Submitted ${new Date(submittedAt).toLocaleDateString()}. `
                  : ''}
                This stage is view-only.
              </span>
            </>
          ) : (
            <>
              <StatusBadge label="View only" variant="default" />
              <span className="erp-users-email">
                This stage is not editable for your role or the current status.
              </span>
            </>
          )}
        </div>
      ) : allowResubmit ? (
        <div className="erp-assessment-banner erp-assessment-banner--action">
          <StatusBadge label="Re-assess" variant="warning" />
          <span className="erp-users-email">
            Review and update scores after the dispute, then resubmit.{' '}
            {scoredCount}/{totalCriteria} answered.
          </span>
        </div>
      ) : (
        <div className="erp-assessment-banner erp-assessment-banner--action">
          <StatusBadge label="Your turn" variant="info" />
          <span className="erp-users-email">
            Rate each criterion (1–5 or N/A). {scoredCount}/{totalCriteria}{' '}
            answered.
          </span>
        </div>
      )}

      <div className="erp-assessment-sections">
        {sections.map((section) => {
          const sectionAvg = getSectionAvg(section.criteria);
          return (
            <div key={section.id} className="erp-evaluation-section-card">
              <div className="erp-evaluation-section-header">
                <div className="min-w-0">
                  <span className="erp-users-cell-strong">{section.name}</span>
                  {section.nameZh ? (
                    <span className="erp-users-email ml-2">
                      {section.nameZh}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge
                    label={`${Number(section.weight)}% weight`}
                    variant="info"
                  />
                  {sectionAvg !== null ? (
                    <span className="erp-assessment-section-avg">
                      Avg {sectionAvg.toFixed(1)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="erp-assessment-criteria-list">
                {section.criteria.map((criterion) => {
                  const scoreState = scores.find(
                    (s) => s.criteriaId === criterion.id,
                  );
                  return (
                    <div
                      key={criterion.id}
                      className="erp-assessment-criteria-item"
                    >
                      <div className="erp-assessment-criteria-main">
                        <div className="erp-assessment-criteria-text">
                          <p className="erp-assessment-criteria-name">
                            {criterion.name}
                            {criterion.nameZh ? (
                              <span className="erp-users-email ml-1.5 text-[12px]">
                                {criterion.nameZh}
                              </span>
                            ) : null}
                          </p>
                          {criterion.description ? (
                            <p className="erp-assessment-criteria-desc">
                              {criterion.description}
                            </p>
                          ) : null}
                        </div>
                        <ScoreInput
                          value={scoreState?.score}
                          onChange={(val) => updateScore(criterion.id, val)}
                          disabled={isLocked}
                        />
                      </div>
                      {!readOnly ? (
                        <Input
                          placeholder="Comment (optional)"
                          value={scoreState?.comment}
                          onChange={(e) =>
                            updateCriteriaComment(
                              criterion.id,
                              e.target.value,
                            )
                          }
                          size="small"
                          className="erp-assessment-criteria-comment"
                          disabled={disabled}
                        />
                      ) : scoreState?.comment ? (
                        <p className="erp-assessment-criteria-comment-ro">
                          {scoreState.comment}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="erp-assessment-overall">
        <label className="erp-assessment-overall-label" htmlFor={`overall-${stage}`}>
          Overall Comment
        </label>
        <Input.TextArea
          id={`overall-${stage}`}
          rows={3}
          value={overallComment}
          onChange={(e) => setOverallComment(e.target.value)}
          placeholder="Overall comments about this employee's performance..."
          disabled={isLocked}
          maxLength={1000}
          showCount
        />
      </div>

      {!readOnly && !isSubmitted ? (
        <div className="erp-assessment-footer">
          <span className="erp-users-email">
            {scoredCount}/{totalCriteria} criteria answered
          </span>
          <Button
            type="primary"
            onClick={() => void handleSubmit()}
            loading={submitting}
            disabled={disabled}
          >
            {submitLabel ?? 'Submit Assessment'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
