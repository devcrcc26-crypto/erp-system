'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/profile/profile-v2.css';
import './employee-detail-v2.css';

import { useRef, useState } from 'react';
import { Alert, Button, Dropdown, Grid, Skeleton } from 'antd';
import type { MenuProps } from 'antd';
import {
  BarChartOutlined,
  CalendarOutlined,
  DollarOutlined,
  EditOutlined,
  FileTextOutlined,
  MailOutlined,
  MoreOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  ScheduleOutlined,
  StarOutlined,
  UserDeleteOutlined,
  UserOutlined,
  UserSwitchOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import MyEvaluationsPageContent from '@/components/modules/hr/evaluation/MyEvaluationsPageContent';
import EmployeeLeaveProfileSection from '@/components/modules/hr/leave/EmployeeLeaveProfileSection';
import EmployeeSiteAssignmentsSection from '@/components/modules/hr/site-assignment/EmployeeSiteAssignmentsSection';
import EmployeeOvertimeProfileSection from '@/components/modules/hr/overtime/EmployeeOvertimeProfileSection';
import EmployeeWorkScheduleSection from '@/components/modules/hr/work-schedule/EmployeeWorkScheduleSection';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import EmployeePayslipsSection from '@/components/modules/hr/payroll/EmployeePayslipsSection';
import EmployeeAttendanceProfileSection from '@/components/modules/profile/EmployeeAttendanceProfileSection';
import ProfileContractPeriodSelect from '@/components/modules/profile/ProfileContractPeriodSelect';
import { useProfileContractPeriod } from '@/hooks/use-profile-contract-period';
import EmployeeAccountAccessFields from '@/components/modules/users/EmployeeAccountAccessFields';
import { ApproverOnlyTag } from '@/components/modules/users/EmployeeApproverOnlyField';
import EmployeeProfileDocuments from '@/components/modules/users/EmployeeProfileDocuments';
import EmployeeProfilePhoto from '@/components/modules/users/EmployeeProfilePhoto';
import EmployeeRolesCard from '@/components/modules/users/EmployeeRolesCard';
import EmployeeSeparationBanner from '@/components/modules/users/EmployeeSeparationBanner';
import EmployeeSeparationDialog from '@/components/modules/users/EmployeeSeparationDialog';
import {
  EmployeeReactivateDialog,
  EmployeeSetInactiveDialog,
} from '@/components/modules/users/EmployeeInactiveDialogs';
import EmployeeRehireDialog from '@/components/modules/users/EmployeeRehireDialog';
import EmploymentHistorySection from '@/components/modules/users/EmploymentHistorySection';
import EmploymentStatusTag from '@/components/modules/users/EmploymentStatusTag';
import { useEmployment } from '@/lib/query/employment';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanCreatePayroll,
  useCanEditHr,
  useCanEditUsers,
  useCanManageEmployeePerDiemRates,
  useCanViewHr,
  useCanViewTeam,
  useIsSystemAdmin,
} from '@/hooks/use-auth-capabilities';
import EmployeeContractsSection from '@/components/modules/hr/employee-contract/EmployeeContractsSection';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { formatRoleDisplayName } from '@/lib/utils/role-colors';
import { ApiRequestError } from '@/lib/api/errors';
import type { EmergencyContact, UserDetail } from '@/lib/api/types';
import {
  PROTECTED_SYSTEM_ADMIN_EMPLOYEE_ID,
  SYSTEM_ADMINISTRATOR_ROLE,
} from '@/lib/constants/protected-accounts';
import { useCurrentUser } from '@/lib/query/profile';
import {
  useDeleteUser,
  useResendInvitation,
  useUser,
} from '@/lib/query/users';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import {
  userStatusLabel,
  userStatusVariant,
} from '@/lib/utils/user-status';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';

const DETAIL_ROOT = `erp-pro-list-page erp-users-page erp-employee-detail-page erp-profile-page erp-profile-v2 erp-employee-detail-v2 erp-hr-travel-v2 ${DETAIL_PAGE_V2}`;

const USER_STATUS_DOT: Record<'success' | 'warning' | 'default', string> = {
  success: '#16a34a',
  warning: '#d97706',
  default: '#94a3b8',
};

function displayValue(value: string | number | null | undefined): string {
  if (value == null || value === '') {
    return '-';
  }
  return String(value);
}

function formatEmergencyContactName(contact: EmergencyContact): string {
  return [contact.firstName, contact.middleName, contact.lastName]
    .filter(Boolean)
    .join(' ');
}

function formatAddress(user: UserDetail): string {
  const parts = [
    user.addressHouseNumber,
    user.addressWoreda,
    user.addressSubcity,
    user.addressCity,
    user.addressRegion,
    user.addressCountry,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length > 0 ? parts.join(', ') : '-';
}

const PROFILE_TABS = [
  'overview',
  'leave',
  'attendance',
  'workSchedule',
  'perDiem',
  'payroll',
  'evaluations',
  'contracts',
] as const;

type ProfileTab = (typeof PROFILE_TABS)[number];

const PERIOD_FILTER_TABS: ReadonlySet<ProfileTab> = new Set([
  'leave',
  'attendance',
  'payroll',
  'evaluations',
]);

const TAB_ICONS: Record<ProfileTab, React.ReactNode> = {
  overview: <UserOutlined />,
  leave: <CalendarOutlined />,
  attendance: <BarChartOutlined />,
  workSchedule: <ScheduleOutlined />,
  perDiem: <WalletOutlined />,
  payroll: <DollarOutlined />,
  evaluations: <StarOutlined />,
  contracts: <FileTextOutlined />,
};

function resolveProfileTab(value: string | null): ProfileTab {
  return PROFILE_TABS.find((tab) => tab === value) ?? 'overview';
}

/** Fact tile in the identity card; empty values read as a muted dash. */
function MetaStat({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}): React.ReactNode {
  const empty = value == null || value === '' || value === '-';
  return (
    <div className="erp-users-stat">
      <div className="min-w-0">
        <p className="erp-users-stat-label">{label}</p>
        <p
          className={
            empty
              ? 'erp-employee-meta-value erp-profile-meta-empty'
              : 'erp-employee-meta-value'
          }
          title={empty ? undefined : (value ?? undefined)}
        >
          {empty ? '-' : value}
        </p>
      </div>
    </div>
  );
}

function DetailSection({
  title,
  children,
  className = '',
  bodyClassName = '',
  extra,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  extra?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={`erp-employee-section ${className}`.trim()}>
      <div className="erp-employee-section-header">
        <h3 className="erp-employee-section-title">{title}</h3>
        {extra ? <div className="erp-employee-section-extra">{extra}</div> : null}
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

function UserStatusIndicator({
  user,
  t,
}: {
  user: UserDetail;
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

/**
 * Employee detail (HR view). Same v2 layout as My Profile - identity card
 * with fact tiles, then a pill-tab workspace - via the shared
 * `erp-profile-page erp-profile-v2` styles; HR-only chrome (top bar, actions)
 * lives in `employee-detail-v2.css`.
 */
export default function EmployeeDetailPageContent({
  userId,
}: {
  userId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const canCreatePayroll = useCanCreatePayroll();
  const canManagePerDiemRates = useCanManageEmployeePerDiemRates();
  const viewerIsAdmin = useIsSystemAdmin();
  const currentUserQuery = useCurrentUser();
  const detailQuery = useUser(userId);
  const deleteUser = useDeleteUser();
  const resendInvitation = useResendInvitation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEditUsers = useCanEditUsers();
  const canEditHr = useCanEditHr();
  // HR, or a supervisor opening someone in their reporting chain.
  const canViewTeam = useCanViewTeam();
  // Supervisors without HR or users.edit get a read-only profile.
  const isTeamViewOnly = !canViewHr && !canEditUsers;
  const listHref = isTeamViewOnly ? '/hr/my-team' : '/users';
  const employmentQuery = useEmployment(userId, canViewHr || canEditUsers || canViewTeam);
  const employment = employmentQuery.data;
  const [separationOpen, setSeparationOpen] = useState(false);
  const [employmentDialog, setEmploymentDialog] = useState<
    'inactive' | 'reactivate' | 'rehire' | null
  >(null);

  const tabRefs = useRef<Partial<Record<ProfileTab, HTMLButtonElement | null>>>({});

  const isOwnProfile = currentUserQuery.data?.id === userId;
  const contractPeriod = useProfileContractPeriod({
    mode: isOwnProfile ? 'self' : 'employee',
    employeeId: userId,
    enabled: Boolean(userId),
  });
  const periodProps = {
    contractPeriod: contractPeriod.selected,
    contractPeriods: contractPeriod.periods,
    contractPeriodLoading: contractPeriod.isLoading,
    onContractPeriodChange: contractPeriod.setSelectedId,
    hidePeriodControl: true as const,
  };
  const showPerDiemTab = isOwnProfile || canManagePerDiemRates;
  const showPayrollTab = isOwnProfile || canCreatePayroll;
  // Read-only contracts for HR and the employee's supervisors.
  const showContractsTab = canViewTeam && !isOwnProfile;
  const visibleTabs = PROFILE_TABS.filter(
    (tab) =>
      (tab !== 'perDiem' || showPerDiemTab) &&
      (tab !== 'payroll' || showPayrollTab) &&
      (tab !== 'contracts' || showContractsTab),
  );
  const requestedTab = resolveProfileTab(searchParams.get('tab'));
  const activeTab = visibleTabs.includes(requestedTab) ? requestedTab : 'overview';

  const tabLabels: Record<ProfileTab, string> = {
    overview: t('users.tabOverview'),
    leave: t('users.tabLeave'),
    attendance: t('users.tabAttendance'),
    workSchedule: t('users.tabWorkSchedule'),
    perDiem: isNarrow ? t('users.tabPerDiemShort') : t('users.tabPerDiem'),
    payroll: t('users.tabPayroll'),
    evaluations: t('users.tabEvaluations'),
    contracts: t('users.tabContracts'),
  };

  function setActiveTab(tab: ProfileTab): void {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  /** WAI-ARIA tabs: arrows / Home / End move focus and select. */
  function handleTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const index = visibleTabs.indexOf(activeTab);
    let next: number | null = null;
    if (event.key === 'ArrowRight') {
      next = (index + 1) % visibleTabs.length;
    } else if (event.key === 'ArrowLeft') {
      next = (index - 1 + visibleTabs.length) % visibleTabs.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = visibleTabs.length - 1;
    }
    if (next === null) {
      return;
    }
    event.preventDefault();
    const tab = visibleTabs[next];
    setActiveTab(tab);
    tabRefs.current[tab]?.focus();
  }

  const user = detailQuery.data;
  const showResend =
    Boolean(user?.isActive && user.email && !user.emailVerifiedAt);
  const isProtectedAccount =
    user?.employeeId === PROTECTED_SYSTEM_ADMIN_EMPLOYEE_ID;
  const targetIsAdmin = Boolean(
    user?.userRoles?.some(
      (assignment) => assignment.role.name === SYSTEM_ADMINISTRATOR_ROLE,
    ),
  );
  const showDestructiveActions =
    !isProtectedAccount && (!targetIsAdmin || viewerIsAdmin);

  async function handleResend(): Promise<void> {
    if (!user) {
      return;
    }
    try {
      const result = await resendInvitation.mutateAsync(user.id);
      messageApi.success(result.message);
    } catch (error: unknown) {
      messageApi.error(
        error instanceof ApiRequestError
          ? error.message
          : t('users.resendError'),
      );
    }
  }

  async function handleDelete(): Promise<void> {
    if (!user) {
      return;
    }
    try {
      await deleteUser.mutateAsync(user.id);
      messageApi.success(
        t('users.deactivated', {
          name: formatUserName(user),
        }),
      );
      router.push('/users');
    } catch (error: unknown) {
      messageApi.error(
        error instanceof ApiRequestError
          ? error.message
          : t('users.deleteError'),
      );
      throw error;
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={DETAIL_ROOT}>
        <div className="erp-pro-card p-6">
          <Skeleton active avatar paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !user) {
    const status =
      detailQuery.error instanceof ApiRequestError
        ? detailQuery.error.status
        : 0;

    return (
      <div className={`${DETAIL_ROOT}`}>
        <Alert
          type="error"
          showIcon
          title={
            status === 403 || status === 401
              ? t('users.noPermission')
              : detailQuery.error instanceof ApiRequestError
                ? detailQuery.error.message
                : t('users.detailNotFound')
          }
          action={
            <Button onClick={() => router.push(listHref)}>
              {t('users.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const fullName = formatUserName(user);
  // Employment actions: users.edit or hr.edit (HR and above), never protected accounts.
  const canManageEmployment = Boolean(
    (canEditUsers || canEditHr) &&
      showDestructiveActions &&
      !user.excludedFromHrProcesses &&
      employment,
  );
  const isSeparated = employment?.employmentStatus === 'SEPARATED';
  const emergencyContacts = user.emergencyContacts ?? [];
  const primaryRole =
    user.userRoles.find((assignment) => assignment.isPrimary)?.role.name ??
    user.userRoles[0]?.role.name;

  // Rare or destructive actions live in the overflow menu, so the top bar
  // only ever shows Edit plus one menu button.
  const lifecycleItems: NonNullable<MenuProps['items']> = [];
  if (showResend) {
    lifecycleItems.push({
      key: 'resend',
      icon: <MailOutlined />,
      label: t('users.resendVerification'),
      disabled: resendInvitation.isPending,
      onClick: () => void handleResend(),
    });
  }
  if (canManageEmployment && isSeparated) {
    lifecycleItems.push({
      key: 'rehire',
      icon: <RedoOutlined />,
      label: t('users.employment.rehire'),
      onClick: () => setEmploymentDialog('rehire'),
    });
  }
  if (canManageEmployment && !isSeparated && employment?.inactive) {
    lifecycleItems.push({
      key: 'reactivate',
      icon: <PlayCircleOutlined />,
      label: t('users.employment.reactivate'),
      onClick: () => setEmploymentDialog('reactivate'),
    });
  }
  if (
    canManageEmployment &&
    !isSeparated &&
    !employment?.inactive &&
    !employment?.separation
  ) {
    lifecycleItems.push({
      key: 'inactive',
      icon: <PauseCircleOutlined />,
      label: t('users.employment.setInactive'),
      onClick: () => setEmploymentDialog('inactive'),
    });
  }
  const dangerItems: NonNullable<MenuProps['items']> = [];
  if (canManageEmployment && !isSeparated && !employment?.separation) {
    dangerItems.push({
      key: 'separate',
      icon: <UserSwitchOutlined />,
      label: t('users.separation.action'),
      danger: true,
      onClick: () => setSeparationOpen(true),
    });
  }
  if (showDestructiveActions) {
    dangerItems.push({
      key: 'delete',
      icon: <UserDeleteOutlined />,
      label: t('common.delete'),
      danger: true,
      onClick: () => setConfirmDelete(true),
    });
  }
  const overflowItems: MenuProps['items'] = [
    ...lifecycleItems,
    ...(lifecycleItems.length > 0 && dangerItems.length > 0
      ? [{ type: 'divider' as const }]
      : []),
    ...dangerItems,
  ];

  return (
    <div className={DETAIL_ROOT}>
      <div className="erp-pro-card erp-profile-identity">
        <div className="erp-employee-toolbar">
          <Button
            type="text"
            icon={<ArrowLeft size={16} aria-hidden />}
            onClick={() => router.push(listHref)}
            aria-label={isNarrow ? t('users.backToList') : undefined}
            className="erp-employee-toolbar-back"
          >
            {isNarrow ? undefined : t('users.backToList')}
          </Button>
          <div className="erp-employee-toolbar-actions">
            {isTeamViewOnly ? null : (
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => router.push(`/users/${user.id}/edit`)}
              >
                {t('common.edit')}
              </Button>
            )}
            {!isTeamViewOnly && overflowItems.length > 0 ? (
              <Dropdown
                menu={{ items: overflowItems }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button
                  icon={<MoreOutlined />}
                  loading={resendInvitation.isPending}
                  aria-label={t('users.moreActions')}
                  title={t('users.moreActions')}
                >
                  {isCompact ? undefined : t('common.actions')}
                </Button>
              </Dropdown>
            ) : null}
          </div>
        </div>

        <div className="erp-employee-hero erp-profile-hero">
          <EmployeeProfilePhoto
            userId={user.id}
            photoDocumentId={user.photoDocumentId}
            firstName={user.firstName}
            lastName={user.lastName}
            canEdit={!isTeamViewOnly}
            size={isNarrow ? 72 : 88}
            variant="hero"
          />
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="erp-profile-hero-badges mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {user.employeeId ? (
                <span className="erp-users-id-chip">{user.employeeId}</span>
              ) : null}
              <UserStatusIndicator user={user} t={t} />
              {employment && !user.excludedFromHrProcesses ? (
                <EmploymentStatusTag employment={employment} />
              ) : null}
              {user.excludedFromHrProcesses ? <ApproverOnlyTag /> : null}
              {primaryRole ? (
                <span className="erp-users-role-tag">
                  {formatRoleDisplayName(primaryRole)}
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0">
                {fullName}
              </h2>
              {user.chineseName ? (
                <span className="erp-users-name-alt">{user.chineseName}</span>
              ) : null}
            </div>
            <p className="erp-users-email m-0 mt-1.5">
              {user.email ?? t('users.noEmailNoLogin')}
            </p>
            <p className="erp-users-cell-sub m-0 mt-1">
              {[user.position?.title, user.department?.name]
                .filter(Boolean)
                .join(' · ') || '-'}
            </p>
          </div>
        </div>
        {employment ? (
          <EmployeeSeparationBanner
            userId={user.id}
            employment={employment}
            canManage={canManageEmployment}
          />
        ) : null}

        <div className="erp-users-stat-bar erp-employee-meta-bar erp-profile-meta">
          <MetaStat label={t('common.department')} value={user.department?.name} />
          <MetaStat label={t('common.position')} value={user.position?.title} />
          <MetaStat
            label={t('users.form.reportsTo')}
            value={user.reportsTo ? formatUserName(user.reportsTo) : null}
          />
          <MetaStat
            label={t('common.discipline')}
            value={user.engineeringDiscipline?.name}
          />
          <MetaStat label={t('users.form.phone')} value={user.phone} />
          <MetaStat
            label={t('users.form.employmentDate')}
            value={
              user.employmentDate ? formatProjectDate(user.employmentDate) : null
            }
          />
        </div>
        <EmployeeSeparationDialog
          open={separationOpen}
          userId={user.id}
          employeeName={fullName}
          onClose={() => setSeparationOpen(false)}
        />
        <EmployeeSetInactiveDialog
          open={employmentDialog === 'inactive'}
          userId={user.id}
          employeeName={fullName}
          onClose={() => setEmploymentDialog(null)}
        />
        {employment?.inactive ? (
          <EmployeeReactivateDialog
            open={employmentDialog === 'reactivate'}
            userId={user.id}
            employeeName={fullName}
            inactive={employment.inactive}
            onClose={() => setEmploymentDialog(null)}
          />
        ) : null}
        <EmployeeRehireDialog
          open={employmentDialog === 'rehire'}
          userId={user.id}
          employeeName={fullName}
          onClose={() => setEmploymentDialog(null)}
        />
      </div>

      <div className="erp-pro-card erp-profile-workspace">
        <div
          className="erp-profile-tabbar erp-employee-tabbar erp-employee-tabbar--scroll"
          role="tablist"
          aria-label={fullName}
          onKeyDown={handleTabKeyDown}
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              ref={(element) => {
                tabRefs.current[tab] = element;
              }}
              id={`employee-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`employee-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_ICONS[tab]}
              <span className="erp-employee-tab-label">{tabLabels[tab]}</span>
            </button>
          ))}
        </div>

        <div
          id={`employee-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`employee-tab-${activeTab}`}
          className="erp-employee-tab-panel"
        >
          {PERIOD_FILTER_TABS.has(activeTab) ? (
            <div className="erp-profile-period-bar mb-4 flex justify-end">
              <ProfileContractPeriodSelect
                periods={contractPeriod.periods}
                value={contractPeriod.selectedId}
                loading={contractPeriod.isLoading}
                onChange={contractPeriod.setSelectedId}
              />
            </div>
          ) : null}
          {activeTab === 'leave' ? (
            <div className="flex flex-col gap-4">
              {canViewTeam ? (
                <EmployeeLeaveProfileSection
                  mode="employee"
                  employeeId={user.id}
                  {...periodProps}
                />
              ) : (
                <EmployeeLeaveProfileSection mode="self" {...periodProps} />
              )}
              {canViewTeam ? (
                <EmployeeOvertimeProfileSection
                  mode="employee"
                  employeeId={user.id}
                  {...periodProps}
                />
              ) : (
                <EmployeeOvertimeProfileSection
                  mode="self"
                  employeeId={user.id}
                  {...periodProps}
                />
              )}
              <EmployeeSiteAssignmentsSection employeeId={user.id} />
            </div>
          ) : activeTab === 'attendance' ? (
            <EmployeeAttendanceProfileSection
              employeeId={user.id}
              isOwnProfile={isOwnProfile}
              {...periodProps}
            />
          ) : activeTab === 'workSchedule' ? (
            <EmployeeWorkScheduleSection employeeId={user.id} />
          ) : activeTab === 'perDiem' ? (
            <EmployeePerDiemRatesSection
              employeeId={user.id}
              editable={canManagePerDiemRates}
            />
          ) : activeTab === 'payroll' && showPayrollTab ? (
            <EmployeePayslipsSection
              mode={isOwnProfile ? 'self' : 'employee'}
              employeeId={user.id}
              contractPeriod={contractPeriod.selected}
            />
          ) : activeTab === 'contracts' && showContractsTab ? (
            <EmployeeContractsSection employeeId={user.id} />
          ) : activeTab === 'evaluations' ? (
            <MyEvaluationsPageContent
              employeeId={isOwnProfile ? undefined : user.id}
              contractPeriod={contractPeriod.selected}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="erp-employee-overview-cols">
                <div className="erp-employee-overview-col">
                  <DetailSection title={t('users.sectionPersonalInformation')}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <MetaItem label={t('users.form.firstName')}>
                        {user.firstName}
                      </MetaItem>
                      <MetaItem label={t('users.form.middleName')}>
                        {displayValue(user.middleName)}
                      </MetaItem>
                      <MetaItem label={t('users.form.lastName')}>
                        {displayValue(user.lastName)}
                      </MetaItem>
                      <MetaItem label={t('users.form.chineseName')}>
                        {displayValue(user.chineseName)}
                      </MetaItem>
                      <MetaItem label={t('users.form.gender')}>
                        {user.gender ? t(`hr.gender.${user.gender}`) : '-'}
                      </MetaItem>
                      <MetaItem label={t('users.form.dateOfBirth')}>
                        {user.dateOfBirth
                          ? formatProjectDate(user.dateOfBirth)
                          : '-'}
                      </MetaItem>
                      <MetaItem label={t('users.form.nationalId')}>
                        {displayValue(user.nationalId)}
                      </MetaItem>
                      <MetaItem label={t('users.form.nationality')}>
                        {user.nationality
                          ? t(`hr.nationality.${user.nationality}`)
                          : '-'}
                      </MetaItem>
                      <MetaItem label={t('users.form.phone')}>
                        {displayValue(user.phone)}
                      </MetaItem>
                      <MetaItem label={t('users.form.secondaryPhone')}>
                        {displayValue(user.secondaryPhone)}
                      </MetaItem>
                    </div>
                  </DetailSection>

                  <DetailSection title={t('users.sectionPayrollDetails')}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <MetaItem label={t('users.form.bankName')}>
                        {displayValue(user.bankName)}
                      </MetaItem>
                      <MetaItem label={t('users.form.bankBranch')}>
                        {displayValue(user.bankBranch)}
                      </MetaItem>
                      <MetaItem label={t('users.form.bankAccountNumber')}>
                        {displayValue(user.bankAccountNumber)}
                      </MetaItem>
                      <MetaItem label={t('users.form.tin')}>
                        {displayValue(user.tin)}
                      </MetaItem>
                    </div>
                  </DetailSection>

                  <DetailSection title={t('users.sectionEducationExperience')}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <MetaItem label={t('users.form.educationLevel')}>
                        {user.educationLevel
                          ? t(`hr.educationLevel.${user.educationLevel}`)
                          : '-'}
                      </MetaItem>
                      <MetaItem label={t('users.form.fieldOfStudy')}>
                        {displayValue(user.fieldOfStudy)}
                      </MetaItem>
                      <MetaItem label={t('users.form.yearsOfExperience')}>
                        {user.yearsOfExperience != null ? (
                          <div>
                            <div>
                              {t('users.yearsValue', {
                                years: user.yearsOfExperience,
                              })}
                            </div>
                            {user.yearsOfExperienceAsOf ? (
                              <div className="erp-users-cell-sub mt-0.5">
                                {t('users.yearsOfExperienceRecorded', {
                                  date: formatProjectDate(
                                    user.yearsOfExperienceAsOf,
                                  ),
                                })}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          '-'
                        )}
                      </MetaItem>
                    </div>
                  </DetailSection>

                  <DetailSection title={t('users.sectionEmergencyContact')}>
                    {emergencyContacts.length === 0 ? (
                      <p className="erp-users-cell-sub m-0">
                        {t('users.form.noEmergencyContacts')}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {emergencyContacts.map((contact, index) => (
                          <div
                            key={`${formatEmergencyContactName(contact)}-${index}`}
                            className="erp-employee-contact-card"
                          >
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <MetaItem label={t('users.form.fullName')}>
                                {formatEmergencyContactName(contact)}
                              </MetaItem>
                              <MetaItem
                                label={t('users.form.emergencyContactPhone')}
                              >
                                {displayValue(contact.phone)}
                              </MetaItem>
                              <MetaItem
                                label={t('users.form.emergencyContactEmail')}
                              >
                                {displayValue(contact.email)}
                              </MetaItem>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </DetailSection>

                  <DetailSection title={t('users.assignedRoles')}>
                    <EmployeeRolesCard
                      employeeId={user.id}
                      employeeCode={user.employeeId}
                      roles={user.userRoles ?? []}
                      canEdit={canViewHr}
                      onRolesChanged={() => {
                        void detailQuery.refetch();
                      }}
                    />
                  </DetailSection>
                </div>

                <div className="erp-employee-overview-col">
                  <DetailSection title={t('users.sectionAddress')}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <MetaItem label={t('users.form.addressCountry')}>
                        {displayValue(user.addressCountry)}
                      </MetaItem>
                      <MetaItem label={t('users.form.addressRegion')}>
                        {displayValue(user.addressRegion)}
                      </MetaItem>
                      <MetaItem label={t('users.form.addressCity')}>
                        {displayValue(user.addressCity)}
                      </MetaItem>
                      <MetaItem label={t('users.form.addressSubcity')}>
                        {displayValue(user.addressSubcity)}
                      </MetaItem>
                      <MetaItem label={t('users.form.addressWoreda')}>
                        {displayValue(user.addressWoreda)}
                      </MetaItem>
                      <MetaItem label={t('users.form.addressHouseNumber')}>
                        {displayValue(user.addressHouseNumber)}
                      </MetaItem>
                      <div className="sm:col-span-2">
                        <MetaItem label={t('users.detailFullAddress')}>
                          {formatAddress(user)}
                        </MetaItem>
                      </div>
                    </div>
                  </DetailSection>

                  <DetailSection
                    title={t('users.sectionOrganizationAssignment')}
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <MetaItem label={t('users.form.employeeId')}>
                        {user.employeeId ? (
                          <span className="erp-users-id-chip">
                            {user.employeeId}
                          </span>
                        ) : (
                          '-'
                        )}
                      </MetaItem>
                      <MetaItem label={t('users.form.employeeType')}>
                        {user.employeeType
                          ? t(`hr.employeeType.${user.employeeType}`)
                          : '-'}
                      </MetaItem>
                      <MetaItem label={t('users.form.employmentDate')}>
                        {user.employmentDate
                          ? formatProjectDate(user.employmentDate)
                          : '-'}
                      </MetaItem>
                      <MetaItem label={t('common.department')}>
                        {displayValue(user.department?.name)}
                      </MetaItem>
                      <MetaItem label={t('common.position')}>
                        {displayValue(user.position?.title)}
                      </MetaItem>
                      <MetaItem label={t('users.form.seniority')}>
                        {displayValue(user.seniorityLevel?.name)}
                      </MetaItem>
                      <MetaItem label={t('users.form.reportsTo')}>
                        {user.reportsTo ? formatUserName(user.reportsTo) : '-'}
                      </MetaItem>
                      <MetaItem label={t('common.discipline')}>
                        {user.engineeringDiscipline ? (
                          <div>
                            <div className="erp-users-cell-strong">
                              {user.engineeringDiscipline.name}
                            </div>
                            {user.engineeringDiscipline.nameZh ? (
                              <div className="erp-users-cell-sub mt-0.5">
                                {user.engineeringDiscipline.nameZh}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          '-'
                        )}
                      </MetaItem>
                      <MetaItem label={t('users.form.leavePolicy')}>
                        {displayValue(user.leavePolicy?.name)}
                      </MetaItem>
                      <MetaItem label={t('users.form.workSchedule')}>
                        {user.workSchedule
                          ? user.workSchedule.isDefault
                            ? `${user.workSchedule.name} (${t('hr.workSchedule.defaultBadge')})`
                            : user.workSchedule.name
                          : t('hr.workSchedule.noSchedule')}
                      </MetaItem>
                    </div>
                  </DetailSection>

                  <DetailSection title={t('users.sectionAccountAccess')}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <MetaItem label={t('users.form.email')}>
                        {displayValue(user.email)}
                      </MetaItem>
                      <EmployeeAccountAccessFields user={user} />
                      <MetaItem label={t('common.status')}>
                        <UserStatusIndicator user={user} t={t} />
                      </MetaItem>
                      <MetaItem label={t('common.activeAccount')}>
                        {user.isActive ? t('hr.labels.yes') : t('hr.labels.no')}
                      </MetaItem>
                      <MetaItem label={t('users.detailEmailVerified')}>
                        {user.emailVerifiedAt
                          ? formatProjectDate(user.emailVerifiedAt)
                          : '-'}
                      </MetaItem>
                      <MetaItem label={t('users.exportTable.lastLogin')}>
                        {user.lastLogin
                          ? formatProjectDate(user.lastLogin)
                          : '-'}
                      </MetaItem>
                      <MetaItem label={t('users.detailCreatedAt')}>
                        {formatProjectDate(user.createdAt)}
                      </MetaItem>
                    </div>
                  </DetailSection>
                </div>
              </div>

              {employment && !user.excludedFromHrProcesses ? (
                <DetailSection title={t('users.employment.historyTitle')}>
                  <EmploymentHistorySection userId={user.id} employment={employment} />
                </DetailSection>
              ) : null}
              <DetailSection
                title={t('users.form.profileDocuments')}
                className="erp-employee-section--docs"
              >
                <EmployeeProfileDocuments userId={user.id} embedded />
              </DetailSection>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        className="erp-hr-travel-modal"
        open={confirmDelete}
        title={t('users.deleteEmployee')}
        description={t('users.deleteDescription', {
          name: fullName,
          email: user.email ?? t('users.noEmailNoLogin'),
        })}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteUser.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
