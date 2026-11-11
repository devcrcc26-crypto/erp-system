import type { QueryClient } from '@tanstack/react-query';

let queryClientRef: QueryClient | null = null;

/** Registers the app QueryClient for use outside React components. */
export function registerQueryClient(client: QueryClient): void {
  queryClientRef = client;
}

/** Returns the registered QueryClient, if available. */
export function getQueryClient(): QueryClient | null {
  return queryClientRef;
}
