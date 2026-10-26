'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import './employees-v2.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Dropdown,
  Grid,
  Input,
  Modal,
  Popover,
  Select,
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
  EditOutlined,
  FilterOutlined,
  KeyOutlined,
  MoreOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserDeleteOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Users } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import { ImagePreviewTrigger } from '@/components/shared/preview';
import ThreePeopleIcon from '@/components/ThreePeopleIcon';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import UserImportModal from '@/components/modules/users/UserImportModal';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useCanEditUsers, useIsSystemAdmin } from '@/hooks/use-auth-capabilities';
import { ApproverOnlyTag } from '@/components/modules/users/EmployeeApproverOnlyField';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import {
  PROTECTED_SYSTEM_ADMIN_EMPLOYEE_ID,
  SYSTEM_ADMINISTRATOR_ROLE,
} from '@/lib/constants/protected-accounts';
import {
  useAdminResetPassword,
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
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import { buildUsersExportSheets } from '@/lib/utils/users-export';
import {
  filterAndSortUsers,
  paginateUsers,
  type UsersListSortField,
} from '@/lib/utils/users-list-filter';
import { formatUserName, pickTopLevelRoleName } from '@/lib/utils/user-display';
import { avatarTint, userInitials } from '@/lib/utils/avatar-tint';
import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
import { canResetUserPassword } from '@/lib/utils/user-permissions';
import { getRoleColor, formatRoleDisplayName } from '@/lib/utils/role-colors';
import {
  userStatusLabel,
  userStatusVariant,
} from '@/lib/utils/user-status';

const PAGE_ROOT = `erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 ${LIST_PAGE_V2}`;

const COLUMN_SORT_FIELD: Record<string, UsersListSortField> = {
  name: 'name',
  employeeId: 'employeeId',
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
  return top ? formatRoleDisplayName(top) : '-';
}


function isPendingActivation(user: User): boolean {
  return Boolean(user.isActive && user.email && !user.emailVerifiedAt);
}

function UserListAvatar({ user }: { user: User }): React.ReactNode {
  const photoQuery = useUserPhotoUrl(user.id, user.photoDocumentId);
  const initials = userInitials(user.firstName, user.lastName);
  const tint = avatarTint(user.id);

  return (
    <ImagePreviewTrigger
      src={photoQuery.data?.url}
      alt={formatUserName(user)}
      className="!rounded-xl"
    >
      <Avatar
        size={40}
        shape="square"
        className="erp-users-avatar"
        src={photoQuery.data?.url}
        icon={!photoQuery.data?.url && !initials ? <UserOutlined /> : undefined}
        style={{
          backgroundColor: photoQuery.data?.url ? undefined : tint.bg,
          color: tint.fg,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {initials}
      </Avatar>
    </ImagePreviewTrigger>
  );
}

/** Truncates long cell text and exposes the full value on hover. */
function TruncateText({
  value,
  className = '',
  style,
}: {
  value: string;
  className?: string;
  style?: React.CSSProperties;
}): React.ReactNode {
  return (
    <Tooltip title={value} mouseEnterDelay={0.35}>
      <span className={`block truncate ${className}`.trim()} style={style}>
        {value}
      </span>
    </Tooltip>
  );
}

const USER_STATUS_DOT: Record<'success' | 'warning' | 'default', string> = {
  success: '#16a34a',
  warning: '#d97706',
  default: '#94a3b8',
};

const USER_STAT_ACCENT: Record<
  'teal' | 'green' | 'amber' | 'slate',
  { bg: string; fg: string }
> = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  slate: { bg: '#EEF1F4', fg: '#64748B' },
};

/** One segment of the users-page stat bar: tinted icon chip + label + value. */
function UserStat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: number;
  accent: keyof typeof USER_STAT_ACCENT;
  icon: React.ReactNode;
}): React.ReactNode {
  const tint = USER_STAT_ACCENT[accent];
  return (
    <div className="erp-users-stat">
      <span
        className="erp-users-stat-chip"
        style={{ background: tint.bg, color: tint.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-users-stat-value">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

/** One consistent dot + label for every status (active / pending / inactive / no login). */
function UserStatusIndicator({
  user,
  t,
}: {
  user: User;
  t: (key: string, vars?: Record<string, string | number>) => string;
}): React.ReactNode {
  const variant = userStatusVariant(user);
  const label = userStatusLabel(user, t);

  return (
    <span className="erp-users-status" data-variant={variant}>
      <span
        aria-hidden
        className="erp-users-status-dot"
        style={{ background: USER_STATUS_DOT[variant] }}
      />
      {label}
    </span>
  );
}

export default function UsersPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const viewerIsAdmin = useIsSystemAdmin();
  const canEditUsers = useCanEditUsers();
  const { params, bindMeta, resetPage } = useTablePagination(10);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState<string | undefined>();
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>();
  const [positionFilter, setPositionFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>();
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState<
    'ACTIVE' | 'INACTIVE' | 'SEPARATED' | undefined
  >();
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<
    EmployeeType | undefined
  >();
  const [nationalityFilter, setNationalityFilter] = useState<
    Nationality | undefined
  >();
  const [filterNoRole, setFilterNoRole] = useState(false);
  const [showLoginNameColumn, setShowLoginNameColumn] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem('erp.users.showLoginName') === '1';
  });
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
  const adminResetPassword = useAdminResetPassword();
  const [tempPasswordModal, setTempPasswordModal] = useState<{
    name: string;
    temporaryPassword: string;
  } | null>(null);
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
        label: position.titleZh
          ? `${position.title} / ${position.titleZh}`
          : position.title,
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
      if (filterNoRole && (user.userRoles?.length ?? 0) > 0) {
        return false;
      }
      if (
        employmentStatusFilter &&
        (user.employmentStatus ?? 'ACTIVE') !== employmentStatusFilter
      ) {
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
    filterNoRole,
    employmentStatusFilter,
    sortBy,
    sortOrder,
  ]);

  const { data: users, meta } = useMemo(
    () => paginateUsers(filteredUsers, params.page ?? 1, params.limit ?? 50),
    [filteredUsers, params.page, params.limit],
  );


  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setDisciplineFilter(undefined);
    setDepartmentFilter(undefined);
    setPositionFilter(undefined);
    setStatusFilter(undefined);
    setEmploymentStatusFilter(undefined);
    setEmployeeTypeFilter(undefined);
    setNationalityFilter(undefined);
    setFilterNoRole(false);
    resetPage();
  }

  const moreFilterCount = useMemo(() => {
    let count = 0;
    if (disciplineFilter) count += 1;
    if (positionFilter) count += 1;
    if (employeeTypeFilter) count += 1;
    if (nationalityFilter) count += 1;
    if (filterNoRole) count += 1;
    return count;
  }, [
    disciplineFilter,
    positionFilter,
    employeeTypeFilter,
    nationalityFilter,
    filterNoRole,
  ]);

  const hasActiveFilters = Boolean(
    appliedSearch ||
      departmentFilter ||
      statusFilter !== undefined ||
      employmentStatusFilter !== undefined ||
      moreFilterCount > 0,
  );

  async function handleRefresh(): Promise<void> {
    await usersQuery.refetch();
  }

  if (usersQuery.isLoading && !usersQuery.data) {
    return (
      <div className={PAGE_ROOT}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
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

  async function handleAdminResetPassword(user: User): Promise<void> {
    setActionMessage(null);
    try {
      const result = await adminResetPassword.mutateAsync(user.id);
      setTempPasswordModal({
        name: formatUserName(user),
        temporaryPassword: result.temporaryPassword,
      });
    } catch (error) {
      setActionMessage({
        type: 'error',
        text:
          error instanceof ApiRequestError
            ? error.message
            : 'Could not reset password',
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
          name: formatUserName(deletingUser),
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
    const isProtectedAccount =
      user.employeeId === PROTECTED_SYSTEM_ADMIN_EMPLOYEE_ID;
    const targetIsAdmin = Boolean(
      user.userRoles?.some(
        (assignment) => assignment.role.name === SYSTEM_ADMINISTRATOR_ROLE,
      ),
    );
    const showDestructiveActions =
      !isProtectedAccount && (!targetIsAdmin || viewerIsAdmin);

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

    if (canResetUserPassword(user, canEditUsers)) {
      items.push({
        key: 'reset-password',
        icon: <KeyOutlined />,
        label: 'Reset password',
        onClick: () => void handleAdminResetPassword(user),
      });
    }

    if (showDestructiveActions) {
      items.push({
        key: 'delete',
        icon: <UserDeleteOutlined />,
        label: t('common.delete'),
        danger: true,
        onClick: () => setDeletingUser(user),
      });
    } else if (isProtectedAccount) {
      items.push({
        key: 'delete',
        icon: <UserDeleteOutlined />,
        label: t('common.delete'),
        danger: true,
        disabled: true,
        title: t('users.accountProtectedCannotDeactivate'),
      });
    }

    return items;
  }

  const pagination = bindMeta(meta);

  return (
    <div className={PAGE_ROOT}>
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
        className="erp-hr-travel-modal"
        open={Boolean(deletingUser)}
        title={t('users.deleteEmployee')}
        description={
          deletingUser
            ? t('users.deleteDescription', {
                name: formatUserName(deletingUser),
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

      <Modal
        open={Boolean(tempPasswordModal)}
        title="Temporary password"
        okText="I have copied it"
        cancelButtonProps={{ style: { display: 'none' } }}
        onOk={() => setTempPasswordModal(null)}
        onCancel={() => setTempPasswordModal(null)}
        destroyOnHidden
        rootClassName="erp-hr-travel-modal"
        className="erp-hr-travel-modal"
      >
        {tempPasswordModal ? (
          <div className="space-y-3">
            <p className="m-0 text-sm text-slate-600">
              Shown once for {tempPasswordModal.name}. The user must change this
              password on next sign-in.
            </p>
            <Input.Password
              value={tempPasswordModal.temporaryPassword}
              readOnly
              size="large"
            />
          </div>
        ) : null}
      </Modal>

      {actionMessage ? (
        <Alert
          type={actionMessage.type === 'success' ? 'success' : 'error'}
          showIcon
          title={actionMessage.text}
          closable
          onClose={() => setActionMessage(null)}
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <UserStat
          label={t('users.stats.total')}
          value={userStats.totalCount}
          accent="teal"
          icon={<Users size={15} />}
        />
        <UserStat
          label={t('users.stats.active')}
          value={userStats.activeCount}
          accent="green"
          icon={<CheckCircleOutlined />}
        />
        <UserStat
          label={t('users.stats.pending')}
          value={userStats.pendingCount}
          accent="amber"
          icon={<ClockCircleOutlined />}
        />
        <UserStat
          label={t('users.stats.inactive')}
          value={userStats.inactiveCount}
          accent="slate"
          icon={<UserDeleteOutlined />}
        />
      </div>

      <div className="erp-pro-card erp-employees-list-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">{t('users.allUsers')}</h3>
            <span className="erp-users-count-pill">
              {meta.total.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title={t('common.refresh')}>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={usersQuery.isFetching && !usersQuery.isLoading}
                onClick={() => void handleRefresh()}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
            <HrListActions
              compact={isCompact}
              exports={[
                {
                  key: 'export',
                  filePrefix: 'users',
                  disabled: filteredUsers.length === 0,
                  buildSheets: () =>
                    buildUsersExportSheets(
                      filteredUsers,
                      formatUserRoleNames,
                      (user) => userStatusLabel(user, t),
                    ),
                },
              ]}
              onImport={() => setImportOpen(true)}
              primary={{
                label: t('users.addEmployee'),
                onClick: () => router.push('/users/new'),
              }}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('users.searchPlaceholder')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              if (value === '') {
                setAppliedSearch('');
                resetPage();
              }
            }}
            onPressEnter={() => {
              setAppliedSearch(search.trim());
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              setAppliedSearch('');
              resetPage();
            }}
            aria-label={t('users.searchPlaceholder')}
          />
          <span className="erp-users-filter-spacer" aria-hidden />
          <Checkbox
            checked={showLoginNameColumn}
            onChange={(event) => {
              const checked = event.target.checked;
              setShowLoginNameColumn(checked);
              window.localStorage.setItem(
                'erp.users.showLoginName',
                checked ? '1' : '0',
              );
            }}
          >
            {t('users.showLoginNameColumn')}
          </Checkbox>
          <Select
            placeholder={t('users.filterDepartment')}
            className="erp-users-filter-select"
            allowClear
            options={departmentFilterOptions}
            value={departmentFilter}
            onChange={(value?: string) => {
              setDepartmentFilter(value);
              resetPage();
            }}
            aria-label={t('common.department')}
          />
          <Select
            placeholder={t('users.filterStatus')}
            className="erp-users-filter-select"
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
            aria-label={t('common.status')}
          />
          <Select
            placeholder={t('users.employment.filterEmploymentStatus')}
            className="erp-users-filter-select"
            allowClear
            options={[
              { label: t('users.employment.statusActive'), value: 'ACTIVE' },
              { label: t('users.employment.statusInactiveShort'), value: 'INACTIVE' },
              { label: t('users.employment.statusSeparatedShort'), value: 'SEPARATED' },
            ]}
            value={employmentStatusFilter}
            onChange={(value?: 'ACTIVE' | 'INACTIVE' | 'SEPARATED') => {
              setEmploymentStatusFilter(value);
              resetPage();
            }}
            aria-label={t('users.employment.filterEmploymentStatus')}
          />
          <Checkbox
            checked={filterNoRole}
            onChange={(event) => {
              setFilterNoRole(event.target.checked);
              resetPage();
            }}
          >
            {t('users.filterNoRole')}
          </Checkbox>
          <Popover
            trigger="click"
            placement={isCompact ? 'bottom' : 'bottomLeft'}
            open={moreFiltersOpen}
            onOpenChange={setMoreFiltersOpen}
            content={
              <div className="erp-users-more-filters flex w-[min(260px,calc(100vw-48px))] flex-col gap-3 p-1">
                <Select
                  placeholder={t('users.filterDiscipline')}
                  className="w-full"
                  allowClear
                  options={disciplineFilterOptions}
                  value={disciplineFilter}
                  onChange={(value?: string) => {
                    setDisciplineFilter(value);
                    resetPage();
                  }}
                  aria-label={t('common.discipline')}
                />
                <Select
                  placeholder={t('users.filterPosition')}
                  className="w-full"
                  allowClear
                  options={positionFilterOptions}
                  value={positionFilter}
                  onChange={(value?: string) => {
                    setPositionFilter(value);
                    resetPage();
                  }}
                  aria-label={t('common.position')}
                />
                <Select
                  placeholder={t('users.form.employeeType')}
                  className="w-full"
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
                    {
                      value: 'FREELANCER',
                      label: t('hr.employeeType.FREELANCER'),
                    },
                  ]}
                  value={employeeTypeFilter}
                  onChange={(value?: EmployeeType) => {
                    setEmployeeTypeFilter(value);
                    resetPage();
                  }}
                  aria-label={t('users.form.employeeType')}
                />
                <Select
                  placeholder={t('users.form.nationality')}
                  className="w-full"
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
                  aria-label={t('users.form.nationality')}
                />
              </div>
            }
          >
            <Badge count={moreFilterCount} size="small" offset={[-2, 2]}>
              <Button icon={<FilterOutlined />}>
                {isNarrow ? t('users.filtersShort') : t('users.moreFilters')}
              </Button>
            </Badge>
          </Popover>
          {hasActiveFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<User>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            dataSource={users}
            scroll={{ x: isCompact ? 720 : 966 }}
            pagination={
              pagination
                ? {
                    ...pagination,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    simple: isNarrow,
                    showSizeChanger: !isNarrow,
                  }
                : undefined
            }
            onChange={handleTableChange}
            onRow={(record) => ({
              onClick: () => router.push(`/users/${record.id}`),
              className: 'cursor-pointer',
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
                title: t('common.name'),
                key: 'name',
                sorter: true,
                fixed: isCompact ? undefined : 'left',
                width: isCompact ? 280 : 300,
                render: (_, record) => {
                  const fullName = formatUserName(record);

                  return (
                    <div className="erp-users-person">
                      <UserListAvatar user={record} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <TruncateText
                            value={fullName}
                            className="erp-users-name whitespace-normal break-words"
                          />
                          {record.excludedFromHrProcesses ? (
                            <ApproverOnlyTag />
                          ) : null}
                        </div>
                        {record.email ? (
                          <TruncateText
                            value={record.email}
                            className="erp-users-email mt-0.5"
                          />
                        ) : (
                          <p className="erp-users-email m-0 mt-0.5">
                            {t('users.noEmailNoLogin')}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                },
              },
              {
                title: t('users.employeeIdColumn'),
                dataIndex: 'employeeId',
                key: 'employeeId',
                width: 104,
                sorter: true,
                render: (id: string | null | undefined) =>
                  id ? (
                    <span className="erp-users-id-chip">{id}</span>
                  ) : (
                    <span className="erp-users-dash">-</span>
                  ),
              },
              ...(showLoginNameColumn
                ? [
                    {
                      title: t('users.loginNameColumn'),
                      dataIndex: 'loginName' as const,
                      key: 'loginName',
                      width: 180,
                      render: (value: string | null | undefined) =>
                        value?.trim() ? (
                          <TruncateText
                            value={value}
                            className="erp-users-cell-strong"
                          />
                        ) : (
                          <span className="erp-users-dash">
                            {t('users.loginNameNotSet')}
                          </span>
                        ),
                    },
                  ]
                : []),
              {
                title: t('common.position'),
                key: 'position',
                width: 156,
                sorter: true,
                responsive: ['lg'],
                render: (_, record) => {
                  const positionTitle = record.position?.title ?? null;
                  const disciplineName = record.engineeringDisciplineId
                    ? (record.engineeringDiscipline?.name ??
                      disciplineNameById.get(record.engineeringDisciplineId) ??
                      null)
                    : null;

                  if (!positionTitle && !disciplineName) {
                    return <span className="erp-users-dash">-</span>;
                  }

                  return (
                    <div className="min-w-0">
                      {positionTitle ? (
                        <TruncateText
                          value={positionTitle}
                          className="erp-users-cell-strong"
                        />
                      ) : null}
                      {disciplineName ? (
                        <TruncateText
                          value={disciplineName}
                          className="erp-users-cell-sub mt-0.5"
                        />
                      ) : null}
                    </div>
                  );
                },
              },
              {
                title: t('common.department'),
                key: 'department',
                width: 156,
                sorter: true,
                responsive: ['md'],
                render: (_, record) =>
                  record.department?.name ? (
                    <TruncateText
                      value={record.department.name}
                      className="erp-users-cell-strong"
                    />
                  ) : (
                    <span className="erp-users-dash">-</span>
                  ),
              },
              {
                title: t('common.role'),
                key: 'roles',
                width: 148,
                ellipsis: true,
                responsive: ['md'],
                render: (_, record) => {
                  const assignments = record.userRoles ?? [];
                  if (assignments.length === 0) {
                    return (
                      <Tooltip title={t('users.noRoleTooltip')}>
                        <div className="erp-users-role-cell">
                          <Tag
                            color="error"
                            className="erp-users-role-chip"
                            style={{ margin: 0 }}
                          >
                            <WarningOutlined /> {t('users.noRole')}
                          </Tag>
                        </div>
                      </Tooltip>
                    );
                  }
                  const primaryRole =
                    assignments.find((ur) => ur.isPrimary) ??
                    assignments[0];
                  const extraCount = assignments.length - 1;
                  const allNames = assignments
                    .map((ur) => formatRoleDisplayName(ur.role.name))
                    .join(', ');
                  return (
                    <Tooltip title={allNames} mouseEnterDelay={0.35}>
                      <div className="erp-users-role-cell">
                        <Tag
                          color={getRoleColor(primaryRole.role.name)}
                          className="erp-users-role-chip"
                          style={{ margin: 0, fontWeight: 600 }}
                        >
                          {formatRoleDisplayName(primaryRole.role.name)}
                        </Tag>
                        {extraCount > 0 ? (
                          <Tag className="erp-users-role-extra" style={{ margin: 0 }}>
                            +{extraCount}
                          </Tag>
                        ) : null}
                      </div>
                    </Tooltip>
                  );
                },
              },
              {
                title: t('common.status'),
                key: 'status',
                width: isCompact ? 100 : 108,
                sorter: true,
                render: (_, record) => (
                  <UserStatusIndicator user={record} t={t} />
                ),
              },
              {
                title: '',
                key: 'actions',
                width: 44,
                align: 'right',
                fixed: isCompact ? undefined : 'right',
                render: (_, record) => (
                  <div
                    className="erp-table-row-actions flex items-center justify-end"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Dropdown
                      menu={{ items: buildActionMenu(record) }}
                      trigger={['click']}
                      placement="bottomRight"
                      rootClassName="erp-row-actions-menu"
                      disabled={resendInvitation.isPending}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined />}
                        aria-label={t('users.actionsFor', {
                          name: formatUserName(record),
                        })}
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
