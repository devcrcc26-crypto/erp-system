'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  Select,
  Skeleton,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import LeavePeriodBreakdownTable from '@/components/modules/hr/leave/LeavePeriodBreakdownTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import FormPageFooter from '@/components/ui/FormPageFooter/FormPageFooter';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeaveType } from '@/lib/api/leave.types';
import type {
  LeavePeriodInput,
  PreviewDaysResult,
} from '@/lib/api/work-schedule.types';
import {
  useLeaveRequest,
  useUpdateLeaveRequest,
} from '@/lib/query/leave';
import { useCurrentUser } from '@/lib/query/profile';
import { usePreviewLeaveDays } from '@/lib/query/work-schedule';
import { formatLeaveType } from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface LeavePeriodRow {
  id: string;
  range: [Dayjs, Dayjs] | null;
}

interface LeaveFormValues {
  leaveType: LeaveType;
  reason?: string;
}

function newPeriodId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function completeRange(
  value: [Dayjs | null, Dayjs | null] | null,
): [Dayjs, Dayjs] | null {
  if (!value?.[0] || !value[1]) {
    return null;
  }
  return [value[0], value[1]];
}

function toPeriodInputs(periods: LeavePeriodRow[]): LeavePeriodInput[] {
  return periods
    .filter((row): row is LeavePeriodRow & { range: [Dayjs, Dayjs] } =>
      Boolean(row.range?.[0] && row.range[1]),
    )
    .map((row) => ({
      startDate: row.range[0].format('YYYY-MM-DD'),
      endDate: row.range[1].format('YYYY-MM-DD'),
    }));
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
  const previewMutation = usePreviewLeaveDays();
  const [periods, setPeriods] = useState<LeavePeriodRow[]>([]);
  const [preview, setPreview] = useState<PreviewDaysResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const request = detailQuery.data;

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
      reason: request.reason ?? undefined,
    });
    if (request.periods && request.periods.length > 0) {
      setPeriods(
        request.periods.map((period) => ({
          id: period.id ?? newPeriodId(),
          range: [dayjs(period.startDate), dayjs(period.endDate)],
        })),
      );
    } else {
      setPeriods([
        {
          id: newPeriodId(),
          range: [dayjs(request.startDate), dayjs(request.endDate)],
        },
      ]);
    }
  }, [form, request]);

  useEffect(() => {
    const inputs = toPeriodInputs(periods);
    if (inputs.length === 0 || !request) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void previewMutation
        .mutateAsync({ employeeId: request.employeeId, periods: inputs })
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
  }, [periods, request?.employeeId, t]);

  useSetHeaderExtra(null);

  async function handleSubmit(values: LeaveFormValues): Promise<void> {
    const inputs = toPeriodInputs(periods);
    if (inputs.length === 0) {
      messageApi.error(t('hr.form.periodRequired'));
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
    try {
      await updateMutation.mutateAsync({
        leaveType: values.leaveType,
        periods: inputs,
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
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
            onClick={() => router.push(`/hr/leave-requests/${requestId}`)}
            className="shrink-0"
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.cancel')}
          </Button>
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
        id="leave-request-edit-form"
        form={form}
        layout="vertical"
        onFinish={(values) => void handleSubmit(values)}
        className="flex flex-col gap-4"
      >
        <FormLayout variant="pro" title={t('hr.form.leaveDetails')}>
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

          <div className="mb-4">
            <p className="mb-2 text-sm font-medium">{t('hr.form.periods')}</p>
            <div className="flex flex-col gap-3">
              {periods.map((period, index) => (
                <div key={period.id} className="flex items-start gap-2">
                  <DatePicker.RangePicker
                    className="w-full"
                    value={period.range}
                    onChange={(value) => {
                      setPeriods((current) =>
                        current.map((row) =>
                          row.id === period.id
                            ? {
                                ...row,
                                range: completeRange(
                                  value as [Dayjs | null, Dayjs | null] | null,
                                ),
                              }
                            : row,
                        ),
                      );
                    }}
                  />
                  {periods.length > 1 ? (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setPeriods((current) =>
                          current.filter((row) => row.id !== period.id),
                        )
                      }
                    />
                  ) : null}
                  {index === periods.length - 1 ? (
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() =>
                        setPeriods((current) => [
                          ...current,
                          { id: newPeriodId(), range: null },
                        ])
                      }
                    >
                      {t('hr.form.addPeriod')}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            {previewError ? (
              <Alert
                type="error"
                showIcon
                title={previewError}
                className="mt-3"
              />
            ) : preview ? (
              <div className="mt-3 rounded-xl border border-[#e8ebef] p-3">
                <LeavePeriodBreakdownTable
                  breakdown={preview.periods.flatMap((row) => row.breakdown)}
                  totalDays={preview.totalDays}
                  showTotal
                />
              </div>
            ) : null}
          </div>

          <Form.Item name="reason" label={t('hr.form.reason')}>
            <Input.TextArea rows={4} maxLength={4000} showCount />
          </Form.Item>
        </FormLayout>
      </Form>

      <FormPageFooter
        submitLabel={t('hr.buttons.saveLeaveRequest')}
        formId="leave-request-edit-form"
        useFormAttribute
        isSubmitting={updateMutation.isPending}
        submitDisabled={!canEdit}
        onSubmit={() => form.submit()}
      />
    </div>
  );
}
