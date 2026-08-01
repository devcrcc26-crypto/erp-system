'use client';

import { useEffect } from 'react';
import { Alert, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Gates /hr/* routes — requires hr.view (Human Resources module access).
 * Employees submit leave/overtime via Approvals, not this section.
 */
export default function HrSectionLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const permLoading = usePermissionsLoading();
  const canViewHr = useCanViewHr();
  const allowed = canViewHr;

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
