'use client';

import { useMemo, useState } from 'react';
import { Button, DatePicker, Form, Input, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
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

function calendarDays(start: Dayjs, end: Dayjs): number {
  return end.diff(start, 'day') + 1;
}

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
      notifyApiError(messageApi, error);
    }
  }

  return (
    <FormLayout
      title={t('pages.hr.siteAssignments.form.title')}
      description={t('pages.hr.siteAssignments.form.description')}
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <OnBehalfSection state={onBehalf} />
        <Form.Item
          name="siteName"
          label={t('pages.hr.siteAssignments.form.siteName')}
          rules={[{ required: true }]}
        >
          <Input placeholder={t('pages.hr.siteAssignments.form.siteNamePlaceholder')} />
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
            placeholder={t('pages.hr.siteAssignments.form.projectPlaceholder')}
          />
        </Form.Item>
        <Form.Item
          label={t('pages.hr.siteAssignments.form.dateRange')}
          required
        >
          <DatePicker.RangePicker
            style={{ width: '100%' }}
            value={range}
            onChange={(value) => setRange(value ?? null)}
          />
          {dayCount != null ? (
            <div style={{ marginTop: 8, color: 'var(--color-text-secondary)' }}>
              {t('pages.hr.siteAssignments.form.calendarDays', {
                count: dayCount,
              })}
            </div>
          ) : null}
        </Form.Item>
        <Form.Item name="reason" label={t('pages.hr.siteAssignments.form.reason')}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={submitMutation.isPending}>
          {t('pages.hr.siteAssignments.form.submit')}
        </Button>
      </Form>
    </FormLayout>
  );
}
