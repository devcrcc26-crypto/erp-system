import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextStore {
  correlationId: string;
  userId?: string;
  companyId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export function getRequestContext(): RequestContextStore | undefined {
  return requestContextStorage.getStore();
}
