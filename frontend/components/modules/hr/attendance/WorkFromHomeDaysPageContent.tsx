'use client';

import { useMemo, useState } from 'react';
import { Button, DatePicker, Form, Input, Modal, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import PageHeader from '@/components/ui/PageHeader/PageHeader';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  createWorkFromHomeDay,
  deleteWorkFromHomeDay,
  listWorkFromHomeDays,
  type WorkFromHomeDay,
  type WorkFromHomeScope,
} from '@/lib/api/work-from-home.api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifyApiError } from '@/lib/utils/notify-api-error';

export default function WorkFromHomeDaysPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const message = useAppMessage();
  const canViewHr = useCanViewHr();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(dayjs().month() + 1);
  const [year, setYear] = useState(dayjs().year());
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const listQuery = useQuery({
    queryKey: ['work-from-home', month, year],
    queryFn: () => listWorkFromHomeDays({ month, year }),
    enabled: canViewHr,
  });

  const createMutation = useMutation({
    mutationFn: createWorkFromHomeDay,
    onSuccess: async () => {
      message.success(t('common.saved'));
      setModalOpen(false);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ['work-from-home'] });
    },
    onError: (error) => notifyApiError(message, error),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkFromHomeDay,
    onSuccess: async () => {
      message.success(t('common.deleted'));
      await queryClient.invalidateQueries({ queryKey: ['work-from-home'] });
    },
    onError: (error) => notifyApiError(message, error),
  });

  const columns: ColumnsType<WorkFromHomeDay> = useMemo(
    () => [
      {
        title: t('pages.hr.workFromHome.columns.date'),
        dataIndex: 'date',
        key: 'date',
      },
      {
        title: t('pages.hr.workFromHome.columns.reason'),
        dataIndex: 'reason',
        key: 'reason',
      },
      {
        title: t('pages.hr.workFromHome.columns.scope'),
        dataIndex: 'scope',
        key: 'scope',
      },
      {
        title: t('common.actions'),
        key: 'actions',
        render: (_, row) => (
          <Button
            type="link"
            danger
            onClick={() => deleteMutation.mutate(row.id)}
          >
            {t('common.delete')}
          </Button>
        ),
      },
    ],
    [deleteMutation, t],
  );

  if (!canViewHr) {
    return null;
  }

  return (
    <>
      <PageHeader
        title={t('pages.hr.workFromHome.title')}
        breadcrumbs={[
          { label: t('nav.hr.attendance'), href: '/hr/attendance' },
          { label: t('pages.hr.workFromHome.title') },
        ]}
        actions={
          <Space>
            <Select
              value={month}
              options={Array.from({ length: 12 }, (_, i) => ({
                value: i + 1,
                label: dayjs().month(i).format('MMMM'),
              }))}
              onChange={setMonth}
              style={{ width: 140 }}
            />
            <Select
              value={year}
              options={[year - 1, year, year + 1].map((y) => ({
                value: y,
                label: String(y),
              }))}
              onChange={setYear}
              style={{ width: 100 }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setModalOpen(true)}
            >
              {t('common.add')}
            </Button>
          </Space>
        }
      />
      <DataTable<WorkFromHomeDay>
        rowKey="id"
        columns={columns}
        dataSource={listQuery.data ?? []}
        loading={listQuery.isLoading}
      />
      <Modal
        title={t('pages.hr.workFromHome.createTitle')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ scope: 'ALL' as WorkFromHomeScope }}
          onFinish={(values) =>
            createMutation.mutate({
              date: values.date.format('YYYY-MM-DD'),
              reason: values.reason,
              scope: values.scope,
            })
          }
        >
          <Form.Item
            name="date"
            label={t('pages.hr.workFromHome.fields.date')}
            rules={[{ required: true }]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item
            name="reason"
            label={t('pages.hr.workFromHome.fields.reason')}
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="scope" label={t('pages.hr.workFromHome.fields.scope')}>
            <Select
              options={[
                { value: 'ALL', label: 'All employees' },
                { value: 'DEPARTMENTS', label: 'Departments' },
                { value: 'EMPLOYEES', label: 'Employees' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
