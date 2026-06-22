'use client';

import { useState } from 'react';
import {
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Spin,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  DailyLogEquipment,
  DailyLogIncident,
  DailyLogVisitor,
  DailyLogWorkforce,
} from '@/lib/api/project-management.types';
import { DAILY_LOG_WORKFLOW } from '@/lib/api/workflow';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useAddDailyLogEquipment,
  useAddDailyLogIncident,
  useAddDailyLogVisitor,
  useAddDailyLogWorkforce,
  useDailyLog,
  useDeleteDailyLog,
  useRemoveDailyLogEquipment,
  useRemoveDailyLogIncident,
  useRemoveDailyLogVisitor,
  useRemoveDailyLogWorkforce,
  useUpdateDailyLog,
} from '@/lib/query/daily-logs';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  dailyLogStatusVariant,
  formatDailyLogStatus,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface DailyLogEditValues {
  weatherCondition?: string;
  temperatureC?: number;
  rainfallMm?: number;
  workSummary?: string;
}

interface WorkforceFormValues {
  trade: string;
  contractor?: string;
  workerCount: number;
}

interface EquipmentFormValues {
  equipmentType: string;
  quantity?: number;
  hoursUsed?: number;
  hoursDowntime?: number;
}

interface VisitorFormValues {
  visitorName: string;
  company?: string;
  purpose?: string;
}

interface IncidentFormValues {
  incidentType: string;
  description: string;
  severity?: string;
}

const INCIDENT_SEVERITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
];

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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm] = Form.useForm<DailyLogEditValues>();
  const [workforceForm] = Form.useForm<WorkforceFormValues>();
  const [equipmentForm] = Form.useForm<EquipmentFormValues>();
  const [visitorForm] = Form.useForm<VisitorFormValues>();
  const [incidentForm] = Form.useForm<IncidentFormValues>();

  const open = Boolean(dailyLogId);
  const resolveUserName = useUserNameLookup();
  const messageApi = useAppMessage();

  const logQuery = useDailyLog(projectId, dailyLogId ?? '', open);
  const updateDailyLog = useUpdateDailyLog();
  const deleteDailyLog = useDeleteDailyLog();
  const addWorkforce = useAddDailyLogWorkforce();
  const removeWorkforce = useRemoveDailyLogWorkforce();
  const addEquipment = useAddDailyLogEquipment();
  const removeEquipment = useRemoveDailyLogEquipment();
  const addVisitor = useAddDailyLogVisitor();
  const removeVisitor = useRemoveDailyLogVisitor();
  const addIncident = useAddDailyLogIncident();
  const removeIncident = useRemoveDailyLogIncident();

  const log = logQuery.data;
  const isEditable = log?.status === 'DRAFT';

  async function handleSave(values: DailyLogEditValues): Promise<void> {
    if (!dailyLogId) {
      return;
    }
    try {
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
      messageApi.success('Daily log updated');
      onUpdated();
      void logQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update daily log', messageApi);
    }
  }

  async function handleStatusChange(status: string): Promise<void> {
    if (!dailyLogId) {
      return;
    }
    try {
      await updateDailyLog.mutateAsync({
        projectId,
        dailyLogId,
        body: { status },
      });
      messageApi.success('Status updated');
      onUpdated();
      void logQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update status', messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!dailyLogId) {
      return;
    }
    try {
      await deleteDailyLog.mutateAsync({ projectId, dailyLogId });
      messageApi.success('Daily log deleted');
      setDeleteOpen(false);
      onUpdated();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to delete daily log', messageApi);
    }
  }

  async function handleAddWorkforce(values: WorkforceFormValues): Promise<void> {
    if (!dailyLogId) {
      return;
    }
    try {
      await addWorkforce.mutateAsync({
        projectId,
        dailyLogId,
        body: {
          trade: values.trade.trim(),
          contractor: values.contractor?.trim() || undefined,
          workerCount: values.workerCount,
        },
      });
      workforceForm.resetFields();
      messageApi.success('Workforce entry added');
      void logQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to add workforce entry', messageApi);
    }
  }

  async function handleAddEquipment(values: EquipmentFormValues): Promise<void> {
    if (!dailyLogId) {
      return;
    }
    try {
      await addEquipment.mutateAsync({
        projectId,
        dailyLogId,
        body: {
          equipmentType: values.equipmentType.trim(),
          quantity: values.quantity,
          hoursUsed: values.hoursUsed,
          hoursDowntime: values.hoursDowntime,
        },
      });
      equipmentForm.resetFields();
      messageApi.success('Equipment entry added');
      void logQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to add equipment entry', messageApi);
    }
  }

  async function handleAddVisitor(values: VisitorFormValues): Promise<void> {
    if (!dailyLogId) {
      return;
    }
    try {
      await addVisitor.mutateAsync({
        projectId,
        dailyLogId,
        body: {
          visitorName: values.visitorName.trim(),
          company: values.company?.trim() || undefined,
          purpose: values.purpose?.trim() || undefined,
        },
      });
      visitorForm.resetFields();
      messageApi.success('Visitor added');
      void logQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to add visitor', messageApi);
    }
  }

  async function handleAddIncident(values: IncidentFormValues): Promise<void> {
    if (!dailyLogId) {
      return;
    }
    try {
      await addIncident.mutateAsync({
        projectId,
        dailyLogId,
        body: {
          incidentType: values.incidentType.trim(),
          description: values.description.trim(),
          severity: values.severity,
        },
      });
      incidentForm.resetFields();
      messageApi.success('Incident recorded');
      void logQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to record incident', messageApi);
    }
  }

  const workforceColumns: ColumnsType<DailyLogWorkforce> = [
    { title: 'Trade', dataIndex: 'trade', key: 'trade' },
    {
      title: 'Contractor',
      dataIndex: 'contractor',
      key: 'contractor',
      render: (value: string | null) => value ?? '—',
    },
    { title: 'Workers', dataIndex: 'workerCount', key: 'workerCount' },
    ...(isEditable
      ? [
          {
            title: '',
            key: 'actions',
            width: 48,
            render: (_: unknown, record: DailyLogWorkforce) => (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={removeWorkforce.isPending}
                onClick={() =>
                  void removeWorkforce
                    .mutateAsync({
                      projectId,
                      dailyLogId: dailyLogId!,
                      workforceId: record.id,
                    })
                    .then(() => void logQuery.refetch())
                    .catch((error: unknown) =>
                      notifyApiError(
                        error,
                        'Failed to remove workforce entry',
                        messageApi,
                      ),
                    )
                }
              />
            ),
          },
        ]
      : []),
  ];

  const equipmentColumns: ColumnsType<DailyLogEquipment> = [
    { title: 'Type', dataIndex: 'equipmentType', key: 'equipmentType' },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity' },
    {
      title: 'Hours used',
      dataIndex: 'hoursUsed',
      key: 'hoursUsed',
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Downtime',
      dataIndex: 'hoursDowntime',
      key: 'hoursDowntime',
      render: (value: string | null) => value ?? '—',
    },
    ...(isEditable
      ? [
          {
            title: '',
            key: 'actions',
            width: 48,
            render: (_: unknown, record: DailyLogEquipment) => (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={removeEquipment.isPending}
                onClick={() =>
                  void removeEquipment
                    .mutateAsync({
                      projectId,
                      dailyLogId: dailyLogId!,
                      equipmentId: record.id,
                    })
                    .then(() => void logQuery.refetch())
                    .catch((error: unknown) =>
                      notifyApiError(
                        error,
                        'Failed to remove equipment entry',
                        messageApi,
                      ),
                    )
                }
              />
            ),
          },
        ]
      : []),
  ];

  const visitorColumns: ColumnsType<DailyLogVisitor> = [
    { title: 'Name', dataIndex: 'visitorName', key: 'visitorName' },
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
    ...(isEditable
      ? [
          {
            title: '',
            key: 'actions',
            width: 48,
            render: (_: unknown, record: DailyLogVisitor) => (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={removeVisitor.isPending}
                onClick={() =>
                  void removeVisitor
                    .mutateAsync({
                      projectId,
                      dailyLogId: dailyLogId!,
                      visitorId: record.id,
                    })
                    .then(() => void logQuery.refetch())
                    .catch((error: unknown) =>
                      notifyApiError(error, 'Failed to remove visitor', messageApi),
                    )
                }
              />
            ),
          },
        ]
      : []),
  ];

  const incidentColumns: ColumnsType<DailyLogIncident> = [
    { title: 'Type', dataIndex: 'incidentType', key: 'incidentType' },
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
    ...(isEditable
      ? [
          {
            title: '',
            key: 'actions',
            width: 48,
            render: (_: unknown, record: DailyLogIncident) => (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={removeIncident.isPending}
                onClick={() =>
                  void removeIncident
                    .mutateAsync({
                      projectId,
                      dailyLogId: dailyLogId!,
                      incidentId: record.id,
                    })
                    .then(() => void logQuery.refetch())
                    .catch((error: unknown) =>
                      notifyApiError(
                        error,
                        'Failed to remove incident',
                        messageApi,
                      ),
                    )
                }
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
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
        extra={
          log && isEditable ? (
            <Button danger onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          ) : undefined
        }
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
            <WorkflowStepper
              steps={DAILY_LOG_WORKFLOW}
              currentStatus={log.status}
            />

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
              <Descriptions.Item label="Status">
                <StatusBadge
                  label={formatDailyLogStatus(log.status)}
                  variant={dailyLogStatusVariant(log.status)}
                />
              </Descriptions.Item>
              <Descriptions.Item label="Total workers">
                {log.totalWorkers}
              </Descriptions.Item>
            </Descriptions>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                Update status
              </p>
              <Select
                className="w-full max-w-xs"
                value={log.status}
                onChange={(value: string) => void handleStatusChange(value)}
                loading={updateDailyLog.isPending}
                options={DAILY_LOG_WORKFLOW.map((step) => ({
                  value: step.key,
                  label: step.label,
                }))}
              />
            </div>

            <FormLayout title="Weather & work summary">
              <Form<DailyLogEditValues>
                form={editForm}
                key={log.id}
                layout="vertical"
                initialValues={{
                  weatherCondition: log.weatherCondition ?? undefined,
                  temperatureC: log.temperatureC
                    ? Number(log.temperatureC)
                    : undefined,
                  rainfallMm: log.rainfallMm ? Number(log.rainfallMm) : undefined,
                  workSummary: log.workSummary ?? undefined,
                }}
                onFinish={(values: DailyLogEditValues) => void handleSave(values)}
              >
                <Form.Item label="Weather" name="weatherCondition">
                  <Input disabled={!isEditable} />
                </Form.Item>
                <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
                  <Form.Item label="Temperature (°C)" name="temperatureC">
                    <InputNumber className="!w-full" disabled={!isEditable} />
                  </Form.Item>
                  <Form.Item label="Rainfall (mm)" name="rainfallMm">
                    <InputNumber
                      className="!w-full"
                      min={0}
                      disabled={!isEditable}
                    />
                  </Form.Item>
                </div>
                <Form.Item label="Work summary" name="workSummary">
                  <Input.TextArea rows={4} disabled={!isEditable} />
                </Form.Item>
                {isEditable && (
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={updateDailyLog.isPending}
                  >
                    Save changes
                  </Button>
                )}
              </Form>
            </FormLayout>

            <FormLayout title="Workforce on site">
              <DataTable
                size="small"
                rowKey="id"
                dataSource={log.workforce}
                locale={{ emptyText: 'No workforce recorded' }}
                columns={workforceColumns}
              />
              {isEditable && (
                <Form<WorkforceFormValues>
                  form={workforceForm}
                  layout="vertical"
                  className="mt-4"
                  onFinish={(values: WorkforceFormValues) =>
                    void handleAddWorkforce(values)
                  }
                >
                  <div className="grid gap-4 md:grid-cols-3 md:gap-x-4">
                    <Form.Item
                      label="Trade"
                      name="trade"
                      rules={[{ required: true, message: 'Trade is required' }]}
                    >
                      <Input placeholder="e.g. Carpenter" />
                    </Form.Item>
                    <Form.Item label="Contractor" name="contractor">
                      <Input placeholder="Subcontractor name" />
                    </Form.Item>
                    <Form.Item
                      label="Workers"
                      name="workerCount"
                      rules={[{ required: true, message: 'Count is required' }]}
                      initialValue={1}
                    >
                      <InputNumber className="!w-full" min={1} />
                    </Form.Item>
                  </div>
                  <Button
                    type="dashed"
                    htmlType="submit"
                    icon={<PlusOutlined />}
                    loading={addWorkforce.isPending}
                  >
                    Add workforce
                  </Button>
                </Form>
              )}
            </FormLayout>

            <FormLayout title="Equipment">
              <DataTable
                size="small"
                rowKey="id"
                dataSource={log.equipment}
                locale={{ emptyText: 'No equipment recorded' }}
                columns={equipmentColumns}
              />
              {isEditable && (
                <Form<EquipmentFormValues>
                  form={equipmentForm}
                  layout="vertical"
                  className="mt-4"
                  onFinish={(values: EquipmentFormValues) =>
                    void handleAddEquipment(values)
                  }
                >
                  <div className="grid gap-4 md:grid-cols-4 md:gap-x-4">
                    <Form.Item
                      label="Equipment type"
                      name="equipmentType"
                      rules={[{ required: true, message: 'Type is required' }]}
                    >
                      <Input placeholder="e.g. Excavator" />
                    </Form.Item>
                    <Form.Item label="Quantity" name="quantity" initialValue={1}>
                      <InputNumber className="!w-full" min={1} />
                    </Form.Item>
                    <Form.Item label="Hours used" name="hoursUsed">
                      <InputNumber className="!w-full" min={0} />
                    </Form.Item>
                    <Form.Item label="Downtime (hrs)" name="hoursDowntime">
                      <InputNumber className="!w-full" min={0} />
                    </Form.Item>
                  </div>
                  <Button
                    type="dashed"
                    htmlType="submit"
                    icon={<PlusOutlined />}
                    loading={addEquipment.isPending}
                  >
                    Add equipment
                  </Button>
                </Form>
              )}
            </FormLayout>

            <FormLayout title="Visitors">
              <DataTable
                size="small"
                rowKey="id"
                dataSource={log.visitors}
                locale={{ emptyText: 'No visitors recorded' }}
                columns={visitorColumns}
              />
              {isEditable && (
                <Form<VisitorFormValues>
                  form={visitorForm}
                  layout="vertical"
                  className="mt-4"
                  onFinish={(values: VisitorFormValues) =>
                    void handleAddVisitor(values)
                  }
                >
                  <div className="grid gap-4 md:grid-cols-3 md:gap-x-4">
                    <Form.Item
                      label="Visitor name"
                      name="visitorName"
                      rules={[{ required: true, message: 'Name is required' }]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item label="Company" name="company">
                      <Input />
                    </Form.Item>
                    <Form.Item label="Purpose" name="purpose">
                      <Input />
                    </Form.Item>
                  </div>
                  <Button
                    type="dashed"
                    htmlType="submit"
                    icon={<PlusOutlined />}
                    loading={addVisitor.isPending}
                  >
                    Add visitor
                  </Button>
                </Form>
              )}
            </FormLayout>

            <FormLayout title="Incidents">
              <DataTable
                size="small"
                rowKey="id"
                dataSource={log.incidents}
                locale={{ emptyText: 'No incidents recorded' }}
                columns={incidentColumns}
              />
              {isEditable && (
                <Form<IncidentFormValues>
                  form={incidentForm}
                  layout="vertical"
                  className="mt-4"
                  onFinish={(values: IncidentFormValues) =>
                    void handleAddIncident(values)
                  }
                >
                  <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
                    <Form.Item
                      label="Incident type"
                      name="incidentType"
                      rules={[{ required: true, message: 'Type is required' }]}
                    >
                      <Input placeholder="e.g. Near miss, injury" />
                    </Form.Item>
                    <Form.Item label="Severity" name="severity">
                      <Select
                        allowClear
                        options={INCIDENT_SEVERITY_OPTIONS}
                        placeholder="Select severity"
                      />
                    </Form.Item>
                  </div>
                  <Form.Item
                    label="Description"
                    name="description"
                    rules={[
                      { required: true, message: 'Description is required' },
                    ]}
                  >
                    <Input.TextArea rows={2} />
                  </Form.Item>
                  <Button
                    type="dashed"
                    htmlType="submit"
                    icon={<PlusOutlined />}
                    loading={addIncident.isPending}
                  >
                    Record incident
                  </Button>
                </Form>
              )}
            </FormLayout>

            <DocumentAttachmentPanel
              folderId={log.attachmentFolderId ?? undefined}
              readOnly={!isEditable}
              title="Site photos"
              description="Upload site photos and videos for this daily log."
            />
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete daily log?"
        description="This will permanently remove the daily log and all its entries."
        confirmLabel="Delete"
        danger
        confirmLoading={deleteDailyLog.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
