'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Select, Spin } from 'antd';
import { User } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import { useResendActivation } from '@/lib/query/auth';
import {
  useChangeEmail,
  useChangePassword,
  useCurrentUser,
  useUpdateProfile,
} from '@/lib/query/profile';

const LANGUAGE_OPTIONS = [
  { value: '', label: 'Company default' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
];

const TIMEZONE_OPTIONS = [
  { value: '', label: 'Company default' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Africa/Addis_Ababa', label: 'Africa/Addis Ababa (EAT)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (AST)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
];

const DATE_FORMAT_OPTIONS = [
  { value: '', label: 'Company default' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
];

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

export default function ProfilePageContent(): React.ReactNode {
  const [accountForm] = Form.useForm<AccountFormValues>();
  const [prefsForm] = Form.useForm<PreferencesFormValues>();
  const [passwordForm] = Form.useForm<PasswordFormValues>();
  const [emailForm] = Form.useForm<{ newEmail: string }>();

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

  useEffect(() => {
    if (!profile) {
      return;
    }
    accountForm.setFieldsValue({
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone ?? '',
    });
    prefsForm.setFieldsValue({
      preferredLanguage: profile.preferredLanguage ?? '',
      preferredTimezone: profile.preferredTimezone ?? '',
      preferredDateFormat: profile.preferredDateFormat ?? '',
    });
  }, [profile, accountForm, prefsForm]);

  if (profileQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <PlaceholderPage
        icon={User}
        title="Profile"
        description="Unable to load your profile. Please try again later."
      />
    );
  }

  const isEmailVerified = Boolean(profile.emailVerifiedAt);
  const roleNames = profile.roles.map((role) => role.name).join(', ') || '—';

  async function handleAccountSubmit(values: AccountFormValues): Promise<void> {
    setAccountError(null);
    setAccountSuccess(null);

    try {
      await updateProfile.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone?.trim() || undefined,
      });
      setAccountSuccess('Account details saved.');
    } catch (error) {
      setAccountError(
        error instanceof ApiRequestError
          ? error.message
          : 'Failed to save account details.',
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
      setPrefsSuccess('Preferences saved.');
    } catch (error) {
      setPrefsError(
        error instanceof ApiRequestError
          ? error.message
          : 'Failed to save preferences.',
      );
    }
  }

  async function handlePasswordSubmit(values: PasswordFormValues): Promise<void> {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (values.newPassword !== values.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      passwordForm.resetFields();
      setPasswordSuccess(
        'Password changed. Other sessions have been signed out.',
      );
    } catch (error) {
      setPasswordError(
        error instanceof ApiRequestError
          ? error.message
          : 'Failed to change password.',
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
          : 'Failed to request email change.',
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
          : 'Failed to resend activation email.',
      );
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {!isEmailVerified && (
        <Alert
          type="warning"
          showIcon
          message="Email not verified"
          description={
            <div>
              <p>Your account must be verified before you can use all features.</p>
              <Button
                type="primary"
                size="small"
                className="!mt-3"
                loading={resendActivation.isPending}
                onClick={() => void handleResendActivation()}
              >
                Resend activation email
              </Button>
              {resendMessage && <p className="mt-2">{resendMessage}</p>}
            </div>
          }
        />
      )}

      <FormLayout
        title="Account"
        description={`${profile.companyName} · ${roleNames}`}
      >
        <Form<AccountFormValues>
          form={accountForm}
          layout="vertical"
          onFinish={(values: AccountFormValues) => void handleAccountSubmit(values)}
        >
          <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
            <Form.Item
              label="First name"
              name="firstName"
              rules={[{ required: true, message: 'First name is required' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="Last name"
              name="lastName"
              rules={[{ required: true, message: 'Last name is required' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item label="Phone" name="phone">
              <Input type="tel" />
            </Form.Item>
            <Form.Item label="Email">
              <div className="flex items-center gap-2">
                <Input readOnly value={profile.email} className="!opacity-80" />
                <StatusBadge
                  label={isEmailVerified ? 'Verified' : 'Unverified'}
                  variant={isEmailVerified ? 'success' : 'warning'}
                />
              </div>
              {profile.pendingEmail && (
                <p className="mt-1 text-xs text-slate-500">
                  Pending confirmation: {profile.pendingEmail}
                </p>
              )}
              <Button
                type="link"
                className="!px-0 !text-orange-600"
                onClick={() => {
                  setShowChangeEmail((current) => !current);
                  setEmailError(null);
                  setEmailSuccess(null);
                }}
              >
                {showChangeEmail ? 'Cancel email change' : 'Change email'}
              </Button>
            </Form.Item>
          </div>

          {accountError && <Alert type="error" showIcon message={accountError} className="!mb-4" />}
          {accountSuccess && <Alert type="success" showIcon message={accountSuccess} className="!mb-4" />}

          <Button type="primary" htmlType="submit" loading={updateProfile.isPending}>
            Save account
          </Button>
        </Form>

        {showChangeEmail && (
          <Form
            form={emailForm}
            layout="vertical"
            className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4"
            onFinish={(values: { newEmail: string }) => void handleEmailChangeSubmit(values)}
          >
            <Form.Item
              label="New email address"
              name="newEmail"
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Enter a valid email' },
              ]}
              extra="A confirmation link will be sent to the new address."
            >
              <Input type="email" />
            </Form.Item>
            {emailError && <Alert type="error" showIcon message={emailError} className="!mb-4" />}
            {emailSuccess && <Alert type="success" showIcon message={emailSuccess} className="!mb-4" />}
            <Button type="primary" htmlType="submit" loading={changeEmail.isPending}>
              Send confirmation
            </Button>
          </Form>
        )}
      </FormLayout>

      <FormLayout
        title="Preferences"
        description="Leave blank to use your company defaults."
      >
        <Form<PreferencesFormValues>
          form={prefsForm}
          layout="vertical"
          onFinish={(values: PreferencesFormValues) => void handlePreferencesSubmit(values)}
        >
          <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
            <Form.Item label="Language" name="preferredLanguage">
              <Select options={LANGUAGE_OPTIONS} />
            </Form.Item>
            <Form.Item label="Timezone" name="preferredTimezone">
              <Select options={TIMEZONE_OPTIONS} />
            </Form.Item>
            <Form.Item label="Date format" name="preferredDateFormat" className="md:col-span-2">
              <Select options={DATE_FORMAT_OPTIONS} />
            </Form.Item>
          </div>

          {prefsError && <Alert type="error" showIcon message={prefsError} className="!mb-4" />}
          {prefsSuccess && <Alert type="success" showIcon message={prefsSuccess} className="!mb-4" />}

          <Button type="primary" htmlType="submit" loading={updateProfile.isPending}>
            Save preferences
          </Button>
        </Form>
      </FormLayout>

      <FormLayout
        title="Security"
        description="Update your password. Other active sessions will be signed out."
      >
        <Form<PasswordFormValues>
          form={passwordForm}
          layout="vertical"
          className="max-w-md"
          onFinish={(values: PasswordFormValues) => void handlePasswordSubmit(values)}
        >
          <Form.Item
            label="Current password"
            name="currentPassword"
            rules={[{ required: true, message: 'Current password is required' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            label="New password"
            name="newPassword"
            rules={[
              { required: true, message: 'New password is required' },
              { min: 8, message: 'Password must be at least 8 characters' },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label="Confirm new password"
            name="confirmPassword"
            rules={[{ required: true, message: 'Please confirm your password' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>

          {passwordError && <Alert type="error" showIcon message={passwordError} className="!mb-4" />}
          {passwordSuccess && <Alert type="success" showIcon message={passwordSuccess} className="!mb-4" />}

          <Button type="primary" htmlType="submit" loading={changePassword.isPending}>
            Change password
          </Button>
        </Form>
      </FormLayout>
    </div>
  );
}
