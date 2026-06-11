'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { User } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import { ApiRequestError } from '@/lib/api/errors';
import { useResendActivation } from '@/lib/query/auth';
import {
  useChangeEmail,
  useChangePassword,
  useCurrentUser,
  useUpdateProfile,
} from '@/lib/query/profile';

const INPUT_CLASS =
  'w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100';

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

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <section className="rounded-md bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function ProfilePageContent(): React.ReactNode {
  const profileQuery = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const changeEmail = useChangeEmail();
  const resendActivation = useResendActivation();

  const profile = profileQuery.data;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('');
  const [preferredTimezone, setPreferredTimezone] = useState('');
  const [preferredDateFormat, setPreferredDateFormat] = useState('');

  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSuccess, setAccountSuccess] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [prefsSuccess, setPrefsSuccess] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) {
      return;
    }
    setFirstName(profile.firstName);
    setLastName(profile.lastName);
    setPhone(profile.phone ?? '');
    setPreferredLanguage(profile.preferredLanguage ?? '');
    setPreferredTimezone(profile.preferredTimezone ?? '');
    setPreferredDateFormat(profile.preferredDateFormat ?? '');
  }, [profile]);

  if (profileQuery.isLoading) {
    return (
      <div className="rounded-md bg-white p-6 text-sm text-slate-500 shadow-sm">
        Loading profile…
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

  const userEmail = profile.email;
  const isEmailVerified = Boolean(profile.emailVerifiedAt);
  const roleNames = profile.roles.map((role) => role.name).join(', ') || '—';

  async function handleAccountSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAccountError(null);
    setAccountSuccess(null);

    try {
      await updateProfile.mutateAsync({
        firstName,
        lastName,
        phone: phone.trim() || undefined,
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
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setPrefsError(null);
    setPrefsSuccess(null);

    try {
      await updateProfile.mutateAsync({
        preferredLanguage: preferredLanguage || undefined,
        preferredTimezone: preferredTimezone || undefined,
        preferredDateFormat: preferredDateFormat || undefined,
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

  async function handlePasswordSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
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

  async function handleEmailChangeSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    try {
      const result = await changeEmail.mutateAsync({ newEmail });
      setEmailSuccess(result.message);
      setNewEmail('');
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
    setResendMessage(null);

    try {
      const result = await resendActivation.mutateAsync({
        email: userEmail,
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
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Email not verified</p>
          <p className="mt-1 text-amber-800">
            Your account must be verified before you can use all features.
          </p>
          <button
            type="button"
            onClick={() => void handleResendActivation()}
            disabled={resendActivation.isPending}
            className="mt-3 rounded-md px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: '#f97316' }}
          >
            {resendActivation.isPending
              ? 'Sending…'
              : 'Resend activation email'}
          </button>
          {resendMessage && (
            <p className="mt-2 text-amber-800">{resendMessage}</p>
          )}
        </div>
      )}

      <SectionCard
        title="Account"
        description={`${profile.companyName} · ${roleNames}`}
      >
        <form onSubmit={handleAccountSubmit} className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="firstName" className="mb-1 block text-sm font-medium text-slate-700">
              First name
            </label>
            <input
              id="firstName"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="lastName" className="mb-1 block text-sm font-medium text-slate-700">
              Last name
            </label>
            <input
              id="lastName"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium text-slate-700">
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <div className="flex items-center gap-2">
              <input
                type="email"
                readOnly
                value={profile.email}
                className={`${INPUT_CLASS} cursor-not-allowed opacity-80`}
              />
              {isEmailVerified ? (
                <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  Verified
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  Unverified
                </span>
              )}
            </div>
            {profile.pendingEmail && (
              <p className="mt-1 text-xs text-slate-500">
                Pending confirmation: {profile.pendingEmail}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setShowChangeEmail((current) => !current);
                setEmailError(null);
                setEmailSuccess(null);
              }}
              className="mt-2 text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              {showChangeEmail ? 'Cancel email change' : 'Change email'}
            </button>
          </div>

          {accountError && (
            <p className="md:col-span-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {accountError}
            </p>
          )}
          {accountSuccess && (
            <p className="md:col-span-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {accountSuccess}
            </p>
          )}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="rounded-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#f97316' }}
            >
              {updateProfile.isPending ? 'Saving…' : 'Save account'}
            </button>
          </div>
        </form>

        {showChangeEmail && (
          <form
            onSubmit={handleEmailChangeSubmit}
            className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3"
          >
            <div>
              <label htmlFor="newEmail" className="mb-1 block text-sm font-medium text-slate-700">
                New email address
              </label>
              <input
                id="newEmail"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className={INPUT_CLASS}
              />
              <p className="mt-1 text-xs text-slate-500">
                A confirmation link will be sent to the new address.
              </p>
            </div>
            {emailError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {emailError}
              </p>
            )}
            {emailSuccess && (
              <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                {emailSuccess}
              </p>
            )}
            <button
              type="submit"
              disabled={changeEmail.isPending}
              className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#f97316' }}
            >
              {changeEmail.isPending ? 'Sending…' : 'Send confirmation'}
            </button>
          </form>
        )}
      </SectionCard>

      <SectionCard
        title="Preferences"
        description="Leave blank to use your company defaults."
      >
        <form onSubmit={handlePreferencesSubmit} className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="preferredLanguage" className="mb-1 block text-sm font-medium text-slate-700">
              Language
            </label>
            <select
              id="preferredLanguage"
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              className={INPUT_CLASS}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value || 'default'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="preferredTimezone" className="mb-1 block text-sm font-medium text-slate-700">
              Timezone
            </label>
            <select
              id="preferredTimezone"
              value={preferredTimezone}
              onChange={(e) => setPreferredTimezone(e.target.value)}
              className={INPUT_CLASS}
            >
              {TIMEZONE_OPTIONS.map((option) => (
                <option key={option.value || 'default'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="preferredDateFormat" className="mb-1 block text-sm font-medium text-slate-700">
              Date format
            </label>
            <select
              id="preferredDateFormat"
              value={preferredDateFormat}
              onChange={(e) => setPreferredDateFormat(e.target.value)}
              className={INPUT_CLASS}
            >
              {DATE_FORMAT_OPTIONS.map((option) => (
                <option key={option.value || 'default'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {prefsError && (
            <p className="md:col-span-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {prefsError}
            </p>
          )}
          {prefsSuccess && (
            <p className="md:col-span-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {prefsSuccess}
            </p>
          )}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="rounded-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#f97316' }}
            >
              {updateProfile.isPending ? 'Saving…' : 'Save preferences'}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Security"
        description="Update your password. Other active sessions will be signed out."
      >
        <form onSubmit={handlePasswordSubmit} className="grid max-w-md gap-4">
          <div>
            <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-slate-700">
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-slate-700">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-slate-700">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          {passwordError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {passwordError}
            </p>
          )}
          {passwordSuccess && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {passwordSuccess}
            </p>
          )}

          <div>
            <button
              type="submit"
              disabled={changePassword.isPending}
              className="rounded-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#f97316' }}
            >
              {changePassword.isPending ? 'Updating…' : 'Change password'}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
