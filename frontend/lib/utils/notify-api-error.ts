import { message } from 'antd';
import { ApiRequestError, toApiRequestError } from '@/lib/api/errors';

/**
 * Surfaces API validation/conflict errors in Ant Design toasts.
 */
export function notifyApiError(error: unknown, fallback = 'Request failed'): void {
  const apiError =
    error instanceof ApiRequestError ? error : toApiRequestError(error);
  message.error(apiError.message || fallback);
}
