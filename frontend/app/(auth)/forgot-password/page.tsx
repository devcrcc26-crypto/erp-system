'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useForgotPassword } from '@/lib/query/auth';
import { ApiRequestError } from '@/lib/api/errors';
import { DemoEmailWarning } from '@/components/auth/DemoEmailWarning';

export default function ForgotPasswordPage(): React.ReactNode {
  const forgotPassword = useForgotPassword();

  const [email, setEmail] = useState('');
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
        `${result.message} If you do not see an email, double-check the address and that the account is still active. In local development, open Mailpit at http://localhost:8025 or check the backend terminal for a line starting with [DEV Password reset]. Emails are not delivered to real Gmail inboxes.`,
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
    <div className="w-full max-w-md rounded-md border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Forgot password</h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter the exact email address on your account. We will send a reset
          link if it matches an active user.
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
            className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100"
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
          className="w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: '#f97316' }}
        >
          {forgotPassword.isPending ? 'Sending…' : 'Send reset link'}
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
