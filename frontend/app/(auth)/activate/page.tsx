'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PriorSessionNotice } from '@/components/auth/PriorSessionNotice';
import AuthCenteredShell from '@/components/auth/AuthCenteredShell';
import { usePrepareIdentityAuthFlow } from '@/hooks/usePrepareIdentityAuthFlow';
import { useActivateAccount } from '@/lib/query/auth';
import { ApiRequestError } from '@/lib/api/errors';

function ActivateForm(): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') ?? '';
  const { priorUserEmail } = usePrepareIdentityAuthFlow();

  const activate = useActivateAccount();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    if (!tokenFromUrl) {
      setErrorMessage('Activation link is invalid or missing a token.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    try {
      await activate.mutateAsync({
        token: tokenFromUrl,
        newPassword: password,
      });
      router.replace('/login?activated=1');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Activation failed. Please try again or contact your administrator.');
      }
    }
  }

  return (
    <div className="w-full min-w-0 max-w-md rounded-md border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-6 text-center sm:mb-8">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Activate account
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Set your password to verify your email and access the system.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <PriorSessionNotice
          priorUserEmail={priorUserEmail}
          message="You have been signed out so this account can be activated."
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

        <button
          type="submit"
          disabled={activate.isPending}
          className="w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: '#f97316' }}
        >
          {activate.isPending ? 'Activating...' : 'Activate account'}
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

export default function ActivatePage(): React.ReactNode {
  return (
    <AuthCenteredShell>
      <Suspense
        fallback={
          <div className="w-full min-w-0 rounded-none border border-slate-200 bg-white p-5 text-center text-sm text-slate-500 shadow-sm sm:p-8">
            Loading...
          </div>
        }
      >
        <ActivateForm />
      </Suspense>
    </AuthCenteredShell>
  );
}
