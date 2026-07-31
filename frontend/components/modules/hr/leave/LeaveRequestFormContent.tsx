'use client';

import { useEffect, useMemo } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Divider,
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

interface LeaveFormValues {
  leaveType: LeaveType;
  dateRange: [Dayjs, Dayjs];
  days: number;
  reason?: string;
}

/**
 * Standalone leave request form under Approvals → New Request (no HR layout).
 */
export default function LeaveRequestFormContent(): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<LeaveFormValues>();
  const year = new Date().getFullYear();
  const balancesQuery = useMyLeaveBalances(year, true);
  const submitMutation = useSubmitLeaveRequest();

  const leaveType = Form.useWatch('leaveType', form) as LeaveType | undefined;
  const dateRange = Form.useWatch('dateRange', form) as
    | [Dayjs, Dayjs]
    | undefined;

  const selectedBalance = useMemo(() => {
    if (!leaveType) {
      return undefined;
    }
    return balancesQuery.data?.find((row) => row.leaveType === leaveType);
  }, [balancesQuery.data, leaveType]);

  useEffect(() => {
    form.setFieldsValue({ days: 1 });
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
          onFinish={(values) => void handleSubmit(values)}
        >
          <Form.Item
            name="leaveType"
            label="Leave Type"
            rules={[{ required: true, message: 'Select a leave type' }]}
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
        </Form>

        <Divider />

        <Typography.Text strong>{year} Balance</Typography.Text>
        {balancesQuery.isLoading ? (
          <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
            Loading balance…
          </Typography.Paragraph>
        ) : leaveType && selectedBalance ? (
          <Space
            orientation="vertical"
            size={4}
            style={{ width: '100%', marginTop: 8 }}
          >
            <Typography.Text>{formatLeaveType(leaveType)}</Typography.Text>
            <Typography.Text type="secondary">
              Entitled: {selectedBalance.entitled}
            </Typography.Text>
            <Typography.Text type="secondary">
              Used: {selectedBalance.used}
            </Typography.Text>
            <Typography.Text type="secondary">
              Pending: {selectedBalance.pending}
            </Typography.Text>
            <Typography.Text strong>
              Remaining: {selectedBalance.remaining}
            </Typography.Text>
          </Space>
        ) : (
          <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
            Select a leave type to view your balance.
          </Typography.Paragraph>
        )}
      </div>
    </FormLayout>
  );
}
