'use client';

import { useState } from 'react';
import { Alert, Button, Skeleton, Space, Tag } from 'antd';
import { CalendarOutlined, UserOutlined, WalletOutlined } from '@ant-design/icons';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import EmployeeLeaveProfileSection from '@/components/modules/hr/leave/EmployeeLeaveProfileSection';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import EmployeeProfileDocuments from '@/components/modules/users/EmployeeProfileDocuments';
import EmployeeProfilePhoto from '@/components/modules/users/EmployeeProfilePhoto';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanManageEmployeePerDiemRates, useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { EmergencyContact, UserDetail } from '@/lib/api/types';
import { useCurrentUser } from '@/lib/query/profile';
import {
  useDeleteUser,
  useResendInvitation,
  useUser,
} from '@/lib/query/users';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  userStatusLabel,
  userStatusVariant,
} from '@/lib/utils/user-status';
import { tokens } from '@/lib/theme/tokens';

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

type ProfileTab = 'overview' | 'leave' | 'perDiem';

function resolveProfileTab(value: string | null): ProfileTab {
  if (value === 'leave') {
    return 'leave';
  }
  if (value === 'perDiem') {
    return 'perDiem';
  }
  return 'overview';
}

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
  const canViewHr = useCanViewHr();
  const canManagePerDiemRates = useCanManageEmployeePerDiemRates();
  const currentUserQuery = useCurrentUser();
  const detailQuery = useUser(userId);
  const deleteUser = useDeleteUser();
  const resendInvitation = useResendInvitation();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeTab = resolveProfileTab(searchParams.get('tab'));
  const isOwnProfile = currentUserQuery.data?.id === userId;
  const showPerDiemTab = isOwnProfile || canManagePerDiemRates;

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
          name: `${user.firstName} ${user.lastName}`,
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
      <div className="erp-pro-list-page flex flex-col gap-3">
        <Skeleton active avatar paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !user) {
    const status =
      detailQuery.error instanceof ApiRequestError
        ? detailQuery.error.status
        : 0;

    return (
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
    );
  }

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const emergencyContacts = user.emergencyContacts ?? [];

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/users')}
          style={{ borderRadius: 2 }}
        >
          {t('users.backToList')}
        </Button>
        <Space wrap className="ml-auto" size={8}>
          {showResend ? (
            <Button
              loading={resendInvitation.isPending}
              onClick={() => void handleResend()}
              style={{ borderRadius: 2 }}
            >
              {t('users.resendVerification')}
            </Button>
          ) : null}
          <Button
            type="primary"
            icon={<Pencil size={14} />}
            onClick={() => router.push(`/users/${user.id}/edit`)}
            style={{ borderRadius: 2 }}
          >
            {t('common.update')}
          </Button>
          <Button
            danger
            icon={<Trash2 size={14} />}
            onClick={() => setConfirmDelete(true)}
            style={{ borderRadius: 2 }}
          >
            {t('common.delete')}
          </Button>
        </Space>
      </div>

      {/* Identity hero */}
      <div
        className="overflow-hidden rounded-lg"
        style={{
          background: tokens.colorCardBg,
          border: `1px solid ${tokens.colorBorder}`,
        }}
      >
        <div
          className="h-1 w-full"
          style={{ backgroundColor: tokens.colorPrimary }}
        />
        <div className="px-3 py-4 sm:px-5">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <EmployeeProfilePhoto
              userId={user.id}
              photoDocumentId={user.photoDocumentId}
              firstName={user.firstName}
              lastName={user.lastName}
              canEdit
              size={104}
              variant="hero"
            />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {user.employeeId ? (
                  <span
                    className="rounded px-2 py-0.5 font-[family-name:var(--font-mono)] text-xs font-medium"
                    style={{
                      background: tokens.colorPrimaryLight,
                      color: tokens.colorPrimary,
                    }}
                  >
                    {user.employeeId}
                  </span>
                ) : null}
                <StatusBadge
                  label={userStatusLabel(user, t)}
                  variant={userStatusVariant(user)}
                />
              </div>
              <h2
                className="m-0 text-xl font-semibold leading-snug tracking-tight"
                style={{ color: tokens.colorTextPrimary }}
              >
                {fullName}
              </h2>
              {user.chineseName ? (
                <p
                  className="m-0 mt-1 text-sm"
                  style={{ color: tokens.colorTextSecondary }}
                >
                  {user.chineseName}
                </p>
              ) : null}
              <p
                className="m-0 mt-2 text-sm"
                style={{ color: tokens.colorTextSecondary }}
              >
                {user.email ?? t('users.noEmailNoLogin')}
              </p>
              <p
                className="m-0 mt-1 text-sm"
                style={{ color: tokens.colorTextTertiary }}
              >
                {[user.position?.title, user.department?.name]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <SummaryStrip
        items={[
          {
            label: t('common.department'),
            value: displayValue(user.department?.name),
          },
          {
            label: t('common.position'),
            value: displayValue(user.position?.title),
          },
          {
            label: t('common.discipline'),
            value: displayValue(user.engineeringDiscipline?.name),
          },
          {
            label: t('users.form.phone'),
            value: displayValue(user.phone),
          },
          {
            label: t('users.exportTable.lastLogin'),
            value: user.lastLogin
              ? formatProjectDate(user.lastLogin)
              : '-',
          },
        ]}
      />

      <div className="erp-profile-tabbar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
        >
          <UserOutlined />
          {t('users.tabOverview')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'leave'}
          onClick={() => setActiveTab('leave')}
        >
          <CalendarOutlined />
          {t('users.tabLeave')}
        </button>
        {showPerDiemTab ? (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'perDiem'}
            onClick={() => setActiveTab('perDiem')}
          >
            <WalletOutlined />
            {t('users.tabPerDiem')}
          </button>
        ) : null}
      </div>
      {activeTab === 'leave' ? (
        canViewHr ? (
          <EmployeeLeaveProfileSection mode="employee" employeeId={user.id} />
        ) : (
          <EmployeeLeaveProfileSection mode="self" />
        )
      ) : activeTab === 'perDiem' ? (
        <EmployeePerDiemRatesSection
          employeeId={user.id}
          editable={canManagePerDiemRates}
        />
      ) : (
              <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard title={t('users.sectionPersonalInformation')} bodyClassName="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetaItem label={t('users.form.firstName')}>{user.firstName}</MetaItem>
            <MetaItem label={t('users.form.middleName')}>
              {displayValue(user.middleName)}
            </MetaItem>
            <MetaItem label={t('users.form.lastName')}>{user.lastName}</MetaItem>
            <MetaItem label={t('users.form.chineseName')}>
              {displayValue(user.chineseName)}
            </MetaItem>
            <MetaItem label={t('users.form.gender')}>
              {user.gender ? t(`hr.gender.${user.gender}`) : '-'}
            </MetaItem>
            <MetaItem label={t('users.form.dateOfBirth')}>
              {user.dateOfBirth ? formatProjectDate(user.dateOfBirth) : '-'}
            </MetaItem>
            <MetaItem label={t('users.form.nationalId')}>
              {displayValue(user.nationalId)}
            </MetaItem>
            <MetaItem label={t('users.form.nationality')}>
              {user.nationality ? t(`hr.nationality.${user.nationality}`) : '-'}
            </MetaItem>
          </div>
        </SectionCard>

        <SectionCard title={t('users.sectionAddress')} bodyClassName="p-4">
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
        </SectionCard>

        <SectionCard title={t('users.sectionOrganizationAssignment')} bodyClassName="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetaItem label={t('users.form.employeeId')}>
              {displayValue(user.employeeId)}
            </MetaItem>
            <MetaItem label={t('users.form.employeeType')}>
              {user.employeeType
                ? t(`hr.employeeType.${user.employeeType}`)
                : '-'}
            </MetaItem>
            <MetaItem label={t('common.department')}>
              {displayValue(user.department?.name)}
            </MetaItem>
            <MetaItem label={t('common.position')}>
              {displayValue(user.position?.title)}
            </MetaItem>
            <MetaItem label={t('common.discipline')}>
              {user.engineeringDiscipline ? (
                <div>
                  <div>{user.engineeringDiscipline.name}</div>
                  {user.engineeringDiscipline.nameZh ? (
                    <div
                      className="text-xs"
                      style={{ color: tokens.colorTextSecondary }}
                    >
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
          </div>
        </SectionCard>

        <SectionCard title={t('users.sectionEducationExperience')} bodyClassName="p-4">
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
        </SectionCard>

        <SectionCard title={t('users.sectionAccountAccess')} bodyClassName="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetaItem label={t('users.form.email')}>
              {displayValue(user.email)}
            </MetaItem>
            <MetaItem label={t('common.status')}>
              <StatusBadge
                label={userStatusLabel(user, t)}
                variant={userStatusVariant(user)}
              />
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
              {user.lastLogin ? formatProjectDate(user.lastLogin) : '-'}
            </MetaItem>
            <MetaItem label={t('users.detailCreatedAt')}>
              {formatProjectDate(user.createdAt)}
            </MetaItem>
          </div>
        </SectionCard>

        <SectionCard title={t('users.assignedRoles')} bodyClassName="p-4">
          {user.userRoles.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: tokens.colorTextSecondary }}>
              {t('users.noRoleAssigned')}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {user.userRoles.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex flex-wrap items-center gap-2 rounded px-3 py-2"
                  style={{
                    border: `1px solid ${tokens.colorBorder}`,
                    background: tokens.colorPageBg,
                  }}
                >
                  <span className="text-sm font-medium">{assignment.role.name}</span>
                  {assignment.isPrimary ? (
                    <Tag color="gold">{t('users.primaryRole')}</Tag>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title={t('users.sectionEmergencyContact')} bodyClassName="p-4">
        {emergencyContacts.length === 0 ? (
          <p className="m-0 text-sm" style={{ color: tokens.colorTextSecondary }}>
            {t('users.form.noEmergencyContacts')}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {emergencyContacts.map((contact, index) => (
              <div
                key={`${formatEmergencyContactName(contact)}-${index}`}
                className="rounded p-4"
                style={{
                  border: `1px solid ${tokens.colorBorder}`,
                  background: tokens.colorPageBg,
                }}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <MetaItem label={t('users.form.fullName')}>
                    {formatEmergencyContactName(contact)}
                  </MetaItem>
                  <MetaItem label={t('users.form.emergencyContactPhone')}>
                    {displayValue(contact.phone)}
                  </MetaItem>
                  <MetaItem label={t('users.form.emergencyContactEmail')}>
                    {displayValue(contact.email)}
                  </MetaItem>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('users.form.profileDocuments')} bodyClassName="p-4">
        <EmployeeProfileDocuments userId={user.id} />
      </SectionCard>
              </div>
      )}

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
