import type { AxiosError } from 'axios';
import type { ApiErrorEnvelope } from './types';

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    (value as ApiErrorEnvelope).success === false &&
    'error' in value
  );
}

export function toApiRequestError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) {
    return error;
  }

  if (error == null || typeof error !== 'object') {
    const message =
      typeof error === 'string' && error.trim()
        ? error
        : 'Request failed';
    return new ApiRequestError(message, 'REQUEST_FAILED', 0);
  }

  const axiosError = error as AxiosError<ApiErrorEnvelope>;
  const status = axiosError.response?.status ?? 0;
  const envelope = axiosError.response?.data;

  if (envelope && isApiErrorEnvelope(envelope)) {
    return new ApiRequestError(
      envelope.error.message,
      envelope.error.code,
      status,
      envelope.error.details,
    );
  }

  const message =
    axiosError.message ||
    (error instanceof Error ? error.message : 'Request failed');

  return new ApiRequestError(message, 'REQUEST_FAILED', status);
}

/** True when API denied the action because of project design stage (e.g. TENDER). */
export function isProjectStageBlockedError(error: unknown): boolean {
  const apiError = toApiRequestError(error);
  if (apiError.code === 'PROJECT_STAGE_BLOCKED') {
    return true;
  }
  return /stage\s+TENDER/i.test(apiError.message);
}
