import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { signOutLocally } from '@/lib/auth/sign-out-locally';
import { useAuthStore } from '@/stores/auth.store';
import { toApiRequestError } from './errors';
import type {
  ApiEnvelope,
  ApiSuccessEnvelope,
  AuthTokens,
  PaginationMeta,
  RefreshTokenRequest,
} from './types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3008/api';

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

let refreshPromise: Promise<AuthTokens> | null = null;

function unwrapEnvelope<T>(envelope: ApiEnvelope<T>): T {
  if (!envelope.success) {
    throw toApiRequestError({ response: { status: 400, data: envelope } });
  }
  return envelope.data;
}

function unwrapPaginated<T>(
  envelope: ApiEnvelope<T[]>,
): { data: T[]; meta: PaginationMeta } {
  if (!envelope.success) {
    throw toApiRequestError({ response: { status: 400, data: envelope } });
  }
  if (!envelope.meta) {
    throw new Error('Paginated response is missing meta');
  }
  return { data: envelope.data, meta: envelope.meta };
}

async function refreshAccessToken(): Promise<AuthTokens> {
  const { sessionId, refreshToken, updateSessionTokens } = useAuthStore.getState();

  if (!sessionId || !refreshToken) {
    throw new Error('No refresh token available');
  }

  const body: RefreshTokenRequest = { sessionId, refreshToken };
  const response = await axios.post<ApiSuccessEnvelope<AuthTokens>>(
    `${API_BASE_URL}/auth/refresh`,
    body,
  );

  const tokens = response.data.data;
  updateSessionTokens(tokens);
  return tokens;
}

function getRefreshPromise(): Promise<AuthTokens> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiEnvelope<unknown>>) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const status = error.response?.status;

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      originalRequest._retry = true;

      try {
        const tokens = await getRefreshPromise();
        originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
        return apiClient(originalRequest);
      } catch {
        // Refresh failed — clear session/query cache and stop polling by leaving
        // the app shell. Avoid a second redirect if already on an auth page.
        signOutLocally();
        if (typeof window !== 'undefined') {
          const path = window.location.pathname;
          if (!path.startsWith('/login') && !path.startsWith('/forgot-password')) {
            window.location.replace('/login');
          }
        }
      }
    }

    return Promise.reject(toApiRequestError(error));
  },
);

export async function apiGet<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.get<ApiEnvelope<T>>(url, config);
  return unwrapEnvelope(response.data);
}

export async function apiGetPaginated<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<{ data: T[]; meta: PaginationMeta }> {
  const response = await apiClient.get<ApiEnvelope<T[]>>(url, config);
  return unwrapPaginated(response.data);
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.post<ApiEnvelope<T>>(url, body, config);
  return unwrapEnvelope(response.data);
}

export async function apiPatch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.patch<ApiEnvelope<T>>(url, body, config);
  return unwrapEnvelope(response.data);
}

export async function apiPut<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.put<ApiEnvelope<T>>(url, body, config);
  return unwrapEnvelope(response.data);
}

export async function apiDelete<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.delete<ApiEnvelope<T>>(url, config);
  return unwrapEnvelope(response.data);
}

export async function apiPostForm<T>(
  url: string,
  formData: FormData,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.post<ApiEnvelope<T>>(url, formData, {
    ...config,
    headers: {
      ...config?.headers,
      'Content-Type': 'multipart/form-data',
    },
  });
  return unwrapEnvelope(response.data);
}

export async function apiPatchForm<T>(
  url: string,
  formData: FormData,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.patch<ApiEnvelope<T>>(url, formData, {
    ...config,
    headers: {
      ...config?.headers,
      'Content-Type': 'multipart/form-data',
    },
  });
  return unwrapEnvelope(response.data);
}

export async function downloadApiFile(
  url: string,
  filename: string,
): Promise<{ headers: Record<string, string> }> {
  const response = await apiClient.get(url, { responseType: 'blob' });
  const contentType = response.headers['content-type'];
  const blob = new Blob([response.data as BlobPart], {
    type: typeof contentType === 'string' ? contentType : 'application/octet-stream',
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(response.headers)) {
    if (typeof value === 'string') {
      headers[key.toLowerCase()] = value;
    }
  }
  return { headers };
}

