'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PriorSessionNotice } from '@/components/auth/PriorSessionNotice';
import AuthCenteredShell from '@/components/auth/AuthCenteredShell';
import { usePrepareIdentityAuthFlow } from '@/hooks/usePrepareIdentityAuthFlow';
import { useResetPassword } from '@/lib/query/auth';
import { ApiRequestError } from '@/lib/api/errors';

function ResetPasswordForm(): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetPassword = useResetPassword();
  const { priorUserEmail } = usePrepareIdentityAuthFlow();

  const emailFromUrl = (searchParams.get('email') ?? '').trim().toLowerCase();
  const tokenFromUrl = (searchParams.get('token') ?? '').trim();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (tokenFromUrl && !emailFromUrl) {
      router.replace(`/activate?token=${encodeURIComponent(tokenFromUrl)}`);
    }
  }, [tokenFromUrl, emailFromUrl, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    if (!emailFromUrl || !tokenFromUrl) {
      setErrorMessage('Reset link is invalid or missing required parameters.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    try {
      await resetPassword.mutateAsync({
        email: emailFromUrl,
        token: tokenFromUrl,
        newPassword: password,
      });
      router.replace('/login?reset=1');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Password reset failed. Please request a new link.');
      }
    }
  }

  return (
    <div className="w-full min-w-0 max-w-md rounded-md border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-6 text-center sm:mb-8">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Reset password
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Choose a new password for {emailFromUrl || 'your account'}.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <PriorSessionNotice
          priorUserEmail={priorUserEmail}
          message="You have been signed out so this password reset can continue."
        />

        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100"
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100"
          />
        </div>

        {errorMessage && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {errorMessage}
          </p>
        )}

        {errorMessage?.toLowerCase().includes('invalid or expired') && (
          <p className="text-sm text-slate-500">
            Reset links expire after 1 hour and can only be used once. Request a
            new link from{' '}
            <Link href="/forgot-password" className="font-medium text-orange-600 hover:underline">
              forgot password
            </Link>
            .
          </p>
        )}

        <button
          type="submit"
          disabled={resetPassword.isPending || (Boolean(tokenFromUrl) && !emailFromUrl)}
          className="w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: '#f97316' }}
        >
          {resetPassword.isPending ? 'Resetting...' : 'Reset password'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-orange-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage(): React.ReactNode {
  return (
    <AuthCenteredShell>
      <Suspense
        fallback={
          <div className="w-full min-w-0 rounded-none border border-slate-200 bg-white p-5 text-center text-sm text-slate-500 shadow-sm sm:p-8">
            Loading...
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthCenteredShell>
  );
}
