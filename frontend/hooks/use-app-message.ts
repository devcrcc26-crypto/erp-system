'use client';

import { App } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';

/**
 * Returns Ant Design message API bound to the root App context (theme-aware).
 */
export function useAppMessage(): MessageInstance {
  const { message } = App.useApp();
  return message;
}
