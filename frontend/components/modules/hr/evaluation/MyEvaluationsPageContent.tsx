'use client';

import { useMemo, useState } from 'react';
import { Empty, Select, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { EvaluationStatus } from '@/lib/api/evaluation.types';
import {
  useEvaluations,
  useMyEvaluations,
} from '@/lib/query/evaluation';
import {
  EVALUATION_STATUS_BADGE,
  EVALUATION_STATUS_LABELS,
  getQuarterLabel,
  getQuarterPeriodLabel,
  getScoreColor,
  getScoreLabel,
} from '@/lib/utils/evaluation-status';
import EvaluationTrendChart from './EvaluationTrendChart';

const ACTION_STATUSES: EvaluationStatus[] = [
  'PENDING',
  'RESULT_SHARED',
  'DL_UPHELD',
  'DL_ADJUSTED',
];

const COMPLETED_STATUSES: EvaluationStatus[] = [
  'ACCEPTED',
  'LOCKED',
  'HR_DECIDED',
];

interface MyEvaluationsPageContentProps {
  /** When viewing another employee (HR), pass their user id. */
  employeeId?: string;
}

export default function MyEvaluationsPageContent({
  employeeId,
}: MyEvaluationsPageContentProps = {}): React.ReactNode {
  const router = useRouter();
  const [yearFilter, setYearFilter] = useState<number | ''>('');

  const myQuery = useMyEvaluations();
  const employeeQuery = useEvaluations(
    employeeId ? { employeeId } : undefined,
    { enabled: Boolean(employeeId) },
  );

  const evaluationsQuery = employeeId ? employeeQuery : myQuery;

  const evaluations = useMemo(
    () => evaluationsQuery.data ?? [],
    [evaluationsQuery.data],
  );

  if (evaluationsQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-evaluation-page flex justify-center p-12">
        <Spin size="large" />
      </div>
    );
  }

  const years = [...new Set(evaluations.map((e) => e.cycle.year))].sort(
    (a, b) => b - a,
  );
  const yearOptions = [
    { value: '' as const, label: 'All Years' },
    ...years.map((y) => ({ value: y, label: String(y) })),
  ];

  const filtered =
    yearFilter === ''
      ? evaluations
      : evaluations.filter((e) => e.cycle.year === yearFilter);

  const needsAction = evaluations.filter((e) =>
    ACTION_STATUSES.includes(e.status),
  ).length;

  const completed = evaluations.filter((e) =>
    COMPLETED_STATUSES.includes(e.status),
  );

  const sorted = [...filtered].sort((a, b) => {
    if (b.cycle.year !== a.cycle.year) {
      return b.cycle.year - a.cycle.year;
    }
    return b.cycle.quarter - a.cycle.quarter;
  });

  return (
    <div className="erp-pro-list-page erp-users-page erp-evaluation-page">
      <div className="erp-pro-card erp-evaluation-trend-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {employeeId ? 'Evaluations' : 'My Evaluations'}
            </h3>
            {needsAction > 0 && !employeeId ? (
              <span className="erp-users-count-pill">
                {needsAction} action{needsAction === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="erp-users-count-pill">
                {evaluations.length.toLocaleString()}
              </span>
            )}
          </div>
          <div className="erp-users-toolbar-actions">
            <Select
              value={yearFilter}
              onChange={setYearFilter}
              options={yearOptions}
              className="erp-users-filter-select w-[120px]"
            />
          </div>
        </div>
        <div className="erp-pro-card-body">
          <p className="erp-users-email m-0 mb-3">
            {employeeId
              ? 'Quarterly performance evaluations for this employee'
              : 'Your quarterly performance evaluations'}
          </p>
          {completed.length >= 2 ? (
            <>
              <h4 className="mb-3 mt-0 text-[13px] font-semibold text-[#374151]">
                Performance Trend
              </h4>
              <EvaluationTrendChart evaluations={completed} />
            </>
          ) : null}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="erp-pro-card">
          <div className="px-4 py-10">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No evaluations found"
            />
          </div>
        </div>
      ) : (
        <div className="erp-evaluation-card-grid">
          {sorted.map((ev) => {
            const finalScore = ev.adjustedScore ?? ev.finalScore;
            const needsMyAction = ACTION_STATUSES.includes(ev.status);
            const assessments = ev.assessments ?? [];

            return (
              <button
                key={ev.id}
                type="button"
                className={`erp-evaluation-card${
                  needsMyAction ? ' erp-evaluation-card--action' : ''
                }`}
                onClick={() => router.push(`/hr/evaluations/${ev.id}`)}
              >
                <div className="erp-evaluation-card-top">
                  <div className="min-w-0">
                    <p className="erp-users-cell-strong m-0 text-[15px]">
                      {getQuarterLabel(ev.cycle.quarter, ev.cycle.year)}
                    </p>
                    <p className="erp-users-email m-0 mt-0.5">
                      {getQuarterPeriodLabel(ev.cycle.quarter, ev.cycle.year)}
                    </p>
                  </div>
                  {finalScore != null ? (
                    <div className="text-right">
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
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge
                    label={EVALUATION_STATUS_LABELS[ev.status]}
                    variant={EVALUATION_STATUS_BADGE[ev.status]}
                  />
                  {needsMyAction ? (
                    <StatusBadge label="Action Required" variant="info" />
                  ) : null}
                </div>

                <div>
                  <div className="erp-evaluation-stage-bar">
                    {(['SELF', 'TEAM_LEAD', 'DISCIPLINE_LEAD'] as const).map(
                      (stage) => {
                        const done = assessments.some(
                          (a) =>
                            a.stage === stage && a.submittedAt !== null,
                        );
                        return (
                          <div
                            key={stage}
                            className={`erp-evaluation-stage-seg${
                              done ? ' erp-evaluation-stage-seg--done' : ''
                            }`}
                          />
                        );
                      },
                    )}
                  </div>
                  <div className="erp-evaluation-stage-labels">
                    {['Self', 'Team Lead', 'DL'].map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
