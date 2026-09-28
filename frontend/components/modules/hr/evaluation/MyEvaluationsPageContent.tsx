'use client';

import { useMemo, useState } from 'react';
import { Badge, Card, Empty, Select, Spin, Tag } from 'antd';
import { useRouter } from 'next/navigation';
import type { EvaluationStatus } from '@/lib/api/evaluation.types';
import {
  useEvaluations,
  useMyEvaluations,
} from '@/lib/query/evaluation';
import {
  EVALUATION_STATUS_COLORS,
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
  const [yearFilter, setYearFilter] = useState<number | null>(null);

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
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const years = [...new Set(evaluations.map((e) => e.cycle.year))].sort(
    (a, b) => b - a,
  );
  const yearOptions = [
    { value: null as number | null, label: 'All Years' },
    ...years.map((y) => ({ value: y, label: String(y) })),
  ];

  const filtered = yearFilter
    ? evaluations.filter((e) => e.cycle.year === yearFilter)
    : evaluations;

  const needsAction = evaluations.filter((e) =>
    ACTION_STATUSES.includes(e.status),
  ).length;

  const completed = evaluations.filter((e) =>
    COMPLETED_STATUSES.includes(e.status),
  );

  return (
    <div className="erp-pro-list-page">
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>
              {employeeId ? 'Evaluations' : 'My Evaluations'}
              {needsAction > 0 && !employeeId && (
                <Badge
                  count={needsAction}
                  style={{ marginLeft: 8 }}
                  title={`${needsAction} evaluation(s) need your action`}
                />
              )}
            </h2>
            <p
              style={{
                margin: 0,
                color: 'var(--color-text-tertiary)',
                fontSize: 13,
              }}
            >
              {employeeId
                ? 'Quarterly performance evaluations for this employee'
                : 'Your quarterly performance evaluations'}
            </p>
          </div>
          <Select
            value={yearFilter}
            onChange={setYearFilter}
            options={yearOptions}
            style={{ width: 120 }}
          />
        </div>
      </div>

      {completed.length >= 2 && (
        <div
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <h4 style={{ margin: '0 0 12px' }}>Your Performance Trend</h4>
          <EvaluationTrendChart evaluations={completed} />
        </div>
      )}

      {filtered.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No evaluations found"
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 12,
          }}
        >
          {[...filtered]
            .sort((a, b) => {
              if (b.cycle.year !== a.cycle.year) {
                return b.cycle.year - a.cycle.year;
              }
              return b.cycle.quarter - a.cycle.quarter;
            })
            .map((ev) => {
              const finalScore = ev.adjustedScore ?? ev.finalScore;
              const needsMyAction = ACTION_STATUSES.includes(ev.status);
              const assessments = ev.assessments ?? [];

              return (
                <Card
                  key={ev.id}
                  hoverable
                  onClick={() => router.push(`/hr/evaluations/${ev.id}`)}
                  style={{
                    cursor: 'pointer',
                    border: needsMyAction
                      ? '2px solid #1677ff'
                      : '1px solid var(--color-border)',
                  }}
                  styles={{ body: { padding: 16 } }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {getQuarterLabel(ev.cycle.quarter, ev.cycle.year)}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        {getQuarterPeriodLabel(
                          ev.cycle.quarter,
                          ev.cycle.year,
                        )}
                      </div>
                    </div>
                    {finalScore != null ? (
                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontSize: 24,
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
                    ) : null}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <Tag
                      color={EVALUATION_STATUS_COLORS[ev.status]}
                      style={{ margin: 0 }}
                    >
                      {EVALUATION_STATUS_LABELS[ev.status]}
                    </Tag>
                    {needsMyAction && (
                      <Tag color="blue" style={{ margin: '0 0 0 6px' }}>
                        Action Required
                      </Tag>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      display: 'flex',
                      gap: 4,
                    }}
                  >
                    {(['SELF', 'TEAM_LEAD', 'DISCIPLINE_LEAD'] as const).map(
                      (stage) => {
                        const done = assessments.some(
                          (a) =>
                            a.stage === stage && a.submittedAt !== null,
                        );
                        return (
                          <div
                            key={stage}
                            style={{
                              flex: 1,
                              height: 4,
                              borderRadius: 2,
                              background: done
                                ? '#1677ff'
                                : 'var(--color-border)',
                            }}
                          />
                        );
                      },
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: 4,
                    }}
                  >
                    {['Self', 'Team Lead', 'DL'].map((label) => (
                      <span
                        key={label}
                        style={{
                          fontSize: 10,
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
