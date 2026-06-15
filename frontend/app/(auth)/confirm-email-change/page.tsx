'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConfirmEmailChange } from '@/lib/query/auth';
import { ApiRequestError } from '@/lib/api/errors';

const confirmingTokens = new Set<string>();

function ConfirmEmailChangeContent(): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmEmailChange = useConfirmEmailChange();

  const tokenFromUrl = (searchParams.get('token') ?? '').trim();

  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    tokenFromUrl ? null : 'Confirmation link is invalid or missing a token.',
  );

  useEffect(() => {
    if (!tokenFromUrl) {
      return;
    }

    const storageKey = `email-change-confirm:${tokenFromUrl}`;

    if (sessionStorage.getItem(storageKey) === 'done') {
      router.replace('/login?emailChanged=1');
      return;
    }

    if (confirmingTokens.has(tokenFromUrl)) {
      return;
    }

    confirmingTokens.add(tokenFromUrl);

    void confirmEmailChange
      .mutateAsync({ token: tokenFromUrl })
      .then(() => {
        sessionStorage.setItem(storageKey, 'done');
        router.replace('/login?emailChanged=1');
      })
      .catch((error: unknown) => {
        if (error instanceof ApiRequestError) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage('Email confirmation failed. Please try again.');
        }
      })
      .finally(() => {
        confirmingTokens.delete(tokenFromUrl);
      });
  }, [tokenFromUrl, confirmEmailChange, router]);

  if (errorMessage) {
    return (
      <div className="w-full max-w-md rounded-md border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Email confirmation failed</h1>
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
    <div className="w-full max-w-md rounded-md border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">Confirming email change</h1>
      <p className="mt-2 text-sm text-slate-500">
        {confirmEmailChange.isPending
          ? 'Please wait while we verify your new email address…'
          : 'Redirecting you to sign in…'}
      </p>
    </div>
  );
}

export default function ConfirmEmailChangePage(): React.ReactNode {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md rounded-md border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Loading…
        </div>
      }
    >
      <ConfirmEmailChangeContent />
    </Suspense>
  );
}
