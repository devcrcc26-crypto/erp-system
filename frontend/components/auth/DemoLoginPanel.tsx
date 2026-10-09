'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { isDemoLoginEnabled } from '@/lib/auth/demo-login-enabled';

interface DemoLoginPanelProps {
  onSelectAccount: (email: string, password: string) => void;
}

type DemoLoginCredentialsComponent = ComponentType<{
  onSelectAccount: (email: string, password: string) => void;
}>;

/**
 * Loads demo credentials only when demo login is enabled.
 * The credentials module is dynamically imported so production builds
 * can tree-shake it out of the client bundle.
 */
export function DemoLoginPanel({
  onSelectAccount,
}: DemoLoginPanelProps): React.ReactNode {
  const [Credentials, setCredentials] =
    useState<DemoLoginCredentialsComponent | null>(null);

  useEffect(() => {
    // Keep the dynamic import inside this guarded branch so production
    // (NODE_ENV === 'production') dead-code-eliminates the chunk.
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === 'true'
    ) {
      let cancelled = false;
      void import('@/components/auth/DemoLoginCredentials').then((mod) => {
        if (!cancelled) {
          setCredentials(() => mod.DemoLoginCredentials);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, []);

  if (!isDemoLoginEnabled() || !Credentials) {
    return null;
  }

  return <Credentials onSelectAccount={onSelectAccount} />;
}
