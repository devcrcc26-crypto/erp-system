'use client';

import { Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSessionCapabilities } from '@/lib/query/auth';
import { useCapabilitiesReady } from '@/hooks/use-pm-capabilities';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Blocks the dashboard shell until persisted auth and capabilities are ready.
 */
export default function DashboardAuthGate({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionId = useAuthStore((state) => state.sessionId);
  const [hydrated, setHydrated] = useState(
    () => Boolean(useAuthStore.getState().accessToken),
  );

  useEffect(() => {
    if (useAuthStore.getState().accessToken) {
      setHydrated(true);
      return;
    }

    void Promise.resolve(useAuthStore.persist.rehydrate()).then(() => {
      setHydrated(true);
    });
  }, []);

  const sessionConfirmed =
    hydrated && Boolean(accessToken) && Boolean(sessionId);

  useSessionCapabilities(sessionConfirmed);
  const capabilitiesReady = useCapabilitiesReady();

  useEffect(() => {
    if (hydrated && !accessToken) {
      router.replace('/login');
    }
  }, [hydrated, accessToken, router]);

  if (!hydrated || !sessionConfirmed || !capabilitiesReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return children;
}
