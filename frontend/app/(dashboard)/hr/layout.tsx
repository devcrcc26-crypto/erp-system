'use client';

import { useEffect } from 'react';
import { Alert, Spin } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { isHrRouteAllowed } from '@/lib/permissions/route-access';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Gates /hr/* routes.
 * Full HR (hr.view) can access everything.
 * Employees may open overtime, leave-request, and employee-contract routes
 * for their own records; page-level ownership checks enforce that.
 * Supervisors also get the team list routes.
 * The rules live in `isHrRouteAllowed` (lib/permissions/route-access.ts),
 * shared with the dashboard route gate and the breadcrumb trail.
 */
export default function HrSectionLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useEpcTranslation();
  const permLoading = usePermissionsLoading();
  const capabilities = useAuthStore((state) => state.capabilities);
  const allowed = isHrRouteAllowed(pathname, capabilities);

  useEffect(() => {
    if (!permLoading && !allowed) {
      router.replace('/approvals');
    }
  }, [permLoading, allowed, router]);

  if (permLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (!allowed) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.hr.accessDenied')}
      />
    );
  }

  return children;
}
