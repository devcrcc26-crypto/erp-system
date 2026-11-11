'use client';

import { useCallback, useRef, useState } from 'react';
import { apiGet } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';

/** Lifetime requested for preview URLs (long enough for an iframe PDF session). */
export const PREVIEW_URL_EXPIRES_IN_SECONDS = 600;

/** Treat a URL as expired this long before it actually is, so an open preview never 403s. */
const EXPIRY_MARGIN_MS = 30_000;

export interface SignedUrlResult {
  url: string;
  /** Epoch ms after which the URL should be fetched again. */
  expiresAt: number;
}

export interface SignedUrlOptions {
  /**
   * Endpoint returning `{ url, expiresIn }`. Defaults to the core documents
   * endpoint with a 10-minute lifetime; pass this for profile documents,
   * photos, and other entity-scoped download endpoints.
   */
  path?: string;
}

/** Core document download endpoint (default lifetime, used for downloads). */
export function documentDownloadPath(documentId: string): string {
  return `/documents/${documentId}/download-url`;
}

/** Core document endpoint asking for a preview-length signed URL. */
export function documentPreviewPath(documentId: string): string {
  return `${documentDownloadPath(documentId)}?expiresIn=${PREVIEW_URL_EXPIRES_IN_SECONDS}`;
}

export function isSignedUrlFresh(
  result: SignedUrlResult | null | undefined,
): result is SignedUrlResult {
  return Boolean(result && result.expiresAt > Date.now());
}

/**
 * Resolves a signed URL from `path` (no caching; callers cache the result).
 */
export async function fetchSignedUrl(path: string): Promise<SignedUrlResult> {
  const { url, expiresIn } = await apiGet<{ url: string; expiresIn: number }>(
    path,
  );
  return {
    url,
    expiresAt: Date.now() + Math.max(0, expiresIn * 1000 - EXPIRY_MARGIN_MS),
  };
}

export function signedUrlErrorMessage(error: unknown): string {
  return error instanceof ApiRequestError
    ? error.message
    : 'Unable to load file';
}

/**
 * Lazily fetches a signed URL for a document: nothing is requested until
 * `fetch()` is called (e.g. when the user clicks preview). The URL is kept in
 * component state and reused until shortly before it expires.
 *
 * `fetch()` resolves to the URL (or `null` on failure) so callers can open a
 * viewer straight away without waiting for a re-render.
 */
export function useSignedUrl(
  documentId: string | null,
  options: SignedUrlOptions = {},
): {
  url: string | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<string | null>;
} {
  const path = documentId
    ? (options.path ?? documentPreviewPath(documentId))
    : null;
  const [cached, setCached] = useState<
    (SignedUrlResult & { path: string }) | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<{
    path: string;
    promise: Promise<string | null>;
  } | null>(null);

  const fetch = useCallback(async (): Promise<string | null> => {
    if (!path) {
      return null;
    }
    if (cached?.path === path && isSignedUrlFresh(cached)) {
      return cached.url;
    }
    if (inflightRef.current?.path === path) {
      return inflightRef.current.promise;
    }

    setLoading(true);
    setError(null);
    const promise = fetchSignedUrl(path)
      .then((result) => {
        setCached({ ...result, path });
        return result.url;
      })
      .catch((err: unknown) => {
        setError(signedUrlErrorMessage(err));
        return null;
      })
      .finally(() => {
        if (inflightRef.current?.promise === promise) {
          inflightRef.current = null;
        }
        setLoading(false);
      });
    inflightRef.current = { path, promise };
    return promise;
  }, [cached, path]);

  const url = cached?.path === path ? cached.url : null;
  return { url, loading, error, fetch };
}
