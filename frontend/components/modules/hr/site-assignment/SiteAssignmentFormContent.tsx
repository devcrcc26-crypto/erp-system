'use client';

import './site-assignments-v2.css';

import { useMemo, useState } from 'react';
import { Button, DatePicker, Form, Input, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
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

const LIST_PATH = '/hr/site-assignments';

function calendarDays(start: Dayjs, end: Dayjs): number {
  return end.diff(start, 'day') + 1;
}

/**
 * New site assignment request — v2 hero + soft form card.
 */
export default function SiteAssignmentFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm();
  const onBehalf = useOnBehalf('SITE_ASSIGNMENT');
  const submitMutation = useSubmitSiteAssignment();
  const projectsQuery = useProjects({ page: 1, limit: 200 });
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(
    null,
  );

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

  async function onFinish(values: {
    siteName: string;
    projectId?: string;
    reason?: string;
  }): Promise<void> {
    if (!range?.[0] || !range[1]) {
      messageApi.error(t('pages.hr.siteAssignments.form.datesRequired'));
      return;
    }
    try {
      const detail = await submitMutation.mutateAsync({
        siteName: values.siteName.trim(),
        projectId: values.projectId,
        startDate: range[0].format('YYYY-MM-DD'),
        endDate: range[1].format('YYYY-MM-DD'),
        reason: values.reason?.trim(),
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

      <Form form={form} layout="vertical" requiredMark={false} onFinish={onFinish}>
        <FormLayout variant="pro">
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
          <div className="flex justify-end">
            <Button
              type="primary"
              htmlType="submit"
              loading={submitMutation.isPending}
            >
              {t('pages.hr.siteAssignments.form.submit')}
            </Button>
          </div>
        </FormLayout>
      </Form>
    </div>
  );
}
