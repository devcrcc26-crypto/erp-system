'use client';

import { App } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import type { HookAPI } from 'antd/es/modal/useModal';

/**
 * Returns Ant Design message API bound to the root App context (theme-aware).
 */
export function useAppMessage(): MessageInstance {
  const { message } = App.useApp();
  return message;
}

/**
 * Returns Ant Design modal API bound to the root App context (theme-aware).
 * Prefer this over static Modal.confirm / Modal.info / etc.
 */
export function useAppModal(): HookAPI {
  const { modal } = App.useApp();
  return modal;
}
