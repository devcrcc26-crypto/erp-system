'use client';

import './site-assignments-v2.css';

import { useMemo, useState } from 'react';
import { Button, DatePicker, Form, Input, Select } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { siteAssignmentKeys } from '@/lib/query/site-assignment';
import DayCoverageNotice from '@/components/modules/hr/shared/DayCoverageNotice';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useEarliestAllowedDate } from '@/lib/query/backdating';
import {
  useSiteAssignmentEmployees,
  useSiteAssignmentSupervisors,
  useSubmitSiteAssignment,
} from '@/lib/query/site-assignment';
import { useCurrentUser } from '@/lib/query/profile';
import type { SiteAssignmentPickerEmployee } from '@/lib/api/site-assignment.types';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { isBeforeCurrentMonthEat } from '@/lib/utils/backdating-date.util';
import { formatUserName } from '@/lib/utils/user-display';

interface SiteAssignmentFormValues {
  siteName?: string;
  projectName?: string;
  reason?: string;
  lateReason?: string;
}

function formatPickerEmployee(employee: SiteAssignmentPickerEmployee): string {
  const name = [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return employee.employeeId ? `${name} · ${employee.employeeId}` : name;
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
  const queryClient = useQueryClient();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<SiteAssignmentFormValues>();
  const currentUser = useCurrentUser();
  const isHrSubmitter = useCanViewHr();
  const [supervisorId, setSupervisorId] = useState<string | undefined>();
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [targetError, setTargetError] = useState<string | null>(null);
  const reportsToId = isHrSubmitter
    ? supervisorId
    : currentUser.data?.id;
  const employeesQuery = useSiteAssignmentEmployees(
    reportsToId,
    Boolean(reportsToId),
  );
  const supervisorsQuery = useSiteAssignmentSupervisors(isHrSubmitter);
  const earliestQuery = useEarliestAllowedDate(employeeId);
  const submitMutation = useSubmitSiteAssignment();
  const earliestDay = earliestQuery.data?.earliestDate
    ? dayjs(earliestQuery.data.earliestDate)
    : null;
  const requiresLateReason =
    earliestQuery.data?.requiresLateReasonWhenBeforeCurrentMonth === true;
  const [periods, setPeriods] = useState<SitePeriodRow[]>([
    { id: newPeriodId(), range: null },
  ]);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{
    siteName: string;
    projectName: string;
    reason: string;
    lateReason: string;
    periods: SitePeriodSnapshot[];
  }>({
    siteName: '',
    projectName: '',
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
        isBeforeCurrentMonthEat(row.range[0].format('YYYY-MM-DD')),
      ),
    [periods],
  );

  function captureSnapshot(): typeof snapshot {
    const values = form.getFieldsValue(true) as SiteAssignmentFormValues;
    const next = {
      siteName: values.siteName?.trim() ?? '',
      projectName: values.projectName?.trim() ?? '',
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
      projectName: '',
      reason: '',
      lateReason: '',
      periods: [],
    });
    setSupervisorId(undefined);
    setEmployeeId(undefined);
    setTargetError(null);
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
    if (!employeeId) {
      setTargetError(t('pages.hr.siteAssignments.form.targetRequired'));
      return false;
    }
    if (isHrSubmitter && !supervisorId) {
      setTargetError(t('pages.hr.siteAssignments.form.supervisorRequired'));
      return false;
    }
    setTargetError(null);
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
        const result = await submitMutation.mutateAsync({
          employeeId: employeeId ?? '',
          ...(isHrSubmitter && supervisorId
            ? { onBehalfOfSupervisorId: supervisorId }
            : {}),
          siteName: values.siteName,
          projectName: values.projectName || undefined,
          startDate: period.startDate,
          endDate: period.endDate,
          reason: values.reason || undefined,
          lateReason:
            values.lateReason?.trim() || values.reason?.trim() || undefined,
        });
        created.push(result);
      }
      messageApi.success(
        created.length === 1
          ? t('pages.hr.siteAssignments.form.submitSuccess')
          : t('pages.hr.siteAssignments.form.submitSuccessMany', {
              count: created.length,
            }),
      );
      await navigateAfterRequestSubmit({
        queryClient,
        router,
        invalidateKeys: [siteAssignmentKeys.all],
      });
    } catch (error) {
      notifyApiError(
        error,
        t('pages.hr.siteAssignments.form.submitFailed'),
        messageApi,
        t,
      );
    }
  }

  const employeeOptions = useMemo(
    () =>
      (employeesQuery.data ?? []).map((employee) => ({
        value: employee.id,
        label: formatPickerEmployee(employee),
      })),
    [employeesQuery.data],
  );
  const supervisorOptions = useMemo(
    () =>
      (supervisorsQuery.data ?? []).map((employee) => ({
        value: employee.id,
        label: formatPickerEmployee(employee),
      })),
    [supervisorsQuery.data],
  );
  const selectedEmployee = (employeesQuery.data ?? []).find(
    (row) => row.id === employeeId,
  );
  const selectedSupervisor = (supervisorsQuery.data ?? []).find(
    (row) => row.id === supervisorId,
  );
  const subjectLabel = selectedEmployee
    ? formatUserName(selectedEmployee)
    : '-';
  const supervisorLabel = isHrSubmitter
    ? selectedSupervisor
      ? formatUserName(selectedSupervisor)
      : '-'
    : currentUser.data
      ? formatUserName(currentUser.data)
      : '-';

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
            {isHrSubmitter ? (
              <Form.Item
                label={t('pages.hr.siteAssignments.form.supervisor')}
                required
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={supervisorId}
                  loading={supervisorsQuery.isLoading}
                  onChange={(next) => {
                    setSupervisorId(next);
                    setEmployeeId(undefined);
                    setTargetError(null);
                  }}
                  options={supervisorOptions}
                  placeholder={t(
                    'pages.hr.siteAssignments.form.supervisorPlaceholder',
                  )}
                />
              </Form.Item>
            ) : null}
            <Form.Item
              label={t('pages.hr.siteAssignments.form.employee')}
              required
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                value={employeeId}
                loading={employeesQuery.isLoading}
                disabled={isHrSubmitter && !supervisorId}
                onChange={(next) => {
                  setEmployeeId(next);
                  setTargetError(null);
                }}
                options={employeeOptions}
                placeholder={t('pages.hr.siteAssignments.form.employeePlaceholder')}
              />
            </Form.Item>
            {targetError ? (
              <p className="m-0 mb-3 text-sm text-[#B42318]" role="alert">
                {targetError}
              </p>
            ) : null}
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
                name="projectName"
                label={t('pages.hr.siteAssignments.form.project')}
              >
                <Input
                  maxLength={200}
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
                  employeeId={employeeId}
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
              {isHrSubmitter ? (
                <ReviewItem
                  label={t('pages.hr.siteAssignments.form.supervisor')}
                  value={supervisorLabel}
                />
              ) : null}
              <ReviewItem
                label={t('pages.hr.siteAssignments.form.employee')}
                value={subjectLabel}
              />
              <ReviewItem
                label={t('pages.hr.siteAssignments.form.siteName')}
                value={snapshot.siteName || '-'}
              />
              <ReviewItem
                label={t('pages.hr.siteAssignments.form.project')}
                value={snapshot.projectName || '-'}
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
      isHrSubmitter,
      employeeId,
      supervisorId,
      employeeOptions,
      supervisorOptions,
      employeesQuery.isLoading,
      supervisorsQuery.isLoading,
      subjectLabel,
      supervisorLabel,
      periods,
      dayCount,
      periodError,
      snapshot,
      periodsReviewValue,
      earliestDay,
      requiresLateReason,
      anyPeriodBeforeCurrentMonth,
      coverageSpan,
      targetError,
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
        showCancelButton={false}
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
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('common.cancel')}
          isSubmitting={submitMutation.isPending}
          contentVariant="sections"
          submitLabel={t('pages.hr.siteAssignments.form.submit')}
        />
      </Form>
      </HrFormPageShell>
    </div>
  );
}
