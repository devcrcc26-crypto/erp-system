'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Avatar,
  Button,
  Dropdown,
  Input,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  type MenuProps,
} from 'antd';
import type {
  FilterValue,
  SorterResult,
  TablePaginationConfig,
} from 'antd/es/table/interface';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
  UserDeleteOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Users } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import ThreePeopleIcon from '@/components/ThreePeopleIcon';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
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
  useAllUsers,
  useDeleteUser,
  useResendInvitation,
  useUserPhotoUrl,
} from '@/lib/query/users';
import type { EmployeeType, Nationality, User } from '@/lib/api/types';
import {
  useDepartments,
  useEngineeringDisciplineOptions,
  usePositions,
} from '@/lib/query/org';
import { exportUsersExcel } from '@/lib/utils/users-export-excel';
import {
  filterAndSortUsers,
  paginateUsers,
  type UsersListSortField,
} from '@/lib/utils/users-list-filter';
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

const COLUMN_SORT_FIELD: Record<string, UsersListSortField> = {
  name: 'name',
  email: 'email',
  department: 'department',
  position: 'position',
  status: 'status',
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
    email: t('common.email'),
    firstName: t('users.form.firstName'),
    lastName: t('users.form.lastName'),
    middleName: t('users.form.middleName'),
    chineseName: t('users.form.chineseName'),
    role: t('common.role'),
    phone: t('users.exportTable.phone'),
    discipline: t('common.discipline'),
    gender: t('users.form.gender'),
    department: t('common.department'),
    position: t('common.position'),
    employeeId: t('users.form.employeeId'),
    nationality: t('users.form.nationality'),
    employeeType: t('users.form.employeeType'),
    dateOfBirth: t('users.form.dateOfBirth'),
    nationalId: t('users.form.nationalId'),
    educationLevel: t('users.form.educationLevel'),
    fieldOfStudy: t('users.form.fieldOfStudy'),
    experienceStartDate: t('users.form.experienceStartDate'),
    yearsOfExperience: t('users.form.yearsOfExperience'),
    addressCountry: t('users.form.addressCountry'),
    addressRegion: t('users.form.addressRegion'),
    addressCity: t('users.form.addressCity'),
    addressSubcity: t('users.form.addressSubcity'),
    addressWoreda: t('users.form.addressWoreda'),
    addressHouseNumber: t('users.form.addressHouseNumber'),
    leavePolicy: t('users.form.leavePolicy'),
    emergencyContacts: t('users.sectionEmergencyContact'),
    status: t('common.status'),
    lastLogin: t('users.exportTable.lastLogin'),
  };
}

function isPendingActivation(user: User): boolean {
  return Boolean(user.isActive && user.email && !user.emailVerifiedAt);
}

function UserListAvatar({ user }: { user: User }): React.ReactNode {
  const photoQuery = useUserPhotoUrl(user.id, user.photoDocumentId);
  const initials =
    `${user.firstName?.charAt(0) ?? ''}${user.lastName?.charAt(0) ?? ''}`.toUpperCase();

  return (
    <Avatar
      size={32}
      src={photoQuery.data?.url}
      icon={!photoQuery.data?.url && !initials ? <UserOutlined /> : undefined}
      style={{
        backgroundColor: photoQuery.data?.url
          ? undefined
          : tokens.colorPrimaryLight,
        color: tokens.colorPrimary,
        fontSize: 12,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials}
    </Avatar>
  );
}

export default function UsersPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const router = useRouter();
  const authUser = useAuthStore((state) => state.user);
  const { params, bindMeta, resetPage } = useTablePagination(10);
  const [exportingUsers, setExportingUsers] = useState(false);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState<string | undefined>();
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>();
  const [positionFilter, setPositionFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>();
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<
    EmployeeType | undefined
  >();
  const [nationalityFilter, setNationalityFilter] = useState<
    Nationality | undefined
  >();
  const [sortBy, setSortBy] = useState<UsersListSortField | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = search.trim();
      setAppliedSearch((prev) => {
        if (prev !== next) {
          setTimeout(() => resetPage(), 0);
        }
        return next;
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [search, resetPage]);

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

  const usersQuery = useAllUsers();
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

  const allUsers = usersQuery.data ?? [];

  const userStats = useMemo(() => {
    let activeCount = 0;
    let pendingCount = 0;
    let inactiveCount = 0;
    for (const user of allUsers) {
      if (!user.isActive) {
        inactiveCount += 1;
      } else if (isPendingActivation(user)) {
        pendingCount += 1;
      } else {
        activeCount += 1;
      }
    }
    return {
      totalCount: allUsers.length,
      activeCount,
      pendingCount,
      inactiveCount,
    };
  }, [allUsers]);

  const filteredUsers = useMemo(() => {
    const base = filterAndSortUsers({
      users: allUsers,
      search: appliedSearch,
      disciplineId: disciplineFilter,
      departmentId: departmentFilter,
      positionId: positionFilter,
      isActive: statusFilter,
      sortBy,
      sortOrder,
    });

    return base.filter((user) => {
      if (employeeTypeFilter && user.employeeType !== employeeTypeFilter) {
        return false;
      }
      if (nationalityFilter && user.nationality !== nationalityFilter) {
        return false;
      }
      return true;
    });
  }, [
    allUsers,
    appliedSearch,
    disciplineFilter,
    departmentFilter,
    positionFilter,
    statusFilter,
    employeeTypeFilter,
    nationalityFilter,
    sortBy,
    sortOrder,
  ]);

  const { data: users, meta } = useMemo(
    () => paginateUsers(filteredUsers, params.page ?? 1, params.limit ?? 50),
    [filteredUsers, params.page, params.limit],
  );

  const companyName = authUser?.companyName ?? 'Company';

  const handleExportExcel = useCallback(async (): Promise<void> => {
    setExportingUsers(true);
    try {
      const generatedAt = new Date().toISOString();

      await exportUsersExcel({
        companyName,
        generatedAt,
        labels: buildUsersExportLabels(t),
        users: allUsers,
        formatUserRoles: formatUserRoleNames,
        statusLabel: (user) => userStatusLabel(user, t),
      });
      messageApi.success(t('users.exportSuccess'));
    } catch {
      messageApi.error(t('users.exportError'));
    } finally {
      setExportingUsers(false);
    }
  }, [allUsers, companyName, messageApi, t]);

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setDisciplineFilter(undefined);
    setDepartmentFilter(undefined);
    setPositionFilter(undefined);
    setStatusFilter(undefined);
    setEmployeeTypeFilter(undefined);
    setNationalityFilter(undefined);
    resetPage();
  }

  async function handleRefresh(): Promise<void> {
    await usersQuery.refetch();
  }

  if (usersQuery.isLoading && !usersQuery.data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  if (usersQuery.isError && !usersQuery.data) {
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
    const items: MenuProps['items'] = [
      {
        key: 'update',
        icon: <EditOutlined />,
        label: t('common.update'),
        onClick: () => router.push(`/users/${user.id}/edit`),
      },
    ];

    if (showResend) {
      items.push({
        key: 'resend',
        icon: <ReloadOutlined />,
        label: t('users.resendVerification'),
        onClick: () => void handleResendVerification(user),
      });
    }

    items.push({
      key: 'delete',
      icon: <UserDeleteOutlined />,
      label: t('common.delete'),
      danger: true,
      onClick: () => setDeletingUser(user),
    });

    return items;
  }

  const pagination = bindMeta(meta);

  return (
    <div className="flex flex-col gap-4">
      {importOpen ? (
        <UserImportModal
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            setActionMessage({ type: 'success', text: summary });
            void usersQuery.refetch();
          }}
        />
      ) : null}

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

      <div>
        <h1
          className="m-0 text-xl font-semibold tracking-tight"
          style={{ color: tokens.colorTextPrimary, fontFamily: tokens.fontFamily }}
        >
          {t('users.title')}
        </h1>
        <p
          className="mb-0 mt-1 text-sm"
          style={{ color: tokens.colorTextSecondary }}
        >
          Manage employees, roles, and access across the organization.
        </p>
      </div>

      <div className="mb-1 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total Employees"
          value={userStats.totalCount}
          color="teal"
          icon={<Users size={14} />}
        />
        <StatCard
          label="Active"
          value={userStats.activeCount}
          color="green"
          icon={<CheckCircleOutlined />}
        />
        <StatCard
          label="Pending Activation"
          value={userStats.pendingCount}
          color="amber"
          icon={<ClockCircleOutlined />}
        />
        <StatCard
          label="Inactive"
          value={userStats.inactiveCount}
          color="default"
          icon={<UserDeleteOutlined />}
        />
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input.Search
            placeholder={t('users.searchPlaceholder')}
            className="w-72"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(value) => {
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              setAppliedSearch('');
              resetPage();
            }}
          />
          <Select
            placeholder={t('users.filterDiscipline')}
            className="w-40"
            allowClear
            options={disciplineFilterOptions}
            value={disciplineFilter}
            onChange={(value?: string) => {
              setDisciplineFilter(value);
              resetPage();
            }}
          />
          <Select
            placeholder={t('users.filterDepartment')}
            className="w-40"
            allowClear
            options={departmentFilterOptions}
            value={departmentFilter}
            onChange={(value?: string) => {
              setDepartmentFilter(value);
              resetPage();
            }}
          />
          <Select
            placeholder={t('users.filterPosition')}
            className="w-44"
            allowClear
            options={positionFilterOptions}
            value={positionFilter}
            onChange={(value?: string) => {
              setPositionFilter(value);
              resetPage();
            }}
          />
          <Select
            placeholder={t('users.filterStatus')}
            className="w-36"
            allowClear
            options={[
              { label: t('common.active'), value: true },
              { label: t('common.inactive'), value: false },
            ]}
            value={statusFilter}
            onChange={(value?: boolean) => {
              setStatusFilter(value);
              resetPage();
            }}
          />
          <Select
            placeholder={t('users.form.employeeType')}
            className="w-36"
            allowClear
            options={[
              {
                value: 'PERMANENT',
                label: t('hr.employeeType.PERMANENT'),
              },
              {
                value: 'CONTRACT',
                label: t('hr.employeeType.CONTRACT'),
              },
              {
                value: 'TEMPORARY',
                label: t('hr.employeeType.TEMPORARY'),
              },
            ]}
            value={employeeTypeFilter}
            onChange={(value?: EmployeeType) => {
              setEmployeeTypeFilter(value);
              resetPage();
            }}
          />
          <Select
            placeholder={t('users.form.nationality')}
            className="w-36"
            allowClear
            options={[
              {
                value: 'ETHIOPIAN',
                label: t('hr.nationality.ETHIOPIAN'),
              },
              {
                value: 'CHINESE',
                label: t('hr.nationality.CHINESE'),
              },
            ]}
            value={nationalityFilter}
            onChange={(value?: Nationality) => {
              setNationalityFilter(value);
              resetPage();
            }}
          />
          <Button onClick={handleResetFilters} style={{ borderRadius: 0 }}>
            {t('common.reset')}
          </Button>
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={usersQuery.isFetching && !usersQuery.isLoading}
              onClick={() => void handleRefresh()}
              aria-label={t('common.refresh')}
              style={{ borderRadius: 0 }}
            />
          </Tooltip>
        </div>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-5 py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Users size={16} style={{ color: tokens.colorPrimary }} />
            <h3
              className="m-0 text-sm font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {t('users.allUsers')}
            </h3>
            <span
              className="text-xs"
              style={{ color: tokens.colorTextTertiary }}
            >
              {meta.total === 1
                ? t('users.userCountOne')
                : t('users.userCount', { count: meta.total })}
            </span>
          </div>
          <Space wrap size={8}>
            <Button
              icon={<DownloadOutlined />}
              loading={exportingUsers}
              onClick={() => void handleExportExcel()}
              style={{ borderRadius: 0 }}
            >
              {t('users.exportExcel')}
            </Button>
            <Button
              icon={<UploadOutlined />}
              onClick={() => setImportOpen(true)}
              style={{ borderRadius: 0 }}
            >
              {t('common.importFromExcel')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/users/new')}
              style={{ borderRadius: 0 }}
            >
              {t('users.addEmployee')}
            </Button>
          </Space>
        </div>

        <div className="px-0">
          <DataTable<User>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            dataSource={users}
            scroll={false}
            pagination={
              pagination
                ? {
                    ...pagination,
                    pageSizeOptions: ['10', '20', '50', '100'],
                  }
                : undefined
            }
            onChange={handleTableChange}
            onRow={(record) => ({
              onClick: () => router.push(`/users/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4] ',
            })}
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
                title: '',
                key: 'avatar',
                width: 48,
                render: (_, record) => <UserListAvatar user={record} />,
              },
              {
                title: t('common.name'),
                key: 'name',
                sorter: true,
                render: (_, record) => (
                  <div className="min-w-0 py-0.5">
                    <p
                      className="m-0 text-sm font-medium"
                      style={{ color: tokens.colorTextPrimary }}
                    >
                      {record.firstName} {record.lastName}
                    </p>
                    {record.chineseName ? (
                      <p
                        className="m-0 text-xs"
                        style={{ color: tokens.colorTextTertiary }}
                      >
                        {record.chineseName}
                      </p>
                    ) : null}
                    <p
                      className="m-0 truncate text-xs"
                      style={{ color: tokens.colorTextTertiary }}
                    >
                      {record.email ?? t('users.noEmailNoLogin')}
                    </p>
                  </div>
                ),
              },
              {
                title: 'ID',
                dataIndex: 'employeeId',
                key: 'employeeId',
                width: 100,
                render: (id: string | null | undefined) => (
                  <span
                    className="font-[family-name:var(--font-mono)] text-xs"
                    style={{ color: tokens.colorTextSecondary }}
                  >
                    {id ?? '—'}
                  </span>
                ),
              },
              {
                title: t('common.department'),
                key: 'department',
                ellipsis: { showTitle: true },
                sorter: true,
                render: (_, record) =>
                  record.department?.name ?? (
                    <span style={{ color: tokens.colorTextSecondary }}>—</span>
                  ),
              },
              {
                title: t('common.position'),
                key: 'position',
                ellipsis: { showTitle: true },
                sorter: true,
                render: (_, record) =>
                  record.position?.title ?? (
                    <span style={{ color: tokens.colorTextSecondary }}>—</span>
                  ),
              },
              {
                title: 'Type',
                dataIndex: 'employeeType',
                key: 'employeeType',
                width: 110,
                render: (type: EmployeeType | null | undefined) =>
                  type ? (
                    <span
                      className="text-xs"
                      style={{ color: tokens.colorTextSecondary }}
                    >
                      {t(`hr.employeeType.${type}`)}
                    </span>
                  ) : (
                    '—'
                  ),
              },
              {
                title: t('common.discipline'),
                key: 'discipline',
                ellipsis: { showTitle: true },
                render: (_, record) => {
                  if (!record.engineeringDisciplineId) {
                    return '—';
                  }
                  const name =
                    record.engineeringDiscipline?.name ??
                    disciplineNameById.get(record.engineeringDisciplineId) ??
                    '—';
                  const nameZh = record.engineeringDiscipline?.nameZh;
                  return (
                    <div className="flex flex-col">
                      <span className="text-sm">{name}</span>
                      {nameZh ? (
                        <span
                          className="text-xs"
                          style={{ color: tokens.colorTextSecondary }}
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
                    return '—';
                  }
                  const topRole = pickTopLevelRoleName(roles, '');
                  if (!topRole) {
                    return '—';
                  }
                  const isPrimary = roles.some(
                    (role) => role.name === topRole && role.isPrimary,
                  );
                  return (
                    <Space size={4}>
                      <Tag color={ROLE_COLOR_MAP[topRole] ?? 'default'}>
                        {topRole}
                      </Tag>
                      {/* {isPrimary ? (
                        <Tag color="gold">{t('users.primaryRole')}</Tag>
                      ) : null} */}
                    </Space>
                  );
                },
              },
              {
                title: t('common.status'),
                key: 'status',
                width: 120,
                sorter: true,
                render: (_, record) => (
                  <StatusBadge
                    label={userStatusLabel(record, t)}
                    variant={userStatusVariant(record)}
                  />
                ),
              },
              {
                title: '',
                key: 'actions',
                width: 56,
                render: (_, record) => (
                  <div
                    className="flex items-center justify-end"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Dropdown
                      menu={{ items: buildActionMenu(record) }}
                      trigger={['click']}
                      disabled={resendInvitation.isPending}
                    >
                      <Button
                        size="small"
                        type="text"
                        icon={<MoreOutlined />}
                        aria-label={t('users.actionsFor', {
                          name: `${record.firstName} ${record.lastName}`,
                        })}
                        style={{ borderRadius: 0 }}
                      />
                    </Dropdown>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
