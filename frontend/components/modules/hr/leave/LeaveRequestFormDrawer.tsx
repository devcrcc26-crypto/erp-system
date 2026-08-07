'use client';

import { useEffect, useMemo } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
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
import { useEpcTranslation } from '@/hooks/use-epc-translation';

interface LeaveFormValues {
  leaveType: LeaveType;
  dateRange: [Dayjs, Dayjs];
  days: number;
  reason?: string;
}

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[rgba(0,0,0,0.06)]">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] m-0">
          {title}
        </h3>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

/**
 * Drawer form to submit a leave request with live balance context.
 */
export default function LeaveRequestFormDrawer({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<LeaveFormValues>();
  const year = new Date().getFullYear();
  const balancesQuery = useMyLeaveBalances(year, open);
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
    if (!leaveType) {
      return undefined;
    }
    return balancesQuery.data?.find((row) => row.leaveType === leaveType);
  }, [balancesQuery.data, leaveType]);

  useEffect(() => {
    if (!open) {
      return;
    }
    form.resetFields();
    form.setFieldsValue({ days: 1 });
  }, [form, open]);

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
      onSubmitted?.();
      onClose();
      if (created.approvalRequestId) {
        router.push(`/approvals/${created.approvalRequestId}`);
      } else {
        router.push(`/hr/leave-requests/${created.id}`);
      }
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit leave request', messageApi);
    }
  }

  return (
    <Drawer
      open={open}
      title="New Leave Request"
      size={520}
      className="erp-responsive-drawer"
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button
          type="primary"
          loading={submitMutation.isPending}
          onClick={() => form.submit()}
        >
          Submit
        </Button>
      }
    >
      <Typography.Paragraph
        type="secondary"
        style={{ marginTop: 0, marginBottom: 16 }}
      >
        Short absences (≤ 3 days) need Discipline Lead and HR; longer leave
        escalates to General Manager.
      </Typography.Paragraph>

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

      <div className="flex flex-col gap-4">
        <DrawerSection title="Leave details">
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
                options={leaveTypeOptions}
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

            <Form.Item name="reason" label="Reason" style={{ marginBottom: 0 }}>
              <Input.TextArea rows={4} maxLength={4000} showCount />
            </Form.Item>
          </Form>
        </DrawerSection>

        <DrawerSection title={`${year} balance`}>
          {balancesQuery.isLoading ? (
            <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
              Loading balance…
            </Typography.Paragraph>
          ) : leaveType && selectedBalance ? (
            <Space
              orientation="vertical"
              size={4}
              style={{ width: '100%' }}
            >
              <Typography.Text>{formatLeaveType(leaveType, t)}</Typography.Text>
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
            <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
              Select a leave type to view your balance.
            </Typography.Paragraph>
          )}
        </DrawerSection>
      </div>
    </Drawer>
  );
}
