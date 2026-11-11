import type { MessageInstance } from 'antd/es/message/interface';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Surfaces API failures as plain-language Ant Design toasts.
 * Pass a message instance from `useAppMessage()` when calling from React.
 */
export function notifyApiError(
  error: unknown,
  fallback = 'Request failed',
  messageApi?: MessageInstance,
  t?: TFn,
): void {
  const text = getFriendlyApiErrorMessage(error, fallback, t);
  if (messageApi) {
    messageApi.error(text);
    return;
  }
  console.error(text, error);
}
