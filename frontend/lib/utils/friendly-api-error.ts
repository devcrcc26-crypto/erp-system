import { ApiRequestError, toApiRequestError } from '@/lib/api/errors';
import { formatUserValidationFromDetails } from '@/lib/utils/api-validation-details';
import {
  normalizeEpcLocale,
  translateEpcWithVars,
  type EpcLocale,
} from '@/lib/i18n/epc-messages';
import { useAuthStore } from '@/stores/auth.store';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function resolveLocale(): EpcLocale {
  return normalizeEpcLocale(useAuthStore.getState().user?.preferredLanguage);
}

function defaultT(
  key: string,
  vars?: Record<string, string | number>,
): string {
  return translateEpcWithVars(resolveLocale(), key, vars);
}

function looksTechnical(message: string): boolean {
  return (
    /^(Error|Exception|TypeError|Prisma|P\d{4})\b/i.test(message) ||
    /at\s+\S+\s+\(/.test(message) ||
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(message) ||
    message.includes('stack') ||
    message.length > 280
  );
}

function softenApiMessage(message: string, t: TFn): string | null {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();

  if (
    lower.includes('network error') ||
    lower.includes('failed to fetch') ||
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout')
  ) {
    return t('errors.api.network');
  }

  if (
    lower === 'forbidden' ||
    lower === 'unauthorized' ||
    lower.includes('do not have permission') ||
    lower.includes('you are not allowed')
  ) {
    return lower.includes('unauthorized')
      ? t('errors.api.unauthorized')
      : t('errors.api.forbidden');
  }

  if (
    lower.includes('unique constraint') ||
    lower.includes('duplicate key')
  ) {
    return t('errors.api.conflict');
  }

  if (/request failed with status code\s+\d+/i.test(trimmed)) {
    return null;
  }

  if (
    lower.includes('internal server error') ||
    looksTechnical(trimmed)
  ) {
    return t('errors.api.unexpected');
  }

  // Keep clear domain messages from the API as-is.
  return trimmed;
}

function messageForStatus(status: number, t: TFn): string | null {
  switch (status) {
    case 0:
      return t('errors.api.network');
    case 400:
      return t('errors.api.badRequest');
    case 401:
      return t('errors.api.unauthorized');
    case 403:
      return t('errors.api.forbidden');
    case 404:
      return t('errors.api.notFound');
    case 409:
      return t('errors.api.conflict');
    case 422:
      return t('errors.api.validation');
    case 429:
      return t('errors.api.rateLimited');
    case 500:
    case 502:
    case 503:
    case 504:
      return t('errors.api.server');
    default:
      return null;
  }
}

function messageForCode(code: string, t: TFn): string | null {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, '_');
  switch (normalized) {
    case 'BAD_REQUEST':
      return t('errors.api.badRequest');
    case 'UNAUTHORIZED':
      return t('errors.api.unauthorized');
    case 'FORBIDDEN':
      return t('errors.api.forbidden');
    case 'NOT_FOUND':
      return t('errors.api.notFound');
    case 'CONFLICT':
      return t('errors.api.conflict');
    case 'UNPROCESSABLE_ENTITY':
      return t('errors.api.validation');
    case 'TOO_MANY_REQUESTS':
      return t('errors.api.rateLimited');
    case 'INTERNAL_SERVER_ERROR':
    case 'BAD_GATEWAY':
    case 'SERVICE_UNAVAILABLE':
    case 'GATEWAY_TIMEOUT':
      return t('errors.api.server');
    case 'PROJECT_STAGE_BLOCKED':
      return t('errors.api.projectStageBlocked');
    case 'REQUEST_FAILED':
      return null;
    default:
      return null;
  }
}

/**
 * Turns API / network failures into short plain-language copy for end users.
 * Keeps clear API messages; maps technical / status failures to friendly text.
 */
function validationDetailMessage(
  apiError: ApiRequestError,
  t: TFn,
): string | null {
  return formatUserValidationFromDetails(apiError.details, t);
}

function isGenericValidationMessage(message: string): boolean {
  return /^validation failed$/i.test(message.trim());
}

export function getFriendlyApiErrorMessage(
  error: unknown,
  fallback?: string,
  t: TFn = defaultT,
): string {
  const apiError =
    error instanceof ApiRequestError ? error : toApiRequestError(error);

  const fromDetails = validationDetailMessage(apiError, t);
  if (fromDetails && isGenericValidationMessage(apiError.message)) {
    return fromDetails;
  }

  const softened = softenApiMessage(apiError.message, t);
  if (softened) {
    if (isGenericValidationMessage(softened)) {
      return fromDetails ?? t('errors.api.validation');
    }
    return softened;
  }

  const fromCode = messageForCode(apiError.code, t);
  if (fromCode) {
    return fromCode;
  }

  const fromStatus = messageForStatus(apiError.status, t);
  if (fromStatus) {
    return fromStatus;
  }

  if (fallback?.trim()) {
    return fallback.trim();
  }

  return t('errors.api.unexpected');
}
