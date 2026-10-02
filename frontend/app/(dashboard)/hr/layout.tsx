'use client';

import { useEffect } from 'react';
import { Alert, Spin } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { useCanAccessPayroll, useCanViewHr } from '@/hooks/use-auth-capabilities';
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
  const canAccessPayroll = useCanAccessPayroll();

  const isEmployeeSelfServiceRoute =
    pathname.startsWith('/hr/overtime') ||
    pathname.startsWith('/hr/leave-requests') ||
    pathname.startsWith('/hr/leave-history') ||
    pathname.startsWith('/hr/employee-contract') ||
    pathname.startsWith('/hr/expense-claims') ||
    pathname.startsWith('/hr/attendance') ||
    pathname.startsWith('/hr/evaluations');

  const isPayrollRoute = pathname.startsWith('/hr/payroll');
  const allowed =
    canViewHr || isEmployeeSelfServiceRoute || (isPayrollRoute && canAccessPayroll);

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
