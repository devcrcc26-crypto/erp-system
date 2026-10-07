'use client';

import './leave-v2.css';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  Select,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import LeavePeriodBreakdownTable from '@/components/modules/hr/leave/LeavePeriodBreakdownTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import ProfileFileTypeIcon from '@/components/modules/users/ProfileFileTypeIcon';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeaveType } from '@/lib/api/leave.types';
import type {
  LeaveDayPortion,
  LeavePeriodInput,
  PreviewDaysResult,
} from '@/lib/api/work-schedule.types';
import {
  useMyLeaveBalances,
  useSubmitLeaveRequest,
} from '@/lib/query/leave';
import { usePreviewLeaveDays } from '@/lib/query/work-schedule';
import {
  formatLeaveType,
  resolveBalanceLeaveType,
} from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { tokens } from '@/lib/theme/tokens';

interface LeavePeriodRow {
  id: string;
  range: [Dayjs, Dayjs] | null;
  dayPortion: LeaveDayPortion;
}

interface LeaveFormValues {
  leaveType: LeaveType;
  reason?: string;
}

const DEFAULT_LEAVE_TYPE: LeaveType = 'ANNUAL';

const DETAILS_FIELDS = ['leaveType', 'reason'] as const;

function newPeriodId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function periodsOverlap(periods: LeavePeriodRow[]): boolean {
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

function completeRange(
  value: [Dayjs | null, Dayjs | null] | null,
): [Dayjs, Dayjs] | null {
  if (!value?.[0] || !value[1]) {
    return null;
  }
  return [value[0], value[1]];
}

function toPeriodInputs(periods: LeavePeriodRow[]): LeavePeriodInput[] {
  return periods
    .filter((row): row is LeavePeriodRow & { range: [Dayjs, Dayjs] } =>
      Boolean(row.range?.[0] && row.range[1]),
    )
    .map((row) => ({
      startDate: row.range[0].format('YYYY-MM-DD'),
      endDate: row.range[1].format('YYYY-MM-DD'),
      dayPortion: row.dayPortion,
    }));
}

function isSingleDay(range: [Dayjs, Dayjs] | null): boolean {
  if (!range) {
    return false;
  }
  return range[0].isSame(range[1], 'day');
}

function formatLeaveChargeSummary(
  preview: PreviewDaysResult,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const summary = preview.summary;
  if (!summary) {
    return t('hr.form.daysCharged', { days: preview.totalDays });
  }
  const parts: string[] = [];
  if (summary.workingDays > 0) {
    parts.push(
      t('hr.form.summaryWorking', { count: summary.workingDays }),
    );
  }
  if (summary.halfDays > 0) {
    parts.push(t('hr.form.summaryHalf', { count: summary.halfDays }));
  }
  if (summary.weekendDays > 0) {
    parts.push(
      t('hr.form.summaryWeekend', { count: summary.weekendDays }),
    );
  }
  if (summary.holidayDays > 0) {
    parts.push(
      t('hr.form.summaryHoliday', { count: summary.holidayDays }),
    );
  }
  return t('hr.form.daysChargedDetail', {
    days: preview.totalDays,
    detail: parts.join(', '),
  });
}

function ReviewItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}): React.ReactNode {
  return (
    <div
      className={`erp-leave-review-field${wide ? ' erp-leave-review-field--wide' : ''}`}
    >
      <p className="erp-leave-review-label">{label}</p>
      <p className="erp-leave-review-value">{value}</p>
    </div>
  );
}

/**
 * New leave request — multi-period dates counted from the work schedule.
 */
export default function LeaveRequestFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('LEAVE_REQUEST');
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<LeaveFormValues>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailsSnapshot, setDetailsSnapshot] = useState<
    Partial<LeaveFormValues>
  >({ leaveType: DEFAULT_LEAVE_TYPE });
  const [periods, setPeriods] = useState<LeavePeriodRow[]>([
    { id: newPeriodId(), range: null, dayPortion: 'FULL' },
  ]);
  const [preview, setPreview] = useState<PreviewDaysResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const year = new Date().getFullYear();
  const balancesQuery = useMyLeaveBalances(year, true, onBehalf.employeeId);
  const submitMutation = useSubmitLeaveRequest();
  const previewMutation = usePreviewLeaveDays();

  const leaveType =
    (Form.useWatch('leaveType', form) as LeaveType | undefined) ??
    detailsSnapshot.leaveType ??
    DEFAULT_LEAVE_TYPE;
  const formValues = Form.useWatch([], form) as LeaveFormValues | undefined;

  const leaveTypeOptions = useMemo(
    () => [
      { value: 'ANNUAL' as const, label: t('hr.leaveType.ANNUAL') },
      { value: 'SICK' as const, label: t('hr.leaveType.SICK') },
      { value: 'UNPAID' as const, label: t('hr.leaveType.UNPAID') },
      { value: 'MATERNITY' as const, label: t('hr.leaveType.MATERNITY') },
      { value: 'PATERNITY' as const, label: t('hr.leaveType.PATERNITY') },
      { value: 'EMERGENCY' as const, label: t('hr.leaveType.EMERGENCY') },
      { value: 'COMPASSIONATE' as const, label: t('hr.leaveType.COMPASSIONATE') },
      { value: 'STUDY' as const, label: t('hr.leaveType.STUDY') },
      { value: 'EXAM' as const, label: t('hr.leaveType.EXAM') },
    ],
    [t],
  );

  const selectedBalance = useMemo(() => {
    if (!leaveType || !balancesQuery.data) {
      return undefined;
    }
    const balanceLeaveType = resolveBalanceLeaveType(leaveType);
    return balancesQuery.data.find((row) => row.leaveType === balanceLeaveType);
  }, [balancesQuery.data, leaveType]);

  useEffect(() => {
    form.setFieldsValue({ leaveType: DEFAULT_LEAVE_TYPE });
  }, [form]);

  useEffect(() => {
    const inputs = toPeriodInputs(periods);
    if (inputs.length === 0) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    if (periodsOverlap(periods)) {
      setPreview(null);
      setPreviewError(t('hr.form.overlapPeriods'));
      return;
    }
    const employeeId = onBehalf.effectiveEmployeeId;
    const handle = window.setTimeout(() => {
      void previewMutation
        .mutateAsync({ employeeId, periods: inputs })
        .then((result) => {
          setPreview(result);
          setPreviewError(null);
        })
        .catch((error: unknown) => {
          setPreview(null);
          setPreviewError(
            error instanceof ApiRequestError
              ? error.message
              : t('hr.messages.failedToPreviewLeaveDays'),
          );
        });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [periods, onBehalf.effectiveEmployeeId, t]);

  function captureSnapshot(): Partial<LeaveFormValues> {
    const values = form.getFieldsValue(true) as LeaveFormValues;
    setDetailsSnapshot(values);
    return values;
  }

  function resetForm(): void {
    onBehalf.reset();
    form.resetFields();
    form.setFieldsValue({ leaveType: DEFAULT_LEAVE_TYPE });
    setSelectedFiles([]);
    setDetailsSnapshot({ leaveType: DEFAULT_LEAVE_TYPE });
    setPeriods([{ id: newPeriodId(), range: null, dayPortion: 'FULL' }]);
    setPreview(null);
    setPreviewError(null);
    setFormError(null);
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      await form.validateFields([...DETAILS_FIELDS]);
    } catch {
      return false;
    }
    const inputs = toPeriodInputs(periods);
    if (inputs.length === 0) {
      setFormError(t('hr.form.periodRequired'));
      return false;
    }
    if (periodsOverlap(periods)) {
      setFormError(t('hr.form.overlapPeriods'));
      return false;
    }
    if (previewError) {
      setFormError(previewError);
      return false;
    }
    if (!preview || preview.totalDays <= 0) {
      setFormError(t('hr.form.periodNoWorkingDays'));
      return false;
    }
    captureSnapshot();
    return true;
  }

  async function validateDocumentsStep(): Promise<boolean> {
    captureSnapshot();
    return true;
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    let values: LeaveFormValues;
    try {
      values = await form.validateFields([...DETAILS_FIELDS]);
    } catch {
      return;
    }
    const inputs = toPeriodInputs(periods);
    if (inputs.length === 0) {
      setFormError(t('hr.form.periodRequired'));
      return;
    }
    if (periodsOverlap(periods)) {
      setFormError(t('hr.form.overlapPeriods'));
      return;
    }
    if (previewError) {
      setFormError(previewError);
      return;
    }
    if (!preview || preview.totalDays <= 0) {
      setFormError(t('hr.form.periodNoWorkingDays'));
      return;
    }

    setSubmitting(true);
    try {
      const created = await submitMutation.mutateAsync({
        ...onBehalf.payload,
        leaveType: values.leaveType,
        periods: inputs,
        reason: values.reason?.trim() || undefined,
        files: selectedFiles,
      });
      messageApi.success(t('hr.messages.leaveRequestSubmitted'));
      if (created.id) {
        router.push(`/hr/leave-requests/${created.id}`);
      } else if (created.approvalRequestId) {
        router.push(`/approvals/${created.approvalRequestId}`);
      } else {
        router.push('/hr/leave-requests');
      }
    } catch (error: unknown) {
      const fallback = t('hr.messages.failedToSubmitLeaveRequest');
      notifyApiError(error, fallback, messageApi);
      setFormError(
        error instanceof ApiRequestError ? error.message : fallback,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const reviewValues: Partial<LeaveFormValues> =
    detailsSnapshot.leaveType
      ? detailsSnapshot
      : (formValues ?? detailsSnapshot);

  function renderBalancePanel(): React.ReactNode {
    if (balancesQuery.isLoading) {
      return (
        <p className="erp-users-cell-sub m-0">{t('common.loading')}</p>
      );
    }

    if (balancesQuery.isError) {
      return (
        <p className="m-0 text-sm" style={{ color: tokens.colorRed600 }}>
          {balancesQuery.error instanceof ApiRequestError
            ? balancesQuery.error.message
            : t('hr.messages.failedToLoadLeaveBalance')}
        </p>
      );
    }

    if (!leaveType) {
      return (
        <p className="erp-users-cell-sub m-0">
          {t('hr.messages.selectLeaveTypeForBalance')}
        </p>
      );
    }

    if (!selectedBalance) {
      return (
        <p className="erp-users-cell-sub m-0">
          {t('hr.messages.noLeaveBalanceContactHr')}
        </p>
      );
    }

    return (
      <div className="erp-leave-form-balance-tiles">
        <div className="erp-leave-form-balance-tile erp-leave-form-balance-tile--primary">
          <p className="erp-leave-fact-label">{t('hr.labels.remaining')}</p>
          <p className="erp-leave-fact-value">{selectedBalance.remaining}</p>
        </div>
        <div className="erp-leave-form-balance-tile">
          <p className="erp-leave-fact-label">{t('hr.labels.used')}</p>
          <p className="erp-leave-fact-value">{selectedBalance.used}</p>
        </div>
        <div className="erp-leave-form-balance-tile">
          <p className="erp-leave-fact-label">{t('hr.labels.entitled')}</p>
          <p className="erp-leave-fact-value">{selectedBalance.entitled}</p>
        </div>
        <div className="erp-leave-form-balance-tile">
          <p className="erp-leave-fact-label">
            {selectedBalance.pending > 0
              ? t('hr.labels.pending')
              : t('hr.labels.broughtForward')}
          </p>
          <p className="erp-leave-fact-value">
            {selectedBalance.pending > 0
              ? selectedBalance.pending
              : selectedBalance.broughtForward}
          </p>
        </div>
      </div>
    );
  }

  const steps = useMemo(
    () => [
      {
        title: t('hr.form.leaveDetails'),
        validate: () => validateDetailsStep(),
        content: (
          <div className="flex flex-col gap-4">
            <OnBehalfSection state={onBehalf} />
            <FormLayout
              variant="pro"
              dense
              title={t('hr.form.leaveDetails')}
              description={t('pages.hr.leave.detailsStepDescription')}
            >
              <Form.Item
                name="leaveType"
                label={t('hr.form.leaveType')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.selectLeaveType'),
                  },
                ]}
              >
                <Select
                  options={leaveTypeOptions}
                  placeholder={t('hr.placeholder.selectLeaveType')}
                />
              </Form.Item>

              <div className="erp-leave-period-editor mb-4">
                <p className="erp-leave-period-editor-label">
                  {t('hr.form.periods')}
                </p>
                <div className="erp-leave-period-editor-list">
                  {periods.map((period, index) => (
                    <div key={period.id} className="erp-leave-period-editor-row">
                      <DatePicker.RangePicker
                        className="w-full"
                        value={period.range}
                        onChange={(value) => {
                          const nextRange = completeRange(
                            value as [Dayjs | null, Dayjs | null] | null,
                          );
                          setPeriods((current) =>
                            current.map((row) =>
                              row.id === period.id
                                ? {
                                    ...row,
                                    range: nextRange,
                                    dayPortion:
                                      nextRange && isSingleDay(nextRange)
                                        ? row.dayPortion
                                        : 'FULL',
                                  }
                                : row,
                            ),
                          );
                        }}
                      />
                      <Select
                        className="w-full"
                        value={period.dayPortion}
                        disabled={!isSingleDay(period.range)}
                        options={[
                          {
                            value: 'FULL',
                            label: t('hr.form.dayPortionFull'),
                          },
                          {
                            value: 'MORNING',
                            label: t('hr.form.dayPortionMorning'),
                          },
                          {
                            value: 'AFTERNOON',
                            label: t('hr.form.dayPortionAfternoon'),
                          },
                        ]}
                        onChange={(value: LeaveDayPortion) => {
                          setPeriods((current) =>
                            current.map((row) =>
                              row.id === period.id
                                ? { ...row, dayPortion: value }
                                : row,
                            ),
                          );
                        }}
                      />
                      <div className="erp-leave-period-editor-actions">
                        {periods.length > 1 ? (
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            aria-label={t('hr.form.removePeriod')}
                            onClick={() =>
                              setPeriods((current) =>
                                current.filter((row) => row.id !== period.id),
                              )
                            }
                          />
                        ) : null}
                        {index === periods.length - 1 ? (
                          <Button
                            icon={<PlusOutlined />}
                            onClick={() =>
                              setPeriods((current) => [
                                ...current,
                                {
                                  id: newPeriodId(),
                                  range: null,
                                  dayPortion: 'FULL',
                                },
                              ])
                            }
                          >
                            {t('hr.form.addPeriod')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                {previewError ? (
                  <Alert
                    type="error"
                    showIcon
                    title={previewError}
                    className="mt-1"
                  />
                ) : preview ? (
                  <div className="erp-leave-preview-panel">
                    <p className="erp-leave-preview-title">
                      {formatLeaveChargeSummary(preview, t)}
                    </p>
                    {selectedBalance ? (
                      <p className="erp-leave-preview-hint">
                        {t('hr.form.remainingAfterRequest', {
                          remaining:
                            Math.round(
                              (selectedBalance.remaining - preview.totalDays) *
                                10,
                            ) / 10,
                        })}
                      </p>
                    ) : null}
                    <LeavePeriodBreakdownTable
                      breakdown={preview.periods.flatMap(
                        (row) => row.breakdown,
                      )}
                      totalDays={preview.totalDays}
                      showTotal
                    />
                  </div>
                ) : null}
              </div>

              <div className="erp-leave-form-balance mb-4">
                <p className="erp-leave-form-balance-title">
                  {leaveType
                    ? `${formatLeaveType(leaveType, t)} — ${t('hr.section.leaveBalance')} (${year})`
                    : `${t('hr.section.leaveBalance')} (${year})`}
                </p>
                {renderBalancePanel()}
              </div>

              <Form.Item name="reason" label={t('hr.form.reason')}>
                <Input.TextArea
                  rows={4}
                  maxLength={4000}
                  showCount
                  placeholder={t('hr.placeholder.enterReason')}
                />
              </Form.Item>
            </FormLayout>
          </div>
        ),
      },
      {
        title: t('hr.section.supportingDocuments'),
        validate: () => validateDocumentsStep(),
        content: (
          <FormLayout
            variant="pro"
            dense
            title={t('hr.section.supportingDocuments')}
            description={t('pages.hr.leave.documentsStepDescription')}
          >
            <FileUploadInput
              files={selectedFiles}
              onChange={setSelectedFiles}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              multiple
              disabled={submitting || submitMutation.isPending}
            />
          </FormLayout>
        ),
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <div className="erp-employee-form-sections">
            <FormLayout
              variant="pro"
              dense
              title={t('hr.form.reviewSubmit')}
              description={t('pages.hr.leave.reviewStepDescription')}
            >
              <div className="erp-leave-review-grid">
                <ReviewItem
                  label={t('hr.form.leaveType')}
                  value={formatLeaveType(
                    reviewValues.leaveType ?? DEFAULT_LEAVE_TYPE,
                    t,
                  )}
                />
                <ReviewItem
                  label={t('hr.form.days')}
                  value={preview ? String(preview.totalDays) : '—'}
                />
                {selectedBalance && preview ? (
                  <ReviewItem
                    label={t('hr.form.remainingAfter')}
                    value={String(
                      Math.round(
                        (selectedBalance.remaining - preview.totalDays) * 10,
                      ) / 10,
                    )}
                  />
                ) : selectedBalance ? (
                  <ReviewItem
                    label={t('hr.labels.remaining')}
                    value={String(selectedBalance.remaining)}
                  />
                ) : null}
                {reviewValues.reason?.trim() ? (
                  <ReviewItem
                    label={t('hr.form.reason')}
                    value={reviewValues.reason.trim()}
                    wide
                  />
                ) : null}
              </div>
              {preview ? (
                <div className="erp-leave-preview-panel mt-4">
                  <LeavePeriodBreakdownTable
                    breakdown={preview.periods.flatMap((row) => row.breakdown)}
                  />
                </div>
              ) : null}
            </FormLayout>

            <FormLayout
              variant="pro"
              dense
              title={t('hr.section.supportingDocuments')}
            >
              {selectedFiles.length > 0 ? (
                <ul className="erp-leave-review-files">
                  {selectedFiles.map((file) => (
                    <li
                      key={`${file.name}-${file.size}`}
                      className="erp-leave-review-file"
                    >
                      <ProfileFileTypeIcon
                        name={file.name}
                        fileType={file.type}
                        size="sm"
                      />
                      <span title={file.name}>{file.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noAttachments')}
                </p>
              )}
            </FormLayout>
          </div>
        ),
      },
    ],
    [
      onBehalf,
      t,
      leaveTypeOptions,
      leaveType,
      year,
      selectedBalance,
      balancesQuery.isLoading,
      balancesQuery.isError,
      balancesQuery.error,
      selectedFiles,
      submitting,
      submitMutation.isPending,
      reviewValues,
      periods,
      preview,
      previewError,
    ],
  );

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-leave-form-page erp-leave-v2">
      <HrFormPageShell
        title={t('pages.hr.leave.new')}
        description={t('pages.hr.leave.detailsStepDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
      <Form<LeaveFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve
        className="flex min-h-0 flex-1 flex-col"
        initialValues={{ leaveType: DEFAULT_LEAVE_TYPE }}
      >
        {formError ? (
          <Alert
            type="error"
            showIcon
            title={formError}
            className="mb-4"
            closable
            onClose={() => setFormError(null)}
          />
        ) : null}

        <StepperForm
          steps={steps}
          onSubmit={handleSubmit}
          onReset={resetForm}
          isSubmitting={submitting || submitMutation.isPending}
          contentVariant="sections"
          submitLabel={t('hr.buttons.submitRequest')}
        />
      </Form>
      </HrFormPageShell>
    </div>
  );
}
