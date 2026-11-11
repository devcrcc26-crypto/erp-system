'use client';

import Link from 'next/link';
import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForgotPassword } from '@/lib/query/auth';
import { ApiRequestError } from '@/lib/api/errors';
import { DemoEmailWarning } from '@/components/auth/DemoEmailWarning';
import AuthCenteredShell from '@/components/auth/AuthCenteredShell';

const AUTH_INPUT_CLASS =
  'w-full min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100';

function ForgotPasswordForm(): React.ReactNode {
  const forgotPassword = useForgotPassword();
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get('email')?.trim() ?? '';

  const [email, setEmail] = useState(emailFromQuery);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await forgotPassword.mutateAsync({
        email: email.trim().toLowerCase(),
      });
      setSuccessMessage(
        `${result.message} If you do not see an email, double-check the address and that the account is still active.`,
      );
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Could not send reset email. Please try again.');
      }
    }
  }

  return (
    <AuthCenteredShell>
    <div className="w-full min-w-0 rounded-none border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-6 text-center sm:mb-8">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Forgot password
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter the email address on your account. We will send a reset link if
          it matches. If your account has no email, ask HR to reset your
          password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
          <DemoEmailWarning email={email} />
        </div>

        {successMessage && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            {successMessage}
          </p>
        )}

        {errorMessage && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={forgotPassword.isPending}
          className="w-full rounded-none px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: '#1D9E75' }}
        >
          {forgotPassword.isPending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-600">
        No email on your account? Ask HR to reset your password.
      </p>

      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-[#1D9E75] hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
    </AuthCenteredShell>
  );
}

export default function ForgotPasswordPage(): React.ReactNode {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
