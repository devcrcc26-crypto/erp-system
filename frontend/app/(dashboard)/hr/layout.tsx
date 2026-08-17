'use client';

import { useEffect } from 'react';
import { Alert, Spin } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Gates /hr/* routes.
 * Full HR (hr.view) can access everything.
 * Employees may open overtime, leave-request, and employee-contract routes
 * for their own records; page-level ownership checks enforce that.
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
  const canViewHr = useCanViewHr();

  const isEmployeeSelfServiceRoute =
    pathname.startsWith('/hr/overtime') ||
    pathname.startsWith('/hr/leave-requests') ||
    pathname.startsWith('/hr/employee-contract');

  const allowed = canViewHr || isEmployeeSelfServiceRoute;

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
