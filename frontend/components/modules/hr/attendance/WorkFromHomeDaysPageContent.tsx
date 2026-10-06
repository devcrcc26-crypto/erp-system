'use client';

import './attendance-v2.css';
import './work-from-home-v2.css';

import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Dropdown,
  Form,
  Grid,
  Input,
  Modal,
  Radio,
  Select,
  Spin,
  Tag,
  Tooltip,
  type MenuProps,
} from 'antd';
import {
  CalendarOutlined,
  DeleteOutlined,
  EditOutlined,
  HomeOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { Home } from 'lucide-react';
import EvaluationStat from '@/components/modules/hr/evaluation/EvaluationStat';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  createWorkFromHomeDay,
  deleteWorkFromHomeDay,
  listWorkFromHomeDays,
  updateWorkFromHomeDay,
  type WorkFromHomeDay,
  type WorkFromHomeScope,
} from '@/lib/api/work-from-home.api';
import { useDepartments } from '@/lib/query/org';
import { useAllUsers } from '@/lib/query/users';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

type ScopeMode = 'all' | WorkFromHomeScope;

interface WfhFormValues {
  date: Dayjs;
  reason: string;
  scope: WorkFromHomeScope;
  departmentIds?: string[];
  employeeIds?: string[];
}

const SCOPE_TAG_COLOR: Record<WorkFromHomeScope, string> = {
  ALL: 'green',
  DEPARTMENTS: 'blue',
  EMPLOYEES: 'gold',
};

/**
 * Company WFH calendar days — employees-matched table + scoped add/edit modal.
 */
export default function WorkFromHomeDaysPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const queryClient = useQueryClient();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;

  const [month, setMonth] = useState(dayjs().month() + 1);
  const [year, setYear] = useState(dayjs().year());
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkFromHomeDay | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form] = Form.useForm<WfhFormValues>();
  const watchedScope = Form.useWatch('scope', form) ?? 'ALL';

  const listQuery = useQuery({
    queryKey: ['work-from-home', month, year],
    queryFn: () => listWorkFromHomeDays({ month, year }),
    enabled: canViewHr,
  });

  const departmentsQuery = useDepartments(
    { page: 1, limit: 200, isActive: true },
    canViewHr,
  );
  const usersQuery = useAllUsers({ enabled: canViewHr });

  const departmentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of departmentsQuery.data?.data ?? []) {
      map.set(row.id, row.name);
    }
    return map;
  }, [departmentsQuery.data?.data]);

  const employeeLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of usersQuery.data ?? []) {
      map.set(
        user.id,
        `${formatUserName(user)}${user.employeeId ? ` · ${user.employeeId}` : ''}`,
      );
    }
    return map;
  }, [usersQuery.data]);

  const departmentOptions = useMemo(
    () =>
      (departmentsQuery.data?.data ?? []).map((row) => ({
        value: row.id,
        label: row.name,
      })),
    [departmentsQuery.data?.data],
  );

  const employeeOptions = useMemo(
    () =>
      (usersQuery.data ?? []).map((user) => ({
        value: user.id,
        label: `${formatUserName(user)}${user.employeeId ? ` · ${user.employeeId}` : ''}`,
      })),
    [usersQuery.data],
  );

  const rows = listQuery.data ?? [];

  const scopeCounts = useMemo(
    () => ({
      all: rows.length,
      ALL: rows.filter((row) => row.scope === 'ALL').length,
      DEPARTMENTS: rows.filter((row) => row.scope === 'DEPARTMENTS').length,
      EMPLOYEES: rows.filter((row) => row.scope === 'EMPLOYEES').length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    if (scopeMode === 'all') {
      return rows;
    }
    return rows.filter((row) => row.scope === scopeMode);
  }, [rows, scopeMode]);

  const createMutation = useMutation({
    mutationFn: createWorkFromHomeDay,
    onSuccess: async () => {
      messageApi.success(t('common.saved'));
      closeModal();
      await queryClient.invalidateQueries({ queryKey: ['work-from-home'] });
    },
    onError: (error) =>
      notifyApiError(
        error,
        t('pages.hr.workFromHome.saveFailed'),
        messageApi,
        t,
      ),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      dto,
    }: {
      id: string;
      dto: Parameters<typeof updateWorkFromHomeDay>[1];
    }) => updateWorkFromHomeDay(id, dto),
    onSuccess: async () => {
      messageApi.success(t('common.saved'));
      closeModal();
      await queryClient.invalidateQueries({ queryKey: ['work-from-home'] });
    },
    onError: (error) =>
      notifyApiError(
        error,
        t('pages.hr.workFromHome.saveFailed'),
        messageApi,
        t,
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkFromHomeDay,
    onSuccess: async () => {
      messageApi.success(t('common.deleted'));
      setDeleteId(null);
      await queryClient.invalidateQueries({ queryKey: ['work-from-home'] });
    },
    onError: (error) =>
      notifyApiError(
        error,
        t('pages.hr.workFromHome.deleteFailed'),
        messageApi,
        t,
      ),
  });

  function scopeLabel(scope: WorkFromHomeScope): string {
    return t(`pages.hr.workFromHome.scope.${scope}`);
  }

  function scopeDetail(row: WorkFromHomeDay): string {
    if (row.scope === 'ALL') {
      return t('pages.hr.workFromHome.scopeDetail.all');
    }
    if (row.scope === 'DEPARTMENTS') {
      const names = row.departmentIds
        .map((id) => departmentNameById.get(id))
        .filter((name): name is string => Boolean(name));
      if (names.length === 0) {
        return t('pages.hr.workFromHome.scopeDetail.departmentsCount', {
          count: row.departmentIds.length,
        });
      }
      return names.join(', ');
    }
    const names = row.employeeIds
      .map((id) => employeeLabelById.get(id))
      .filter((name): name is string => Boolean(name));
    if (names.length === 0) {
      return t('pages.hr.workFromHome.scopeDetail.employeesCount', {
        count: row.employeeIds.length,
      });
    }
    if (names.length <= 2) {
      return names.join(', ');
    }
    return t('pages.hr.workFromHome.scopeDetail.employeesNamed', {
      names: names.slice(0, 2).join(', '),
      count: names.length - 2,
    });
  }

  function closeModal(): void {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  }

  function openCreate(): void {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      scope: 'ALL',
      departmentIds: [],
      employeeIds: [],
    });
    setModalOpen(true);
  }

  function openEdit(row: WorkFromHomeDay): void {
    setEditing(row);
    form.setFieldsValue({
      date: dayjs(row.date),
      reason: row.reason,
      scope: row.scope,
      departmentIds: row.departmentIds,
      employeeIds: row.employeeIds,
    });
    setModalOpen(true);
  }

  function handleSubmit(values: WfhFormValues): void {
    const scope = values.scope;
    const payload = {
      date: values.date.format('YYYY-MM-DD'),
      reason: values.reason.trim(),
      scope,
      departmentIds: scope === 'DEPARTMENTS' ? (values.departmentIds ?? []) : [],
      employeeIds: scope === 'EMPLOYEES' ? (values.employeeIds ?? []) : [],
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, dto: payload });
      return;
    }
    createMutation.mutate(payload);
  }

  function handleResetPeriod(): void {
    setMonth(dayjs().month() + 1);
    setYear(dayjs().year());
    setScopeMode('all');
  }

  const hasFilters =
    scopeMode !== 'all' ||
    month !== dayjs().month() + 1 ||
    year !== dayjs().year();

  const saving = createMutation.isPending || updateMutation.isPending;

  function buildActionMenu(row: WorkFromHomeDay): MenuProps['items'] {
    return [
      {
        key: 'update',
        icon: <EditOutlined />,
        label: t('common.update'),
        onClick: () => openEdit(row),
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: t('common.delete'),
        danger: true,
        onClick: () => setDeleteId(row.id),
      },
    ];
  }

  const columns: ColumnsType<WorkFromHomeDay> = useMemo(
    () => [
      {
        title: t('pages.hr.workFromHome.columns.date'),
        dataIndex: 'date',
        key: 'date',
        width: 140,
        render: (value: string) => (
          <span className="erp-users-cell-strong">
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: t('pages.hr.workFromHome.columns.reason'),
        dataIndex: 'reason',
        key: 'reason',
        render: (value: string) => (
          <span className="erp-users-cell-strong">{value}</span>
        ),
      },
      {
        title: t('pages.hr.workFromHome.columns.scope'),
        key: 'scope',
        width: 260,
        render: (_: unknown, row) => (
          <div className="erp-wfh-scope-cell">
            <Tag
              className="erp-wfh-scope-chip"
              color={SCOPE_TAG_COLOR[row.scope]}
            >
              {scopeLabel(row.scope)}
            </Tag>
            <p className="erp-wfh-scope-detail">{scopeDetail(row)}</p>
          </div>
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 44,
        align: 'right',
        fixed: isCompact ? undefined : 'right',
        render: (_: unknown, row) => (
          <div
            className="erp-table-row-actions flex items-center justify-end"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Dropdown
              menu={{ items: buildActionMenu(row) }}
              trigger={['click']}
              placement="bottomRight"
              rootClassName="erp-row-actions-menu"
            >
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                aria-label={t('common.actions')}
              />
            </Dropdown>
          </div>
        ),
      },
    ],
    [t, departmentNameById, employeeLabelById, isCompact],
  );

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-attendance-page erp-attendance-v2 erp-wfh-v2">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-attendance-page erp-attendance-v2 erp-wfh-v2">
        <div className="erp-att-loading">
          <Spin />
        </div>
      </div>
    );
  }

  const monthName = t(`hr.months.${month}`);

  return (
    <div className="erp-pro-list-page erp-users-page erp-attendance-page erp-attendance-v2 erp-wfh-v2">
      <ConfirmDialog
        open={Boolean(deleteId)}
        title={t('pages.hr.workFromHome.deleteTitle')}
        description={t('pages.hr.workFromHome.deleteDescription')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteMutation.mutate(deleteId);
          }
        }}
        onCancel={() => setDeleteId(null)}
      />

      <Modal
        rootClassName="erp-wfh-modal"
        title={
          editing
            ? t('pages.hr.workFromHome.editTitle')
            : t('pages.hr.workFromHome.createTitle')
        }
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={editing ? t('common.save') : t('common.add')}
        destroyOnHidden
        width={480}
      >
        <p className="erp-wfh-modal-lead">
          {t('pages.hr.workFromHome.modalLead')}
        </p>
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{
            scope: 'ALL' as WorkFromHomeScope,
            departmentIds: [],
            employeeIds: [],
          }}
          onFinish={handleSubmit}
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
            extra={t('pages.hr.workFromHome.fields.reasonHint')}
          >
            <Input.TextArea
              rows={2}
              maxLength={500}
              showCount
              placeholder={t('pages.hr.workFromHome.fields.reasonPlaceholder')}
            />
          </Form.Item>
          <Form.Item
            name="scope"
            label={t('pages.hr.workFromHome.fields.scope')}
            rules={[{ required: true }]}
          >
            <Radio.Group className="erp-wfh-scope-radios">
              <Radio value="ALL">
                <span className="erp-wfh-scope-option-title">
                  {t('pages.hr.workFromHome.scope.ALL')}
                </span>
                <span className="erp-wfh-scope-option-desc">
                  {t('pages.hr.workFromHome.scopeHelp.ALL')}
                </span>
              </Radio>
              <Radio value="DEPARTMENTS">
                <span className="erp-wfh-scope-option-title">
                  {t('pages.hr.workFromHome.scope.DEPARTMENTS')}
                </span>
                <span className="erp-wfh-scope-option-desc">
                  {t('pages.hr.workFromHome.scopeHelp.DEPARTMENTS')}
                </span>
              </Radio>
              <Radio value="EMPLOYEES">
                <span className="erp-wfh-scope-option-title">
                  {t('pages.hr.workFromHome.scope.EMPLOYEES')}
                </span>
                <span className="erp-wfh-scope-option-desc">
                  {t('pages.hr.workFromHome.scopeHelp.EMPLOYEES')}
                </span>
              </Radio>
            </Radio.Group>
          </Form.Item>
          <p className="erp-wfh-scope-hint">
            {t('pages.hr.workFromHome.fields.scopeHint')}
          </p>
          {watchedScope === 'DEPARTMENTS' ? (
            <Form.Item
              name="departmentIds"
              label={t('pages.hr.workFromHome.fields.departments')}
              rules={[
                {
                  required: true,
                  type: 'array',
                  min: 1,
                  message: t('pages.hr.workFromHome.fields.pickDepartments'),
                },
              ]}
            >
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                loading={departmentsQuery.isLoading}
                options={departmentOptions}
                placeholder={t(
                  'pages.hr.workFromHome.fields.departmentsPlaceholder',
                )}
              />
            </Form.Item>
          ) : null}
          {watchedScope === 'EMPLOYEES' ? (
            <Form.Item
              name="employeeIds"
              label={t('pages.hr.workFromHome.fields.employees')}
              rules={[
                {
                  required: true,
                  type: 'array',
                  min: 1,
                  message: t('pages.hr.workFromHome.fields.pickEmployees'),
                },
              ]}
            >
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                loading={usersQuery.isLoading}
                options={employeeOptions}
                placeholder={t(
                  'pages.hr.workFromHome.fields.employeesPlaceholder',
                )}
              />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>

      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          className="mb-0"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            t('pages.hr.workFromHome.loadFailed'),
            t,
          )}
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <EvaluationStat
          label={t('pages.hr.workFromHome.stats.total')}
          value={scopeCounts.all}
          accent="teal"
          icon={<HomeOutlined />}
          active={scopeMode === 'all'}
          onClick={() => setScopeMode('all')}
        />
        <EvaluationStat
          label={t('pages.hr.workFromHome.stats.allEmployees')}
          value={scopeCounts.ALL}
          accent="green"
          icon={<TeamOutlined />}
          active={scopeMode === 'ALL'}
          onClick={() => setScopeMode('ALL')}
        />
        <EvaluationStat
          label={t('pages.hr.workFromHome.stats.departments')}
          value={scopeCounts.DEPARTMENTS}
          accent="blue"
          icon={<CalendarOutlined />}
          active={scopeMode === 'DEPARTMENTS'}
          onClick={() => setScopeMode('DEPARTMENTS')}
        />
        <EvaluationStat
          label={t('pages.hr.workFromHome.stats.employees')}
          value={scopeCounts.EMPLOYEES}
          accent="amber"
          icon={<TeamOutlined />}
          active={scopeMode === 'EMPLOYEES'}
          onClick={() => setScopeMode('EMPLOYEES')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {t('pages.hr.workFromHome.title')}
            </h3>
            <span className="erp-users-count-pill">
              {filtered.length.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title={t('common.refresh')}>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={listQuery.isFetching && !listQuery.isLoading}
                onClick={() => void listQuery.refetch()}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
            <HrListActions
              compact={isCompact}
              primary={{
                label: t('common.add'),
                icon: <PlusOutlined />,
                onClick: openCreate,
              }}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Select
            value={month}
            options={Array.from({ length: 12 }, (_, i) => ({
              value: i + 1,
              label: t(`hr.months.${i + 1}`),
            }))}
            onChange={setMonth}
            className="erp-users-filter-select"
            aria-label={t('pages.hr.attendance.filters.month')}
          />
          <Select
            value={year}
            options={[year - 1, year, year + 1].map((y) => ({
              value: y,
              label: String(y),
            }))}
            onChange={setYear}
            className="erp-att-year-input"
            aria-label={t('pages.hr.attendance.filters.year')}
          />
          <span className="erp-users-filter-spacer" aria-hidden />
          {hasFilters ? (
            <Button type="link" onClick={handleResetPeriod} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<WorkFromHomeDay>
            rowKey="id"
            className="erp-data-table erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={filtered}
            loading={listQuery.isFetching && filtered.length === 0}
            scroll={{ x: isNarrow ? 520 : 780 }}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<Home />}
                  title={
                    hasFilters
                      ? t('pages.hr.workFromHome.emptyFiltered')
                      : t('pages.hr.workFromHome.empty', {
                          month: monthName,
                          year,
                        })
                  }
                  description={t('pages.hr.workFromHome.description')}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetPeriod,
                        }
                      : {
                          label: t('common.add'),
                          onClick: openCreate,
                        }
                  }
                />
              ),
            }}
            pagination={false}
          />
        </div>
      </div>
    </div>
  );
}
