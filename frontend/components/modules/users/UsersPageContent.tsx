'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Dropdown,
  Input,
  Select,
  Space,
  Spin,
  Tag,
  type MenuProps,
} from 'antd';
import type {
  FilterValue,
  SorterResult,
  TablePaginationConfig,
} from 'antd/es/table/interface';
import { FileExcelOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { Users } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import ThreePeopleIcon from '@/components/ThreePeopleIcon';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import UserImportModal from '@/components/modules/users/UserImportModal';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import {
  fetchAllUsers,
  useDeleteUser,
  useResendInvitation,
  useUsers,
} from '@/lib/query/users';
import type { User } from '@/lib/api/types';
import {
  useDepartments,
  useEngineeringDisciplineOptions,
  usePositions,
} from '@/lib/query/org';
import { exportUsersExcel } from '@/lib/utils/users-export-excel';
import { pickTopLevelRoleName } from '@/lib/utils/user-display';
import {
  userStatusLabel,
  userStatusVariant,
} from '@/lib/utils/user-status';
import { useAuthStore } from '@/stores/auth.store';
import { tokens } from '@/lib/theme/tokens';

const ROLE_COLOR_MAP: Record<string, string> = {
  'System Administrator': 'red',
  'Project Administrator': 'volcano',
  'Managing Director': 'orange',
  'General Manager': 'gold',
  'Project Director': 'yellow',
  'Project Manager': 'lime',
  'Chief Engineer': 'geekblue',
  'Deputy Chief': 'blue',
  'Department Chief': 'cyan',
  'Discipline Lead': 'purple',
  'Discipline Owner': 'magenta',
  'Institute Chief': 'processing',
  Designer: 'green',
  Reviewer: 'success',
  'Site Coordinator': 'orange',
  'Site Engineer': 'default',
  'Document Controller': 'geekblue',
  Dispatcher: 'warning',
  'Planning Engineer': 'default',
  'Procurement Officer': 'default',
  'Finance Manager': 'default',
  Accountant: 'default',
  'HR Officer': 'default',
  'Safety Officer': 'error',
  'Client Consultant': 'default',
  Storekeeper: 'default',
  Employee: 'default',
};

const COLUMN_SORT_FIELD: Record<string, string> = {
  name: 'firstName',
  email: 'email',
  department: 'departmentId',
  position: 'positionId',
  status: 'isActive',
};

function formatUserRoleNames(user: User): string {
  const roles =
    user.userRoles?.map((assignment) => ({
      name: assignment.role.name,
      isPrimary: assignment.isPrimary,
    })) ?? [];
  const top = pickTopLevelRoleName(roles, '');
  return top || '-';
}

function buildUsersExportLabels(
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  return {
    sheetName: t('users.exportSheetName'),
    name: t('common.name'),
    position: t('common.position'),
    discipline: t('common.discipline'),
    department: t('common.department'),
    role: t('common.role'),
    lastLogin: t('users.exportTable.lastLogin'),
  };
}

export default function UsersPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const router = useRouter();
  const authUser = useAuthStore((state) => state.user);
  const { params, bindMeta, resetPage } = useTablePagination();
  const [exportingUsers, setExportingUsers] = useState(false);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState<string | undefined>();
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>();
  const [positionFilter, setPositionFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>();
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search);
      resetPage();
    }, 300);
    return () => clearTimeout(handle);
  }, [search, resetPage]);

  const handleDisciplineFilterChange = useCallback(
    (value?: string) => {
      setDisciplineFilter(value);
      resetPage();
    },
    [resetPage],
  );

  const handleDepartmentFilterChange = useCallback(
    (value?: string) => {
      setDepartmentFilter(value);
      resetPage();
    },
    [resetPage],
  );

  const handlePositionFilterChange = useCallback(
    (value?: string) => {
      setPositionFilter(value);
      resetPage();
    },
    [resetPage],
  );

  const handleStatusFilterChange = useCallback(
    (value?: boolean) => {
      setStatusFilter(value);
      resetPage();
    },
    [resetPage],
  );

  const handleTableChange = useCallback(
    (
      _pagination: TablePaginationConfig,
      _filters: Record<string, FilterValue | null>,
      sorter: SorterResult<User> | SorterResult<User>[],
    ) => {
      const resolved = Array.isArray(sorter) ? sorter[0] : sorter;
      const columnKey =
        typeof resolved?.columnKey === 'string' ? resolved.columnKey : undefined;
      const field = columnKey ? COLUMN_SORT_FIELD[columnKey] : undefined;
      if (!field || !resolved?.order) {
        setSortBy(undefined);
        setSortOrder(undefined);
        return;
      }
      setSortBy(field);
      setSortOrder(resolved.order === 'ascend' ? 'asc' : 'desc');
    },
    [],
  );

  const usersQuery = useUsers({
    ...params,
    search: debouncedSearch || undefined,
    disciplineId: disciplineFilter,
    departmentId: departmentFilter,
    positionId: positionFilter,
    isActive: statusFilter,
    sortBy,
    sortOrder,
  });
  const deleteUser = useDeleteUser();
  const resendInvitation = useResendInvitation();
  const { options: disciplineFilterOptions, nameById: disciplineNameById } =
    useEngineeringDisciplineOptions(true);
  const departmentsQuery = useDepartments({ page: 1, limit: 100 });
  const positionsQuery = usePositions({ page: 1, limit: 100 });
  const departmentFilterOptions = useMemo(
    () =>
      (departmentsQuery.data?.data ?? []).map((department) => ({
        value: department.id,
        label: department.name,
      })),
    [departmentsQuery.data],
  );
  const positionFilterOptions = useMemo(
    () =>
      (positionsQuery.data?.data ?? []).map((position) => ({
        value: position.id,
        label: position.title,
      })),
    [positionsQuery.data],
  );

  const companyName = authUser?.companyName ?? 'Company';

  const handleExportExcel = useCallback(async (): Promise<void> => {
    setExportingUsers(true);
    try {
      const allUsers = await fetchAllUsers();
      const generatedAt = new Date().toISOString();

      await exportUsersExcel({
        companyName,
        generatedAt,
        labels: buildUsersExportLabels(t),
        users: allUsers,
        formatUserRoles: formatUserRoleNames,
      });
      messageApi.success(t('users.exportSuccess'));
    } catch {
      messageApi.error(t('users.exportError'));
    } finally {
      setExportingUsers(false);
    }
  }, [companyName, messageApi, t]);

  if (usersQuery.isLoading) {
    return (
      <FormLayout variant="pro">
        <div className="flex justify-center p-12">
          <Spin />
        </div>
      </FormLayout>
    );
  }

  if (usersQuery.isError) {
    const status =
      usersQuery.error instanceof ApiRequestError
        ? usersQuery.error.status
        : 0;

    if (status === 403 || status === 401) {
      return (
        <PlaceholderPage
          icon={ThreePeopleIcon}
          title={t('users.title')}
          description={t('users.noPermission')}
        />
      );
    }

    return (
      <PlaceholderPage
        icon={ThreePeopleIcon}
        title={t('users.title')}
        description={t('users.loadError')}
      />
    );
  }

  const users = usersQuery.data?.data ?? [];
  const meta = usersQuery.data?.meta;

  async function handleResendVerification(user: User): Promise<void> {
    setActionMessage(null);

    try {
      const result = await resendInvitation.mutateAsync(user.id);
      setActionMessage({ type: 'success', text: result.message });
    } catch (error) {
      setActionMessage({
        type: 'error',
        text:
          error instanceof ApiRequestError
            ? error.message
            : t('users.resendError'),
      });
    }
  }

  async function handleDeleteUser(): Promise<void> {
    if (!deletingUser) {
      return;
    }

    try {
      await deleteUser.mutateAsync(deletingUser.id);
      setActionMessage({
        type: 'success',
        text: t('users.deactivated', {
          name: `${deletingUser.firstName} ${deletingUser.lastName}`,
        }),
      });
      setDeletingUser(null);
    } catch (error) {
      setActionMessage({
        type: 'error',
        text:
          error instanceof ApiRequestError
            ? error.message
            : t('users.deleteError'),
      });
    }
  }

  function buildActionMenu(user: User): MenuProps['items'] {
    const showResend = user.isActive && Boolean(user.email) && !user.emailVerifiedAt;
    const items: MenuProps['items'] = [];

    if (showResend) {
      items.push({
        key: 'resend',
        label: t('users.resendVerification'),
        onClick: () => void handleResendVerification(user),
      });
    }

    items.push({
      key: 'delete',
      label: t('common.delete'),
      danger: true,
      onClick: () => setDeletingUser(user),
    });

    return items;
  }

  return (
    <div className="space-y-4">
      {importOpen && (
        <UserImportModal
          onClose={() => setImportOpen(false)}
          onImported={(summary) =>
            setActionMessage({ type: 'success', text: summary })
          }
        />
      )}

      <ConfirmDialog
        open={Boolean(deletingUser)}
        title={t('users.deleteEmployee')}
        description={
          deletingUser
            ? t('users.deleteDescription', {
                name: `${deletingUser.firstName} ${deletingUser.lastName}`,
                email: deletingUser.email ?? t('users.noEmailNoLogin'),
              })
            : undefined
        }
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteUser.isPending}
        onConfirm={() => void handleDeleteUser()}
        onCancel={() => setDeletingUser(null)}
      />

      {actionMessage && (
        <Alert
          type={actionMessage.type === 'success' ? 'success' : 'error'}
          showIcon
          title={actionMessage.text}
          closable
          onClose={() => setActionMessage(null)}
        />
      )}

      <FormLayout
        variant="pro"
        title={t('users.allUsers')}
        description={
          meta?.total === 1
            ? t('users.userCountOne')
            : t('users.userCount', { count: meta?.total ?? 0 })
        }
        extra={
          <Space wrap size={8}>
            <Button
              icon={<FileExcelOutlined />}
              loading={exportingUsers}
              onClick={() => void handleExportExcel()}
              style={{ borderRadius: 2 }}
            >
              {t('users.exportExcel')}
            </Button>
            <Button onClick={() => setImportOpen(true)} style={{ borderRadius: 2 }}>
              {t('common.importFromExcel')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/users/new')}
              style={{ borderRadius: 2 }}
            >
              {t('users.addEmployee')}
            </Button>
          </Space>
        }
      >
        <div className="erp-pro-filter-bar">
          <Input.Search
            placeholder={t('users.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 240, maxWidth: '100%' }}
          />
          <Select
            placeholder={t('users.filterDiscipline')}
            options={disciplineFilterOptions}
            allowClear
            style={{ minWidth: 160 }}
            value={disciplineFilter}
            onChange={handleDisciplineFilterChange}
          />
          <Select
            placeholder={t('users.filterDepartment')}
            options={departmentFilterOptions}
            allowClear
            style={{ minWidth: 180 }}
            value={departmentFilter}
            onChange={handleDepartmentFilterChange}
          />
          <Select
            placeholder={t('users.filterPosition')}
            options={positionFilterOptions}
            allowClear
            style={{ minWidth: 180 }}
            value={positionFilter}
            onChange={handlePositionFilterChange}
          />
          <Select
            placeholder={t('users.filterStatus')}
            options={[
              { label: t('common.active'), value: true },
              { label: t('common.inactive'), value: false },
            ]}
            allowClear
            style={{ minWidth: 130 }}
            value={statusFilter}
            onChange={handleStatusFilterChange}
          />
        </div>
        <DataTable<User>
          rowKey="id"
          className="erp-pro-table"
          size="middle"
          dataSource={users}
          pagination={bindMeta(meta)}
          onChange={handleTableChange}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Users />}
                title={t('users.noTeamMembers')}
                description={t('users.noTeamMembersDescription')}
                action={{
                  label: t('users.addEmployee'),
                  onClick: () => router.push('/users/new'),
                }}
              />
            ),
          }}
          columns={[
            {
              title: t('common.name'),
              key: 'name',
              sorter: true,
              align: 'left',
              render: (_, record) => (
                <div className="flex flex-col items-start text-left">
                  <Button
                    type="link"
                    className="!h-auto !justify-start !px-0 !py-0 font-medium"
                    style={{
                      borderRadius: 0,
                      height: 'auto',
                      paddingInline: 0,
                      textAlign: 'left',
                    }}
                    onClick={() => router.push(`/users/${record.id}`)}
                  >
                    {record.firstName} {record.lastName}
                  </Button>
                  {record.chineseName ? (
                    <span
                      className="block text-left"
                      style={{
                        color: tokens.colorTextSecondary,
                        fontSize: 12,
                        lineHeight: 1.4,
                        marginTop: 2,
                      }}
                    >
                      {record.chineseName}
                    </span>
                  ) : null}
                </div>
              ),
            },
            {
              title: t('common.department'),
              key: 'department',
              ellipsis: { showTitle: true },
              sorter: true,
              render: (_, record) =>
                record.department?.name ?? (
                  <span style={{ color: tokens.colorTextSecondary }}>-</span>
                ),
            },
            {
              title: t('common.position'),
              key: 'position',
              ellipsis: { showTitle: true },
              sorter: true,
              render: (_, record) =>
                record.position?.title ?? (
                  <span style={{ color: tokens.colorTextSecondary }}>-</span>
                ),
            },
            {
              title: t('common.email'),
              key: 'email',
              ellipsis: { showTitle: true },
              sorter: true,
              render: (_, record) => record.email || '-',
            },
            {
              title: t('common.discipline'),
              key: 'discipline',
              ellipsis: { showTitle: true },
              render: (_, record) => {
                if (!record.engineeringDisciplineId) {
                  return '-';
                }
                const name =
                  record.engineeringDiscipline?.name ??
                  disciplineNameById.get(record.engineeringDisciplineId) ??
                  '-';
                const nameZh = record.engineeringDiscipline?.nameZh;
                return (
                  <div className="flex flex-col">
                    <span>{name}</span>
                    {nameZh ? (
                      <span
                        style={{ color: tokens.colorTextSecondary, fontSize: 12 }}
                      >
                        {nameZh}
                      </span>
                    ) : null}
                  </div>
                );
              },
            },
            {
              title: t('common.role'),
              key: 'roles',
              ellipsis: { showTitle: true },
              render: (_, record) => {
                const roles =
                  record.userRoles?.map((assignment) => ({
                    name: assignment.role.name,
                    isPrimary: assignment.isPrimary,
                  })) ?? [];
                if (roles.length === 0) {
                  return '-';
                }
                const topRole = pickTopLevelRoleName(roles, '');
                if (!topRole) {
                  return '-';
                }
                const isPrimary = roles.some(
                  (role) => role.name === topRole && role.isPrimary,
                );
                return (
                  <Space size={4}>
                    <Tag color={ROLE_COLOR_MAP[topRole] ?? 'default'}>
                      {topRole}
                    </Tag>
                    {isPrimary ? (
                      <Tag color="gold">{t('users.primaryRole')}</Tag>
                    ) : null}
                  </Space>
                );
              },
            },
            {
              title: t('common.status'),
              key: 'status',
              sorter: true,
              render: (_, record) => (
                <StatusBadge
                  label={userStatusLabel(record, t)}
                  variant={userStatusVariant(record)}
                />
              ),
            },
            {
              title: t('common.actions'),
              key: 'actions',
              width: 120,
              fixed: 'right',
              render: (_, record) => (
                <Space size={0}>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => router.push(`/users/${record.id}/edit`)}
                    style={{ borderRadius: 2, paddingInline: 4 }}
                  >
                    {t('common.update')}
                  </Button>
                  <Dropdown
                    menu={{ items: buildActionMenu(record) }}
                    trigger={['click']}
                    disabled={resendInvitation.isPending}
                  >
                    <Button
                      type="link"
                      size="small"
                      icon={<MoreOutlined />}
                      aria-label={t('users.actionsFor', {
                        name: `${record.firstName} ${record.lastName}`,
                      })}
                      style={{ borderRadius: 2, paddingInline: 4 }}
                    />
                  </Dropdown>
                </Space>
              ),
            },
          ]}
        />
      </FormLayout>
    </div>
  );
}
