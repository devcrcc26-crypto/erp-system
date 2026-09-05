'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import ProfileFileTypeIcon from '@/components/modules/users/ProfileFileTypeIcon';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeaveType } from '@/lib/api/leave.types';
import {
  useMyLeaveBalances,
  useSubmitLeaveRequest,
} from '@/lib/query/leave';
import {
  calculateLeaveDays,
  formatLeaveType,
  resolveBalanceLeaveType,
} from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

interface LeaveFormValues {
  leaveType: LeaveType;
  dateRange: [Dayjs, Dayjs];
  days: number;
  reason?: string;
}

const DEFAULT_LEAVE_TYPE: LeaveType = 'ANNUAL';

const DETAILS_FIELDS = ['leaveType', 'dateRange', 'days', 'reason'] as const;

function ReviewItem({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <p
        className="mb-0.5 text-xs font-medium uppercase tracking-wide"
        style={{ color: tokens.colorTextTertiary }}
      >
        {label}
      </p>
      <p
        className="m-0 whitespace-pre-wrap text-sm"
        style={{ color: tokens.colorTextPrimary }}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * New leave request - StepperForm chrome like Add Employee / Employee Contract.
 */
export default function LeaveRequestFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<LeaveFormValues>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailsSnapshot, setDetailsSnapshot] = useState<
    Partial<LeaveFormValues>
  >({ leaveType: DEFAULT_LEAVE_TYPE, days: 1 });

  const year = new Date().getFullYear();
  const balancesQuery = useMyLeaveBalances(year, true);
  const submitMutation = useSubmitLeaveRequest();

  const leaveType =
    (Form.useWatch('leaveType', form) as LeaveType | undefined) ??
    detailsSnapshot.leaveType ??
    DEFAULT_LEAVE_TYPE;
  const dateRange = Form.useWatch('dateRange', form) as
    | [Dayjs, Dayjs]
    | undefined;
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

  useSetHeaderExtra(null);

  useEffect(() => {
    form.setFieldsValue({ days: 1, leaveType: DEFAULT_LEAVE_TYPE });
  }, [form]);

  useEffect(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) {
      return;
    }
    const days = calculateLeaveDays(
      dateRange[0].format('YYYY-MM-DD'),
      dateRange[1].format('YYYY-MM-DD'),
    );
    if (days !== undefined) {
      form.setFieldValue('days', days);
    }
  }, [dateRange, form]);

  function captureSnapshot(): Partial<LeaveFormValues> {
    const values = form.getFieldsValue(true) as LeaveFormValues;
    setDetailsSnapshot(values);
    return values;
  }

  function resetForm(): void {
    form.resetFields();
    form.setFieldsValue({ leaveType: DEFAULT_LEAVE_TYPE, days: 1 });
    setSelectedFiles([]);
    setDetailsSnapshot({ leaveType: DEFAULT_LEAVE_TYPE, days: 1 });
    setFormError(null);
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      await form.validateFields([...DETAILS_FIELDS]);
      captureSnapshot();
      return true;
    } catch {
      return false;
    }
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

    setSubmitting(true);
    try {
      const created = await submitMutation.mutateAsync({
        leaveType: values.leaveType,
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        days: values.days,
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
    detailsSnapshot.leaveType || detailsSnapshot.dateRange
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
        <p className="m-0 text-sm" style={{ color: tokens.colorError }}>
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
      <div className="erp-leave-balance-summary">
        <div className="erp-leave-balance-summary-main">
          <span className="erp-leave-balance-summary-label">
            {t('hr.labels.remaining')}
          </span>
          <span className="erp-leave-balance-summary-value">
            {selectedBalance.remaining}
          </span>
        </div>
        <div className="erp-leave-balance-summary-meta">
          <span>
            {t('hr.labels.used')}: {selectedBalance.used}
          </span>
          <span>
            {t('hr.labels.entitled')}: {selectedBalance.entitled}
          </span>
          <span>
            {t('hr.labels.broughtForward')}: {selectedBalance.broughtForward}
          </span>
          {selectedBalance.pending > 0 ? (
            <span>
              {t('hr.labels.pending')}: {selectedBalance.pending}
            </span>
          ) : null}
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
          <FormLayout
            variant="pro"
            dense
            title={t('hr.form.leaveDetails')}
            description={t('pages.hr.leave.detailsStepDescription')}
          >
            <div className="erp-form-grid-2">
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

              <Form.Item
                name="dateRange"
                label={t('hr.form.leaveDates')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.selectLeaveDates'),
                  },
                ]}
              >
                <DatePicker.RangePicker className="w-full" />
              </Form.Item>
            </div>

            <div className="erp-leave-balance-panel mb-4">
              <p className="erp-leave-balance-panel-title">
                {leaveType
                  ? `${formatLeaveType(leaveType, t)} - ${t('hr.section.leaveBalance')} (${year})`
                  : `${t('hr.section.leaveBalance')} (${year})`}
              </p>
              {renderBalancePanel()}
            </div>

            <div className="erp-form-grid-2">
              <Form.Item
                name="days"
                label={t('hr.form.days')}
                extra={t('hr.form.daysHint')}
                rules={[
                  { required: true, message: t('hr.validation.enterDays') },
                  {
                    type: 'number',
                    min: 0.5,
                    message: t('hr.validation.minHalfDay'),
                  },
                ]}
              >
                <InputNumber
                  className="w-full"
                  min={0.5}
                  step={0.5}
                  precision={1}
                />
              </Form.Item>
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
              <div className="erp-form-grid-2">
                <ReviewItem
                  label={t('hr.form.leaveType')}
                  value={formatLeaveType(
                    reviewValues.leaveType ?? DEFAULT_LEAVE_TYPE,
                    t,
                  )}
                />
                <ReviewItem
                  label={t('hr.form.leaveDates')}
                  value={
                    reviewValues.dateRange?.[0] && reviewValues.dateRange?.[1]
                      ? `${formatProjectDate(reviewValues.dateRange[0].toISOString())} - ${formatProjectDate(reviewValues.dateRange[1].toISOString())}`
                      : '-'
                  }
                />
                <ReviewItem
                  label={t('hr.form.days')}
                  value={
                    reviewValues.days != null ? String(reviewValues.days) : '-'
                  }
                />
                {selectedBalance ? (
                  <ReviewItem
                    label={t('hr.labels.remaining')}
                    value={String(selectedBalance.remaining)}
                  />
                ) : null}
                {reviewValues.reason?.trim() ? (
                  <div className="md:col-span-2">
                    <ReviewItem
                      label={t('hr.form.reason')}
                      value={reviewValues.reason.trim()}
                    />
                  </div>
                ) : null}
              </div>
            </FormLayout>

            <FormLayout
              variant="pro"
              dense
              title={t('hr.section.supportingDocuments')}
            >
              {selectedFiles.length > 0 ? (
                <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
                  {selectedFiles.map((file) => (
                    <li
                      key={`${file.name}-${file.size}`}
                      className="flex items-center gap-2 rounded-xl border border-[#e8ebef] bg-white px-3 py-2"
                    >
                      <ProfileFileTypeIcon
                        name={file.name}
                        fileType={file.type}
                        size="sm"
                      />
                      <span className="min-w-0 truncate text-sm" title={file.name}>
                        {file.name}
                      </span>
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
    ],
  );

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-leave-form-page">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          onClick={() => router.push('/hr/leave-requests')}
          className="shrink-0"
          style={{ borderRadius: 8 }}
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>

      <Form<LeaveFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve
        className="flex min-h-0 flex-1 flex-col"
        initialValues={{ leaveType: DEFAULT_LEAVE_TYPE, days: 1 }}
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
    </div>
  );
}
