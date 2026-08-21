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
  Space,
  Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import FormPageFooter from '@/components/ui/FormPageFooter/FormPageFooter';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
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
import { tokens } from '@/lib/theme/tokens';

interface LeaveFormValues {
  leaveType: LeaveType;
  dateRange: [Dayjs, Dayjs];
  days: number;
  reason?: string;
}

const DEFAULT_LEAVE_TYPE: LeaveType = 'ANNUAL';

/**
 * New leave request form (Approvals → New, or HR Leave Requests → New).
 */
export default function LeaveRequestFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<LeaveFormValues>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const year = new Date().getFullYear();
  const balancesQuery = useMyLeaveBalances(year, true);
  const submitMutation = useSubmitLeaveRequest();

  const leaveType = Form.useWatch('leaveType', form) as LeaveType | undefined;
  const dateRange = Form.useWatch('dateRange', form) as
    | [Dayjs, Dayjs]
    | undefined;

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

  async function handleSubmit(values: LeaveFormValues): Promise<void> {
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
      notifyApiError(
        error,
        t('hr.messages.failedToSubmitLeaveRequest'),
        messageApi,
      );
    }
  }

  function renderBalancePanel(): React.ReactNode {
    if (balancesQuery.isLoading) {
      return (
        <Typography.Text type="secondary">
          {t('common.loading')}
        </Typography.Text>
      );
    }

    if (balancesQuery.isError) {
      return (
        <Typography.Text type="danger">
          {balancesQuery.error instanceof ApiRequestError
            ? balancesQuery.error.message
            : t('hr.messages.failedToLoadLeaveBalance')}
        </Typography.Text>
      );
    }

    if (!leaveType) {
      return (
        <Typography.Text type="secondary">
          {t('hr.messages.selectLeaveTypeForBalance')}
        </Typography.Text>
      );
    }

    if (!selectedBalance) {
      return (
        <Typography.Text type="secondary">
          {t('hr.messages.noLeaveBalanceContactHr')}
        </Typography.Text>
      );
    }

    return (
      <Space orientation="vertical" size={2} style={{ width: '100%' }}>
        <Typography.Text>
          {t('hr.labels.remaining')}:{' '}
          <Typography.Text strong>{selectedBalance.remaining}</Typography.Text>
        </Typography.Text>
        <Typography.Text type="secondary">
          {t('hr.labels.used')}: {selectedBalance.used}
        </Typography.Text>
        <Typography.Text type="secondary">
          {t('hr.labels.entitled')}: {selectedBalance.entitled}
        </Typography.Text>
        <Typography.Text type="secondary">
          {t('hr.labels.broughtForward')}: {selectedBalance.broughtForward}
        </Typography.Text>
        {selectedBalance.pending > 0 ? (
          <Typography.Text type="secondary">
            {t('hr.labels.pending')}: {selectedBalance.pending}
          </Typography.Text>
        ) : null}
      </Space>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="m-0 text-xl font-semibold tracking-tight"
            style={{
              color: tokens.colorTextPrimary,
              fontFamily: tokens.fontFamily,
            }}
          >
            {t('pages.hr.leave.new')}
          </h1>
          <p
            className="mb-0 mt-1 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            {t('pages.hr.leave.listDescription')}
          </p>
        </div>
        <Button
          onClick={() => router.push('/hr/leave-requests')}
          className="shrink-0"
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>

      {submitMutation.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            submitMutation.error instanceof ApiRequestError
              ? submitMutation.error.message
              : t('hr.messages.failedToSubmitLeaveRequest')
          }
        />
      ) : null}

      <Form
        id="leave-request-form"
        form={form}
        layout="vertical"
        initialValues={{ leaveType: DEFAULT_LEAVE_TYPE, days: 1 }}
        onFinish={(values) => void handleSubmit(values)}
        className="flex flex-col gap-4"
      >
        <FormLayout variant="pro" title={t('hr.form.leaveDetails')}>
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

          <div
            className="mb-6 rounded-sm px-3 py-2"
            style={{
              background: tokens.colorPrimaryLight,
              border: `1px solid ${tokens.colorBorder}`,
            }}
          >
            <Typography.Text
              strong
              style={{ display: 'block', marginBottom: 4 }}
            >
              {leaveType
                ? `${formatLeaveType(leaveType, t)} — ${t('hr.section.leaveBalance')} (${year})`
                : `${t('hr.section.leaveBalance')} (${year})`}
            </Typography.Text>
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

        <FormLayout
          variant="pro"
          title={t('hr.section.supportingDocuments')}
          description={t('hr.form.supportingDocumentsHint')}
        >
          <FileUploadInput
            files={selectedFiles}
            onChange={setSelectedFiles}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            multiple
            disabled={submitMutation.isPending}
          />
        </FormLayout>
      </Form>

      <FormPageFooter
        submitLabel={t('hr.buttons.submitRequest')}
        formId="leave-request-form"
        useFormAttribute
        isSubmitting={submitMutation.isPending}
        onSubmit={() => form.submit()}
      />
    </div>
  );
}
