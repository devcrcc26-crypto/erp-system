'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Collapse,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Tabs,
} from 'antd';
import { ArrowLeft } from 'lucide-react';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ProjectTeamUserSelect from '@/components/ui/ProjectTeamUserSelect/ProjectTeamUserSelect';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  DailyLogEquipment,
  DailyLogIncident,
  DailyLogMaterial,
  DailyLogVisitor,
  DailyLogWorkforce,
  UpdateDailyLogRequest,
} from '@/lib/api/project-management.types';
import {
  useAddDailyLogEquipment,
  useAddDailyLogIncident,
  useAddDailyLogMaterial,
  useAddDailyLogVisitor,
  useAddDailyLogWorkforce,
  useApproveDailyLog,
  useDailyLog,
  useRecallDailyLog,
  useRemoveDailyLogEquipment,
  useRemoveDailyLogIncident,
  useRemoveDailyLogMaterial,
  useRemoveDailyLogVisitor,
  useRemoveDailyLogWorkforce,
  useSubmitDailyLog,
  useUpdateDailyLog,
} from '@/lib/query/daily-logs';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  dailyLogStatusVariant,
  formatDailyLogStatus,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useAuthStore } from '@/stores/auth.store';
import { useEpcCapabilities } from '@/hooks/use-pm-capabilities';
import {
  SHIFT_OPTIONS,
  WEATHER_OPTIONS,
  RAINFALL_OPTIONS,
  VISITOR_PURPOSE_OPTIONS,
  INCIDENT_TYPE_OPTIONS,
  INCIDENT_SEVERITY_OPTIONS,
} from './daily-log-options';

interface EditLogValues {
  shift?: string;
  contractorName?: string;
  supervisorId?: string;
  weatherCondition?: string;
  temperatureC?: number;
  rainfallLevel?: string;
  humidity?: number;
  workDescription?: string;
  issues?: string;
  delays?: string;
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

interface MaterialFormValues {
  materialType: string;
  quantity: number;
  unit: string;
  supplier?: string;
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

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}): React.ReactNode {
  return (
    <div className="mb-3">
      <h3 className={layout.drawerHeading}>{title}</h3>
      {description && (
        <p className={`mt-0.5 ${layout.drawerMutedText}`}>{description}</p>
      )}
    </div>
  );
}

function AddEntryCollapse({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): React.ReactNode {
  return (
    <Collapse
      ghost
      className="!mt-2"
      items={[
        {
          key: 'add',
          label: (
            <span className="text-sm font-medium text-[var(--color-primary)]">
              {label}
            </span>
          ),
          children: <div className="pt-1">{children}</div>,
        },
      ]}
    />
  );
}

export default function DailyLogDetailPageContent({
  projectId,
  logId,
}: {
  projectId: string;
  logId: string;
}): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const resolveUserDisplay = useUserDisplayResolver();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const epc = useEpcCapabilities();

  const [activeTab, setActiveTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [editForm] = Form.useForm<EditLogValues>();
  const [workforceForm] = Form.useForm<WorkforceFormValues>();
  const [equipmentForm] = Form.useForm<EquipmentFormValues>();
  const [materialForm] = Form.useForm<MaterialFormValues>();
  const [visitorForm] = Form.useForm<VisitorFormValues>();
  const [incidentForm] = Form.useForm<IncidentFormValues>();

  const logQuery = useDailyLog(projectId, logId);
  const updateLog = useUpdateDailyLog();
  const submitLog = useSubmitDailyLog();
  const recallLog = useRecallDailyLog();
  const approveLog = useApproveDailyLog();
  const addWorkforce = useAddDailyLogWorkforce();
  const removeWorkforce = useRemoveDailyLogWorkforce();
  const addEquipment = useAddDailyLogEquipment();
  const removeEquipment = useRemoveDailyLogEquipment();
  const addMaterial = useAddDailyLogMaterial();
  const removeMaterial = useRemoveDailyLogMaterial();
  const addVisitor = useAddDailyLogVisitor();
  const removeVisitor = useRemoveDailyLogVisitor();
  const addIncident = useAddDailyLogIncident();
  const removeIncident = useRemoveDailyLogIncident();

  const log = logQuery.data;

  const isCreator = Boolean(currentUserId && log?.siteEngineerId === currentUserId);
  const isSupervisor = Boolean(currentUserId && log?.supervisorId === currentUserId);
  const canEdit =
    (log?.status === 'DRAFT' || log?.status === 'SUBMITTED') &&
    (isCreator || isSupervisor || epc.navFullAccess);
  const canEditChildren =
    log?.status !== 'APPROVED' && (isCreator || isSupervisor || epc.navFullAccess);

  async function handleEditSave(values: EditLogValues): Promise<void> {
    try {
      const body: UpdateDailyLogRequest = {
        shift: values.shift,
        contractorName: values.contractorName?.trim() || undefined,
        supervisorId: values.supervisorId || undefined,
        weatherCondition: values.weatherCondition,
        temperatureC: values.temperatureC,
        rainfallLevel: values.rainfallLevel || undefined,
        humidity: values.humidity,
        workDescription: values.workDescription?.trim() || undefined,
        issues: values.issues?.trim() || undefined,
        delays: values.delays?.trim() || undefined,
      };
      await updateLog.mutateAsync({ projectId, dailyLogId: logId, body });
      messageApi.success('Daily log updated');
      setEditOpen(false);
    } catch (error) {
      notifyApiError(error, 'Failed to update daily log', messageApi);
    }
  }

  async function handleSubmit(): Promise<void> {
    try {
      await submitLog.mutateAsync({ projectId, dailyLogId: logId });
      messageApi.success('Daily log submitted for approval');
    } catch (error) {
      notifyApiError(error, 'Failed to submit daily log', messageApi);
    }
  }

  async function handleRecall(): Promise<void> {
    try {
      await recallLog.mutateAsync({ projectId, dailyLogId: logId });
      messageApi.success('Daily log recalled to draft');
    } catch (error) {
      notifyApiError(error, 'Failed to recall daily log', messageApi);
    }
  }

  async function handleApprove(): Promise<void> {
    try {
      await approveLog.mutateAsync({ projectId, dailyLogId: logId });
      messageApi.success('Daily log approved');
    } catch (error) {
      notifyApiError(error, 'Failed to approve daily log', messageApi);
    }
  }

  async function handleAddWorkforce(values: WorkforceFormValues): Promise<void> {
    try {
      await addWorkforce.mutateAsync({
        projectId,
        dailyLogId: logId,
        body: {
          trade: values.trade.trim(),
          contractor: values.contractor?.trim() || undefined,
          workerCount: values.workerCount,
        },
      });
      workforceForm.resetFields();
      messageApi.success('Workforce entry added');
    } catch (error) {
      notifyApiError(error, 'Failed to add workforce entry', messageApi);
    }
  }

  async function handleAddEquipment(values: EquipmentFormValues): Promise<void> {
    try {
      await addEquipment.mutateAsync({
        projectId,
        dailyLogId: logId,
        body: {
          equipmentType: values.equipmentType.trim(),
          quantity: values.quantity,
          hoursUsed: values.hoursUsed,
          hoursDowntime: values.hoursDowntime,
        },
      });
      equipmentForm.resetFields();
      messageApi.success('Equipment entry added');
    } catch (error) {
      notifyApiError(error, 'Failed to add equipment', messageApi);
    }
  }

  async function handleAddMaterial(values: MaterialFormValues): Promise<void> {
    try {
      await addMaterial.mutateAsync({
        projectId,
        dailyLogId: logId,
        body: {
          materialType: values.materialType.trim(),
          quantity: values.quantity,
          unit: values.unit.trim(),
          supplier: values.supplier?.trim() || undefined,
        },
      });
      materialForm.resetFields();
      messageApi.success('Material entry added');
    } catch (error) {
      notifyApiError(error, 'Failed to add material', messageApi);
    }
  }

  async function handleAddVisitor(values: VisitorFormValues): Promise<void> {
    try {
      await addVisitor.mutateAsync({
        projectId,
        dailyLogId: logId,
        body: {
          visitorName: values.visitorName.trim(),
          company: values.company?.trim() || undefined,
          purpose: values.purpose?.trim() ?? '',
        },
      });
      visitorForm.resetFields();
      messageApi.success('Visitor added');
    } catch (error) {
      notifyApiError(error, 'Failed to add visitor', messageApi);
    }
  }

  async function handleAddIncident(values: IncidentFormValues): Promise<void> {
    try {
      await addIncident.mutateAsync({
        projectId,
        dailyLogId: logId,
        body: {
          incidentType: values.incidentType.trim(),
          description: values.description.trim(),
          severity: values.severity ?? 'MINOR',
        },
      });
      incidentForm.resetFields();
      messageApi.success('Incident recorded');
    } catch (error) {
      notifyApiError(error, 'Failed to record incident', messageApi);
    }
  }

  function deleteRowAction<T extends { id: string }>(
    mutate: (id: string) => Promise<unknown>,
    errorMsg: string,
  ): ColumnsType<T>[number] {
    return {
      title: '',
      key: 'actions',
      width: 48,
      render: (_: unknown, record: T) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() =>
            void mutate(record.id).catch((err: unknown) =>
              notifyApiError(err, errorMsg, messageApi),
            )
          }
        />
      ),
    };
  }

  const workforceColumns = useMemo((): ColumnsType<DailyLogWorkforce> => [
    { title: 'Trade', dataIndex: 'trade', key: 'trade' },
    {
      title: 'Contractor',
      dataIndex: 'contractor',
      key: 'contractor',
      render: (v: string | null) => v ?? '-',
    },
    { title: 'Workers', dataIndex: 'workerCount', key: 'workerCount', width: 90 },
    ...(canEditChildren
      ? [
          deleteRowAction<DailyLogWorkforce>(
            (id) =>
              removeWorkforce.mutateAsync({
                projectId,
                dailyLogId: logId,
                workforceId: id,
              }),
            'Failed to remove workforce entry',
          ),
        ]
      : []),
  ], [canEditChildren, logId, projectId, removeWorkforce]);

  const equipmentColumns = useMemo((): ColumnsType<DailyLogEquipment> => [
    { title: 'Type', dataIndex: 'equipmentType', key: 'equipmentType' },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 70 },
    {
      title: 'Hours used',
      dataIndex: 'hoursUsed',
      key: 'hoursUsed',
      width: 100,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: 'Downtime',
      dataIndex: 'hoursDowntime',
      key: 'hoursDowntime',
      width: 100,
      render: (v: string | null) => v ?? '-',
    },
    ...(canEditChildren
      ? [
          deleteRowAction<DailyLogEquipment>(
            (id) =>
              removeEquipment.mutateAsync({
                projectId,
                dailyLogId: logId,
                equipmentId: id,
              }),
            'Failed to remove equipment',
          ),
        ]
      : []),
  ], [canEditChildren, logId, projectId, removeEquipment]);

  const materialColumns = useMemo((): ColumnsType<DailyLogMaterial> => [
    { title: 'Material', dataIndex: 'materialType', key: 'materialType' },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 80 },
    { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: 'Supplier',
      dataIndex: 'supplier',
      key: 'supplier',
      render: (v: string | null) => v ?? '-',
    },
    ...(canEditChildren
      ? [
          deleteRowAction<DailyLogMaterial>(
            (id) =>
              removeMaterial.mutateAsync({
                projectId,
                dailyLogId: logId,
                materialId: id,
              }),
            'Failed to remove material',
          ),
        ]
      : []),
  ], [canEditChildren, logId, projectId, removeMaterial]);

  const visitorColumns = useMemo((): ColumnsType<DailyLogVisitor> => [
    { title: 'Name', dataIndex: 'visitorName', key: 'visitorName' },
    {
      title: 'Company',
      dataIndex: 'company',
      key: 'company',
      render: (v: string | null) => v ?? '-',
    },
    {
      title: 'Purpose',
      dataIndex: 'purpose',
      key: 'purpose',
      render: (v: string | null) => v ?? '-',
    },
    ...(canEditChildren
      ? [
          deleteRowAction<DailyLogVisitor>(
            (id) =>
              removeVisitor.mutateAsync({
                projectId,
                dailyLogId: logId,
                visitorId: id,
              }),
            'Failed to remove visitor',
          ),
        ]
      : []),
  ], [canEditChildren, logId, projectId, removeVisitor]);

  const incidentColumns = useMemo((): ColumnsType<DailyLogIncident> => [
    { title: 'Type', dataIndex: 'incidentType', key: 'incidentType', width: 160 },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: 110,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    ...(canEditChildren
      ? [
          deleteRowAction<DailyLogIncident>(
            (id) =>
              removeIncident.mutateAsync({
                projectId,
                dailyLogId: logId,
                incidentId: id,
              }),
            'Failed to remove incident',
          ),
        ]
      : []),
  ], [canEditChildren, logId, projectId, removeIncident]);

  if (logQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (logQuery.isError || !log) {
    return (
      <Alert
        type="error"
        showIcon
        title="Unable to load daily log"
        description={
          logQuery.error instanceof ApiRequestError
            ? logQuery.error.message
            : 'Please refresh the page.'
        }
        className="m-6"
      />
    );
  }

  const siteActivityCount =
    (log.workforce?.length ?? 0) +
    (log.equipment?.length ?? 0) +
    (log.materials?.length ?? 0);
  const visitorCount = log.visitors?.length ?? 0;
  const incidentCount = log.incidents?.length ?? 0;

  return (
    <div className={layout.pageStack}>
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}/daily-logs`)}
            className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft size={14} />
            Back to logs
          </button>
          <span className="text-[var(--color-border)]">/</span>
          <h1 className="text-base font-semibold leading-tight text-[var(--color-text-primary)]">
            {log.logNumber?.trim() || formatProjectDate(log.logDate)}
          </h1>
          <StatusBadge
            label={formatDailyLogStatus(log.status)}
            variant={dailyLogStatusVariant(log.status)}
          />
        </div>
        {canEdit && (
          <Button onClick={() => setEditOpen(true)}>Edit log</Button>
        )}
      </div>

      {/* Main content with tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        destroyOnHidden
        items={[
          {
            key: 'overview',
            label: 'Overview',
            children: (
              <div className="flex flex-col gap-6">
                <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                  <Descriptions
                    className={layout.drawerDescriptionsClass}
                    column={{ xs: 1, sm: 2 }}
                    size="small"
                    bordered
                  >
                    <Descriptions.Item label="Log date">
                      {formatProjectDate(log.logDate)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Shift">
                      {log.shift ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Weather">
                      {log.weatherCondition ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Temperature">
                      {log.temperatureC != null ? `${log.temperatureC} °C` : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Rainfall">
                      {log.rainfallLevel ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Humidity">
                      {log.humidity != null ? `${log.humidity}%` : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Contractor">
                      {log.contractorName ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Supervisor">
                      {log.supervisorId
                        ? resolveUserDisplay(log.supervisorId, log.supervisorName)
                        : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Created by">
                      {resolveUserDisplay(log.siteEngineerId, log.siteEngineerName)}
                    </Descriptions.Item>
                    {log.submittedBy && (
                      <Descriptions.Item label="Submitted by">
                        {resolveUserDisplay(log.submittedBy, log.submittedByName)}
                        {log.submittedAt
                          ? ` on ${formatProjectDate(log.submittedAt)}`
                          : ''}
                      </Descriptions.Item>
                    )}
                    {log.approvedBy && (
                      <Descriptions.Item label="Approved by">
                        {resolveUserDisplay(log.approvedBy, log.approvedByName)}
                        {log.approvedAt
                          ? ` on ${formatProjectDate(log.approvedAt)}`
                          : ''}
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </div>

                {log.workDescription?.trim() && (
                  <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                    <p className={`mb-2 ${layout.drawerHeading}`}>Work description</p>
                    <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                      {log.workDescription}
                    </p>
                  </div>
                )}

                {log.issues?.trim() && (
                  <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                    <p className={`mb-2 ${layout.drawerHeading}`}>Issues / problems</p>
                    <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                      {log.issues}
                    </p>
                  </div>
                )}

                {log.delays?.trim() && (
                  <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                    <p className={`mb-2 ${layout.drawerHeading}`}>Delays</p>
                    <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                      {log.delays}
                    </p>
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'site-activity',
            label: (
              <span className="inline-flex items-center gap-2">
                Site activity
                {siteActivityCount > 0 && (
                  <Badge count={siteActivityCount} size="small" color="#F47B20" />
                )}
              </span>
            ),
            children: (
              <div className="flex flex-col gap-8">
                <div>
                  <SectionHeading
                    title="Workforce on site"
                    description="Trades and headcount recorded for this log."
                  />
                  {(log.workforce?.length ?? 0) > 0 && (
                    <p className={`mb-2 ${layout.drawerMutedText}`}>
                      Total workers:{' '}
                      <strong>
                        {log.workforce?.reduce((s, w) => s + w.workerCount, 0) ?? 0}
                      </strong>
                    </p>
                  )}
                  <DataTable
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={log.workforce ?? []}
                    columns={workforceColumns}
                    locale={{ emptyText: 'No workforce recorded' }}
                  />
                  {canEditChildren && (
                    <AddEntryCollapse label="+ Add workforce entry">
                      <Form<WorkforceFormValues>
                        form={workforceForm}
                        layout="vertical"
                        className="erp-drawer-form"
                        onFinish={(v) => void handleAddWorkforce(v)}
                      >
                        <div className="grid gap-4 sm:grid-cols-3">
                          <Form.Item
                            label="Trade"
                            name="trade"
                            rules={[{ required: true, message: 'Trade is required' }]}
                          >
                            <Input placeholder="e.g. Carpenter" />
                          </Form.Item>
                          <Form.Item label="Contractor" name="contractor">
                            <Input placeholder="Subcontractor" />
                          </Form.Item>
                          <Form.Item
                            label="Workers"
                            name="workerCount"
                            initialValue={1}
                            rules={[{ required: true, message: 'Count is required' }]}
                          >
                            <InputNumber className="!w-full" min={1} />
                          </Form.Item>
                        </div>
                        <Button
                          type="primary"
                          htmlType="submit"
                          icon={<PlusOutlined />}
                          loading={addWorkforce.isPending}
                        >
                          Add workforce
                        </Button>
                      </Form>
                    </AddEntryCollapse>
                  )}
                </div>

                <Divider className="!my-0" />

                <div>
                  <SectionHeading
                    title="Equipment"
                    description="Plant and equipment used on site."
                  />
                  <DataTable
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={log.equipment ?? []}
                    columns={equipmentColumns}
                    locale={{ emptyText: 'No equipment recorded' }}
                  />
                  {canEditChildren && (
                    <AddEntryCollapse label="+ Add equipment entry">
                      <Form<EquipmentFormValues>
                        form={equipmentForm}
                        layout="vertical"
                        className="erp-drawer-form"
                        onFinish={(v) => void handleAddEquipment(v)}
                      >
                        <div className="grid gap-4 sm:grid-cols-2">
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
                          type="primary"
                          htmlType="submit"
                          icon={<PlusOutlined />}
                          loading={addEquipment.isPending}
                        >
                          Add equipment
                        </Button>
                      </Form>
                    </AddEntryCollapse>
                  )}
                </div>

                <Divider className="!my-0" />

                <div>
                  <SectionHeading
                    title="Materials"
                    description="Materials delivered or consumed on site."
                  />
                  <DataTable
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={log.materials ?? []}
                    columns={materialColumns}
                    locale={{ emptyText: 'No materials recorded' }}
                  />
                  {canEditChildren && (
                    <AddEntryCollapse label="+ Add material entry">
                      <Form<MaterialFormValues>
                        form={materialForm}
                        layout="vertical"
                        className="erp-drawer-form"
                        onFinish={(v) => void handleAddMaterial(v)}
                      >
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Form.Item
                            label="Material type"
                            name="materialType"
                            rules={[{ required: true, message: 'Type is required' }]}
                          >
                            <Input placeholder="e.g. Ready-mix concrete" />
                          </Form.Item>
                          <Form.Item label="Supplier" name="supplier">
                            <Input placeholder="Supplier name" />
                          </Form.Item>
                          <Form.Item
                            label="Quantity"
                            name="quantity"
                            rules={[{ required: true, message: 'Quantity is required' }]}
                          >
                            <InputNumber className="!w-full" min={0} />
                          </Form.Item>
                          <Form.Item
                            label="Unit"
                            name="unit"
                            rules={[{ required: true, message: 'Unit is required' }]}
                          >
                            <Input placeholder="e.g. m³, kg, pcs" />
                          </Form.Item>
                        </div>
                        <Button
                          type="primary"
                          htmlType="submit"
                          icon={<PlusOutlined />}
                          loading={addMaterial.isPending}
                        >
                          Add material
                        </Button>
                      </Form>
                    </AddEntryCollapse>
                  )}
                </div>
              </div>
            ),
          },
          {
            key: 'visitors',
            label: (
              <span className="inline-flex items-center gap-2">
                Visitors
                {visitorCount > 0 && (
                  <Badge count={visitorCount} size="small" color="#F47B20" />
                )}
              </span>
            ),
            children: (
              <div>
                <SectionHeading
                  title="Visitors"
                  description="People who visited the site today."
                />
                <DataTable
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={log.visitors ?? []}
                  columns={visitorColumns}
                  locale={{ emptyText: 'No visitors recorded' }}
                />
                {canEditChildren && (
                  <AddEntryCollapse label="+ Add visitor">
                    <Form<VisitorFormValues>
                      form={visitorForm}
                      layout="vertical"
                      className="erp-drawer-form"
                      onFinish={(v) => void handleAddVisitor(v)}
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
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
                        <Form.Item
                          className="sm:col-span-2"
                          label="Purpose"
                          name="purpose"
                        >
                          <Select
                            allowClear
                            options={VISITOR_PURPOSE_OPTIONS}
                            placeholder="Select purpose"
                          />
                        </Form.Item>
                      </div>
                      <Button
                        type="primary"
                        htmlType="submit"
                        icon={<PlusOutlined />}
                        loading={addVisitor.isPending}
                      >
                        Add visitor
                      </Button>
                    </Form>
                  </AddEntryCollapse>
                )}
              </div>
            ),
          },
          {
            key: 'safety',
            label: (
              <span className="inline-flex items-center gap-2">
                Safety
                {incidentCount > 0 && (
                  <Badge count={incidentCount} size="small" color="red" />
                )}
              </span>
            ),
            children: (
              <div className="flex flex-col gap-4">
                {incidentCount > 0 ? (
                  <Alert
                    type="warning"
                    showIcon
                    title={`${incidentCount} incident${incidentCount !== 1 ? 's' : ''} recorded on this log`}
                  />
                ) : (
                  <Alert
                    type="success"
                    showIcon
                    title="No incidents recorded - good day!"
                  />
                )}
                <div>
                  <SectionHeading
                    title="Incidents"
                    description="Safety incidents, near misses, or notable events."
                  />
                  <DataTable
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={log.incidents ?? []}
                    columns={incidentColumns}
                    locale={{ emptyText: 'No incidents recorded' }}
                  />
                  {canEditChildren && (
                    <AddEntryCollapse label="+ Record incident">
                      <Form<IncidentFormValues>
                        form={incidentForm}
                        layout="vertical"
                        className="erp-drawer-form"
                        onFinish={(v) => void handleAddIncident(v)}
                      >
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Form.Item
                            label="Incident type"
                            name="incidentType"
                            rules={[{ required: true, message: 'Type is required' }]}
                          >
                            <Select
                              options={INCIDENT_TYPE_OPTIONS}
                              placeholder="Select type"
                            />
                          </Form.Item>
                          <Form.Item label="Severity" name="severity">
                            <Select
                              allowClear
                              options={INCIDENT_SEVERITY_OPTIONS}
                              placeholder="Select severity"
                            />
                          </Form.Item>
                          <Form.Item
                            className="sm:col-span-2"
                            label="Description"
                            name="description"
                            rules={[{ required: true, message: 'Description is required' }]}
                          >
                            <Input.TextArea rows={3} />
                          </Form.Item>
                        </div>
                        <Button
                          type="primary"
                          htmlType="submit"
                          icon={<PlusOutlined />}
                          loading={addIncident.isPending}
                        >
                          Record incident
                        </Button>
                      </Form>
                    </AddEntryCollapse>
                  )}
                </div>
              </div>
            ),
          },
          {
            key: 'files',
            label: 'Files',
            children: (
              <DocumentAttachmentPanel
                folderId={log.attachmentFolderId ?? undefined}
                readOnly={
                  log.status === 'APPROVED' &&
                  !isCreator &&
                  !isSupervisor &&
                  !epc.navFullAccess
                }
                title="Site files"
                description="Photos, documents, and other files for this daily log."
              />
            ),
          },
        ]}
      />

      {/* Sticky bottom workflow bar */}
      <div className="sticky bottom-0 z-10 rounded-b-lg border-t border-[var(--color-border-tertiary)] bg-white p-4">
        {log.status === 'DRAFT' && isCreator && (
          <div className="flex items-center justify-between gap-3">
            <span className={layout.drawerMutedText}>
              Ready to submit for approval?
            </span>
            <Button
              type="primary"
              loading={submitLog.isPending}
              onClick={() => void handleSubmit()}
            >
              Submit for approval
            </Button>
          </div>
        )}
        {log.status === 'SUBMITTED' && isCreator && (
          <div className="flex items-center justify-between gap-3">
            <span className={layout.drawerMutedText}>
              This log is pending approval.
            </span>
            <Button
              loading={recallLog.isPending}
              onClick={() => void handleRecall()}
            >
              Recall to draft
            </Button>
          </div>
        )}
        {log.status === 'SUBMITTED' &&
          !isCreator &&
          (isSupervisor || epc.navFullAccess) && (
            <div className="flex items-center justify-between gap-3">
              <span className={layout.drawerMutedText}>
                This log is awaiting your approval.
              </span>
              <Button
                type="primary"
                loading={approveLog.isPending}
                onClick={() => void handleApprove()}
              >
                Approve log
              </Button>
            </div>
          )}
        {log.status === 'APPROVED' && (
          <Alert
            type="success"
            showIcon
            title={
              log.approvedBy
                ? `Approved by ${resolveUserDisplay(log.approvedBy, log.approvedByName)}${log.approvedAt ? ` on ${formatProjectDate(log.approvedAt)}` : ''}`
                : 'Approved'
            }
          />
        )}
      </div>

      {/* Edit log drawer */}
      <Drawer
        {...wideDetailDrawerProps}
        open={editOpen}
        title="Edit daily log"
        onClose={() => setEditOpen(false)}
        destroyOnHidden
        afterOpenChange={(visible) => {
          if (visible && log) {
            editForm.setFieldsValue({
              shift: log.shift ?? undefined,
              contractorName: log.contractorName ?? undefined,
              supervisorId: log.supervisorId ?? undefined,
              weatherCondition: log.weatherCondition ?? undefined,
              temperatureC:
                log.temperatureC != null ? Number(log.temperatureC) : undefined,
              rainfallLevel: log.rainfallLevel ?? undefined,
              humidity: log.humidity != null ? Number(log.humidity) : undefined,
              workDescription: log.workDescription ?? undefined,
              issues: log.issues ?? undefined,
              delays: log.delays ?? undefined,
            });
          }
        }}
      >
        <Form<EditLogValues>
          form={editForm}
          layout="vertical"
          className="erp-drawer-form"
          onFinish={(v) => void handleEditSave(v)}
        >
          <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
            <Form.Item label="Shift" name="shift">
              <Select allowClear options={SHIFT_OPTIONS} placeholder="Select shift" />
            </Form.Item>
            <Form.Item label="Contractor name" name="contractorName">
              <Input />
            </Form.Item>
          </div>

          <Form.Item label="Supervisor" name="supervisorId">
            <ProjectTeamUserSelect
              projectId={projectId}
              placeholder="Optional supervisor"
            />
          </Form.Item>

          <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
            <Form.Item label="Weather" name="weatherCondition">
              <Select allowClear options={WEATHER_OPTIONS} placeholder="Select weather" />
            </Form.Item>
            <Form.Item label="Temperature (°C)" name="temperatureC">
              <InputNumber className="!w-full" />
            </Form.Item>
          </div>

          <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
            <Form.Item label="Rainfall" name="rainfallLevel">
              <Select allowClear options={RAINFALL_OPTIONS} placeholder="Select rainfall" />
            </Form.Item>
            <Form.Item label="Humidity (%)" name="humidity">
              <InputNumber className="!w-full" min={0} max={100} />
            </Form.Item>
          </div>

          <Form.Item label="Work description" name="workDescription">
            <Input.TextArea rows={4} />
          </Form.Item>

          <Form.Item label="Issues / problems" name="issues">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item label="Delays" name="delays">
            <Input.TextArea rows={3} />
          </Form.Item>

          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={updateLog.isPending}>
              Save changes
            </Button>
          </div>
        </Form>
      </Drawer>
    </div>
  );
}
