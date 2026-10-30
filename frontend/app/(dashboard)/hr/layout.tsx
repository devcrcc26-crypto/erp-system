'use client';

import { useEffect } from 'react';
import { Alert, Spin } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import {
  useCanAccessPayroll,
  useCanCreatePurchaseRequest,
  useCanManageAnnouncements,
  useCanViewHr,
  useCanViewPurchaseRequest,
  useCanViewTeam,
} from '@/hooks/use-auth-capabilities';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Gates /hr/* routes.
 * Full HR (hr.view) can access everything.
 * Employees may open overtime, leave-request, and employee-contract routes
 * for their own records; page-level ownership checks enforce that.
 * Supervisors also get the team list routes (`isTeamRoute`).
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
  const canManageAnnouncements = useCanManageAnnouncements();
  const canViewPurchaseRequest = useCanViewPurchaseRequest();
  const canCreatePurchaseRequest = useCanCreatePurchaseRequest();
  const canViewTeam = useCanViewTeam();

  const isEmployeeSelfServiceRoute =
    pathname.startsWith('/hr/overtime') ||
    pathname.startsWith('/hr/leave-requests') ||
    pathname.startsWith('/hr/leave-history') ||
    pathname.startsWith('/hr/employee-contract') ||
    pathname.startsWith('/hr/expense-claims') ||
    pathname.startsWith('/hr/per-diem') ||
    pathname.startsWith('/hr/attendance') ||
    pathname.startsWith('/hr/site-assignments') ||
    pathname.startsWith('/hr/evaluations');

  // Supervisor team lists (data scoped to their reporting chain by the API).
  const isTeamRoute = [
    '/hr/my-team',
    '/hr/flight-applications',
    '/hr/business-trips',
    '/hr/vehicle-applications',
    '/hr/equipment-and-materials-exit-permit',
    '/hr/field-movement-logs',
  ].some((prefix) => pathname.startsWith(prefix));

  const isWfhAssignRoute = pathname.startsWith('/hr/work-from-home');
  const isPayrollRoute = pathname.startsWith('/hr/payroll');
  const isAnnouncementsRoute = pathname.startsWith('/hr/announcements');
  const isPurchaseRequestRoute = pathname.startsWith('/hr/purchase-requests');
  const allowed =
    canViewHr ||
    isEmployeeSelfServiceRoute ||
    isWfhAssignRoute ||
    (isTeamRoute && canViewTeam) ||
    (isPayrollRoute && canAccessPayroll) ||
    (isAnnouncementsRoute && canManageAnnouncements) ||
    (isPurchaseRequestRoute &&
      (canViewPurchaseRequest || canCreatePurchaseRequest));

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
