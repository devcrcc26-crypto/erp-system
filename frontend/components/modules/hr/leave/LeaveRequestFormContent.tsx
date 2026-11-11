'use client';

import './leave-v2.css';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Form, Input, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { leaveKeys } from '@/lib/query/leave';
import { approvalKeys } from '@/lib/query/approvals';
import DayCoverageNotice from '@/components/modules/hr/shared/DayCoverageNotice';
import LeavePeriodBreakdownTable from '@/components/modules/hr/leave/LeavePeriodBreakdownTable';
import LeavePeriodsEditor, {
  createEmptyLeavePeriod,
  leavePeriodsOverlap,
  toLeavePeriodInputs,
  type LeavePeriodRow,
} from '@/components/modules/hr/leave/LeavePeriodsEditor';
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
import type { PreviewDaysResult } from '@/lib/api/work-schedule.types';
import {
  useMyLeaveBalances,
  useSubmitLeaveRequest,
} from '@/lib/query/leave';
import { useCurrentUser } from '@/lib/query/profile';
import { usePreviewLeaveDays } from '@/lib/query/work-schedule';
import {
  formatLeaveType,
  leaveTypeAffectsBalance,
  resolveBalanceLeaveType,
} from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { tokens } from '@/lib/theme/tokens';

interface LeaveFormValues {
  leaveType: LeaveType;
  reason?: string;
}

const DEFAULT_LEAVE_TYPE: LeaveType = 'ANNUAL';

const DETAILS_FIELDS = ['leaveType', 'reason'] as const;

function roundBalanceAmount(value: number | string | undefined): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 10) / 10;
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
 * New leave request - multi-period dates counted from the work schedule.
 */
export default function LeaveRequestFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('LEAVE_REQUEST');
  const currentUser = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<LeaveFormValues>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailsSnapshot, setDetailsSnapshot] = useState<
    Partial<LeaveFormValues>
  >({ leaveType: DEFAULT_LEAVE_TYPE });
  const [periods, setPeriods] = useState<LeavePeriodRow[]>([
    createEmptyLeavePeriod(),
  ]);
  const [preview, setPreview] = useState<PreviewDaysResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const leaveOwnerGender =
    onBehalf.employee?.gender ?? currentUser.data?.gender ?? null;

  const balanceForDate = useMemo(() => {
    const inputs = toLeavePeriodInputs(periods);
    if (inputs.length === 0) {
      return undefined;
    }
    return inputs.reduce(
      (earliest, period) =>
        period.startDate < earliest ? period.startDate : earliest,
      inputs[0].startDate,
    );
  }, [periods]);

  const balancesQuery = useMyLeaveBalances({
    forDate: balanceForDate,
    enabled: Boolean(onBehalf.effectiveEmployeeId),
    employeeId: onBehalf.employeeId,
  });
  const submitMutation = useSubmitLeaveRequest();
  const previewMutation = usePreviewLeaveDays();

  const leaveType =
    (Form.useWatch('leaveType', form) as LeaveType | undefined) ??
    detailsSnapshot.leaveType ??
    DEFAULT_LEAVE_TYPE;
  const formValues = Form.useWatch([], form) as LeaveFormValues | undefined;

  const leaveTypeOptions = useMemo(() => {
    const options = [
      { value: 'ANNUAL' as const, label: t('hr.leaveType.ANNUAL') },
      { value: 'SICK' as const, label: t('hr.leaveType.SICK') },
      { value: 'UNPAID' as const, label: t('hr.leaveType.UNPAID') },
      { value: 'MATERNITY' as const, label: t('hr.leaveType.MATERNITY') },
      { value: 'PATERNITY' as const, label: t('hr.leaveType.PATERNITY') },
      { value: 'EMERGENCY' as const, label: t('hr.leaveType.EMERGENCY') },
      { value: 'COMPASSIONATE' as const, label: t('hr.leaveType.COMPASSIONATE') },
      { value: 'STUDY' as const, label: t('hr.leaveType.STUDY') },
      { value: 'EXAM' as const, label: t('hr.leaveType.EXAM') },
    ];
    if (leaveOwnerGender === 'FEMALE') {
      return options;
    }
    return options.filter((option) => option.value !== 'MATERNITY');
  }, [leaveOwnerGender, t]);

  const selectedBalance = useMemo(() => {
    if (!leaveType || !balancesQuery.data || !leaveTypeAffectsBalance(leaveType)) {
      return undefined;
    }
    const balanceLeaveType = resolveBalanceLeaveType(leaveType);
    return balancesQuery.data.find((row) => row.leaveType === balanceLeaveType);
  }, [balancesQuery.data, leaveType]);

  const coverageSpan = useMemo(() => {
    const ranges = periods
      .map((row) => row.range)
      .filter((range): range is [Dayjs, Dayjs] => Boolean(range?.[0] && range[1]));
    if (ranges.length === 0) {
      return null;
    }
    let from = ranges[0][0];
    let to = ranges[0][1];
    for (const range of ranges) {
      if (range[0].isBefore(from, 'day')) {
        from = range[0];
      }
      if (range[1].isAfter(to, 'day')) {
        to = range[1];
      }
    }
    return {
      from: from.format('YYYY-MM-DD'),
      to: to.format('YYYY-MM-DD'),
    };
  }, [periods]);

  const balanceYearLabel =
    selectedBalance?.year ?? balancesQuery.data?.[0]?.year;

  useEffect(() => {
    form.setFieldsValue({ leaveType: DEFAULT_LEAVE_TYPE });
  }, [form]);

  useEffect(() => {
    if (leaveType === 'MATERNITY' && leaveOwnerGender !== 'FEMALE') {
      form.setFieldsValue({ leaveType: DEFAULT_LEAVE_TYPE });
    }
  }, [form, leaveOwnerGender, leaveType]);

  useEffect(() => {
    const inputs = toLeavePeriodInputs(periods);
    if (inputs.length === 0) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    if (leavePeriodsOverlap(periods)) {
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
    setPeriods([createEmptyLeavePeriod()]);
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
    const inputs = toLeavePeriodInputs(periods);
    if (inputs.length === 0) {
      setFormError(t('hr.form.periodRequired'));
      return false;
    }
    if (leavePeriodsOverlap(periods)) {
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
    if (
      selectedBalance &&
      Math.round(preview.totalDays * 10) / 10 >
        Math.round(selectedBalance.remaining * 10) / 10
    ) {
      setFormError(
        t('hr.messages.insufficientLeaveBalance', {
          remaining: selectedBalance.remaining,
          requested: preview.totalDays,
        }),
      );
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
    const inputs = toLeavePeriodInputs(periods);
    if (inputs.length === 0) {
      setFormError(t('hr.form.periodRequired'));
      return;
    }
    if (leavePeriodsOverlap(periods)) {
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
    if (
      selectedBalance &&
      Math.round(preview.totalDays * 10) / 10 >
        Math.round(selectedBalance.remaining * 10) / 10
    ) {
      setFormError(
        t('hr.messages.insufficientLeaveBalance', {
          remaining: selectedBalance.remaining,
          requested: preview.totalDays,
        }),
      );
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
        queryClient.setQueryData(leaveKeys.detail(created.id), created);
      }
      await navigateAfterRequestSubmit({
        queryClient,
        router,
        invalidateKeys: [
          leaveKeys.all,
          ...(created.id ? [leaveKeys.detail(created.id)] : []),
          approvalKeys.all,
        ],
      });
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

    if (!leaveTypeAffectsBalance(leaveType)) {
      return (
        <p className="erp-users-cell-sub m-0">
          {t('hr.messages.unpaidLeaveNoBalance')}
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

    const entitled = roundBalanceAmount(selectedBalance.entitled);
    const broughtForward = roundBalanceAmount(selectedBalance.broughtForward);
    const usedApproved = roundBalanceAmount(selectedBalance.used);
    const pendingNow = roundBalanceAmount(selectedBalance.pending);
    const remainingNow = roundBalanceAmount(selectedBalance.remaining);

    const chargedDays = roundBalanceAmount(preview?.totalDays);
    const showProjection = preview != null && chargedDays > 0;
    const pendingDisplay = showProjection
      ? roundBalanceAmount(pendingNow + chargedDays)
      : pendingNow;
    const remainingDisplay = showProjection
      ? roundBalanceAmount(remainingNow - chargedDays)
      : remainingNow;
    const pool = roundBalanceAmount(entitled + broughtForward);
    const committedDisplay = showProjection
      ? roundBalanceAmount(pool - remainingDisplay)
      : roundBalanceAmount(usedApproved + pendingNow);
    const showPendingTile = !showProjection && pendingNow > 0;

    return (
      <div className="erp-leave-form-balance-tiles">
        <div className="erp-leave-form-balance-tile erp-leave-form-balance-tile--primary">
          <p className="erp-leave-fact-label">
            {showProjection
              ? t('hr.form.remainingAfter')
              : t('hr.labels.remaining')}
          </p>
          <p className="erp-leave-fact-value">{remainingDisplay}</p>
        </div>
        <div className="erp-leave-form-balance-tile">
          <p className="erp-leave-fact-label">
            {showProjection || pendingNow > 0
              ? t('hr.form.usedIncludingPending')
              : t('hr.labels.used')}
          </p>
          <p className="erp-leave-fact-value">{committedDisplay}</p>
          {showProjection || pendingNow > 0 ? (
            <p className="erp-users-cell-sub m-0 mt-0.5">
              {t('hr.leave.usedPending', {
                used: usedApproved,
                pending: showProjection ? pendingDisplay : pendingNow,
              })}
            </p>
          ) : null}
        </div>
        <div className="erp-leave-form-balance-tile">
          <p className="erp-leave-fact-label">{t('hr.labels.entitled')}</p>
          <p className="erp-leave-fact-value">{entitled}</p>
        </div>
        <div className="erp-leave-form-balance-tile">
          <p className="erp-leave-fact-label">
            {showPendingTile
              ? t('hr.labels.pending')
              : t('hr.labels.broughtForward')}
          </p>
          <p className="erp-leave-fact-value">
            {showPendingTile ? pendingNow : broughtForward}
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

              <LeavePeriodsEditor
                periods={periods}
                onChange={setPeriods}
                preview={preview}
                previewError={previewError}
                previewHint={
                  selectedBalance && preview ? (
                    <p className="erp-leave-preview-hint">
                      {t('hr.form.remainingAfterRequest', {
                        remaining:
                          Math.round(
                            (selectedBalance.remaining - preview.totalDays) *
                              10,
                          ) / 10,
                      })}
                    </p>
                  ) : null
                }
              >
                <DayCoverageNotice
                  className="mt-3"
                  employeeId={onBehalf.effectiveEmployeeId}
                  from={coverageSpan?.from ?? null}
                  to={coverageSpan?.to ?? null}
                  focus="LEAVE"
                />
              </LeavePeriodsEditor>

              <div className="erp-leave-form-balance mb-4">
                <p className="erp-leave-form-balance-title">
                  {leaveType
                    ? `${formatLeaveType(leaveType, t)} - ${t('hr.section.leaveBalance')}${balanceYearLabel != null ? ` (${balanceYearLabel})` : ''}`
                    : `${t('hr.section.leaveBalance')}${balanceYearLabel != null ? ` (${balanceYearLabel})` : ''}`}
                </p>
                {balanceForDate ? (
                  <p className="erp-users-cell-sub m-0 mb-2">
                    {t('hr.form.leaveBalanceForDates', {
                      date: balanceForDate,
                    })}
                  </p>
                ) : (
                  <p className="erp-users-cell-sub m-0 mb-2">
                    {t('hr.form.leaveBalanceSelectDates')}
                  </p>
                )}
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
                  value={preview ? String(preview.totalDays) : '-'}
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
      balanceYearLabel,
      balanceForDate,
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
        showCancelButton={false}
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
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
          isSubmitting={submitting || submitMutation.isPending}
          contentVariant="sections"
          submitLabel={t('hr.buttons.submitRequest')}
        />
      </Form>
      </HrFormPageShell>
    </div>
  );
}
