'use client';

import { useRouter } from 'next/navigation';
import { Button, Result } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Shown when RouteAccessGate refuses a route (direct URL, breadcrumb or any
 * other link to a page outside the user's permissions).
 */
export default function UnauthorizedPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  return (
    <Result
      status="403"
      title={t('pages.unauthorized.heading')}
      subTitle={t('pages.unauthorized.description')}
      extra={
        <Button type="primary" onClick={() => router.push('/dashboard')}>
          {t('pages.unauthorized.backToDashboard')}
        </Button>
      }
    />
  );
}
