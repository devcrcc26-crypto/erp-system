'use client';

import './work-from-home-v2.css';

import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Drawer,
  Dropdown,
  Form,
  Grid,
  Input,
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
import { useCanViewHr, useCanViewTeam } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  createWorkFromHomeDay,
  deleteWorkFromHomeDay,
  listWorkFromHomeAssignableEmployees,
  listWorkFromHomeDays,
  updateWorkFromHomeDay,
  WFH_MAX_RANGE_DAYS,
  type CreateWorkFromHomeDayDto,
  type WorkFromHomeDay,
  type WorkFromHomeScope,
} from '@/lib/api/work-from-home.api';
import { useDepartments } from '@/lib/query/org';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DRAWER_WIDTH_STANDARD,
  detailDrawerStyles,
} from '@/lib/theme/layout';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

type ScopeMode = 'all' | WorkFromHomeScope;

interface WfhFormValues {
  date?: Dayjs;
  reason: string;
  scope: WorkFromHomeScope;
  departmentIds?: string[];
  employeeIds?: string[];
}

interface WfhPeriodRow {
  id: string;
  range: [Dayjs, Dayjs] | null;
}

const SCOPE_TAG_COLOR: Record<WorkFromHomeScope, string> = {
  ALL: 'green',
  DEPARTMENTS: 'blue',
  EMPLOYEES: 'gold',
};

function newPeriodId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function completeRange(
  value: [Dayjs | null, Dayjs | null] | null,
): [Dayjs, Dayjs] | null {
  if (!value?.[0] || !value[1]) {
    return null;
  }
  return [value[0], value[1]];
}

function periodsOverlap(periods: WfhPeriodRow[]): boolean {
  const ranges = periods
    .map((row) => row.range)
    .filter((range): range is [Dayjs, Dayjs] => Boolean(range));
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const a = ranges[i];
      const b = ranges[j];
      if (!a[1].isBefore(b[0], 'day') && !b[1].isBefore(a[0], 'day')) {
        return true;
      }
    }
  }
  return false;
}

function periodExceedsMax(range: [Dayjs, Dayjs]): boolean {
  return range[1].diff(range[0], 'day') + 1 > WFH_MAX_RANGE_DAYS;
}

/**
 * WFH assign calendar - HR (any scope) or Discipline Lead (multi-select reports).
 */
export default function WorkFromHomeDaysPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  // Direct assignment (no approval) is HR only (hr.view); others use New Request.
  const canAssign = canViewHr;
  // Supervisors get a read-only view of their own and their team's days.
  const canView = useCanViewTeam();
  const queryClient = useQueryClient();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;

  const [month, setMonth] = useState(dayjs().month() + 1);
  const [year, setYear] = useState(dayjs().year());
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<WorkFromHomeDay | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<WfhPeriodRow[]>([
    { id: newPeriodId(), range: null },
  ]);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [form] = Form.useForm<WfhFormValues>();
  const watchedScope = Form.useWatch('scope', form) ?? 'EMPLOYEES';

  const listQuery = useQuery({
    queryKey: ['work-from-home', month, year],
    queryFn: () => listWorkFromHomeDays({ month, year }),
    enabled: canView,
  });

  const assignableQuery = useQuery({
    queryKey: ['work-from-home', 'assignable'],
    queryFn: listWorkFromHomeAssignableEmployees,
    enabled: canAssign,
  });

  const canAssignCompanyWide =
    canViewHr || assignableQuery.data?.canAssignCompanyWide === true;

  const departmentsQuery = useDepartments(
    { page: 1, limit: 200, isActive: true },
    canAssignCompanyWide,
  );

  const departmentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of departmentsQuery.data?.data ?? []) {
      map.set(row.id, row.name);
    }
    return map;
  }, [departmentsQuery.data?.data]);

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
      (assignableQuery.data?.employees ?? []).map((user) => ({
        value: user.id,
        label: `${formatUserName(user)}${user.employeeId ? ` · ${user.employeeId}` : ''}`,
      })),
    [assignableQuery.data?.employees],
  );

  const rows = listQuery.data ?? [];

  const employeeLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of assignableQuery.data?.employees ?? []) {
      map.set(user.id, formatUserName(user));
    }
    for (const row of rows) {
      for (const user of row.employees ?? []) {
        if (!map.has(user.id)) {
          map.set(user.id, formatUserName(user));
        }
      }
    }
    return map;
  }, [assignableQuery.data?.employees, rows]);

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
    mutationFn: async (payloads: CreateWorkFromHomeDayDto[]) => {
      for (const dto of payloads) {
        await createWorkFromHomeDay(dto);
      }
    },
    onSuccess: async () => {
      messageApi.success(t('common.saved'));
      closeDrawer();
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
      closeDrawer();
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
        .map((id) => departmentNameById.get(id) ?? id)
        .filter(Boolean);
      if (names.length === 0) {
        return t('pages.hr.workFromHome.scopeDetail.departmentsCount', {
          count: row.departmentIds.length,
        });
      }
      return names.join(', ');
    }
    const fromRow = (row.employees ?? []).map((user) => formatUserName(user));
    const names =
      fromRow.length > 0
        ? fromRow
        : row.employeeIds
            .map((id) => employeeLabelById.get(id))
            .filter((name): name is string => Boolean(name));
    if (names.length === 0) {
      return t('pages.hr.workFromHome.scopeDetail.employeesCount', {
        count: row.employeeIds.length,
      });
    }
    return names.join(', ');
  }

  function closeDrawer(): void {
    setDrawerOpen(false);
    setEditing(null);
    setPeriods([{ id: newPeriodId(), range: null }]);
    setPeriodError(null);
    form.resetFields();
  }

  function openCreate(): void {
    setEditing(null);
    setPeriods([{ id: newPeriodId(), range: null }]);
    setPeriodError(null);
    form.resetFields();
    form.setFieldsValue({
      scope: canAssignCompanyWide ? 'ALL' : 'EMPLOYEES',
      departmentIds: [],
      employeeIds: [],
    });
    setDrawerOpen(true);
  }

  function openEdit(row: WorkFromHomeDay): void {
    if (!canAssignCompanyWide && row.scope !== 'EMPLOYEES') {
      messageApi.warning(t('pages.hr.workFromHome.disciplineLeadEditOnly'));
      return;
    }
    setEditing(row);
    setPeriodError(null);
    form.setFieldsValue({
      date: dayjs(row.date),
      reason: row.reason,
      scope: canAssignCompanyWide ? row.scope : 'EMPLOYEES',
      departmentIds: row.departmentIds,
      employeeIds: row.employeeIds.filter((id) => employeeLabelById.has(id)),
    });
    setDrawerOpen(true);
  }

  function handleSubmit(values: WfhFormValues): void {
    const scope = canAssignCompanyWide ? values.scope : 'EMPLOYEES';
    const shared = {
      reason: values.reason.trim(),
      scope,
      departmentIds: scope === 'DEPARTMENTS' ? (values.departmentIds ?? []) : [],
      employeeIds: scope === 'EMPLOYEES' ? (values.employeeIds ?? []) : [],
    };

    if (editing) {
      if (!values.date) {
        return;
      }
      updateMutation.mutate({
        id: editing.id,
        dto: {
          ...shared,
          date: values.date.format('YYYY-MM-DD'),
        },
      });
      return;
    }

    const filled = periods.filter(
      (row): row is WfhPeriodRow & { range: [Dayjs, Dayjs] } =>
        Boolean(row.range?.[0] && row.range[1]),
    );
    if (filled.length === 0) {
      setPeriodError(t('pages.hr.workFromHome.fields.periodRequired'));
      return;
    }
    if (periodsOverlap(filled)) {
      setPeriodError(t('pages.hr.workFromHome.fields.periodOverlap'));
      return;
    }
    const tooLong = filled.find((row) => periodExceedsMax(row.range));
    if (tooLong) {
      setPeriodError(
        t('pages.hr.workFromHome.fields.periodMaxDays', {
          days: WFH_MAX_RANGE_DAYS,
        }),
      );
      return;
    }
    setPeriodError(null);
    createMutation.mutate(
      filled.map((row) => ({
        ...shared,
        startDate: row.range[0].format('YYYY-MM-DD'),
        endDate: row.range[1].format('YYYY-MM-DD'),
      })),
    );
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
        width: 160,
        render: (value: string) => (
          <span className="erp-users-cell-strong">
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: t('pages.hr.workFromHome.columns.reason'),
        dataIndex: 'reason',
        ellipsis: true,
      },
      {
        title: t('pages.hr.workFromHome.columns.scope'),
        key: 'scope',
        width: isCompact ? 200 : 280,
        render: (_: unknown, row: WorkFromHomeDay) => (
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
      ...(canAssign
        ? ([
            {
              title: '',
              key: 'actions',
              width: 56,
              align: 'right',
              render: (_: unknown, row: WorkFromHomeDay) => (
                <Dropdown
                  menu={{ items: buildActionMenu(row) }}
                  trigger={['click']}
                  placement="bottomRight"
                >
                  <Button
                    type="text"
                    icon={<MoreOutlined />}
                    aria-label={t('common.actions')}
                  />
                </Dropdown>
              ),
            },
          ] satisfies ColumnsType<WorkFromHomeDay>)
        : []),
    ],
    [t, departmentNameById, employeeLabelById, isCompact, canAssignCompanyWide, canAssign],
  );

  if (!canView) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-wfh-v2">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-wfh-v2">
        <div className="erp-wfh-loading">
          <Spin />
        </div>
      </div>
    );
  }

  const monthName = t(`hr.months.${month}`);

  return (
    <div className="erp-pro-list-page erp-users-page erp-wfh-v2">
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
      <Drawer
        rootClassName="erp-wfh-drawer"
        className="erp-responsive-drawer"
        open={drawerOpen}
        onClose={closeDrawer}
        destroyOnHidden
        size={DRAWER_WIDTH_STANDARD}
        styles={detailDrawerStyles}
        title={
          <div className="min-w-0 py-1">
            <div className="text-[15px] font-semibold leading-snug text-[var(--color-text-primary)]">
              {editing
                ? t('pages.hr.workFromHome.editTitle')
                : t('pages.hr.workFromHome.createTitle')}
            </div>
            <div className="mt-0.5 text-[12px] font-normal text-[var(--color-text-secondary)]">
              {canAssignCompanyWide
                ? t('pages.hr.workFromHome.modalLead')
                : t('pages.hr.workFromHome.modalLeadDisciplineLead')}
            </div>
          </div>
        }
        footer={
          <div className="erp-wfh-drawer-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={closeDrawer} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button
              type="primary"
              loading={saving}
              onClick={() => form.submit()}
            >
              {editing ? t('common.save') : t('common.add')}
            </Button>
          </div>
        }
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          className="erp-drawer-form"
          initialValues={{
            scope: (canAssignCompanyWide ? 'ALL' : 'EMPLOYEES') as WorkFromHomeScope,
            departmentIds: [],
            employeeIds: [],
          }}
          onFinish={handleSubmit}
        >
          {editing ? (
            <Form.Item
              name="date"
              label={t('pages.hr.workFromHome.fields.date')}
              rules={[{ required: true }]}
            >
              <DatePicker className="w-full" />
            </Form.Item>
          ) : (
            <div className="erp-wfh-period-editor">
              <p className="erp-wfh-period-editor-label">
                {t('pages.hr.workFromHome.fields.periods')}
              </p>
              <p className="erp-wfh-period-editor-hint">
                {t('pages.hr.workFromHome.fields.periodsHint', {
                  days: WFH_MAX_RANGE_DAYS,
                })}
              </p>
              <div className="erp-wfh-period-editor-list">
                {periods.map((period, index) => (
                  <div key={period.id} className="erp-wfh-period-editor-row">
                    <DatePicker.RangePicker
                      className="w-full"
                      value={period.range}
                      onChange={(value) => {
                        setPeriodError(null);
                        setPeriods((current) =>
                          current.map((row) =>
                            row.id === period.id
                              ? {
                                  ...row,
                                  range: completeRange(
                                    value as
                                      | [Dayjs | null, Dayjs | null]
                                      | null,
                                  ),
                                }
                              : row,
                          ),
                        );
                      }}
                    />
                    <div className="erp-wfh-period-editor-actions">
                      {periods.length > 1 ? (
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label={t(
                            'pages.hr.workFromHome.fields.removePeriod',
                          )}
                          onClick={() => {
                            setPeriodError(null);
                            setPeriods((current) =>
                              current.filter((row) => row.id !== period.id),
                            );
                          }}
                        />
                      ) : null}
                      {index === periods.length - 1 ? (
                        <Button
                          icon={<PlusOutlined />}
                          onClick={() => {
                            setPeriodError(null);
                            setPeriods((current) => [
                              ...current,
                              { id: newPeriodId(), range: null },
                            ]);
                          }}
                        >
                          {t('pages.hr.workFromHome.fields.addPeriod')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {periodError ? (
                <p className="erp-wfh-period-editor-error" role="alert">
                  {periodError}
                </p>
              ) : null}
            </div>
          )}
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
          {canAssignCompanyWide ? (
            <>
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
            </>
          ) : (
            <p className="erp-wfh-scope-hint">
              {t('pages.hr.workFromHome.fields.disciplineLeadHint')}
            </p>
          )}
          {(canAssignCompanyWide ? watchedScope === 'EMPLOYEES' : true) ? (
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
                loading={assignableQuery.isLoading}
                options={employeeOptions}
                placeholder={t(
                  'pages.hr.workFromHome.fields.employeesPlaceholder',
                )}
              />
            </Form.Item>
          ) : null}
        </Form>
      </Drawer>

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
        {canAssignCompanyWide ? (
          <>
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
          </>
        ) : null}
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
            {canAssign ? (
              <HrListActions
                compact={isCompact}
                primary={{
                  label: t('common.add'),
                  icon: <PlusOutlined />,
                  onClick: openCreate,
                }}
              />
            ) : null}
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
            className="erp-wfh-year-input"
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
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={filtered}
            loading={listQuery.isFetching && filtered.length === 0}
            scroll={{ x: isCompact ? 720 : 966 }}
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
                      : canAssign
                        ? {
                            label: t('common.add'),
                            onClick: openCreate,
                          }
                        : undefined
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
