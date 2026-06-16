'use client';

import { useEffect } from 'react';
import {
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Spin,
  Table,
} from 'antd';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { ApiRequestError } from '@/lib/api/errors';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useDailyLog, useUpdateDailyLog } from '@/lib/query/daily-logs';
import { formatProjectDate } from '@/lib/utils/project-display';

interface DailyLogEditValues {
  weatherCondition?: string;
  temperatureC?: number;
  rainfallMm?: number;
  workSummary?: string;
}

export default function DailyLogDetailDrawer({
  projectId,
  dailyLogId,
  onClose,
  onUpdated,
}: {
  projectId: string;
  dailyLogId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<DailyLogEditValues>();
  const open = Boolean(dailyLogId);
  const resolveUserName = useUserNameLookup();
  const logQuery = useDailyLog(projectId, dailyLogId ?? '', open);
  const updateDailyLog = useUpdateDailyLog();
  const log = logQuery.data;

  useEffect(() => {
    if (!log) {
      return;
    }
    form.setFieldsValue({
      weatherCondition: log.weatherCondition ?? undefined,
      temperatureC: log.temperatureC ? Number(log.temperatureC) : undefined,
      rainfallMm: log.rainfallMm ? Number(log.rainfallMm) : undefined,
      workSummary: log.workSummary ?? undefined,
    });
  }, [log, form]);

  async function handleSave(values: DailyLogEditValues): Promise<void> {
    if (!dailyLogId) {
      return;
    }
    await updateDailyLog.mutateAsync({
      projectId,
      dailyLogId,
      body: {
        weatherCondition: values.weatherCondition?.trim() || undefined,
        temperatureC: values.temperatureC,
        rainfallMm: values.rainfallMm,
        workSummary: values.workSummary?.trim() || undefined,
      },
    });
    onUpdated();
    void logQuery.refetch();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        log
          ? `Daily log — ${formatProjectDate(log.logDate)}`
          : 'Daily log detail'
      }
      size="large"
      destroyOnHidden
    >
      {logQuery.isLoading && (
        <div className="flex justify-center py-12">
          <Spin />
        </div>
      )}

      {logQuery.isError && (
        <p className="text-sm text-slate-500">
          {logQuery.error instanceof ApiRequestError
            ? logQuery.error.message
            : 'Unable to load daily log.'}
        </p>
      )}

      {log && (
        <div className="space-y-6">
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="Date">
              {formatProjectDate(log.logDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Shift">
              {log.shift ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Site engineer" span={2}>
              {resolveUserName(log.siteEngineerId)}
            </Descriptions.Item>
            <Descriptions.Item label="Status" span={2}>
              {log.status}
            </Descriptions.Item>
          </Descriptions>

          <FormLayout title="Weather & work summary">
            <Form<DailyLogEditValues>
              form={form}
              layout="vertical"
              onFinish={(values: DailyLogEditValues) => void handleSave(values)}
            >
              <Form.Item label="Weather" name="weatherCondition">
                <Input />
              </Form.Item>
              <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
                <Form.Item label="Temperature (°C)" name="temperatureC">
                  <InputNumber className="!w-full" />
                </Form.Item>
                <Form.Item label="Rainfall (mm)" name="rainfallMm">
                  <InputNumber className="!w-full" min={0} />
                </Form.Item>
              </div>
              <Form.Item label="Work summary" name="workSummary">
                <Input.TextArea rows={4} />
              </Form.Item>
              <button
                type="submit"
                disabled={updateDailyLog.isPending}
                className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {updateDailyLog.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </Form>
          </FormLayout>

          <FormLayout title="Workforce on site">
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={log.workforce}
              locale={{ emptyText: 'No workforce recorded' }}
              columns={[
                { title: 'Trade', dataIndex: 'trade', key: 'trade' },
                {
                  title: 'Contractor',
                  dataIndex: 'contractor',
                  key: 'contractor',
                  render: (value: string | null) => value ?? '—',
                },
                {
                  title: 'Workers',
                  dataIndex: 'workerCount',
                  key: 'workerCount',
                },
              ]}
            />
          </FormLayout>

          <FormLayout title="Equipment">
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={log.equipment}
              locale={{ emptyText: 'No equipment recorded' }}
              columns={[
                {
                  title: 'Type',
                  dataIndex: 'equipmentType',
                  key: 'equipmentType',
                },
                { title: 'Qty', dataIndex: 'quantity', key: 'quantity' },
                {
                  title: 'Hours used',
                  dataIndex: 'hoursUsed',
                  key: 'hoursUsed',
                  render: (value: string | null) => value ?? '—',
                },
              ]}
            />
          </FormLayout>

          <FormLayout title="Visitors">
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={log.visitors}
              locale={{ emptyText: 'No visitors recorded' }}
              columns={[
                {
                  title: 'Name',
                  dataIndex: 'visitorName',
                  key: 'visitorName',
                },
                {
                  title: 'Company',
                  dataIndex: 'company',
                  key: 'company',
                  render: (value: string | null) => value ?? '—',
                },
                {
                  title: 'Purpose',
                  dataIndex: 'purpose',
                  key: 'purpose',
                  render: (value: string | null) => value ?? '—',
                },
              ]}
            />
          </FormLayout>

          <FormLayout title="Incidents">
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={log.incidents}
              locale={{ emptyText: 'No incidents recorded' }}
              columns={[
                {
                  title: 'Type',
                  dataIndex: 'incidentType',
                  key: 'incidentType',
                },
                {
                  title: 'Severity',
                  dataIndex: 'severity',
                  key: 'severity',
                  render: (value: string | null) => value ?? '—',
                },
                {
                  title: 'Description',
                  dataIndex: 'description',
                  key: 'description',
                  ellipsis: true,
                },
              ]}
            />
          </FormLayout>

          <DocumentAttachmentPanel
            readOnly
            title="Site photos"
            description="Photo and video attachments will be enabled when document folders are linked to this log."
          />
        </div>
      )}
    </Drawer>
  );
}
