'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Form, Input, Select, Spin, Tabs } from 'antd';
import { CalendarOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { User } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import { DemoEmailWarning } from '@/components/auth/DemoEmailWarning';
import EmployeeLeaveProfileSection from '@/components/modules/hr/leave/EmployeeLeaveProfileSection';
import EmployeeProfilePhoto from '@/components/modules/users/EmployeeProfilePhoto';
import {
  MetaItem,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { tokens } from '@/lib/theme/tokens';
import { useResendActivation } from '@/lib/query/auth';
import {
  useChangeEmail,
  useChangePassword,
  useCurrentUser,
  useUpdateProfile,
} from '@/lib/query/profile';
import type { UserProfile } from '@/lib/api/types';

interface AccountFormValues {
  firstName: string;
  lastName: string;
  phone?: string;
}

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

function ProfileIdentityHero({
  profile,
}: {
  profile: UserProfile;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const isEmailVerified = Boolean(profile.emailVerifiedAt);
  const roleNames = profile.roles.map((role) => role.name);

  return (
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
      <div className="px-5 py-5">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <EmployeeProfilePhoto
            source="self"
            photoDocumentId={profile.photoDocumentId}
            firstName={profile.firstName}
            lastName={profile.lastName}
            canEdit
            size={104}
            variant="hero"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <StatusBadge
                label={
                  isEmailVerified
                    ? t('profile.emailVerified')
                    : t('profile.emailUnverified')
                }
                variant={isEmailVerified ? 'success' : 'warning'}
              />
              {roleNames.slice(0, 4).map((name) => (
                <StatusBadge key={name} label={name} variant="default" />
              ))}
              {roleNames.length > 4 ? (
                <StatusBadge
                  label={`+${roleNames.length - 4}`}
                  variant="default"
                />
              ) : null}
            </div>
            <h2
              className="m-0 text-xl font-semibold leading-snug tracking-tight"
              style={{ color: tokens.colorTextPrimary }}
            >
              {profile.firstName} {profile.lastName}
            </h2>
            {profile.chineseName ? (
              <p
                className="m-0 mt-1 text-sm"
                style={{ color: tokens.colorTextSecondary }}
              >
                {profile.chineseName}
              </p>
            ) : null}
            <p
              className="m-0 mt-2 text-sm"
              style={{ color: tokens.colorTextSecondary }}
            >
              {profile.email}
            </p>
            <p
              className="m-0 mt-1 text-sm"
              style={{ color: tokens.colorTextTertiary }}
            >
              {profile.companyName}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const [accountForm] = Form.useForm<AccountFormValues>();
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

  const [activeTab, setActiveTab] = useState<'account' | 'leave'>('account');
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSuccess, setAccountSuccess] = useState<string | null>(null);
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

  if (profileQuery.isLoading) {
    return (
      <div className="erp-pro-list-page flex justify-center p-12">
        <Spin />
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

  async function handleAccountSubmit(values: AccountFormValues): Promise<void> {
    setAccountError(null);
    setAccountSuccess(null);

    try {
      await updateProfile.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone?.trim() || undefined,
      });
      setAccountSuccess(t('profile.accountSaved'));
    } catch (error) {
      setAccountError(
        error instanceof ApiRequestError
          ? error.message
          : t('profile.accountSaveError'),
      );
    }
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
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="flex flex-col gap-3 lg:col-span-2">
        <FormLayout
          variant="pro"
          dense
          title={t('profile.personalDetails')}
          description={t('profile.personalDetailsDescription')}
        >
          <Form
            form={accountForm}
            key={`account-${profile.id}`}
            layout="vertical"
            requiredMark={false}
            initialValues={{
              firstName: profile.firstName,
              lastName: profile.lastName,
              phone: profile.phone ?? '',
            }}
            onFinish={(values: AccountFormValues) => void handleAccountSubmit(values)}
          >
            <div className="grid gap-x-3 md:grid-cols-2">
              <Form.Item
                label={t('common.firstName')}
                name="firstName"
                rules={[{ required: true, message: t('common.requiredFirstName') }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                label={t('common.lastName')}
                name="lastName"
                rules={[{ required: true, message: t('common.requiredLastName') }]}
              >
                <Input />
              </Form.Item>
              <Form.Item label={t('common.phone')} name="phone" className="md:col-span-2">
                <Input type="tel" />
              </Form.Item>
            </div>

            {accountError && (
              <Alert type="error" showIcon title={accountError} className="!mb-3" />
            )}
            {accountSuccess && (
              <Alert type="success" showIcon title={accountSuccess} className="!mb-3" />
            )}

            <Button
              type="primary"
              htmlType="submit"
              loading={updateProfile.isPending}
              style={{ borderRadius: 2 }}
            >
              {t('profile.saveDetails')}
            </Button>
          </Form>
        </FormLayout>

        <FormLayout
          variant="pro"
          dense
          title={t('profile.regionalPreferences')}
          description={t('profile.regionalPreferencesDescription')}
        >
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
            <div className="grid gap-x-3 md:grid-cols-2">
              <Form.Item label={t('common.language')} name="preferredLanguage">
                <Select options={LANGUAGE_OPTIONS} />
              </Form.Item>
              <Form.Item label={t('common.timezone')} name="preferredTimezone">
                <Select options={TIMEZONE_OPTIONS} />
              </Form.Item>
              <Form.Item
                label={t('common.dateFormat')}
                name="preferredDateFormat"
                className="md:col-span-2"
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

            <Button
              type="primary"
              htmlType="submit"
              loading={updateProfile.isPending}
              style={{ borderRadius: 2 }}
            >
              {t('profile.savePreferences')}
            </Button>
          </Form>
        </FormLayout>
      </div>

      <div className="flex flex-col gap-3">
        <FormLayout
          variant="pro"
          dense
          title={t('profile.emailAddress')}
          description={t('profile.emailAddressDescription')}
        >
          <div className="flex flex-col gap-3">
            <div
              className="rounded p-3"
              style={{
                border: `1px solid ${tokens.colorBorder}`,
                background: tokens.colorPageBg,
              }}
            >
              <div className="flex items-start gap-3">
                <span style={{ color: tokens.colorTextTertiary }}>
                  <MailOutlined aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <MetaItem label={t('common.email')}>
                    <span className="break-all">{profile.email}</span>
                  </MetaItem>
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
                    <p
                      className="mt-2 mb-0 text-xs"
                      style={{ color: tokens.colorTextSecondary }}
                    >
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
                type="default"
                block
                onClick={() => {
                  setShowChangeEmail(true);
                  setEmailError(null);
                  setEmailSuccess(null);
                }}
                style={{ borderRadius: 2 }}
              >
                {t('common.changeEmail')}
              </Button>
            ) : (
              <Form
                form={emailForm}
                layout="vertical"
                requiredMark={false}
                className="rounded p-3"
                style={{
                  border: `1px solid ${tokens.colorBorder}`,
                  background: tokens.colorCardBg,
                }}
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
                    style={{ borderRadius: 2 }}
                  >
                    {t('common.sendConfirmation')}
                  </Button>
                  <Button
                    onClick={() => {
                      setShowChangeEmail(false);
                      setEmailError(null);
                      emailForm.resetFields();
                    }}
                    style={{ borderRadius: 2 }}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </Form>
            )}
          </div>
        </FormLayout>

        <FormLayout
          variant="pro"
          dense
          title={t('profile.passwordSection')}
          description={t('profile.passwordDescription')}
        >
          <Form
            form={passwordForm}
            layout="vertical"
            requiredMark={false}
            onFinish={(values: PasswordFormValues) => void handlePasswordSubmit(values)}
          >
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

            {passwordError && (
              <Alert type="error" showIcon title={passwordError} className="!mb-3" />
            )}
            {passwordSuccess && (
              <Alert type="success" showIcon title={passwordSuccess} className="!mb-3" />
            )}

            <Button
              type="primary"
              htmlType="submit"
              loading={changePassword.isPending}
              style={{ borderRadius: 2 }}
            >
              {t('profile.changePassword')}
            </Button>
          </Form>
        </FormLayout>
      </div>
    </div>
  );

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
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
                style={{ borderRadius: 2 }}
              >
                {t('profile.resendActivation')}
              </Button>
              {resendMessage && <p className="mt-2 mb-0">{resendMessage}</p>}
            </div>
          }
        />
      )}

      <ProfileIdentityHero profile={profile} />

      <SummaryStrip
        items={[
          {
            label: t('profile.companyLabel'),
            value: profile.companyName,
          },
          {
            label: t('common.email'),
            value: profile.email,
          },
          {
            label: t('common.phone'),
            value: profile.phone?.trim() || '—',
          },
          {
            label: t('common.language'),
            value: profile.preferredLanguage
              ? profile.preferredLanguage === 'zh'
                ? t('profile.languageZh')
                : t('profile.languageEn')
              : t('common.companyDefault'),
          },
        ]}
      />

      <Tabs
        className="erp-list-tabs"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'account' | 'leave')}
        items={[
          {
            key: 'account',
            label: (
              <span className="flex items-center gap-2">
                <UserOutlined />
                {t('profile.tabAccount')}
              </span>
            ),
            children: accountTab,
          },
          {
            key: 'leave',
            label: (
              <span className="flex items-center gap-2">
                <CalendarOutlined />
                {t('profile.tabLeave')}
              </span>
            ),
            children: <EmployeeLeaveProfileSection mode="self" />,
          },
        ]}
      />
    </div>
  );
}
