'use client';

import './site-assignments-v2.css';

import { useMemo, useState } from 'react';
import { Button, DatePicker, Form, Input, Select } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import DayCoverageNotice from '@/components/modules/hr/shared/DayCoverageNotice';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useEarliestAllowedDate } from '@/lib/query/backdating';
import { useSubmitSiteAssignment } from '@/lib/query/site-assignment';
import { useProjects } from '@/lib/query/projects';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

interface SiteAssignmentFormValues {
  siteName?: string;
  projectId?: string;
  reason?: string;
  lateReason?: string;
}

interface SitePeriodRow {
  id: string;
  range: [Dayjs, Dayjs] | null;
}

interface SitePeriodSnapshot {
  startDate: string;
  endDate: string;
  days: number;
}

function calendarDays(start: Dayjs, end: Dayjs): number {
  return end.diff(start, 'day') + 1;
}

function newPeriodId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function completeRange(
  value: [Dayjs | null, Dayjs | null] | null,
): [Dayjs, Dayjs] | null {
  if (!value?.[0] || !value[1]) {
    return null;
  }
  return [value[0], value[1]];
}

function periodsOverlap(periods: SitePeriodRow[]): boolean {
  const ranges = periods
    .map((row) => row.range)
    .filter((range): range is [Dayjs, Dayjs] => Boolean(range));
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const a = ranges[i];
      const b = ranges[j];
      if (!a[1].isBefore(b[0], 'day') && !b[1].isBefore(a[0], 'day')) {
        return true;
      }
    }
  }
  return false;
}

function filledPeriods(
  periods: SitePeriodRow[],
): Array<SitePeriodRow & { range: [Dayjs, Dayjs] }> {
  return periods.filter(
    (row): row is SitePeriodRow & { range: [Dayjs, Dayjs] } =>
      Boolean(row.range?.[0] && row.range[1]),
  );
}

function ReviewItem({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}): React.ReactNode {
  return (
    <div className={`erp-sa-review-item${wide ? ' erp-sa-review-item--wide' : ''}`}>
      <p className="erp-sa-review-label">{label}</p>
      <p className="erp-sa-review-value">{value}</p>
    </div>
  );
}

/**
 * New site assignment request - v2 hero + StepperForm (details → review).
 * Supports multiple non-overlapping date periods (one request each).
 */
export default function SiteAssignmentFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<SiteAssignmentFormValues>();
  const onBehalf = useOnBehalf('SITE_ASSIGNMENT');
  const earliestQuery = useEarliestAllowedDate(onBehalf.effectiveEmployeeId);
  const submitMutation = useSubmitSiteAssignment();
  const earliestDay = earliestQuery.data?.earliestDate
    ? dayjs(earliestQuery.data.earliestDate)
    : null;
  const requiresLateReason =
    earliestQuery.data?.requiresLateReasonWhenBeforeCurrentMonth === true;
  const projectsQuery = useProjects({ page: 1, limit: 200 });
  const [periods, setPeriods] = useState<SitePeriodRow[]>([
    { id: newPeriodId(), range: null },
  ]);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{
    siteName: string;
    projectId?: string;
    reason: string;
    lateReason: string;
    periods: SitePeriodSnapshot[];
  }>({
    siteName: '',
    reason: '',
    lateReason: '',
    periods: [],
  });

  const dayCount = useMemo(() => {
    const filled = filledPeriods(periods);
    if (filled.length === 0) {
      return null;
    }
    return filled.reduce(
      (sum, row) => sum + calendarDays(row.range[0], row.range[1]),
      0,
    );
  }, [periods]);

  const coverageSpan = useMemo(() => {
    const filled = filledPeriods(periods);
    if (filled.length === 0) {
      return null;
    }
    let from = filled[0].range[0];
    let to = filled[0].range[1];
    for (const row of filled) {
      if (row.range[0].isBefore(from, 'day')) {
        from = row.range[0];
      }
      if (row.range[1].isAfter(to, 'day')) {
        to = row.range[1];
      }
    }
    return {
      from: from.format('YYYY-MM-DD'),
      to: to.format('YYYY-MM-DD'),
    };
  }, [periods]);

  const anyPeriodBeforeCurrentMonth = useMemo(
    () =>
      filledPeriods(periods).some((row) =>
        row.range[0].isBefore(dayjs().startOf('month'), 'day'),
      ),
    [periods],
  );

  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.projectCode} - ${p.name}`,
      })),
    [projectsQuery.data?.data],
  );

  const projectLabel = useMemo(() => {
    if (!snapshot.projectId) {
      return '-';
    }
    return (
      projectOptions.find((option) => option.value === snapshot.projectId)
        ?.label ?? '-'
    );
  }, [projectOptions, snapshot.projectId]);

  function captureSnapshot(): typeof snapshot {
    const values = form.getFieldsValue(true) as SiteAssignmentFormValues;
    const next = {
      siteName: values.siteName?.trim() ?? '',
      projectId: values.projectId,
      reason: values.reason?.trim() ?? '',
      lateReason: values.lateReason?.trim() ?? '',
      periods: filledPeriods(periods).map((row) => ({
        startDate: row.range[0].format('YYYY-MM-DD'),
        endDate: row.range[1].format('YYYY-MM-DD'),
        days: calendarDays(row.range[0], row.range[1]),
      })),
    };
    setSnapshot(next);
    return next;
  }

  function resetForm(): void {
    form.resetFields();
    setPeriods([{ id: newPeriodId(), range: null }]);
    setPeriodError(null);
    setSnapshot({
      siteName: '',
      reason: '',
      lateReason: '',
      periods: [],
    });
    onBehalf.reset();
  }

  function validatePeriods(): boolean {
    const filled = filledPeriods(periods);
    if (filled.length === 0) {
      setPeriodError(t('pages.hr.siteAssignments.form.periodRequired'));
      return false;
    }
    if (periodsOverlap(filled)) {
      setPeriodError(t('pages.hr.siteAssignments.form.periodOverlap'));
      return false;
    }
    setPeriodError(null);
    return true;
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      await form.validateFields(['siteName']);
      if (!validatePeriods()) {
        return false;
      }
      if (requiresLateReason && anyPeriodBeforeCurrentMonth) {
        await form.validateFields(['lateReason']);
      }
      captureSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(): Promise<void> {
    const ok = await validateDetailsStep();
    if (!ok) {
      return;
    }
    const values = captureSnapshot();
    if (values.periods.length === 0) {
      return;
    }
    try {
      const created: Array<{ id: string }> = [];
      for (const period of values.periods) {
        const detail = await submitMutation.mutateAsync({
          siteName: values.siteName,
          projectId: values.projectId,
          startDate: period.startDate,
          endDate: period.endDate,
          reason: values.reason || undefined,
          lateReason: values.lateReason?.trim() || undefined,
          ...onBehalf.payload,
        });
        created.push(detail);
      }
      messageApi.success(
        values.periods.length === 1
          ? t('pages.hr.siteAssignments.form.submitSuccess')
          : t('pages.hr.siteAssignments.form.submitSuccessMany', {
              count: values.periods.length,
            }),
      );
      if (created.length === 1) {
        router.push(`/hr/site-assignments/${created[0].id}`);
        return;
      }
      router.push('/hr/site-assignments');
    } catch (error) {
      notifyApiError(
        error,
        t('pages.hr.siteAssignments.form.submitFailed'),
        messageApi,
        t,
      );
    }
  }

  const onBehalfLabel = onBehalf.employee
    ? formatUserName(onBehalf.employee)
    : t('hr.onBehalf.forYourself');

  const periodsReviewValue =
    snapshot.periods.length === 0
      ? '-'
      : snapshot.periods
          .map(
            (period) =>
              `${formatProjectDate(period.startDate)} – ${formatProjectDate(period.endDate)} (${period.days})`,
          )
          .join('\n');

  const steps = useMemo(
    () => [
      {
        title: t('pages.hr.siteAssignments.form.steps.details'),
        validate: () => validateDetailsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('pages.hr.siteAssignments.form.steps.details')}
            description={t('pages.hr.siteAssignments.form.detailsStepDescription')}
          >
            <OnBehalfSection state={onBehalf} />
            <div className="erp-form-grid-2">
              <Form.Item
                name="siteName"
                label={t('pages.hr.siteAssignments.form.siteName')}
                rules={[{ required: true }]}
              >
                <Input
                  maxLength={200}
                  placeholder={t(
                    'pages.hr.siteAssignments.form.siteNamePlaceholder',
                  )}
                />
              </Form.Item>
              <Form.Item
                name="projectId"
                label={t('pages.hr.siteAssignments.form.project')}
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={projectOptions}
                  loading={projectsQuery.isLoading}
                  placeholder={t(
                    'pages.hr.siteAssignments.form.projectPlaceholder',
                  )}
                />
              </Form.Item>
              <div className="erp-sa-period-editor md:col-span-2">
                <p className="erp-sa-period-editor-label">
                  {t('pages.hr.siteAssignments.form.periods')}
                </p>
                <p className="erp-sa-period-editor-hint">
                  {t('pages.hr.siteAssignments.form.periodsHint')}
                </p>
                <div className="erp-sa-period-editor-list">
                  {periods.map((period, index) => (
                    <div key={period.id} className="erp-sa-period-editor-row">
                      <DatePicker.RangePicker
                        className="w-full"
                        value={period.range}
                        onChange={(value) => {
                          setPeriodError(null);
                          setPeriods((current) =>
                            current.map((row) =>
                              row.id === period.id
                                ? {
                                    ...row,
                                    range: completeRange(
                                      value as
                                        | [Dayjs | null, Dayjs | null]
                                        | null,
                                    ),
                                  }
                                : row,
                            ),
                          );
                        }}
                        disabledDate={(current) => {
                          if (!current || !earliestDay) {
                            return false;
                          }
                          return current.isBefore(earliestDay, 'day');
                        }}
                      />
                      <div className="erp-sa-period-editor-actions">
                        {periods.length > 1 ? (
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            aria-label={t(
                              'pages.hr.siteAssignments.form.removePeriod',
                            )}
                            onClick={() => {
                              setPeriodError(null);
                              setPeriods((current) =>
                                current.filter((row) => row.id !== period.id),
                              );
                            }}
                          />
                        ) : null}
                        {index === periods.length - 1 ? (
                          <Button
                            icon={<PlusOutlined />}
                            onClick={() => {
                              setPeriodError(null);
                              setPeriods((current) => [
                                ...current,
                                { id: newPeriodId(), range: null },
                              ]);
                            }}
                          >
                            {t('pages.hr.siteAssignments.form.addPeriod')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                {dayCount != null ? (
                  <p className="erp-sa-day-hint">
                    {t('pages.hr.siteAssignments.form.calendarDays', {
                      count: dayCount,
                    })}
                  </p>
                ) : null}
                <DayCoverageNotice
                  className="mt-3"
                  employeeId={onBehalf.effectiveEmployeeId}
                  from={coverageSpan?.from ?? null}
                  to={coverageSpan?.to ?? null}
                  focus="SITE_ASSIGNMENT"
                />
                {periodError ? (
                  <p className="erp-sa-period-editor-error" role="alert">
                    {periodError}
                  </p>
                ) : null}
              </div>
              {requiresLateReason && anyPeriodBeforeCurrentMonth ? (
                <Form.Item
                  name="lateReason"
                  label={t('pages.hr.siteAssignments.form.lateReason')}
                  rules={[{ required: true, min: 3 }]}
                  className="md:col-span-2"
                >
                  <Input.TextArea
                    rows={3}
                    maxLength={2000}
                    placeholder={t(
                      'pages.hr.siteAssignments.form.lateReasonPlaceholder',
                    )}
                  />
                </Form.Item>
              ) : null}
              <Form.Item
                name="reason"
                label={t('pages.hr.siteAssignments.form.reason')}
                className="md:col-span-2"
              >
                <Input.TextArea rows={3} maxLength={2000} showCount />
              </Form.Item>
            </div>
          </FormLayout>
        ),
      },
      {
        title: t('pages.hr.siteAssignments.form.steps.review'),
        content: (
          <FormLayout
            variant="pro"
            title={t('pages.hr.siteAssignments.form.steps.review')}
            description={t('pages.hr.siteAssignments.form.reviewStepDescription')}
          >
            <div className="erp-sa-review-grid">
              <ReviewItem
                label={t('hr.onBehalf.employee')}
                value={onBehalfLabel}
              />
              <ReviewItem
                label={t('pages.hr.siteAssignments.form.siteName')}
                value={snapshot.siteName || '-'}
              />
              <ReviewItem
                label={t('pages.hr.siteAssignments.form.project')}
                value={projectLabel}
              />
              <ReviewItem
                label={t('pages.hr.siteAssignments.columns.days')}
                value={
                  snapshot.periods.length > 0
                    ? String(
                        snapshot.periods.reduce(
                          (sum, period) => sum + period.days,
                          0,
                        ),
                      )
                    : '-'
                }
              />
              <ReviewItem
                label={t('pages.hr.siteAssignments.form.periods')}
                value={periodsReviewValue}
                wide
              />
              <ReviewItem
                label={t('pages.hr.siteAssignments.form.reason')}
                value={snapshot.reason || '-'}
                wide
              />
            </div>
          </FormLayout>
        ),
      },
    ],
    [
      t,
      onBehalf,
      onBehalfLabel,
      projectOptions,
      projectsQuery.isLoading,
      periods,
      dayCount,
      periodError,
      snapshot,
      projectLabel,
      periodsReviewValue,
      earliestDay,
      requiresLateReason,
      anyPeriodBeforeCurrentMonth,
    ],
  );

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-sa-form-page erp-site-assignments-v2 flex flex-col">
      <HrFormPageShell
        title={t('pages.hr.siteAssignments.form.title')}
        description={t('pages.hr.siteAssignments.form.description')}
        cancelLabel={t('common.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
      <Form<SiteAssignmentFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve
        className="flex min-h-0 flex-1 flex-col"
      >
        <StepperForm
          steps={steps}
          onSubmit={handleSubmit}
          onReset={resetForm}
          isSubmitting={submitMutation.isPending}
          contentVariant="sections"
          submitLabel={t('pages.hr.siteAssignments.form.submit')}
        />
      </Form>
      </HrFormPageShell>
    </div>
  );
}
