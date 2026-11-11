'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Drawer, Form, Input } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useAppMessage } from '@/hooks/use-app-message';

dayjs.extend(utc);
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useCurrentUser } from '@/lib/query/profile';
import { useOnBehalfEligibleEmployees } from '@/lib/query/on-behalf';
import { useSubmitSiteAssignment } from '@/lib/query/site-assignment';
import { requestWorkFromHomeDay } from '@/lib/api/work-from-home.api';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface AttendanceMissingScheduleDrawerProps {
  open: boolean;
  employeeId: string;
  employeeName: string;
  month: number;
  year: number;
  onClose: () => void;
  onSubmitted?: () => void;
}

type DrawerMode = 'site' | 'wfh' | null;

interface SiteFormValues {
  siteName: string;
  reason: string;
}

interface WfhFormValues {
  date: Dayjs;
  reason: string;
}

/**
 * Submit site assignment or WFH on behalf of an employee missing from the import file.
 */
export default function AttendanceMissingScheduleDrawer({
  open,
  employeeId,
  employeeName,
  month,
  year,
  onClose,
  onSubmitted,
}: AttendanceMissingScheduleDrawerProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const eligibleQuery = useOnBehalfEligibleEmployees(
    currentUser.data?.id,
    currentUser.data?.companyId,
    open,
  );
  const canSubmitOnBehalf = useMemo(
    () =>
      (eligibleQuery.data ?? []).some((row) => row.id === employeeId),
    [eligibleQuery.data, employeeId],
  );

  const [mode, setMode] = useState<DrawerMode>(null);
  const [siteForm] = Form.useForm<SiteFormValues>();
  const [wfhForm] = Form.useForm<WfhFormValues>();
  const submitSite = useSubmitSiteAssignment();
  const [submittingWfh, setSubmittingWfh] = useState(false);

  const monthStart = dayjs.utc(`${year}-${String(month).padStart(2, '0')}-01`);
  const monthEnd = monthStart.endOf('month');

  useEffect(() => {
    if (!open) {
      setMode(null);
      siteForm.resetFields();
      wfhForm.resetFields();
    }
  }, [open, siteForm, wfhForm]);

  useEffect(() => {
    if (open && mode === 'site') {
      siteForm.setFieldsValue({ siteName: '', reason: '' });
    }
    if (open && mode === 'wfh') {
      wfhForm.setFieldsValue({
        date: monthStart,
        reason: '',
      });
    }
  }, [open, mode, monthStart, siteForm, wfhForm]);

  async function handleSiteSubmit(): Promise<void> {
    const values = await siteForm.validateFields();
    try {
      const reason = values.reason.trim();
      await submitSite.mutateAsync({
        employeeId,
        siteName: values.siteName.trim(),
        startDate: monthStart.format('YYYY-MM-DD'),
        endDate: monthEnd.format('YYYY-MM-DD'),
        reason,
        lateReason: reason,
        createdFromAttendanceImport: true,
      });
      messageApi.success(t('pages.hr.attendance.importModal.siteSubmitted'));
      onSubmitted?.();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to submit site assignment', messageApi);
    }
  }

  async function handleWfhSubmit(): Promise<void> {
    const values = await wfhForm.validateFields();
    setSubmittingWfh(true);
    try {
      await requestWorkFromHomeDay({
        onBehalfOfEmployeeId: employeeId,
        date: values.date.format('YYYY-MM-DD'),
        reason: values.reason.trim(),
        createdFromAttendanceImport: true,
      });
      messageApi.success(t('pages.hr.attendance.importModal.wfhSubmitted'));
      onSubmitted?.();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to submit work from home', messageApi);
    } finally {
      setSubmittingWfh(false);
    }
  }

  const title =
    mode === 'site'
      ? t('pages.hr.attendance.importModal.submitSiteAssignment')
      : mode === 'wfh'
        ? t('pages.hr.attendance.importModal.submitWorkFromHome')
        : t('pages.hr.attendance.importModal.missingScheduleDrawerTitle');

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={420}
      title={title}
      destroyOnHidden
      footer={
        mode === 'site' ? (
          <div className="flex justify-end gap-2">
            <Button onClick={() => setMode(null)}>{t('common.back')}</Button>
            <Button
              type="primary"
              loading={submitSite.isPending}
              onClick={() => void handleSiteSubmit()}
            >
              {t('common.submit')}
            </Button>
          </div>
        ) : mode === 'wfh' ? (
          <div className="flex justify-end gap-2">
            <Button onClick={() => setMode(null)}>{t('common.back')}</Button>
            <Button
              type="primary"
              loading={submittingWfh}
              onClick={() => void handleWfhSubmit()}
            >
              {t('common.submit')}
            </Button>
          </div>
        ) : null
      }
    >
      <p className="mb-3 text-[13px] text-slate-600">
        {employeeName} · {monthStart.format('MMMM YYYY')}
      </p>

      {mode === null ? (
        <div className="flex flex-col gap-2">
          {canSubmitOnBehalf ? (
            <>
              <Button type="primary" onClick={() => setMode('site')}>
                {t('pages.hr.attendance.importModal.submitSiteAssignment')}
              </Button>
              <Button onClick={() => setMode('wfh')}>
                {t('pages.hr.attendance.importModal.submitWorkFromHome')}
              </Button>
            </>
          ) : (
            <p className="text-[12px] text-slate-500">
              {t('pages.hr.attendance.importModal.onBehalfRequired')}
            </p>
          )}
        </div>
      ) : null}

      {mode === 'site' ? (
        <Form form={siteForm} layout="vertical">
          <Form.Item label={t('pages.hr.siteAssignments.form.dateRange')}>
            <span className="text-[13px]">
              {monthStart.format('YYYY-MM-DD')} – {monthEnd.format('YYYY-MM-DD')}
            </span>
          </Form.Item>
          <Form.Item
            name="siteName"
            label={t('pages.hr.siteAssignments.columns.site')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="reason"
            label={t('pages.hr.siteAssignments.form.reason')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      ) : null}

      {mode === 'wfh' ? (
        <Form form={wfhForm} layout="vertical">
          <Form.Item
            name="date"
            label={t('pages.hr.attendance.workFromHome.fields.date')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <DatePicker
              className="w-full"
              disabledDate={(current) =>
                current.isBefore(monthStart, 'day') ||
                current.isAfter(monthEnd, 'day')
              }
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label={t('pages.hr.attendance.workFromHome.fields.reason')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      ) : null}
    </Drawer>
  );
}
