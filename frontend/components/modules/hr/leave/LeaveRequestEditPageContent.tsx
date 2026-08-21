'use client';

import { useEffect, useMemo } from 'react';
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
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeaveType } from '@/lib/api/leave.types';
import {
  useLeaveRequest,
  useUpdateLeaveRequest,
} from '@/lib/query/leave';
import { useCurrentUser } from '@/lib/query/profile';
import {
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

/**
 * Edit a draft or returned leave request (owner or HR).
 */
export default function LeaveRequestEditPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<LeaveFormValues>();
  const canManage = useCanViewHr();
  const currentUser = useCurrentUser();
  const detailQuery = useLeaveRequest(requestId);
  const updateMutation = useUpdateLeaveRequest(requestId);

  const request = detailQuery.data;
  const dateRange = Form.useWatch('dateRange', form) as
    | [Dayjs, Dayjs]
    | undefined;

  const leaveTypeOptions = useMemo(
    () =>
      (
        [
          'ANNUAL',
          'SICK',
          'UNPAID',
          'MATERNITY',
          'PATERNITY',
          'EMERGENCY',
          'COMPASSIONATE',
          'STUDY',
          'EXAM',
        ] as const
      ).map((value) => ({
        value,
        label: formatLeaveType(value, t),
      })),
    [t],
  );

  const canEdit =
    Boolean(request) &&
    (request?.status === 'DRAFT' || request?.status === 'RETURNED') &&
    (canManage ||
      (Boolean(currentUser.data?.id) &&
        request?.employeeId === currentUser.data?.id));

  useEffect(() => {
    if (!request) {
      return;
    }
    form.setFieldsValue({
      leaveType: request.leaveType,
      dateRange: [dayjs(request.startDate), dayjs(request.endDate)],
      days: request.days,
      reason: request.reason ?? undefined,
    });
  }, [form, request]);

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

  useSetHeaderExtra(null);

  async function handleSubmit(values: LeaveFormValues): Promise<void> {
    try {
      await updateMutation.mutateAsync({
        leaveType: values.leaveType,
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        days: values.days,
        reason: values.reason?.trim() || undefined,
      });
      messageApi.success(t('hr.messages.leaveRequestUpdated'));
      router.push(`/hr/leave-requests/${requestId}`);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToUpdateLeaveRequest'),
        messageApi,
      );
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (detailQuery.isError || !request) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.failedToLoadLeaveRequests')
        }
        action={
          <Button onClick={() => router.push('/hr/leave-requests')}>
            {t('hr.buttons.back')}
          </Button>
        }
      />
    );
  }

  if (!canEdit) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('hr.messages.cannotEditLeaveRequest')}
        action={
          <Button onClick={() => router.push(`/hr/leave-requests/${requestId}`)}>
            {t('hr.buttons.back')}
          </Button>
        }
      />
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
            {t('pages.hr.leave.edit')}
          </h1>
          <p
            className="mb-0 mt-1 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            {request.requestNumber}
          </p>
        </div>
        <Space size={8} className="shrink-0" wrap>
          <Button
            onClick={() => router.push(`/hr/leave-requests/${requestId}`)}
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.cancel')}
          </Button>
          <Button
            type="primary"
            loading={updateMutation.isPending}
            disabled={!canEdit}
            onClick={() => form.submit()}
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.saveLeaveRequest')}
          </Button>
        </Space>
      </div>

      {updateMutation.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            updateMutation.error instanceof ApiRequestError
              ? updateMutation.error.message
              : t('hr.messages.failedToUpdateLeaveRequest')
          }
        />
      ) : null}

      <Form
        form={form}
        layout="vertical"
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
              <Select options={leaveTypeOptions} />
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
            <Input.TextArea rows={4} maxLength={4000} showCount />
          </Form.Item>
        </FormLayout>
      </Form>
    </div>
  );
}
