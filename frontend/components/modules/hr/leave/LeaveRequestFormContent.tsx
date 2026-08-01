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
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeaveType } from '@/lib/api/leave.types';
import {
  useMyLeaveBalances,
  useSubmitLeaveRequest,
} from '@/lib/query/leave';
import {
  LEAVE_TYPE_OPTIONS,
  calculateLeaveDays,
  formatLeaveType,
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
 * Standalone leave request form under Approvals → New Request (no HR layout).
 * Auth alone is enough; leave/hr RBAC is enforced on HR list/detail pages.
 */
export default function LeaveRequestFormContent(): React.ReactNode {
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
          Available:{' '}
          <Typography.Text strong>{selectedBalance.remaining}</Typography.Text>{' '}
          days
        </Typography.Text>
        <Typography.Text type="secondary">
          Used: {selectedBalance.used} days
        </Typography.Text>
        <Typography.Text type="secondary">
          Entitled: {selectedBalance.entitled} days
        </Typography.Text>
        {selectedBalance.pending > 0 ? (
          <Typography.Text type="secondary">
            Pending: {selectedBalance.pending} days
          </Typography.Text>
        ) : null}
      </Space>
    );
  }

  return (
    <FormLayout
      title="New Leave Request"
      description="Short absences (≤ 3 days) need Discipline Lead and HR; longer leave escalates to General Manager."
      extra={
        <Space>
          <Button onClick={() => router.push('/approvals/new')}>Cancel</Button>
          <Button
            type="primary"
            loading={submitMutation.isPending}
            onClick={() => form.submit()}
          >
            Submit
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

      <div className="mx-auto w-full max-w-xl">
        <Form
          form={form}
          layout="vertical"
          initialValues={{ leaveType: DEFAULT_LEAVE_TYPE, days: 1 }}
          onFinish={(values) => void handleSubmit(values)}
        >
          <Form.Item
            name="leaveType"
            label="Leave Type"
            rules={[{ required: true, message: 'Select a leave type' }]}
            extra={
              <div
                className="mt-2 rounded-md px-3 py-2"
                style={{
                  background: tokens.colorPrimaryLight,
                  border: `1px solid ${tokens.colorBorder}`,
                }}
              >
                <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
                  {leaveType
                    ? `${formatLeaveType(leaveType)} balance (${year})`
                    : `${year} balance`}
                </Typography.Text>
                {renderBalancePanel()}
              </div>
            }
          >
            <Select
              options={LEAVE_TYPE_OPTIONS}
              placeholder="Select leave type"
            />
          </Form.Item>

          <Form.Item
            name="dateRange"
            label="Leave Dates"
            rules={[{ required: true, message: 'Select start and end dates' }]}
          >
            <DatePicker.RangePicker className="w-full" />
          </Form.Item>

          <Form.Item
            name="days"
            label="Days"
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

          <Form.Item name="reason" label="Reason">
            <Input.TextArea rows={4} maxLength={4000} showCount />
          </Form.Item>

          <Form.Item label="Attachments (optional)">
            <Typography.Paragraph
              type="secondary"
              style={{ marginBottom: 8, fontSize: 13 }}
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
          </Form.Item>
        </Form>
      </div>
    </FormLayout>
  );
}
