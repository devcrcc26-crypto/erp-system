import type { MessageInstance } from 'antd/es/message/interface';
import { ApiRequestError, toApiRequestError } from '@/lib/api/errors';

/**
 * Surfaces API validation/conflict errors in Ant Design toasts.
 * Pass a message instance from `useAppMessage()` when calling from React components.
 */
export function notifyApiError(
  error: unknown,
  fallback = 'Request failed',
  messageApi?: MessageInstance,
): void {
  const apiError =
    error instanceof ApiRequestError ? error : toApiRequestError(error);
  const text = apiError.message || fallback;
  if (messageApi) {
    messageApi.error(text);
    return;
  }
  console.error(text, error);
}
