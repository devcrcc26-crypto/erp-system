'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeaveType } from '@/lib/api/leave.types';
import { useLeaveRequest, useUpdateLeaveRequest } from '@/lib/query/leave';
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
import {
  LEAVE_TYPE_OPTIONS,
  formatLeaveEmployeeName,
  formatLeaveStatus,
  formatLeaveType,
  leaveStatusVariant,
  leaveTypeVariant,
} from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Typed leave body for Approvals detail — editable when RETURNED by requester.
 */
export default function LeaveRequestDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = useLeaveRequest(sourceId);
  const updateMutation = useUpdateLeaveRequest(sourceId);
  const leave = detailQuery.data;
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();

  if (detailQuery.isLoading && !leave) {
    return (
      <div
        style={{
          background: tokens.colorCardBg,
          border: `1px solid ${tokens.colorBorder}`,
          borderRadius: 8,
          padding: 24,
        }}
      >
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (detailQuery.isError || !leave) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Leave request not found'
        }
      />
    );
  }

  const balance = leave.balance;
  const canEdit =
    leave.status === 'RETURNED' &&
    Boolean(currentUser.data?.id) &&
    leave.employeeId === currentUser.data?.id;

  async function handleSave(): Promise<void> {
    try {
      const values = await form.validateFields();
      await updateMutation.mutateAsync({
        leaveType: values.leaveType as LeaveType,
        startDate: values.range[0].format('YYYY-MM-DD'),
        endDate: values.range[1].format('YYYY-MM-DD'),
        days: values.days,
        reason: values.reason?.trim() || undefined,
      });
      messageApi.success('Leave request updated');
      setEditing(false);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(error, 'Failed to update leave', messageApi);
    }
  }

  return (
    <div
      style={{
        background: tokens.colorCardBg,
        border: `1px solid ${tokens.colorBorder}`,
        borderRadius: 8,
        padding: 24,
      }}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Typography.Title level={5} style={{ margin: 0 }}>
          Leave request
        </Typography.Title>
        <StatusBadge
          label={formatLeaveStatus(leave.status)}
          variant={leaveStatusVariant(leave.status)}
        />
        <StatusBadge
          label={formatLeaveType(leave.leaveType)}
          variant={leaveTypeVariant(leave.leaveType)}
        />
        {canEdit && !editing ? (
          <Button size="small" onClick={() => {
            form.setFieldsValue({
              leaveType: leave.leaveType,
              range: [dayjs(leave.startDate), dayjs(leave.endDate)],
              days: leave.days,
              reason: leave.reason ?? '',
            });
            setEditing(true);
          }}>
            Edit
          </Button>
        ) : null}
      </div>

      {editing ? (
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="leaveType"
            label="Leave type"
            rules={[{ required: true }]}
          >
            <Select options={LEAVE_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="range"
            label="Dates"
            rules={[{ required: true, message: 'Select date range' }]}
          >
            <DatePicker.RangePicker className="w-full" format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="days" label="Days" rules={[{ required: true }]}>
            <InputNumber min={0.5} max={365} step={0.5} className="w-full" />
          </Form.Item>
          <Form.Item name="reason" label="Reason">
            <Input.TextArea rows={3} maxLength={4000} />
          </Form.Item>
          <Space>
            <Button
              type="primary"
              loading={updateMutation.isPending}
              onClick={() => void handleSave()}
            >
              Save changes
            </Button>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
          </Space>
        </Form>
      ) : (
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="Employee">
            {formatLeaveEmployeeName(leave.employee)}
          </Descriptions.Item>
          <Descriptions.Item label="Leave type">
            {formatLeaveType(leave.leaveType)}
          </Descriptions.Item>
          <Descriptions.Item label="Start date">
            {formatProjectDate(leave.startDate)}
          </Descriptions.Item>
          <Descriptions.Item label="End date">
            {formatProjectDate(leave.endDate)}
          </Descriptions.Item>
          <Descriptions.Item label="Days">{leave.days}</Descriptions.Item>
          <Descriptions.Item label="Reason">
            {leave.reason?.trim() || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Attachments">
            <AttachmentDownloadList documents={leave.documents} />
          </Descriptions.Item>
        </Descriptions>
      )}

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        Leave balance
      </Typography.Title>
      {balance ? (
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="Entitled">
            {balance.entitled}
          </Descriptions.Item>
          <Descriptions.Item label="Used">{balance.used}</Descriptions.Item>
          <Descriptions.Item label="Pending">
            {balance.pending}
          </Descriptions.Item>
          <Descriptions.Item label="Remaining">
            <Typography.Text strong>{balance.remaining}</Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Typography.Text type="secondary">
          Balance unavailable for this leave type.
        </Typography.Text>
      )}
    </div>
  );
}
