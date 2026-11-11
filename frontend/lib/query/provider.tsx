'use client';

import { AuthSessionSync } from '@/components/auth/AuthSessionSync';
import { AuthSync } from '@/components/auth/AuthSync';
import { registerQueryClient } from '@/lib/query/query-client-ref';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }): ReactNode {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
    registerQueryClient(client);
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <AuthSessionSync />
      {children}
    </QueryClientProvider>
  );
}
