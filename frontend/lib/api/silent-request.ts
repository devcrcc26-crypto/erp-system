import { useAuthStore } from '@/stores/auth.store';
import type { ApiEnvelope, PaginationMeta } from './types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3008/api';

function authHeaders(): HeadersInit {
  const token = useAuthStore.getState().accessToken;
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

/** GET without throwing on 401/403 - avoids noisy axios console errors for permission probes. */
export async function silentApiGet(path: string): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    headers: authHeaders(),
  });
}

export async function silentPaginatedTotal(
  path: string,
  params: Record<string, string> = {},
): Promise<number | null> {
  try {
    const query = new URLSearchParams({ limit: '1', ...params });
    const response = await silentApiGet(`${path}?${query.toString()}`);
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as ApiEnvelope<unknown[]> & {
      meta?: PaginationMeta;
    };
    if (!body.success || !body.meta) {
      return null;
    }
    return body.meta.total;
  } catch {
    return null;
  }
}
