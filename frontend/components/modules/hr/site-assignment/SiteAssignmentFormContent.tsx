'use client';

import './site-assignments-v2.css';

import { useMemo, useState } from 'react';
import { Button, DatePicker, Form, Input, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { useSubmitSiteAssignment } from '@/lib/query/site-assignment';
import { useProjects } from '@/lib/query/projects';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

const LIST_PATH = '/hr/site-assignments';

interface SiteAssignmentFormValues {
  siteName?: string;
  projectId?: string;
  reason?: string;
}

function calendarDays(start: Dayjs, end: Dayjs): number {
  return end.diff(start, 'day') + 1;
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
 * New site assignment request — v2 hero + StepperForm (details → review).
 */
export default function SiteAssignmentFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<SiteAssignmentFormValues>();
  const onBehalf = useOnBehalf('SITE_ASSIGNMENT');
  const submitMutation = useSubmitSiteAssignment();
  const projectsQuery = useProjects({ page: 1, limit: 200 });
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(
    null,
  );
  const [snapshot, setSnapshot] = useState<{
    siteName: string;
    projectId?: string;
    reason: string;
    startDate: string | null;
    endDate: string | null;
  }>({
    siteName: '',
    reason: '',
    startDate: null,
    endDate: null,
  });

  useSetHeaderExtra(null);

  const dayCount = useMemo(() => {
    if (!range?.[0] || !range[1]) {
      return null;
    }
    return calendarDays(range[0], range[1]);
  }, [range]);

  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.projectCode} — ${p.name}`,
      })),
    [projectsQuery.data?.data],
  );

  const projectLabel = useMemo(() => {
    if (!snapshot.projectId) {
      return '—';
    }
    return (
      projectOptions.find((option) => option.value === snapshot.projectId)
        ?.label ?? '—'
    );
  }, [projectOptions, snapshot.projectId]);

  function captureSnapshot(): typeof snapshot {
    const values = form.getFieldsValue(true) as SiteAssignmentFormValues;
    const next = {
      siteName: values.siteName?.trim() ?? '',
      projectId: values.projectId,
      reason: values.reason?.trim() ?? '',
      startDate: range?.[0]?.format('YYYY-MM-DD') ?? null,
      endDate: range?.[1]?.format('YYYY-MM-DD') ?? null,
    };
    setSnapshot(next);
    return next;
  }

  function resetForm(): void {
    form.resetFields();
    setRange(null);
    setSnapshot({
      siteName: '',
      reason: '',
      startDate: null,
      endDate: null,
    });
    onBehalf.reset();
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      await form.validateFields(['siteName']);
      if (!range?.[0] || !range[1]) {
        messageApi.error(t('pages.hr.siteAssignments.form.datesRequired'));
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
    if (!ok || !range?.[0] || !range[1]) {
      return;
    }
    const values = captureSnapshot();
    try {
      const detail = await submitMutation.mutateAsync({
        siteName: values.siteName,
        projectId: values.projectId,
        startDate: values.startDate!,
        endDate: values.endDate!,
        reason: values.reason || undefined,
        ...onBehalf.payload,
      });
      messageApi.success(t('pages.hr.siteAssignments.form.submitSuccess'));
      router.push(`/hr/site-assignments/${detail.id}`);
    } catch (error) {
      notifyApiError(
        error,
        t('pages.hr.siteAssignments.form.submitFailed'),
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
        title: t('pages.hr.siteAssignments.form.steps.details'),
        validate: () => validateDetailsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('pages.hr.siteAssignments.form.steps.details')}
            description={t('pages.hr.siteAssignments.form.detailsStepDescription')}
          >
            <OnBehalfSection state={onBehalf} />
            <div className="erp-form-grid-2">
              <Form.Item
                name="siteName"
                label={t('pages.hr.siteAssignments.form.siteName')}
                rules={[{ required: true }]}
              >
                <Input
                  maxLength={200}
                  placeholder={t(
                    'pages.hr.siteAssignments.form.siteNamePlaceholder',
                  )}
                />
              </Form.Item>
              <Form.Item
                name="projectId"
                label={t('pages.hr.siteAssignments.form.project')}
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={projectOptions}
                  loading={projectsQuery.isLoading}
                  placeholder={t(
                    'pages.hr.siteAssignments.form.projectPlaceholder',
                  )}
                />
              </Form.Item>
              <Form.Item
                label={t('pages.hr.siteAssignments.form.dateRange')}
                required
                className="md:col-span-2"
              >
                <DatePicker.RangePicker
                  className="w-full"
                  value={range}
                  onChange={(value) => setRange(value ?? null)}
                />
                {dayCount != null ? (
                  <p className="erp-sa-day-hint">
                    {t('pages.hr.siteAssignments.form.calendarDays', {
                      count: dayCount,
                    })}
                  </p>
                ) : null}
              </Form.Item>
              <Form.Item
                name="reason"
                label={t('pages.hr.siteAssignments.form.reason')}
                className="md:col-span-2"
              >
                <Input.TextArea rows={3} maxLength={2000} showCount />
              </Form.Item>
            </div>
          </FormLayout>
        ),
      },
      {
        title: t('pages.hr.siteAssignments.form.steps.review'),
        content: (
          <FormLayout
            variant="pro"
            title={t('pages.hr.siteAssignments.form.steps.review')}
            description={t('pages.hr.siteAssignments.form.reviewStepDescription')}
          >
            <div className="erp-sa-review-grid">
              <ReviewItem
                label={t('hr.onBehalf.employee')}
                value={onBehalfLabel}
              />
              <ReviewItem
                label={t('pages.hr.siteAssignments.form.siteName')}
                value={snapshot.siteName || '—'}
              />
              <ReviewItem
                label={t('pages.hr.siteAssignments.form.project')}
                value={projectLabel}
              />
              <ReviewItem
                label={t('pages.hr.siteAssignments.form.dateRange')}
                value={
                  snapshot.startDate && snapshot.endDate
                    ? `${formatProjectDate(snapshot.startDate)} – ${formatProjectDate(snapshot.endDate)}`
                    : '—'
                }
              />
              <ReviewItem
                label={t('pages.hr.siteAssignments.columns.days')}
                value={
                  snapshot.startDate && snapshot.endDate && range?.[0] && range[1]
                    ? String(calendarDays(range[0], range[1]))
                    : '—'
                }
              />
              <ReviewItem
                label={t('pages.hr.siteAssignments.form.reason')}
                value={snapshot.reason || '—'}
                wide
              />
            </div>
          </FormLayout>
        ),
      },
    ],
    [
      t,
      onBehalf,
      onBehalfLabel,
      projectOptions,
      projectsQuery.isLoading,
      range,
      dayCount,
      snapshot,
      projectLabel,
    ],
  );

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-sa-form-page erp-site-assignments-v2 flex flex-col">
      <section className="erp-sa-form-hero">
        <div className="min-w-0">
          <Link href={LIST_PATH} className="erp-sa-back">
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            {t('hr.buttons.backToList')}
          </Link>
          <h1 className="erp-sa-form-hero-title">
            {t('pages.hr.siteAssignments.form.title')}
          </h1>
          <p className="erp-sa-form-hero-desc">
            {t('pages.hr.siteAssignments.form.description')}
          </p>
        </div>
        <div>
          <Button onClick={() => router.push(LIST_PATH)}>
            {t('common.cancel')}
          </Button>
        </div>
      </section>

      <Form<SiteAssignmentFormValues>
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
          submitLabel={t('pages.hr.siteAssignments.form.submit')}
        />
      </Form>
    </div>
  );
}
