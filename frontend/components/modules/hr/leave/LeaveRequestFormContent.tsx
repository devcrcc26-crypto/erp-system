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
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeaveType } from '@/lib/api/leave.types';
import {
  useMyLeaveBalances,
  useSubmitLeaveRequest,
} from '@/lib/query/leave';
import {
  calculateLeaveDays,
  formatLeaveType,
} from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { tokens } from '@/lib/theme/tokens';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

interface LeaveFormValues {
  leaveType: LeaveType;
  dateRange: [Dayjs, Dayjs];
  days: number;
  reason?: string;
}

const DEFAULT_LEAVE_TYPE: LeaveType = 'ANNUAL';

/**
 * Standalone leave request form under Approvals → New Request (no HR layout).
 * Auth alone is enough; leave/hr RBAC is enforced on HR list/detail pages.
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
    ],
    [t],
  );

  const selectedBalance = useMemo(() => {
    if (!leaveType || !balancesQuery.data) {
      return undefined;
    }
    return balancesQuery.data.find((row) => row.leaveType === leaveType);
  }, [balancesQuery.data, leaveType]);

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
      messageApi.success('Leave request submitted');
      if (created.approvalRequestId) {
        router.push(`/approvals/${created.approvalRequestId}`);
      } else {
        router.push('/approvals/new');
      }
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit leave request', messageApi);
    }
  }

  function renderBalancePanel(): React.ReactNode {
    if (balancesQuery.isLoading) {
      return (
        <Typography.Text type="secondary">Loading balance…</Typography.Text>
      );
    }

    if (balancesQuery.isError) {
      return (
        <Typography.Text type="danger">
          {balancesQuery.error instanceof ApiRequestError
            ? balancesQuery.error.message
            : 'Failed to load leave balance'}
        </Typography.Text>
      );
    }

    if (!leaveType) {
      return (
        <Typography.Text type="secondary">
          Select a leave type to view your balance.
        </Typography.Text>
      );
    }

    if (!selectedBalance) {
      return (
        <Typography.Text type="secondary">
          No balance record — contact HR
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
        {selectedBalance.pending > 0 ? (
          <Typography.Text type="secondary">
            {t('hr.labels.pending')}: {selectedBalance.pending}
          </Typography.Text>
        ) : null}
      </Space>
    );
  }

  return (
    <FormLayout
      title={t('hr.buttons.newLeaveRequest')}
      description="Short absences (≤ 3 days) need Discipline Lead and HR; longer leave escalates to General Manager."
      extra={
        <Space>
          <Button onClick={() => router.push('/approvals/new')}>
            {t('hr.buttons.cancel')}
          </Button>
          <Button
            type="primary"
            loading={submitMutation.isPending}
            onClick={() => form.submit()}
          >
            {t('hr.buttons.submitRequest')}
          </Button>
        </Space>
      }
    >
      {submitMutation.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            submitMutation.error instanceof ApiRequestError
              ? submitMutation.error.message
              : 'Submit failed'
          }
        />
      ) : null}

      <div className="mx-auto w-full max-w-2xl flex flex-col gap-4">
        <SectionCard title={t('hr.form.leaveDetails')} bodyClassName="px-5 py-4">
          <Form
            form={form}
            layout="vertical"
            initialValues={{ leaveType: DEFAULT_LEAVE_TYPE, days: 1 }}
            onFinish={(values) => void handleSubmit(values)}
          >
            <Form.Item
              name="leaveType"
              label={t('hr.form.leaveType')}
              rules={[{ required: true, message: 'Select a leave type' }]}
            >
              <Select
                options={leaveTypeOptions}
                placeholder={t('hr.placeholder.selectLeaveType')}
              />
            </Form.Item>

            <div
              className="mb-6 rounded-md px-3 py-2"
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

            <Form.Item
              name="dateRange"
              label={t('hr.form.leaveDates')}
              rules={[{ required: true, message: 'Select start and end dates' }]}
            >
              <DatePicker.RangePicker className="w-full" />
            </Form.Item>

            <Form.Item
              name="days"
              label={t('hr.form.days')}
              extra="Auto-calculated from dates; edit for half-days."
              rules={[
                { required: true, message: 'Enter days' },
                { type: 'number', min: 0.5, message: 'Minimum 0.5 day' },
              ]}
            >
              <InputNumber
                className="w-full"
                min={0.5}
                step={0.5}
                precision={1}
              />
            </Form.Item>

            <Form.Item
              name="reason"
              label={t('hr.form.reason')}
            >
              <Input.TextArea
                rows={4}
                maxLength={4000}
                showCount
                placeholder={t('hr.placeholder.enterReason')}
              />
            </Form.Item>
          </Form>
        </SectionCard>

        <SectionCard title={t('hr.section.supportingDocuments')} bodyClassName="px-5 py-4">
          <Typography.Paragraph
            type="secondary"
            style={{ marginBottom: 12, fontSize: 13 }}
          >
            Upload supporting documents e.g. medical certificate for sick leave
          </Typography.Paragraph>
          <FileUploadInput
            files={selectedFiles}
            onChange={setSelectedFiles}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            multiple
            disabled={submitMutation.isPending}
          />
        </SectionCard>
      </div>
    </FormLayout>
  );
}
