'use client';

import { useEffect } from 'react';
import { Alert, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Gates all /hr/* routes on the hr.view capability.
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

  useEffect(() => {
    if (!permLoading && !canViewHr) {
      router.replace('/');
    }
  }, [permLoading, canViewHr, router]);

  if (permLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (!canViewHr) {
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
