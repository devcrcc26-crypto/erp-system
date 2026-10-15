'use client';

import { useState } from 'react';
import { Alert, Button, Grid, Skeleton, Space, Tag } from 'antd';
import {
  BarChartOutlined,
  CalendarOutlined,
  DollarOutlined,
  EditOutlined,
  StarOutlined,
  UserDeleteOutlined,
  UserOutlined,
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
import EmployeeAccountAccessFields from '@/components/modules/users/EmployeeAccountAccessFields';
import { ApproverOnlyTag } from '@/components/modules/users/EmployeeApproverOnlyField';
import EmployeeProfileDocuments from '@/components/modules/users/EmployeeProfileDocuments';
import EmployeeProfilePhoto from '@/components/modules/users/EmployeeProfilePhoto';
import EmployeeRolesCard from '@/components/modules/users/EmployeeRolesCard';
import EmployeeSeparationBanner from '@/components/modules/users/EmployeeSeparationBanner';
import EmployeeSeparationDialog from '@/components/modules/users/EmployeeSeparationDialog';
import { useEmployment } from '@/lib/query/employment';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanCreatePayroll,
  useCanEditUsers,
  useCanManageEmployeePerDiemRates,
  useCanViewHr,
  useIsSystemAdmin,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { getRoleColor, formatRoleDisplayName } from '@/lib/utils/role-colors';
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

type ProfileTab =
  | 'overview'
  | 'leave'
  | 'attendance'
  | 'workSchedule'
  | 'perDiem'
  | 'payroll'
  | 'evaluations';

function resolveProfileTab(value: string | null): ProfileTab {
  if (value === 'leave') {
    return 'leave';
  }
  if (value === 'attendance') {
    return 'attendance';
  }
  if (value === 'workSchedule') {
    return 'workSchedule';
  }
  if (value === 'perDiem') {
    return 'perDiem';
  }
  if (value === 'evaluations') {
    return 'evaluations';
  }
  if (value === 'payroll') {
    return 'payroll';
  }
  return 'overview';
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
    <span className="erp-users-status">
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
 * Employee detail - visual language aligned with the Users list page.
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
  const employmentQuery = useEmployment(userId, canViewHr || canEditUsers);
  const employment = employmentQuery.data;
  const [separationOpen, setSeparationOpen] = useState(false);

  const activeTab = resolveProfileTab(searchParams.get('tab'));
  const isOwnProfile = currentUserQuery.data?.id === userId;
  const showPerDiemTab = isOwnProfile || canManagePerDiemRates;
  const showPayrollTab = isOwnProfile || canCreatePayroll;

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
      <div className="erp-pro-list-page erp-users-page">
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
      <div className="erp-pro-list-page erp-users-page">
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
            <Button onClick={() => router.push('/users')}>
              {t('users.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const fullName = formatUserName(user);
  const emergencyContacts = user.emergencyContacts ?? [];
  const primaryRole =
    user.userRoles.find((assignment) => assignment.isPrimary)?.role.name ??
    user.userRoles[0]?.role.name;

  return (
    <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push('/users')}
              aria-label={t('users.backToList')}
            >
              {isNarrow ? undefined : t('users.backToList')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            {showResend ? (
              <Button
                loading={resendInvitation.isPending}
                onClick={() => void handleResend()}
                className="erp-employee-toolbar-resend"
              >
                {isCompact
                  ? t('users.resendVerificationShort')
                  : t('users.resendVerification')}
              </Button>
            ) : null}
            {canEditUsers &&
            showDestructiveActions &&
            !user.excludedFromHrProcesses &&
            employment &&
            employment.employmentStatus !== 'SEPARATED' &&
            !employment.separation ? (
              <Button danger onClick={() => setSeparationOpen(true)}>
                {t('users.separation.action')}
              </Button>
            ) : null}
            <Space.Compact>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => router.push(`/users/${user.id}/edit`)}
                aria-label={t('common.update')}
              >
                {isNarrow ? undefined : t('common.update')}
              </Button>
              {showDestructiveActions ? (
                <Button
                  danger
                  icon={<UserDeleteOutlined />}
                  onClick={() => setConfirmDelete(true)}
                  aria-label={t('common.delete')}
                >
                  {isNarrow ? undefined : t('common.delete')}
                </Button>
              ) : null}
            </Space.Compact>
          </div>
        </div>

        <div className="erp-employee-hero">
          <EmployeeProfilePhoto
            userId={user.id}
            photoDocumentId={user.photoDocumentId}
            firstName={user.firstName}
            lastName={user.lastName}
            canEdit
            size={isNarrow ? 72 : 88}
            variant="hero"
          />
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {user.employeeId ? (
                <span className="erp-users-id-chip">{user.employeeId}</span>
              ) : null}
              <UserStatusIndicator user={user} t={t} />
              {user.excludedFromHrProcesses ? <ApproverOnlyTag /> : null}
              {primaryRole ? (
                <Tag
                  color={getRoleColor(primaryRole)}
                  className="m-0"
                  style={{ fontWeight: 600 }}
                >
                  {formatRoleDisplayName(primaryRole)}
                </Tag>
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
            canManage={canEditUsers}
          />
        ) : null}
        <EmployeeSeparationDialog
          open={separationOpen}
          userId={user.id}
          employeeName={fullName}
          onClose={() => setSeparationOpen(false)}
        />
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('common.department')}</p>
            <p className="erp-employee-meta-value">
              {displayValue(user.department?.name)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('common.position')}</p>
            <p className="erp-employee-meta-value">
              {displayValue(user.position?.title)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('users.form.reportsTo')}</p>
            <p className="erp-employee-meta-value">
              {user.reportsTo ? formatUserName(user.reportsTo) : '-'}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('common.discipline')}</p>
            <p className="erp-employee-meta-value">
              {displayValue(user.engineeringDiscipline?.name)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('users.form.phone')}</p>
            <p className="erp-employee-meta-value">
              {displayValue(user.phone)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('users.exportTable.lastLogin')}
            </p>
            <p className="erp-employee-meta-value">
              {user.lastLogin ? formatProjectDate(user.lastLogin) : '-'}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-pro-card">
        <div className="erp-profile-tabbar erp-employee-tabbar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
          >
            <UserOutlined />
            <span className="erp-employee-tab-label">
              {t('users.tabOverview')}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'leave'}
            onClick={() => setActiveTab('leave')}
          >
            <CalendarOutlined />
            <span className="erp-employee-tab-label">{t('users.tabLeave')}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'attendance'}
            onClick={() => setActiveTab('attendance')}
          >
            <BarChartOutlined />
            <span className="erp-employee-tab-label">
              {t('users.tabAttendance')}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'workSchedule'}
            onClick={() => setActiveTab('workSchedule')}
          >
            <CalendarOutlined />
            <span className="erp-employee-tab-label">
              {t('users.tabWorkSchedule')}
            </span>
          </button>
          {showPerDiemTab ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'perDiem'}
              onClick={() => setActiveTab('perDiem')}
            >
              <WalletOutlined />
              <span className="erp-employee-tab-label">
                {isNarrow ? t('users.tabPerDiemShort') : t('users.tabPerDiem')}
              </span>
            </button>
          ) : null}
          {showPayrollTab ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'payroll'}
              onClick={() => setActiveTab('payroll')}
            >
              <DollarOutlined />
              <span className="erp-employee-tab-label">
                {t('users.tabPayroll')}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'evaluations'}
            onClick={() => setActiveTab('evaluations')}
          >
            <StarOutlined />
            <span className="erp-employee-tab-label">
              {t('users.tabEvaluations')}
            </span>
          </button>
        </div>

        <div className="erp-employee-tab-panel">
          {activeTab === 'leave' ? (
            <div className="flex flex-col gap-4">
              {canViewHr ? (
                <EmployeeLeaveProfileSection
                  mode="employee"
                  employeeId={user.id}
                />
              ) : (
                <EmployeeLeaveProfileSection mode="self" />
              )}
              {canViewHr ? (
                <EmployeeOvertimeProfileSection
                  mode="employee"
                  employeeId={user.id}
                />
              ) : (
                <EmployeeOvertimeProfileSection mode="self" />
              )}
              <EmployeeSiteAssignmentsSection employeeId={user.id} />
            </div>
          ) : activeTab === 'attendance' ? (
            <EmployeeAttendanceProfileSection
              employeeId={user.id}
              isOwnProfile={isOwnProfile}
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
            />
          ) : activeTab === 'evaluations' ? (
            <MyEvaluationsPageContent
              employeeId={isOwnProfile ? undefined : user.id}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <DetailSection title={t('users.sectionPersonalInformation')}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <MetaItem label={t('users.form.firstName')}>
                      {user.firstName}
                    </MetaItem>
                    <MetaItem label={t('users.form.middleName')}>
                      {displayValue(user.middleName)}
                    </MetaItem>
                    <MetaItem label={t('users.form.lastName')}>
                      {user.lastName}
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
                  </div>
                </DetailSection>

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
                    <MetaItem label={t('users.form.experienceStartDate')}>
                      {user.experienceStartDate
                        ? formatProjectDate(user.experienceStartDate)
                        : '-'}
                    </MetaItem>
                    <MetaItem label={t('users.form.yearsOfExperience')}>
                      {user.yearsOfExperience != null
                        ? String(user.yearsOfExperience)
                        : '-'}
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

              <DetailSection title={t('users.sectionEmergencyContact')}>
                {emergencyContacts.length === 0 ? (
                  <p className="erp-users-cell-sub m-0">
                    {t('users.form.noEmergencyContacts')}
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
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
