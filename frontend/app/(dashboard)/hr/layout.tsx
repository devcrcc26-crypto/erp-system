'use client';

import { useEffect } from 'react';
import { Alert, Spin } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import {
  useCanAccessLeave,
  useCanAccessOvertime,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Gates /hr/* routes: full HR (hr.view), leave access, or overtime access.
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
  const canAccessLeave = useCanAccessLeave();
  const canAccessOvertime = useCanAccessOvertime();

  const isOvertimeRoute = pathname.startsWith('/hr/overtime');
  const isLeaveRoute = pathname.startsWith('/hr/leave-requests');
  const allowed =
    canViewHr ||
    (isLeaveRoute && canAccessLeave) ||
    (isOvertimeRoute && canAccessOvertime);

  useEffect(() => {
    if (!permLoading && !allowed) {
      router.replace('/');
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
