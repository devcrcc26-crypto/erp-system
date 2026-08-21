'use client';

import { useMemo, useState } from 'react';
import { Alert, Avatar, Button, Form, Input, Select, Spin } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { User } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import { DemoEmailWarning } from '@/components/auth/DemoEmailWarning';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { useResendActivation } from '@/lib/query/auth';
import {
  useChangeEmail,
  useChangePassword,
  useCurrentUser,
  useMyProfilePhotoUrl,
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

function profileInitials(profile: UserProfile): string {
  const first = profile.firstName.charAt(0).toUpperCase();
  const last = profile.lastName.charAt(0).toUpperCase();
  return `${first}${last}`;
}

function ProfileSummaryCard({ profile }: { profile: UserProfile }): React.ReactNode {
  const { t } = useEpcTranslation();
  const isEmailVerified = Boolean(profile.emailVerifiedAt);
  const roleNames = profile.roles.map((role) => role.name);
  const photoQuery = useMyProfilePhotoUrl(Boolean(profile.photoDocumentId));

  return (
    <div className={`${layout.cardSurface} overflow-hidden`}>
      <div className="h-1.5 w-full" style={{ backgroundColor: tokens.colorPrimary }} />
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <Avatar
          size={72}
          src={photoQuery.data?.url}
          className="shrink-0 !text-xl !font-semibold"
          style={{
            backgroundColor: photoQuery.data?.url
              ? undefined
              : tokens.colorSidebarBg,
          }}
        >
          {profileInitials(profile)}
        </Avatar>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">
            {profile.firstName} {profile.lastName}
            {profile.chineseName ? (
              <span className="ml-2 font-semibold text-slate-500">
                {profile.chineseName}
              </span>
            ) : null}
          </h2>
          <p className="mt-1 truncate text-sm text-slate-600">{profile.email}</p>
          <p className="mt-1 text-sm text-slate-500">{profile.companyName}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge
              label={isEmailVerified ? t('profile.emailVerified') : t('profile.emailUnverified')}
              variant={isEmailVerified ? 'success' : 'warning'}
            />
            {roleNames.map((name) => (
              <StatusBadge key={name} label={name} variant="default" />
            ))}
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
      <div className={layout.loadingCard}>
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

  return (
    <div className={layout.pageStack}>
      {!isEmailVerified && (
        <Alert
          type="warning"
          showIcon
          title={t('profile.emailNotVerified')}
          description={
            <div>
              <p>{t('profile.emailNotVerifiedBody')}</p>
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
              {resendMessage && <p className="mt-2">{resendMessage}</p>}
            </div>
          }
        />
      )}

      <ProfileSummaryCard profile={profile} />

      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        <div className={`${layout.sectionStack} lg:col-span-2`}>
          <FormLayout
            title={t('profile.personalDetails')}
            description={t('profile.personalDetailsDescription')}
          >
            <Form<AccountFormValues>
              form={accountForm}
              key={`account-${profile.id}`}
              layout="vertical"
              initialValues={{
                firstName: profile.firstName,
                lastName: profile.lastName,
                phone: profile.phone ?? '',
              }}
              onFinish={(values: AccountFormValues) => void handleAccountSubmit(values)}
            >
              <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
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
                <Alert type="error" showIcon title={accountError} className="!mb-4" />
              )}
              {accountSuccess && (
                <Alert type="success" showIcon title={accountSuccess} className="!mb-4" />
              )}

              <Button type="primary" htmlType="submit" loading={updateProfile.isPending}>
                {t('profile.saveDetails')}
              </Button>
            </Form>
          </FormLayout>

          <FormLayout
            title={t('profile.regionalPreferences')}
            description={t('profile.regionalPreferencesDescription')}
          >
            <Form<PreferencesFormValues>
              form={prefsForm}
              key={`prefs-${profile.id}`}
              layout="vertical"
              initialValues={{
                preferredLanguage: profile.preferredLanguage ?? '',
                preferredTimezone: profile.preferredTimezone ?? '',
                preferredDateFormat: profile.preferredDateFormat ?? '',
              }}
              onFinish={(values: PreferencesFormValues) =>
                void handlePreferencesSubmit(values)
              }
            >
              <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
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
                <Alert type="error" showIcon title={prefsError} className="!mb-4" />
              )}
              {prefsSuccess && (
                <Alert type="success" showIcon title={prefsSuccess} className="!mb-4" />
              )}

              <Button type="primary" htmlType="submit" loading={updateProfile.isPending}>
                {t('profile.savePreferences')}
              </Button>
            </Form>
          </FormLayout>
        </div>

        <div className={layout.sectionStack}>
          <FormLayout
            title={t('profile.emailAddress')}
            description={t('profile.emailAddressDescription')}
          >
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-slate-400">
                    <MailOutlined aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {profile.email}
                    </p>
                    <div className="mt-2">
                      <StatusBadge
                        label={isEmailVerified ? t('common.verified') : t('common.unverified')}
                        variant={isEmailVerified ? 'success' : 'warning'}
                      />
                    </div>
                    {profile.pendingEmail && (
                      <p className="mt-2 text-xs text-slate-500">
                        {t('common.pendingConfirmation', { email: profile.pendingEmail })}
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
                >
                  {t('common.changeEmail')}
                </Button>
              ) : (
                <Form
                  form={emailForm}
                  layout="vertical"
                  className="rounded-lg border border-slate-200 bg-white p-4"
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
                    <Alert type="error" showIcon title={emailError} className="!mb-4" />
                  )}
                  {emailSuccess && (
                    <Alert type="success" showIcon title={emailSuccess} className="!mb-4" />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="primary" htmlType="submit" loading={changeEmail.isPending}>
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
          </FormLayout>

          <FormLayout
            title={t('profile.passwordSection')}
            description={t('profile.passwordDescription')}
          >
            <Form<PasswordFormValues>
              form={passwordForm}
              layout="vertical"
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
                <Alert type="error" showIcon title={passwordError} className="!mb-4" />
              )}
              {passwordSuccess && (
                <Alert type="success" showIcon title={passwordSuccess} className="!mb-4" />
              )}

              <Button type="primary" htmlType="submit" loading={changePassword.isPending}>
                {t('profile.changePassword')}
              </Button>
            </Form>
          </FormLayout>
        </div>
      </div>
    </div>
  );
}
