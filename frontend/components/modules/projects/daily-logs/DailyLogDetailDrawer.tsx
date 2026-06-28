// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Collapse,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Tabs,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  DailyLogDetail,
  DailyLogEquipment,
  DailyLogIncident,
  DailyLogVisitor,
  DailyLogWorkforce,
} from '@/lib/api/project-management.types';
import { DAILY_LOG_WORKFLOW } from '@/lib/api/workflow';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
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
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
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

function DrawerSection({
  title,
  description,
  children,
  bordered = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  bordered?: boolean;
}): React.ReactNode {
  return (
    <section
      className={
        bordered
          ? layout.drawerSection
          : 'flex flex-col gap-4 sm:gap-5'
      }
    >
      <div>
        <h3 className={layout.drawerHeading}>{title}</h3>
        {description && (
          <p className={`mt-1 ${layout.drawerMutedText}`}>{description}</p>
        )}
      </div>
      {children}
    </section>
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
            <span className="text-sm font-medium" style={{ color: tokens.colorTeal600 }}>
              {label}
            </span>
          ),
          children: <div className="pt-1">{children}</div>,
        },
      ]}
    />
  );
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [editForm] = Form.useForm<DailyLogEditValues>();
  const [workforceForm] = Form.useForm<WorkforceFormValues>();
  const [equipmentForm] = Form.useForm<EquipmentFormValues>();
  const [visitorForm] = Form.useForm<VisitorFormValues>();
  const [incidentForm] = Form.useForm<IncidentFormValues>();

  const open = Boolean(dailyLogId);
  const resolveUserDisplay = useUserDisplayResolver();
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
  const isDataLocked =
    log?.status === 'SUBMITTED' || log?.status === 'APPROVED';

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

  function deleteAction(
    onDelete: () => Promise<unknown>,
    errorMessage: string,
  ): React.ReactNode {
    return (
      <Button
        type="text"
        danger
        size="small"
        icon={<DeleteOutlined />}
        onClick={() =>
          void onDelete()
            .then(() => void logQuery.refetch())
            .catch((error: unknown) =>
              notifyApiError(error, errorMessage, messageApi),
            )
        }
      />
    );
  }

  const workforceColumns = useMemo((): ColumnsType<DailyLogWorkforce> => {
    if (!log || !dailyLogId) {
      return [];
    }

    return [
      { title: 'Trade', dataIndex: 'trade', key: 'trade' },
      {
        title: 'Contractor',
        dataIndex: 'contractor',
        key: 'contractor',
        render: (value: string | null) => value ?? '-',
      },
      { title: 'Workers', dataIndex: 'workerCount', key: 'workerCount', width: 90 },
      ...(isEditable
        ? [
            {
              title: '',
              key: 'actions',
              width: 48,
              render: (_: unknown, record: DailyLogWorkforce) =>
                deleteAction(
                  () =>
                    removeWorkforce.mutateAsync({
                      projectId,
                      dailyLogId,
                      workforceId: record.id,
                    }),
                  'Failed to remove workforce entry',
                ),
            },
          ]
        : []),
    ];
  }, [dailyLogId, isEditable, log, projectId, removeWorkforce]);

  const equipmentColumns = useMemo((): ColumnsType<DailyLogEquipment> => {
    if (!log || !dailyLogId) {
      return [];
    }

    return [
      { title: 'Type', dataIndex: 'equipmentType', key: 'equipmentType' },
      { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 70 },
      {
        title: 'Hours used',
        dataIndex: 'hoursUsed',
        key: 'hoursUsed',
        width: 100,
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Downtime',
        dataIndex: 'hoursDowntime',
        key: 'hoursDowntime',
        width: 100,
        render: (value: string | null) => value ?? '-',
      },
      ...(isEditable
        ? [
            {
              title: '',
              key: 'actions',
              width: 48,
              render: (_: unknown, record: DailyLogEquipment) =>
                deleteAction(
                  () =>
                    removeEquipment.mutateAsync({
                      projectId,
                      dailyLogId,
                      equipmentId: record.id,
                    }),
                  'Failed to remove equipment entry',
                ),
            },
          ]
        : []),
    ];
  }, [dailyLogId, isEditable, log, projectId, removeEquipment]);

  const visitorColumns = useMemo((): ColumnsType<DailyLogVisitor> => {
    if (!log || !dailyLogId) {
      return [];
    }

    return [
      { title: 'Name', dataIndex: 'visitorName', key: 'visitorName' },
      {
        title: 'Company',
        dataIndex: 'company',
        key: 'company',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Purpose',
        dataIndex: 'purpose',
        key: 'purpose',
        render: (value: string | null) => value ?? '-',
      },
      ...(isEditable
        ? [
            {
              title: '',
              key: 'actions',
              width: 48,
              render: (_: unknown, record: DailyLogVisitor) =>
                deleteAction(
                  () =>
                    removeVisitor.mutateAsync({
                      projectId,
                      dailyLogId,
                      visitorId: record.id,
                    }),
                  'Failed to remove visitor',
                ),
            },
          ]
        : []),
    ];
  }, [dailyLogId, isEditable, log, projectId, removeVisitor]);

  const incidentColumns = useMemo((): ColumnsType<DailyLogIncident> => {
    if (!log || !dailyLogId) {
      return [];
    }

    return [
      { title: 'Type', dataIndex: 'incidentType', key: 'incidentType', width: 140 },
      {
        title: 'Severity',
        dataIndex: 'severity',
        key: 'severity',
        width: 100,
        render: (value: string | null) => value ?? '-',
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
              render: (_: unknown, record: DailyLogIncident) =>
                deleteAction(
                  () =>
                    removeIncident.mutateAsync({
                      projectId,
                      dailyLogId,
                      incidentId: record.id,
                    }),
                  'Failed to remove incident',
                ),
            },
          ]
        : []),
    ];
  }, [dailyLogId, isEditable, log, projectId, removeIncident]);

  function renderSummaryHeader(currentLog: DailyLogDetail): React.ReactNode {
    return (
      <div className={layout.drawerSurface}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <dl className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className={layout.drawerMetaLabel}>
                Date
              </dt>
              <dd className={`mt-1 ${layout.drawerHeading}`}>
                {formatProjectDate(currentLog.logDate)}
              </dd>
            </div>
            <div>
              <dt className={layout.drawerMetaLabel}>
                Shift
              </dt>
              <dd className={`mt-1 ${layout.drawerMutedText}`}>
                {currentLog.shift ?? '-'}
              </dd>
            </div>
            <div>
              <dt className={layout.drawerMetaLabel}>
                Site engineer
              </dt>
              <dd className={`mt-1 ${layout.drawerMutedText}`}>
                {resolveUserDisplay(currentLog.siteEngineerId, currentLog.siteEngineerName)}
              </dd>
            </div>
            <div>
              <dt className={layout.drawerMetaLabel}>
                Workers on site
              </dt>
              <dd className={`mt-1 ${layout.drawerMutedText}`}>
                {currentLog.totalWorkers}
              </dd>
            </div>
          </dl>

          <div className="flex w-full flex-col gap-2 lg:w-56">
            <span className={layout.drawerMetaLabel}>
              Status
            </span>
            <StatusBadge
              label={formatDailyLogStatus(currentLog.status)}
              variant={dailyLogStatusVariant(currentLog.status)}
            />
            <Select
              className="w-full"
              value={currentLog.status}
              onChange={(value: string) => void handleStatusChange(value)}
              loading={updateDailyLog.isPending}
              options={DAILY_LOG_WORKFLOW.map((step) => ({
                value: step.key,
                label: step.label,
              }))}
            />
          </div>
        </div>
      </div>
    );
  }

  function renderOverviewTab(currentLog: DailyLogDetail): React.ReactNode {
    return (
      <div className="flex flex-col gap-6 sm:gap-8">
        {isDataLocked && (
          <Alert
            type="warning"
            showIcon
            title="This log has been submitted and its data fields are locked. Only status advancement is permitted."
            style={{
              backgroundColor: tokens.colorAmber50,
              borderColor: tokens.colorAmber50,
              color: tokens.colorAmber400,
            }}
          />
        )}
        <DrawerSection
          title="Weather & conditions"
          description="Record site weather and environmental conditions for the day."
          bordered={false}
        >
          <Form<DailyLogEditValues>
            form={editForm}
            key={currentLog.id}
            layout="vertical"
            className="erp-drawer-form"
            initialValues={{
              weatherCondition: currentLog.weatherCondition ?? undefined,
              temperatureC: currentLog.temperatureC
                ? Number(currentLog.temperatureC)
                : undefined,
              rainfallMm: currentLog.rainfallMm
                ? Number(currentLog.rainfallMm)
                : undefined,
              workSummary: currentLog.workSummary ?? undefined,
            }}
            onFinish={(values: DailyLogEditValues) => void handleSave(values)}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Form.Item
                className="sm:col-span-3"
                label="Weather"
                name="weatherCondition"
              >
                <Input
                  disabled={!isEditable}
                  placeholder="e.g. Clear, overcast, windy"
                />
              </Form.Item>
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
              <Input.TextArea
                rows={5}
                disabled={!isEditable}
                placeholder="Describe work completed on site today"
              />
            </Form.Item>
            {isEditable && (
              <div className="flex justify-end">
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={updateDailyLog.isPending}
                >
                  Save changes
                </Button>
              </div>
            )}
          </Form>
        </DrawerSection>
      </div>
    );
  }

  function renderSiteActivityTab(currentLog: DailyLogDetail): React.ReactNode {
    return (
      <div className="flex flex-col gap-8 sm:gap-10">
        <DrawerSection
          title="Workforce on site"
          description="Trades and headcount recorded for this log."
          bordered={false}
        >
          <DataTable
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={currentLog.workforce}
            locale={{ emptyText: 'No workforce recorded' }}
            columns={workforceColumns}
          />
          {isEditable && (
            <AddEntryCollapse label="Add workforce entry">
              <Form<WorkforceFormValues>
                form={workforceForm}
                layout="vertical"
                className="erp-drawer-form"
                onFinish={(values: WorkforceFormValues) =>
                  void handleAddWorkforce(values)
                }
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
        </DrawerSection>

        <Divider className="!my-0" />

        <DrawerSection
          title="Equipment"
          description="Plant and equipment used on site."
          bordered={false}
        >
          <DataTable
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={currentLog.equipment}
            locale={{ emptyText: 'No equipment recorded' }}
            columns={equipmentColumns}
          />
          {isEditable && (
            <AddEntryCollapse label="Add equipment entry">
              <Form<EquipmentFormValues>
                form={equipmentForm}
                layout="vertical"
                className="erp-drawer-form"
                onFinish={(values: EquipmentFormValues) =>
                  void handleAddEquipment(values)
                }
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
        </DrawerSection>
      </div>
    );
  }

  function renderVisitorsSafetyTab(currentLog: DailyLogDetail): React.ReactNode {
    return (
      <div className="flex flex-col gap-8 sm:gap-10">
        <DrawerSection
          title="Visitors"
          description="People who visited the site today."
          bordered={false}
        >
          <DataTable
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={currentLog.visitors}
            locale={{ emptyText: 'No visitors recorded' }}
            columns={visitorColumns}
          />
          {isEditable && (
            <AddEntryCollapse label="Add visitor">
              <Form<VisitorFormValues>
                form={visitorForm}
                layout="vertical"
                className="erp-drawer-form"
                onFinish={(values: VisitorFormValues) =>
                  void handleAddVisitor(values)
                }
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
                    <Input />
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
        </DrawerSection>

        <Divider className="!my-0" />

        <DrawerSection
          title="Incidents"
          description="Safety incidents, near misses, or notable events."
          bordered={false}
        >
          <DataTable
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={currentLog.incidents}
            locale={{ emptyText: 'No incidents recorded' }}
            columns={incidentColumns}
          />
          {isEditable && (
            <AddEntryCollapse label="Record incident">
              <Form<IncidentFormValues>
                form={incidentForm}
                layout="vertical"
                className="erp-drawer-form"
                onFinish={(values: IncidentFormValues) =>
                  void handleAddIncident(values)
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
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
                  <Form.Item
                    className="sm:col-span-2"
                    label="Description"
                    name="description"
                    rules={[
                      { required: true, message: 'Description is required' },
                    ]}
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
        </DrawerSection>
      </div>
    );
  }

  const siteActivityCount = (log?.workforce.length ?? 0) + (log?.equipment.length ?? 0);
  const visitorsSafetyCount =
    (log?.visitors.length ?? 0) + (log?.incidents.length ?? 0);

  return (
    <>
      <Drawer
        {...wideDetailDrawerProps}
        open={open}
        onClose={onClose}
        title={
          log
            ? `Daily log - ${formatProjectDate(log.logDate)}`
            : 'Daily log detail'
        }
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
          <div className="flex flex-col gap-3">
            <div className="erp-page-skeleton h-10 w-full rounded" />
            <div className="erp-page-skeleton h-10 w-full rounded" />
            <div className="erp-page-skeleton h-32 w-full rounded" />
          </div>
        )}

        {logQuery.isError && (
          <p className={layout.drawerMutedText}>
            {logQuery.error instanceof ApiRequestError
              ? logQuery.error.message
              : 'Unable to load daily log.'}
          </p>
        )}

        {log && (
          <div className={layout.drawerStack}>
            {renderSummaryHeader(log)}

            <WorkflowStepper
              className="erp-drawer-workflow"
              steps={DAILY_LOG_WORKFLOW}
              currentStatus={log.status}
            />

            <Tabs
              activeKey={activeTab}
              onChange={(key: string) => {
                setActiveTab(key);
                if (key === 'photos' && log && !log.attachmentFolderId) {
                  void logQuery.refetch();
                }
              }}
              destroyOnHidden
              className="erp-daily-log-tabs min-w-0"
              items={[
                {
                  key: 'overview',
                  label: 'Overview',
                  children: renderOverviewTab(log),
                },
                {
                  key: 'site-activity',
                  label: (
                    <span className="inline-flex items-center gap-2">
                      Site activity
                      {siteActivityCount > 0 && (
                        <Badge
                          count={siteActivityCount}
                          size="small"
                          color="#F47B20"
                        />
                      )}
                    </span>
                  ),
                  children: renderSiteActivityTab(log),
                },
                {
                  key: 'visitors-safety',
                  label: (
                    <span className="inline-flex items-center gap-2">
                      Visitors & safety
                      {visitorsSafetyCount > 0 && (
                        <Badge
                          count={visitorsSafetyCount}
                          size="small"
                          color="#F47B20"
                        />
                      )}
                    </span>
                  ),
                  children: renderVisitorsSafetyTab(log),
                },
                {
                  key: 'photos',
                  label: 'Photos',
                  children: (
                    <DocumentAttachmentPanel
                      folderId={log.attachmentFolderId ?? undefined}
                      readOnly={!isEditable}
                      title="Site photos"
                      description="Upload site photos and videos for this daily log."
                    />
                  ),
                },
              ]}
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
