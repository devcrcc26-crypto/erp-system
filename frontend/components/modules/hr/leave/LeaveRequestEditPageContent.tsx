'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Input, Select, Skeleton } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import LeavePeriodsEditor, {
  createEmptyLeavePeriod,
  leavePeriodsOverlap,
  toLeavePeriodInputs,
  type LeavePeriodRow,
} from '@/components/modules/hr/leave/LeavePeriodsEditor';
import ReturnedRequestCallout from '@/components/modules/approvals/ReturnedRequestCallout';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import FormPageFooter from '@/components/ui/FormPageFooter/FormPageFooter';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { LeaveType } from '@/lib/api/leave.types';
import type { PreviewDaysResult } from '@/lib/api/work-schedule.types';
import {
  useLeaveRequest,
  useUpdateLeaveRequest,
} from '@/lib/query/leave';
import { useCurrentUser } from '@/lib/query/profile';
import { usePreviewLeaveDays } from '@/lib/query/work-schedule';
import { formatLeaveType } from '@/lib/utils/leave-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

import './leave-v2.css';

interface LeaveFormValues {
  leaveType: LeaveType;
  reason?: string;
}

/**
 * Edit a draft or returned leave request (owner or HR).
 * Periods and day counts match the new-request form (work-schedule preview).
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

  const isOwner =
    Boolean(currentUser.data?.id) &&
    request?.employeeId === currentUser.data?.id;
  const canEdit =
    Boolean(request) &&
    (request?.status === 'DRAFT' || request?.status === 'RETURNED') &&
    (canManage || isOwner);
  const backHref = request?.approvalRequestId
    ? `/approvals/${request.approvalRequestId}`
    : `/hr/leave-requests/${requestId}`;

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
          id: period.id ?? createEmptyLeavePeriod().id,
          range: [dayjs(period.startDate), dayjs(period.endDate)],
          dayPortion: period.dayPortion ?? 'FULL',
        })),
      );
    } else {
      setPeriods([
        {
          id: createEmptyLeavePeriod().id,
          range: [dayjs(request.startDate), dayjs(request.endDate)],
          dayPortion: 'FULL',
        },
      ]);
    }
  }, [form, request]);

  useEffect(() => {
    const inputs = toLeavePeriodInputs(periods);
    if (inputs.length === 0 || !request) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [periods, request?.employeeId, t]);

  async function handleSubmit(values: LeaveFormValues): Promise<void> {
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
    try {
      await updateMutation.mutateAsync({
        leaveType: values.leaveType,
        periods: inputs,
        reason: values.reason?.trim() || undefined,
      });
      messageApi.success(t('pages.approvals.edit.saved'));
      router.push(backHref);
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
    <HrFormPageShell
      title={t('pages.hr.leave.edit')}
      description={t('pages.hr.leave.detailsStepDescription')}
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref={backHref}
      backLabel={t('hr.buttons.back')}
    >
      <div className="erp-leave-v2 flex flex-col gap-4">
        {request.status === 'RETURNED' ? (
          <ReturnedRequestCallout
            approvalRequestId={request.approvalRequestId}
          />
        ) : null}
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

            <LeavePeriodsEditor
              periods={periods}
              onChange={setPeriods}
              preview={preview}
              previewError={previewError}
            />

            <Form.Item name="reason" label={t('hr.form.reason')}>
              <Input.TextArea rows={4} maxLength={4000} showCount />
            </Form.Item>
          </FormLayout>
        </Form>

        <FormPageFooter
          submitLabel={
            isOwner
              ? t('pages.approvals.edit.saveChanges')
              : t('hr.buttons.saveLeaveRequest')
          }
          formId="leave-request-edit-form"
          useFormAttribute
          isSubmitting={updateMutation.isPending}
          submitDisabled={!canEdit}
          onSubmit={() => form.submit()}
        />
      </div>
    </HrFormPageShell>
  );
}
