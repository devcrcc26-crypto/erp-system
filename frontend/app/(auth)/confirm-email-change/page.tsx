'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePrepareIdentityAuthFlow } from '@/hooks/usePrepareIdentityAuthFlow';
import AuthCenteredShell from '@/components/auth/AuthCenteredShell';
import { apiPost } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import type { MessageResponse } from '@/lib/api/types';

function storageKeyForToken(token: string): string {
  return `email-change-confirm:${token}`;
}

function ConfirmEmailChangeContent(): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  usePrepareIdentityAuthFlow();

  const tokenFromUrl = (searchParams.get('token') ?? '').trim();

  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    tokenFromUrl ? null : 'Confirmation link is invalid or missing a token.',
  );

  useEffect(() => {
    if (!tokenFromUrl) {
      return;
    }

    const storageKey = storageKeyForToken(tokenFromUrl);
    const status = sessionStorage.getItem(storageKey);

    if (status === 'done') {
      router.replace('/login?emailChanged=1');
      return;
    }

    if (status === 'pending') {
      return;
    }

    sessionStorage.setItem(storageKey, 'pending');

    void apiPost<MessageResponse>('/auth/confirm-email-change', {
      token: tokenFromUrl,
    })
      .then(() => {
        sessionStorage.setItem(storageKey, 'done');
        router.replace('/login?emailChanged=1');
      })
      .catch((error: unknown) => {
        sessionStorage.removeItem(storageKey);

        if (error instanceof ApiRequestError) {
          if (error.status === 429) {
            setErrorMessage(
              'Too many confirmation attempts. Please wait a minute and open the link again.',
            );
            return;
          }

          setErrorMessage(error.message);
          return;
        }

        setErrorMessage('Email confirmation failed. Please try again.');
      });
  }, [tokenFromUrl, router]);

  if (errorMessage) {
    return (
      <div className="w-full min-w-0 max-w-md rounded-md border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Email confirmation failed
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            We could not confirm your new email address.
          </p>
        </div>

        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p>

        {errorMessage.toLowerCase().includes('invalid or expired') && (
          <p className="mt-4 text-sm text-slate-500">
            Confirmation links expire after 24 hours and can only be used once. Request a new
            change from your profile settings.
          </p>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-medium text-orange-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-md rounded-md border border-slate-200 bg-white p-5 text-center shadow-sm sm:p-8">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
        Confirming email change
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Please wait while we verify your new email address…
      </p>
    </div>
  );
}

export default function ConfirmEmailChangePage(): React.ReactNode {
  return (
    <AuthCenteredShell>
      <Suspense
        fallback={
          <div className="w-full min-w-0 rounded-none border border-slate-200 bg-white p-5 text-center text-sm text-slate-500 shadow-sm sm:p-8">
            Loading…
          </div>
        }
      >
        <ConfirmEmailChangeContent />
      </Suspense>
    </AuthCenteredShell>
  );
}
