'use client';

import { useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { usePositions } from '@/lib/query/org';
import { useCreatePositionHistory, usePositionHistory } from '@/lib/query/employee-profile-records';
import { useEducationRecords, usePriorEmployments } from '@/lib/query/employee-profile-records';
import { ApiRequestError } from '@/lib/api/errors';
import { useAppMessage } from '@/hooks/use-app-message';

function money(value: number | null | undefined): string {
  if (value == null) {
    return '-';
  }
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function EmployeeEducationEmploymentLists({
  userId,
}: {
  userId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const education = useEducationRecords(userId);
  const prior = usePriorEmployments(userId);
  const educationRows = education.data ?? [];
  const priorRows = prior.data ?? [];

  return (
    <>
      <div className="mt-4">
        <div className="mb-2 text-sm font-semibold text-slate-700">
          {t('users.form.higherEducation')}
        </div>
        {educationRows.length === 0 ? (
          <p className="erp-users-cell-sub m-0">{t('users.form.noEducationRecords')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {educationRows.map((row) => (
              <div key={row.id ?? row.instituteName} className="erp-employee-contact-card">
                <div className="erp-users-cell-strong">{row.instituteName}</div>
                <div className="erp-users-cell-sub">
                  {[row.certificateType, row.subjectMajor, row.graduationYear]
                    .filter((part) => part != null && part !== '')
                    .join(' · ') || '-'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="mb-2 text-sm font-semibold text-slate-700">
          {t('users.form.priorEmployment')}
        </div>
        {priorRows.length === 0 ? (
          <p className="erp-users-cell-sub m-0">{t('users.form.noPriorEmployment')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {priorRows.map((row) => (
              <div key={row.id ?? row.employerName} className="erp-employee-contact-card">
                <div className="erp-users-cell-strong">{row.employerName}</div>
                <div className="erp-users-cell-sub">
                  {[
                    row.lastPosition,
                    row.dateFrom,
                    row.dateTo,
                  ]
                    .filter((part) => part != null && part !== '')
                    .join(' · ') || '-'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function EmployeePositionHistorySection({
  userId,
  canManage,
}: {
  userId: string;
  canManage: boolean;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const message = useAppMessage();
  const history = usePositionHistory(userId);
  const createHistory = useCreatePositionHistory(userId);
  const positions = usePositions({ page: 1, limit: 100, isActive: true }, canManage);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<{
    positionId?: string;
    salaryOverride?: number | null;
    effectiveFrom: Dayjs;
    note?: string;
  }>();

  const rows = history.data ?? [];

  async function submit(): Promise<void> {
    const values = await form.validateFields();
    try {
      await createHistory.mutateAsync({
        positionId: values.positionId || null,
        salaryOverride:
          values.salaryOverride == null ? null : values.salaryOverride,
        effectiveFrom: values.effectiveFrom.format('YYYY-MM-DD'),
        note: values.note?.trim() || null,
      });
      message.success(t('users.form.positionHistorySaved'));
      setOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(
        error instanceof ApiRequestError
          ? error.message
          : t('users.form.positionHistorySaveFailed'),
      );
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-700">
          {t('users.sectionPositionHistory')}
        </span>
        {canManage ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setOpen(true)}
            style={{ borderRadius: 8 }}
          >
            {t('users.form.addPositionHistory')}
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="erp-users-cell-sub m-0">{t('users.form.noPositionHistory')}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((row) => {
            const title =
              locale === 'zh' && row.positionTitleZh
                ? row.positionTitleZh
                : row.positionTitle;
            return (
              <li key={row.id} className="erp-employee-contact-card">
                <div className="erp-users-cell-strong">
                  {title || t('users.form.positionUnchanged')}
                </div>
                <div className="erp-users-cell-sub mt-1">
                  {row.effectiveFrom}
                  {' — '}
                  {row.effectiveTo ?? t('users.form.current')}
                </div>
                <div className="mt-1">
                  {t('users.form.salaryOverride')}: {money(row.salaryOverride)}
                </div>
                {row.note ? (
                  <div className="erp-users-cell-sub mt-1">{row.note}</div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <Modal
        title={t('users.form.addPositionHistory')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        confirmLoading={createHistory.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ effectiveFrom: dayjs() }}>
          <Form.Item name="positionId" label={t('users.form.position')}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('common.select')}
              options={(positions.data?.data ?? []).map((position) => ({
                value: position.id,
                label: position.title,
              }))}
            />
          </Form.Item>
          <Form.Item name="salaryOverride" label={t('users.form.salaryOverride')}>
            <InputNumber min={0} className="!w-full" />
          </Form.Item>
          <Form.Item
            name="effectiveFrom"
            label={t('users.form.effectiveFrom')}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <DatePicker className="!w-full" />
          </Form.Item>
          <Form.Item name="note" label={t('users.form.historyNote')}>
            <Input maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
