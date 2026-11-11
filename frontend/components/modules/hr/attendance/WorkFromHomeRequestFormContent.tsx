'use client';

import './work-from-home-v2.css';

import { useMemo, useState } from 'react';
import { Alert, DatePicker, Form, Input, Spin } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import DayCoverageNotice from '@/components/modules/hr/shared/DayCoverageNotice';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import WorkFromHomeRangeDays from '@/components/modules/hr/attendance/WorkFromHomeRangeDays';
import ReturnedRequestCallout from '@/components/modules/approvals/ReturnedRequestCallout';
import type { ApprovalRequestDetail } from '@/lib/api/approvals.types';
import {
  previewWorkFromHomeRange,
  requestWorkFromHomeDay,
  updateWorkFromHomeRequest,
  WFH_MAX_RANGE_DAYS,
  type UpdateWorkFromHomeRequestDto,
  type WorkFromHomeRequestForm,
} from '@/lib/api/work-from-home.api';
import { useEarliestAllowedDate } from '@/lib/query/backdating';
import { invalidateAfterRequestEdit } from '@/lib/query/request-edit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';

interface WfhRequestFormValues {
  reason?: string;
  lateReason?: string;
}

function ReviewItem({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}): React.ReactNode {
  return (
    <div className={`erp-wfh-review-item${wide ? ' erp-wfh-review-item--wide' : ''}`}>
      <p className="erp-wfh-review-label">{label}</p>
      <p className="erp-wfh-review-value">{value}</p>
    </div>
  );
}

/** Range + reason of an existing request (edit mode). */
function initialRangeOf(
  editRequest: ApprovalRequestDetail | undefined,
): [Dayjs, Dayjs] | null {
  const formData = editRequest?.formData as WorkFromHomeRequestForm | undefined;
  const start = formData?.startDate ?? formData?.date;
  const end = formData?.endDate ?? formData?.date;
  return start && end ? [dayjs(start), dayjs(end)] : null;
}

/**
 * Employee work-from-home request for a date range - one request, Reports to →
 * HR Officer approval; approval creates a WFH day per working day.
 *
 * With `editRequest`, edits the employee's own RETURNED request (prefilled);
 * saving keeps it RETURNED (resubmit from the request page).
 */
export default function WorkFromHomeRequestFormContent({
  editRequest,
}: {
  editRequest?: ApprovalRequestDetail;
} = {}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const isEdit = Boolean(editRequest);
  const initialReason =
    (editRequest?.formData as WorkFromHomeRequestForm | undefined)?.reason ?? '';
  const [form] = Form.useForm<WfhRequestFormValues>();
  const onBehalf = useOnBehalf('WORK_FROM_HOME');
  const earliestQuery = useEarliestAllowedDate(onBehalf.effectiveEmployeeId);
  const earliestDay = earliestQuery.data?.earliestDate
    ? dayjs(earliestQuery.data.earliestDate)
    : null;
  const requiresLateReason =
    earliestQuery.data?.requiresLateReasonWhenBeforeCurrentMonth === true;
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(() =>
    initialRangeOf(editRequest),
  );
  /** First day clicked while choosing a range (limits the 31-day window). */
  const [rangeAnchor, setRangeAnchor] = useState<Dayjs | null>(null);
  const [snapshot, setSnapshot] = useState<{
    label: string | null;
    reason: string;
  }>({ label: null, reason: '' });
  const startKey = range?.[0].format('YYYY-MM-DD') ?? null;
  const endKey = range?.[1].format('YYYY-MM-DD') ?? null;

  const previewQuery = useQuery({
    queryKey: [
      'work-from-home-preview',
      startKey,
      endKey,
      onBehalf.effectiveEmployeeId ?? null,
      editRequest?.id ?? null,
    ],
    queryFn: () =>
      previewWorkFromHomeRange({
        startDate: startKey!,
        endDate: endKey!,
        ...(onBehalf.payload.onBehalfOfEmployeeId
          ? { onBehalfOfEmployeeId: onBehalf.payload.onBehalfOfEmployeeId }
          : {}),
        ...(editRequest ? { editingRequestId: editRequest.id } : {}),
      }),
    enabled: Boolean(startKey && endKey),
    retry: false,
  });
  const preview = previewQuery.data;

  const queryClient = useQueryClient();
  const submitMutation = useMutation({
    mutationFn: requestWorkFromHomeDay,
  });
  const updateMutation = useMutation({
    mutationFn: (dto: UpdateWorkFromHomeRequestDto) =>
      updateWorkFromHomeRequest(editRequest?.id ?? '', dto),
    onSuccess: () => invalidateAfterRequestEdit(queryClient),
  });

  function captureSnapshot(): typeof snapshot {
    const values = form.getFieldsValue(true) as WfhRequestFormValues;
    const next = {
      label: preview?.label ?? null,
      reason: values.reason?.trim() ?? '',
    };
    setSnapshot(next);
    return next;
  }

  function resetForm(): void {
    form.resetFields();
    setRange(initialRangeOf(editRequest));
    setRangeAnchor(null);
    setSnapshot({ label: null, reason: '' });
    onBehalf.reset();
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      await form.validateFields(['reason']);
      if (!range) {
        messageApi.error(t('pages.hr.workFromHome.range.rangeRequired'));
        return false;
      }
      if (!preview || preview.workingDays === 0) {
        messageApi.error(t('pages.hr.workFromHome.range.noWorkingDays'));
        return false;
      }
      if (requiresLateReason && range[0].isBefore(dayjs().startOf('month'), 'day')) {
        await form.validateFields(['lateReason']);
      }
      captureSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(): Promise<void> {
    const ok = await validateDetailsStep();
    if (!ok || !startKey || !endKey) {
      return;
    }
    const values = captureSnapshot();
    if (editRequest) {
      try {
        await updateMutation.mutateAsync({
          startDate: startKey,
          endDate: endKey,
          reason: values.reason,
          lateReason: form.getFieldValue('lateReason')?.trim() || undefined,
        });
        messageApi.success(t('pages.approvals.edit.saved'));
        router.push(`/approvals/${editRequest.id}`);
      } catch (error) {
        notifyApiError(error, t('pages.approvals.edit.failed'), messageApi, t);
      }
      return;
    }
    try {
      await submitMutation.mutateAsync({
        startDate: startKey,
        endDate: endKey,
        reason: values.reason,
        lateReason: form.getFieldValue('lateReason')?.trim() || undefined,
        ...onBehalf.payload,
      });
      messageApi.success(t('pages.hr.workFromHome.request.submitSuccess'));
      await queryClient.invalidateQueries({ queryKey: ['approvals'] });
      router.push('/approvals');
    } catch (error) {
      notifyApiError(
        error,
        t('pages.hr.workFromHome.request.submitFailed'),
        messageApi,
        t,
      );
    }
  }

  const onBehalfLabel = onBehalf.employee
    ? formatUserName(onBehalf.employee)
    : t('hr.onBehalf.forYourself');

  const steps = useMemo(
    () => [
      {
        title: t('pages.hr.workFromHome.request.steps.details'),
        validate: () => validateDetailsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('pages.hr.workFromHome.request.steps.details')}
            description={t('pages.hr.workFromHome.request.detailsStepDescription')}
          >
            {isEdit ? null : <OnBehalfSection state={onBehalf} />}
            <div className="erp-form-grid-2">
              <Form.Item
                label={t('pages.hr.workFromHome.range.dateRange')}
                required
                extra={t('pages.hr.workFromHome.range.maxRange', {
                  days: WFH_MAX_RANGE_DAYS,
                })}
                className="md:col-span-2"
              >
                <DatePicker.RangePicker
                  className="w-full"
                  value={range}
                  onCalendarChange={(values) => {
                    setRangeAnchor(values?.[0] ?? values?.[1] ?? null);
                  }}
                  onOpenChange={(open) => {
                    if (!open) {
                      setRangeAnchor(null);
                    }
                  }}
                  onChange={(values) => {
                    setRange(
                      values?.[0] && values?.[1] ? [values[0], values[1]] : null,
                    );
                  }}
                  disabledDate={(current) => {
                    if (!current) {
                      return false;
                    }
                    if (earliestDay && current.isBefore(earliestDay, 'day')) {
                      return true;
                    }
                    if (rangeAnchor) {
                      return (
                        Math.abs(current.diff(rangeAnchor, 'day')) >=
                        WFH_MAX_RANGE_DAYS
                      );
                    }
                    return false;
                  }}
                />
              </Form.Item>
              {isEdit ? null : (
                // In edit mode this request itself would show as covering
                // its days; the preview below already excludes it.
                <DayCoverageNotice
                  className="md:col-span-2"
                  employeeId={onBehalf.effectiveEmployeeId}
                  from={startKey}
                  to={endKey}
                  focus="WORK_FROM_HOME"
                />
              )}
              {range ? (
                <div className="md:col-span-2">
                  {previewQuery.isLoading ? (
                    <div className="flex justify-center py-4">
                      <Spin size="small" />
                    </div>
                  ) : previewQuery.isError ? (
                    <Alert
                      type="error"
                      showIcon
                      title={getFriendlyApiErrorMessage(
                        previewQuery.error,
                        t('pages.hr.workFromHome.range.previewFailed'),
                        t,
                      )}
                    />
                  ) : preview ? (
                    <div className="flex flex-col gap-2">
                      <p className="m-0 text-sm font-semibold text-slate-900">
                        {t('pages.hr.workFromHome.range.daysCount', {
                          count: preview.workingDays,
                        })}
                      </p>
                      <WorkFromHomeRangeDays days={preview.days} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {requiresLateReason &&
              range?.[0].isBefore(dayjs().startOf('month'), 'day') ? (
                <Form.Item
                  name="lateReason"
                  label={t('pages.hr.siteAssignments.form.lateReason')}
                  rules={[{ required: true, min: 3 }]}
                  className="md:col-span-2"
                >
                  <Input.TextArea
                    rows={3}
                    maxLength={2000}
                    placeholder={t(
                      'pages.hr.siteAssignments.form.lateReasonPlaceholder',
                    )}
                  />
                </Form.Item>
              ) : null}
              <Form.Item
                name="reason"
                label={t('pages.hr.workFromHome.fields.reason')}
                rules={[{ required: true }]}
                className="md:col-span-2"
                extra={t('pages.hr.workFromHome.request.reasonHint')}
              >
                <Input.TextArea
                  rows={3}
                  maxLength={500}
                  showCount
                  placeholder={t(
                    'pages.hr.workFromHome.request.reasonPlaceholder',
                  )}
                />
              </Form.Item>
            </div>
          </FormLayout>
        ),
      },
      {
        title: t('pages.hr.workFromHome.request.steps.review'),
        content: (
          <FormLayout
            variant="pro"
            title={t('pages.hr.workFromHome.request.steps.review')}
            description={t('pages.hr.workFromHome.request.reviewStepDescription')}
          >
            <div className="erp-wfh-review-grid">
              <ReviewItem
                label={t('hr.onBehalf.employee')}
                value={onBehalfLabel}
              />
              <ReviewItem
                label={t('pages.hr.workFromHome.range.dateRange')}
                value={snapshot.label ?? '-'}
              />
              <ReviewItem
                label={t('pages.hr.workFromHome.fields.reason')}
                value={snapshot.reason || '-'}
                wide
              />
              <ReviewItem
                label={t('pages.hr.workFromHome.request.approvalChain')}
                value={t('pages.hr.workFromHome.request.approvalChainValue')}
                wide
              />
            </div>
          </FormLayout>
        ),
      },
    ],
    [
      t,
      isEdit,
      onBehalf,
      onBehalfLabel,
      range,
      rangeAnchor,
      earliestDay,
      requiresLateReason,
      preview,
      previewQuery.isLoading,
      previewQuery.isError,
      previewQuery.error,
      snapshot,
    ],
  );

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-wfh-form-page erp-wfh-v2 flex flex-col">
      <HrFormPageShell
        title={
          isEdit
            ? t('pages.approvals.edit.pageTitle')
            : t('pages.hr.workFromHome.request.title')
        }
        description={
          isEdit
            ? t('pages.approvals.edit.pageDescription')
            : t('pages.hr.workFromHome.request.description')
        }
        cancelLabel={t('common.cancel')}
        cancelHref={
          editRequest ? `/approvals/${editRequest.id}` : '/approvals/new'
        }
        backLabel={
          isEdit
            ? t('hr.buttons.back')
            : t('pages.hr.workFromHome.request.backToPicker')
        }
        showCancelButton={false}
      >
      {editRequest?.status === 'RETURNED' ? (
        <ReturnedRequestCallout approvalRequestId={editRequest.id} />
      ) : null}
      <Form<WfhRequestFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve
        initialValues={isEdit ? { reason: initialReason } : undefined}
        className="flex min-h-0 flex-1 flex-col"
      >
        <StepperForm
          steps={steps}
          onSubmit={handleSubmit}
          onReset={resetForm}
          onCancel={() =>
            router.push(
              editRequest ? `/approvals/${editRequest.id}` : '/approvals/new',
            )
          }
          cancelLabel={t('common.cancel')}
          isSubmitting={submitMutation.isPending || updateMutation.isPending}
          contentVariant="sections"
          submitLabel={
            editRequest
              ? t('pages.approvals.edit.saveChanges')
              : t('pages.hr.workFromHome.request.submit')
          }
        />
      </Form>
      </HrFormPageShell>
    </div>
  );
}
