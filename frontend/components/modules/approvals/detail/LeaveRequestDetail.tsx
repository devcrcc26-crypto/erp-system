'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Select,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import LeavePeriodsEditor, {
  createEmptyLeavePeriod,
  leavePeriodsOverlap,
  toLeavePeriodInputs,
  type LeavePeriodRow,
} from '@/components/modules/hr/leave/LeavePeriodsEditor';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeaveType } from '@/lib/api/leave.types';
import type { PreviewDaysResult } from '@/lib/api/work-schedule.types';
import { useLeaveRequest, useUpdateLeaveRequest } from '@/lib/query/leave';
import { useCurrentUser } from '@/lib/query/profile';
import { usePreviewLeaveDays } from '@/lib/query/work-schedule';
import {
  LEAVE_TYPE_OPTIONS,
  formatLeaveEmployeeName,
  formatLeaveType,
  leaveTypeVariant,
} from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

import '@/components/modules/hr/leave/leave-v2.css';

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
  const previewMutation = usePreviewLeaveDays();
  const leave = detailQuery.data;
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm<{ leaveType: LeaveType; reason?: string }>();
  const [periods, setPeriods] = useState<LeavePeriodRow[]>([]);
  const [preview, setPreview] = useState<PreviewDaysResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing || !leave) {
      return;
    }
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
    const handle = window.setTimeout(() => {
      void previewMutation
        .mutateAsync({ employeeId: leave.employeeId, periods: inputs })
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
    // previewMutation identity is unstable; periods + leave drive the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [editing, periods, leave?.employeeId, t]);

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

  function startEditing(): void {
    const current = detailQuery.data;
    if (!current) {
      return;
    }
    form.setFieldsValue({
      leaveType: current.leaveType,
      reason: current.reason ?? '',
    });
    if (current.periods && current.periods.length > 0) {
      setPeriods(
        current.periods.map((period) => ({
          id: period.id ?? createEmptyLeavePeriod().id,
          range: [dayjs(period.startDate), dayjs(period.endDate)],
          dayPortion: period.dayPortion ?? 'FULL',
        })),
      );
    } else {
      setPeriods([
        {
          id: createEmptyLeavePeriod().id,
          range: [dayjs(current.startDate), dayjs(current.endDate)],
          dayPortion: 'FULL',
        },
      ]);
    }
    setPreview(null);
    setPreviewError(null);
    setEditing(true);
  }

  async function handleSave(): Promise<void> {
    try {
      const values = await form.validateFields();
      const inputs = toLeavePeriodInputs(periods);
      if (inputs.length === 0) {
        messageApi.error(t('hr.form.periodRequired'));
        return;
      }
      if (leavePeriodsOverlap(periods)) {
        messageApi.error(t('hr.form.overlapPeriods'));
        return;
      }
      if (previewError) {
        messageApi.error(previewError);
        return;
      }
      if (!preview || preview.totalDays <= 0) {
        messageApi.error(t('hr.form.periodNoWorkingDays'));
        return;
      }
      await updateMutation.mutateAsync({
        leaveType: values.leaveType,
        periods: inputs,
        reason: values.reason?.trim() || undefined,
      });
      messageApi.success(t('hr.messages.leaveRequestUpdated'));
      setEditing(false);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(
        error,
        t('hr.messages.failedToUpdateLeaveRequest'),
        messageApi,
      );
    }
  }

  return (
    <div className="erp-leave-v2 flex flex-col gap-3">
      {canEdit && !editing ? (
        <div className="flex justify-end">
          <Button size="small" onClick={startEditing} style={{ borderRadius: 0 }}>
            {t('common.edit')}
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
              label={t('hr.form.leaveType')}
              rules={[{ required: true }]}
            >
              <Select options={LEAVE_TYPE_OPTIONS} />
            </Form.Item>
            <LeavePeriodsEditor
              periods={periods}
              onChange={setPeriods}
              preview={preview}
              previewError={previewError}
            />
            <Form.Item name="reason" label={t('hr.form.reason')}>
              <Input.TextArea rows={3} maxLength={4000} />
            </Form.Item>
            <Space>
              <Button
                type="primary"
                loading={updateMutation.isPending}
                onClick={() => void handleSave()}
              >
                {t('hr.buttons.saveLeaveRequest')}
              </Button>
              <Button onClick={() => setEditing(false)}>
                {t('hr.buttons.cancel')}
              </Button>
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

      <SectionCard
        title={t('hr.section.leaveBalance')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
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
