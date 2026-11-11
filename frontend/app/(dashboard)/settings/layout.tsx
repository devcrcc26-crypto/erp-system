'use client';

import { useEffect } from 'react';
import { Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Gates /settings. HR users do not see Settings (System Administrators do).
 * Mirrors the `settings.manage` rule in components/sidebar/sidebar-permissions.ts.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const router = useRouter();
  const permLoading = usePermissionsLoading();
  const caps = useAuthStore((state) => state.capabilities);
  const allowed =
    (caps.canManageRoles || caps.canEditRoles) &&
    (!caps.canViewHr || caps.isSystemAdministrator);

  useEffect(() => {
    if (!permLoading && !allowed) {
      router.replace('/');
    }
  }, [permLoading, allowed, router]);

  if (permLoading || !allowed) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Spin />
      </div>
    );
  }

  return children;
}
