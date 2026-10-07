'use client';

import '../site-assignment/site-assignments-v2.css';
import './work-from-home-v2.css';

import { useMemo, useState } from 'react';
import { DatePicker, Form, Input } from 'antd';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { requestWorkFromHomeDay } from '@/lib/api/work-from-home.api';
import { useMutation } from '@tanstack/react-query';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

interface WfhRequestFormValues {
  reason?: string;
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
    <div className={`erp-sa-review-item${wide ? ' erp-sa-review-item--wide' : ''}`}>
      <p className="erp-sa-review-label">{label}</p>
      <p className="erp-sa-review-value">{value}</p>
    </div>
  );
}

/**
 * Employee work-from-home request — Employee → Discipline Lead approval.
 */
export default function WorkFromHomeRequestFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<WfhRequestFormValues>();
  const onBehalf = useOnBehalf('WORK_FROM_HOME');
  const [date, setDate] = useState<Dayjs | null>(null);
  const [snapshot, setSnapshot] = useState<{
    date: string | null;
    reason: string;
  }>({ date: null, reason: '' });

  const submitMutation = useMutation({
    mutationFn: requestWorkFromHomeDay,
  });

  function captureSnapshot(): typeof snapshot {
    const values = form.getFieldsValue(true) as WfhRequestFormValues;
    const next = {
      date: date?.format('YYYY-MM-DD') ?? null,
      reason: values.reason?.trim() ?? '',
    };
    setSnapshot(next);
    return next;
  }

  function resetForm(): void {
    form.resetFields();
    setDate(null);
    setSnapshot({ date: null, reason: '' });
    onBehalf.reset();
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      await form.validateFields(['reason']);
      if (!date) {
        messageApi.error(t('pages.hr.workFromHome.request.dateRequired'));
        return false;
      }
      captureSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(): Promise<void> {
    const ok = await validateDetailsStep();
    if (!ok || !date) {
      return;
    }
    const values = captureSnapshot();
    try {
      await submitMutation.mutateAsync({
        date: values.date!,
        reason: values.reason,
        ...onBehalf.payload,
      });
      messageApi.success(t('pages.hr.workFromHome.request.submitSuccess'));
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
            <OnBehalfSection state={onBehalf} />
            <div className="erp-form-grid-2">
              <Form.Item
                label={t('pages.hr.workFromHome.fields.date')}
                required
              >
                <DatePicker
                  className="w-full"
                  value={date}
                  onChange={(value) => setDate(value)}
                />
              </Form.Item>
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
            <div className="erp-sa-review-grid">
              <ReviewItem
                label={t('hr.onBehalf.employee')}
                value={onBehalfLabel}
              />
              <ReviewItem
                label={t('pages.hr.workFromHome.fields.date')}
                value={
                  snapshot.date ? formatProjectDate(snapshot.date) : '—'
                }
              />
              <ReviewItem
                label={t('pages.hr.workFromHome.fields.reason')}
                value={snapshot.reason || '—'}
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
    [t, onBehalf, onBehalfLabel, date, snapshot],
  );

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-sa-form-page erp-wfh-v2 flex flex-col">
      <HrFormPageShell
        title={t('pages.hr.workFromHome.request.title')}
        description={t('pages.hr.workFromHome.request.description')}
        cancelLabel={t('common.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('pages.hr.workFromHome.request.backToPicker')}
      >
      <Form<WfhRequestFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve
        className="flex min-h-0 flex-1 flex-col"
      >
        <StepperForm
          steps={steps}
          onSubmit={handleSubmit}
          onReset={resetForm}
          isSubmitting={submitMutation.isPending}
          contentVariant="sections"
          submitLabel={t('pages.hr.workFromHome.request.submit')}
        />
      </Form>
      </HrFormPageShell>
    </div>
  );
}
