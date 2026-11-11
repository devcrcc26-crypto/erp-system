'use client';

import './profile-v2.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Select, Spin } from 'antd';
import {
  BarChartOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  DesktopOutlined,
  DollarOutlined,
  FileProtectOutlined,
  FolderOpenOutlined,
  MailOutlined,
  ScheduleOutlined,
  StarOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { User } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import PlaceholderPage from '@/components/PlaceholderPage';
import { DemoEmailWarning } from '@/components/auth/DemoEmailWarning';
import MyEvaluationsPageContent from '@/components/modules/hr/evaluation/MyEvaluationsPageContent';
import EmployeeLeaveProfileSection from '@/components/modules/hr/leave/EmployeeLeaveProfileSection';
import EmployeeSiteAssignmentsSection from '@/components/modules/hr/site-assignment/EmployeeSiteAssignmentsSection';
import EmployeeOvertimeProfileSection from '@/components/modules/hr/overtime/EmployeeOvertimeProfileSection';
import EmployeePayslipsSection from '@/components/modules/hr/payroll/EmployeePayslipsSection';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import EmployeeProfileDocuments from '@/components/modules/users/EmployeeProfileDocuments';
import EmployeeProfilePhoto from '@/components/modules/users/EmployeeProfilePhoto';
import EmployeeAttendanceProfileSection from '@/components/modules/profile/EmployeeAttendanceProfileSection';
import ProfileAccountDetails, {
  localizedName,
} from '@/components/modules/profile/ProfileAccountDetails';
import ProfileAssetsTab from '@/components/modules/profile/ProfileAssetsTab';
import ProfileContractTab from '@/components/modules/profile/ProfileContractTab';
import ProfileContractPeriodSelect from '@/components/modules/profile/ProfileContractPeriodSelect';
import ProfileWorkScheduleTab from '@/components/modules/profile/ProfileWorkScheduleTab';
import {
  ProfileSection,
  displayText,
} from '@/components/modules/profile/profile-display';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useProfileContractPeriod } from '@/hooks/use-profile-contract-period';
import { formatRoleDisplayName } from '@/lib/utils/role-colors';
import { useIsMdUp } from '@/hooks/useMediaQuery';
import { ApiRequestError } from '@/lib/api/errors';
import { useResendActivation } from '@/lib/query/auth';
import {
  useChangeEmail,
  useChangePassword,
  useCurrentUser,
  useUpdateProfile,
} from '@/lib/query/profile';
import type { UserProfile } from '@/lib/api/types';
import { formatUserName } from '@/lib/utils/user-display';

interface PreferencesFormValues {
  preferredLanguage: string;
  preferredTimezone: string;
  preferredDateFormat: string;
}

interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const PROFILE_TABS = [
  'account',
  'leave',
  'overtime',
  'attendance',
  'workSchedule',
  'documents',
  'contract',
  'payroll',
  'assets',
  'perDiem',
  'evaluations',
] as const;

type ProfileTab = (typeof PROFILE_TABS)[number];

const PERIOD_FILTER_TABS: ReadonlySet<ProfileTab> = new Set([
  'leave',
  'overtime',
  'attendance',
  'payroll',
  'evaluations',
  'contract',
]);

/** One cell of the employee meta bar under the hero. */
function MetaStat({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="erp-users-stat">
      <div className="min-w-0">
        <p className="erp-users-stat-label">{label}</p>
        <p
          className={
            value === '-'
              ? 'erp-employee-meta-value erp-profile-meta-empty'
              : 'erp-employee-meta-value'
          }
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * My Profile - the signed-in employee's record, laid out like the HR employee
 * detail page. Only regional preferences, email, and password are editable.
 */
export default function ProfilePageContent(): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const isMdUp = useIsMdUp();
  const searchParams = useSearchParams();
  const [prefsForm] = Form.useForm<PreferencesFormValues>();
  const [passwordForm] = Form.useForm<PasswordFormValues>();
  const [emailForm] = Form.useForm<{ newEmail: string }>();
  const watchedNewEmail = Form.useWatch('newEmail', emailForm) ?? '';

  const profileQuery = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const changeEmail = useChangeEmail();
  const resendActivation = useResendActivation();

  const profile = profileQuery.data;
  const contractPeriod = useProfileContractPeriod({
    mode: 'self',
    enabled: Boolean(profile),
  });

  const tabFromUrl = searchParams.get('tab');
  const initialTab: ProfileTab =
    tabFromUrl && (PROFILE_TABS as readonly string[]).includes(tabFromUrl)
      ? (tabFromUrl as ProfileTab)
      : 'account';
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const attendanceMonthParam = Number(searchParams.get('month') ?? '');
  const attendanceYearParam = Number(searchParams.get('year') ?? '');
  const attendanceInitialMonth =
    Number.isFinite(attendanceMonthParam) &&
    attendanceMonthParam >= 1 &&
    attendanceMonthParam <= 12
      ? attendanceMonthParam
      : undefined;
  const attendanceInitialYear =
    Number.isFinite(attendanceYearParam) && attendanceYearParam >= 2020
      ? attendanceYearParam
      : undefined;
  const tabRefs = useRef<Partial<Record<ProfileTab, HTMLButtonElement | null>>>({});
  const tabsMountedRef = useRef(false);

  // On phones the tab bar scrolls sideways - keep the selected tab in view.
  // Skipped on first render so the page itself does not jump on load.
  useEffect(() => {
    if (!tabsMountedRef.current) {
      tabsMountedRef.current = true;
      return;
    }
    tabRefs.current[activeTab]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeTab]);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [prefsSuccess, setPrefsSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const LANGUAGE_OPTIONS = useMemo(
    () => [
      { value: '', label: t('common.companyDefault') },
      { value: 'en', label: t('profile.languageEn') },
      { value: 'zh', label: t('profile.languageZh') },
    ],
    [t],
  );

  const TIMEZONE_OPTIONS = useMemo(
    () => [
      { value: '', label: t('common.companyDefault') },
      { value: 'UTC', label: t('profile.timezoneUtc') },
      { value: 'Africa/Addis_Ababa', label: t('profile.timezoneAddis') },
      { value: 'Asia/Dubai', label: t('profile.timezoneDubai') },
      { value: 'Asia/Riyadh', label: t('profile.timezoneRiyadh') },
      { value: 'Europe/London', label: t('profile.timezoneLondon') },
    ],
    [t],
  );

  const DATE_FORMAT_OPTIONS = useMemo(
    () => [
      { value: '', label: t('common.companyDefault') },
      { value: 'DD/MM/YYYY', label: t('profile.dateDmy') },
      { value: 'MM/DD/YYYY', label: t('profile.dateMdy') },
      { value: 'YYYY-MM-DD', label: t('profile.dateIso') },
    ],
    [t],
  );

  const TAB_META: Record<ProfileTab, { label: string; icon: React.ReactNode }> = {
    account: { label: t('profile.tabAccount'), icon: <UserOutlined /> },
    leave: { label: t('profile.tabLeave'), icon: <CalendarOutlined /> },
    overtime: { label: t('profile.tabOvertime'), icon: <ClockCircleOutlined /> },
    attendance: {
      label: t('profile.tabAttendance'),
      icon: <BarChartOutlined />,
    },
    workSchedule: { label: t('profile.tabWorkSchedule'), icon: <ScheduleOutlined /> },
    documents: { label: t('profile.tabDocuments'), icon: <FolderOpenOutlined /> },
    contract: { label: t('profile.tabContract'), icon: <FileProtectOutlined /> },
    payroll: { label: t('profile.tabPayroll'), icon: <DollarOutlined /> },
    assets: {
      label: t('profile.tabAssets'),
      icon: <DesktopOutlined />,
    },
    perDiem: { label: t('profile.tabPerDiem'), icon: <WalletOutlined /> },
    evaluations: {
      label: t('profile.tabEvaluations'),
      icon: <StarOutlined />,
    },
  };

  if (profileQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-profile-page erp-profile-v2">
        <div className="erp-pro-card flex justify-center p-12">
          <Spin />
        </div>
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <PlaceholderPage
        icon={User}
        title={t('profile.title')}
        description={t('profile.loadError')}
      />
    );
  }

  const isEmailVerified = Boolean(profile.emailVerifiedAt);
  const fullName = formatUserName(profile);
  const department = localizedName(
    locale,
    profile.departmentName,
    profile.departmentNameZh,
  );
  const position = localizedName(
    locale,
    profile.positionTitle,
    profile.positionTitleZh,
  );
  const primaryRole =
    profile.roles.find((role) => role.isPrimary)?.name ??
    profile.roles[0]?.name;

  /** WAI-ARIA tabs: arrows / Home / End move focus and select. */
  function handleTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const index = PROFILE_TABS.indexOf(activeTab);
    let next: number | null = null;
    if (event.key === 'ArrowRight') {
      next = (index + 1) % PROFILE_TABS.length;
    } else if (event.key === 'ArrowLeft') {
      next = (index - 1 + PROFILE_TABS.length) % PROFILE_TABS.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = PROFILE_TABS.length - 1;
    }
    if (next === null) {
      return;
    }
    event.preventDefault();
    const tab = PROFILE_TABS[next];
    setActiveTab(tab);
    tabRefs.current[tab]?.focus();
  }

  async function handlePreferencesSubmit(
    values: PreferencesFormValues,
  ): Promise<void> {
    setPrefsError(null);
    setPrefsSuccess(null);

    try {
      await updateProfile.mutateAsync({
        preferredLanguage: values.preferredLanguage || undefined,
        preferredTimezone: values.preferredTimezone || undefined,
        preferredDateFormat: values.preferredDateFormat || undefined,
      });
      setPrefsSuccess(t('profile.preferencesSaved'));
    } catch (error) {
      setPrefsError(
        error instanceof ApiRequestError
          ? error.message
          : t('profile.preferencesSaveError'),
      );
    }
  }

  async function handlePasswordSubmit(values: PasswordFormValues): Promise<void> {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (values.newPassword !== values.confirmPassword) {
      setPasswordError(t('common.passwordsDoNotMatch'));
      return;
    }

    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      passwordForm.resetFields();
      setPasswordSuccess(t('profile.passwordChanged'));
    } catch (error) {
      setPasswordError(
        error instanceof ApiRequestError
          ? error.message
          : t('profile.passwordChangeError'),
      );
    }
  }

  async function handleEmailChangeSubmit(values: { newEmail: string }): Promise<void> {
    setEmailError(null);
    setEmailSuccess(null);

    try {
      const result = await changeEmail.mutateAsync({ newEmail: values.newEmail });
      setEmailSuccess(result.message);
      emailForm.resetFields();
      setShowChangeEmail(false);
    } catch (error) {
      setEmailError(
        error instanceof ApiRequestError
          ? error.message
          : t('profile.emailChangeError'),
      );
    }
  }

  async function handleResendActivation(): Promise<void> {
    if (!profile) {
      return;
    }

    setResendMessage(null);

    try {
      const result = await resendActivation.mutateAsync({
        email: profile.email,
      });
      setResendMessage(result.message);
    } catch (error) {
      setResendMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('profile.resendActivationError'),
      );
    }
  }

  const accountTab = (
    <div className="flex flex-col gap-4">
      <ProfileAccountDetails profile={profile} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ProfileSection title={t('profile.regionalPreferences')}>
          <p className="erp-users-cell-sub m-0 mb-3">
            {t('profile.regionalPreferencesDescription')}
          </p>
          <Form
            form={prefsForm}
            key={`prefs-${profile.id}`}
            layout="vertical"
            requiredMark={false}
            initialValues={{
              preferredLanguage: profile.preferredLanguage ?? '',
              preferredTimezone: profile.preferredTimezone ?? '',
              preferredDateFormat: profile.preferredDateFormat ?? '',
            }}
            onFinish={(values: PreferencesFormValues) =>
              void handlePreferencesSubmit(values)
            }
          >
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Form.Item label={t('common.language')} name="preferredLanguage">
                <Select options={LANGUAGE_OPTIONS} />
              </Form.Item>
              <Form.Item label={t('common.timezone')} name="preferredTimezone">
                <Select options={TIMEZONE_OPTIONS} />
              </Form.Item>
              <Form.Item
                label={t('common.dateFormat')}
                name="preferredDateFormat"
                className="sm:col-span-2"
              >
                <Select options={DATE_FORMAT_OPTIONS} />
              </Form.Item>
            </div>

            {prefsError && (
              <Alert type="error" showIcon title={prefsError} className="!mb-3" />
            )}
            {prefsSuccess && (
              <Alert type="success" showIcon title={prefsSuccess} className="!mb-3" />
            )}

            <Button type="primary" htmlType="submit" loading={updateProfile.isPending}>
              {t('profile.savePreferences')}
            </Button>
          </Form>
        </ProfileSection>

        <ProfileSection title={t('profile.emailAddress')}>
          <div className="flex flex-col gap-3">
            <div className="erp-employee-contact-card">
              <div className="flex items-start gap-3">
                <span className="erp-users-cell-sub">
                  <MailOutlined aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <MetaItem label={t('common.email')}>
                    <span className="break-all">{displayText(profile.email)}</span>
                  </MetaItem>
                  <div className="mt-3">
                    <MetaItem label={t('users.loginName')}>
                      <span className="break-all">
                        {profile.loginName?.trim()
                          ? profile.loginName
                          : t('users.loginNameNotSet')}
                      </span>
                    </MetaItem>
                  </div>
                  <div className="mt-2">
                    <StatusBadge
                      label={
                        isEmailVerified
                          ? t('common.verified')
                          : t('common.unverified')
                      }
                      variant={isEmailVerified ? 'success' : 'warning'}
                    />
                  </div>
                  {profile.pendingEmail && (
                    <p className="erp-users-cell-sub mt-2 mb-0">
                      {t('common.pendingConfirmation', {
                        email: profile.pendingEmail,
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {!showChangeEmail ? (
              <Button
                block
                onClick={() => {
                  setShowChangeEmail(true);
                  setEmailError(null);
                  setEmailSuccess(null);
                }}
              >
                {t('common.changeEmail')}
              </Button>
            ) : (
              <Form
                form={emailForm}
                layout="vertical"
                requiredMark={false}
                className="erp-employee-contact-card"
                onFinish={(values: { newEmail: string }) =>
                  void handleEmailChangeSubmit(values)
                }
              >
                <Form.Item
                  label={t('common.newEmailAddress')}
                  name="newEmail"
                  rules={[
                    { required: true, message: t('common.requiredEmail') },
                    { type: 'email', message: t('common.invalidEmail') },
                  ]}
                  extra={t('common.emailChangeHint')}
                >
                  <Input type="email" />
                </Form.Item>
                <DemoEmailWarning email={watchedNewEmail} />
                {emailError && (
                  <Alert type="error" showIcon title={emailError} className="!mb-3" />
                )}
                {emailSuccess && (
                  <Alert type="success" showIcon title={emailSuccess} className="!mb-3" />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={changeEmail.isPending}
                  >
                    {t('common.sendConfirmation')}
                  </Button>
                  <Button
                    onClick={() => {
                      setShowChangeEmail(false);
                      setEmailError(null);
                      emailForm.resetFields();
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </Form>
            )}
          </div>
        </ProfileSection>
      </div>

      <ProfileSection title={t('profile.passwordSection')}>
        <p className="erp-users-cell-sub m-0 mb-3">{t('profile.passwordDescription')}</p>
        <Form
          form={passwordForm}
          layout="vertical"
          requiredMark={false}
          onFinish={(values: PasswordFormValues) => void handlePasswordSubmit(values)}
        >
          <div className="grid gap-x-3 md:grid-cols-3">
            <Form.Item
              label={t('common.currentPassword')}
              name="currentPassword"
              rules={[{ required: true, message: t('common.requiredCurrentPassword') }]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              label={t('common.newPassword')}
              name="newPassword"
              rules={[
                { required: true, message: t('common.requiredNewPassword') },
                { min: 8, message: t('common.passwordMinLength') },
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              label={t('common.confirmPassword')}
              name="confirmPassword"
              rules={[{ required: true, message: t('common.requiredConfirmPassword') }]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </div>

          {passwordError && (
            <Alert type="error" showIcon title={passwordError} className="!mb-3" />
          )}
          {passwordSuccess && (
            <Alert type="success" showIcon title={passwordSuccess} className="!mb-3" />
          )}

          <Button type="primary" htmlType="submit" loading={changePassword.isPending}>
            {t('profile.changePassword')}
          </Button>
        </Form>
      </ProfileSection>
    </div>
  );

  const periodProps = {
    contractPeriod: contractPeriod.selected,
    contractPeriods: contractPeriod.periods,
    contractPeriodLoading: contractPeriod.isLoading,
    onContractPeriodChange: contractPeriod.setSelectedId,
    hidePeriodControl: true as const,
  };

  function renderTab(tab: ProfileTab, currentProfile: UserProfile): React.ReactNode {
    switch (tab) {
      case 'leave':
        return (
          <>
            <EmployeeLeaveProfileSection
              mode="self"
              hideCreateAction
              {...periodProps}
            />
            <EmployeeSiteAssignmentsSection employeeId={currentProfile.id} />
          </>
        );
      case 'overtime':
        return (
          <EmployeeOvertimeProfileSection
            mode="self"
            employeeId={currentProfile.id}
            hideCreateAction
            showCategoryColumns
            {...periodProps}
          />
        );
      case 'attendance':
        return (
          <EmployeeAttendanceProfileSection
            employeeId={currentProfile.id}
            isOwnProfile
            initialMonth={attendanceInitialMonth}
            initialYear={attendanceInitialYear}
            {...periodProps}
          />
        );
      case 'workSchedule':
        return (
          <ProfileWorkScheduleTab dateFormat={currentProfile.preferredDateFormat} />
        );
      case 'documents':
        return (
          <ProfileSection
            title={t('profile.documentsTitle')}
            className="erp-employee-section--docs"
          >
            <EmployeeProfileDocuments
              userId={currentProfile.id}
              source="self"
              readOnly
              embedded
              emptyMessage={t('profile.noDocuments')}
            />
          </ProfileSection>
        );
      case 'contract':
        return (
          <ProfileContractTab
            dateFormat={currentProfile.preferredDateFormat}
            contractPeriod={contractPeriod.selected}
          />
        );
      case 'payroll':
        return (
          <EmployeePayslipsSection
            mode="self"
            contractPeriod={contractPeriod.selected}
          />
        );
      case 'assets':
        return (
          <ProfileAssetsTab dateFormat={currentProfile.preferredDateFormat} />
        );
      case 'perDiem':
        return (
          <EmployeePerDiemRatesSection
            employeeId={currentProfile.id}
            editable={false}
            emptyMessage={t('profile.noPerDiemRates')}
          />
        );
      case 'evaluations':
        return (
          <MyEvaluationsPageContent
            contractPeriod={contractPeriod.selected}
          />
        );
      case 'account':
      default:
        return accountTab;
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-profile-page erp-profile-v2">
      {!isEmailVerified && (
        <Alert
          type="warning"
          showIcon
          title={t('profile.emailNotVerified')}
          description={
            <div>
              <p className="m-0">{t('profile.emailNotVerifiedBody')}</p>
              <DemoEmailWarning email={profile.email} />
              <Button
                type="primary"
                size="small"
                className="!mt-3"
                loading={resendActivation.isPending}
                onClick={() => void handleResendActivation()}
              >
                {t('profile.resendActivation')}
              </Button>
              {resendMessage && <p className="mt-2 mb-0">{resendMessage}</p>}
            </div>
          }
        />
      )}

      <div className="erp-pro-card erp-profile-identity">
        <div className="erp-employee-hero erp-profile-hero">
          <EmployeeProfilePhoto
            source="self"
            photoDocumentId={profile.photoDocumentId}
            firstName={profile.firstName}
            lastName={profile.lastName}
            canEdit={false}
            size={isMdUp ? 88 : 72}
            variant="hero"
          />
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="erp-profile-hero-badges mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {profile.employeeId ? (
                <span className="erp-users-id-chip">{profile.employeeId}</span>
              ) : null}
              <StatusBadge
                label={
                  isEmailVerified
                    ? t('profile.emailVerified')
                    : t('profile.emailUnverified')
                }
                variant={isEmailVerified ? 'success' : 'warning'}
              />
              {primaryRole ? (
                <span className="erp-users-role-tag">
                  {formatRoleDisplayName(primaryRole)}
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0">{fullName}</h2>
              {profile.chineseName ? (
                <span className="erp-users-name-alt">{profile.chineseName}</span>
              ) : null}
            </div>
            <p className="erp-users-email m-0 mt-1.5">{displayText(profile.email)}</p>
            <p className="erp-users-cell-sub m-0 mt-1">
              {[
                profile.positionTitle ? position : null,
                profile.departmentName ? department : null,
              ]
                .filter(Boolean)
                .join(' · ') || profile.companyName}
            </p>
          </div>
        </div>

        <div className="erp-users-stat-bar erp-employee-meta-bar erp-profile-meta">
          <MetaStat label={t('common.department')} value={department} />
          <MetaStat label={t('common.position')} value={position} />
          <MetaStat
            label={t('users.form.reportsTo')}
            value={displayText(profile.reportsToName)}
          />
          <MetaStat label={t('profile.branch')} value={displayText(profile.branchName)} />
          <MetaStat label={t('users.form.phone')} value={displayText(profile.phone)} />
          <MetaStat
            label={t('users.form.employeeType')}
            value={
              profile.employeeType ? t(`hr.employeeType.${profile.employeeType}`) : '-'
            }
          />
        </div>
      </div>

      <div className="erp-pro-card erp-profile-workspace">
        <div
          className="erp-profile-tabbar erp-employee-tabbar erp-employee-tabbar--scroll"
          role="tablist"
          aria-label={t('profile.title')}
          onKeyDown={handleTabKeyDown}
        >
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab}
              ref={(element) => {
                tabRefs.current[tab] = element;
              }}
              id={`profile-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`profile-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_META[tab].icon}
              <span className="erp-employee-tab-label">{TAB_META[tab].label}</span>
            </button>
          ))}
        </div>

        <div
          id={`profile-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`profile-tab-${activeTab}`}
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
          {renderTab(activeTab, profile)}
        </div>
      </div>
    </div>
  );
}
