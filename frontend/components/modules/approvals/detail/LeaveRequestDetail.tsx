'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeaveType } from '@/lib/api/leave.types';
import { useLeaveRequest, useUpdateLeaveRequest } from '@/lib/query/leave';
import { useCurrentUser } from '@/lib/query/profile';
import {
  LEAVE_TYPE_OPTIONS,
  formatLeaveEmployeeName,
  formatLeaveType,
  leaveTypeVariant,
} from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Typed leave body for Approvals detail - editable when RETURNED by requester.
 * Header is rendered by ApprovalDetailPageContent - do not duplicate it here.
 */
export default function LeaveRequestDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = useLeaveRequest(sourceId);
  const updateMutation = useUpdateLeaveRequest(sourceId);
  const leave = detailQuery.data;
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();

  if (detailQuery.isLoading && !leave) {
    return (
      <div className="bg-white rounded-none border border-[rgba(0,0,0,0.08)] p-6">
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
        periods: [
          {
            startDate: values.range[0].format('YYYY-MM-DD'),
            endDate: values.range[1].format('YYYY-MM-DD'),
          },
        ],
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
    <div className="flex flex-col gap-3">
      {canEdit && !editing ? (
        <div className="flex justify-end">
          <Button
            size="small"
            onClick={() => {
              form.setFieldsValue({
                leaveType: leave.leaveType,
                range: [dayjs(leave.startDate), dayjs(leave.endDate)],
                days: leave.days,
                reason: leave.reason ?? '',
              });
              setEditing(true);
            }}
            style={{ borderRadius: 0 }}
          >
            Edit
          </Button>
        </div>
      ) : null}

      {!editing ? (
        <SummaryStrip
          items={[
            { label: 'Start', value: formatProjectDate(leave.startDate) },
            { label: 'End', value: formatProjectDate(leave.endDate) },
            { label: 'Days', value: String(leave.days), emphasize: true },
            { label: 'Type', value: formatLeaveType(leave.leaveType, t) },
          ]}
        />
      ) : null}

      {editing ? (
        <SectionCard title="Edit request" bodyClassName="px-3 py-4 sm:px-5">
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
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Request Details" bodyClassName="px-3 py-4 sm:px-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <MetaItem label="Employee">
                {formatLeaveEmployeeName(leave.employee)}
              </MetaItem>
              <MetaItem label="Leave type">
                <StatusBadge
                  label={formatLeaveType(leave.leaveType, t)}
                  variant={leaveTypeVariant(leave.leaveType)}
                />
              </MetaItem>
              <MetaItem label="Start date">
                {formatProjectDate(leave.startDate)}
              </MetaItem>
              <MetaItem label="End date">
                {formatProjectDate(leave.endDate)}
              </MetaItem>
              <MetaItem label="Days">
                <span className="font-semibold">{leave.days}</span>
              </MetaItem>
              <MetaItem label="Reason">
                {leave.reason?.trim() || (
                  <span className="text-[var(--color-text-tertiary)]">-</span>
                )}
              </MetaItem>
            </div>
          </SectionCard>

          <SectionCard title="Attachments" bodyClassName="px-3 py-4 sm:px-5">
            {(leave.documents?.length ?? 0) > 0 ? (
              <AttachmentDownloadList documents={leave.documents} />
            ) : (
              <Typography.Text type="secondary">
                No attachments uploaded.
              </Typography.Text>
            )}
          </SectionCard>
        </>
      )}

      <SectionCard title={t('hr.section.leaveBalance')} bodyClassName="px-3 py-4 sm:px-5">
        {balance ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-8 gap-y-4">
            <MetaItem label={t('hr.labels.entitled')}>{balance.entitled}</MetaItem>
            <MetaItem label={t('hr.labels.broughtForward')}>
              {balance.broughtForward}
            </MetaItem>
            <MetaItem label={t('hr.labels.used')}>{balance.used}</MetaItem>
            <MetaItem label={t('hr.labels.pending')}>{balance.pending}</MetaItem>
            <MetaItem label={t('hr.labels.remaining')}>
              <Typography.Text strong>{balance.remaining}</Typography.Text>
            </MetaItem>
          </div>
        ) : (
          <Typography.Text type="secondary">
            Balance unavailable for this leave type.
          </Typography.Text>
        )}
      </SectionCard>
    </div>
  );
}
