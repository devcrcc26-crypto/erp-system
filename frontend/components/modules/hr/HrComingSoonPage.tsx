'use client';

import { Typography } from 'antd';
import PageHeader from '@/components/ui/PageHeader/PageHeader';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';

export interface HrComingSoonPageProps {
  /** i18n key for the page title (also used as nav label). */
  titleKey: string;
}

/**
 * Placeholder for HR module routes until each workflow is implemented.
 */
export default function HrComingSoonPage({
  titleKey,
}: HrComingSoonPageProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const title = t(titleKey);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} showSearch={false} />
      <div
        className="rounded-lg border px-6 py-10"
        style={{
          backgroundColor: tokens.colorCardBg,
          borderColor: tokens.colorBorder,
        }}
      >
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          {t('pages.hr.comingSoonTitle')}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t('pages.hr.comingSoonDescription', { module: title })}
        </Typography.Paragraph>
      </div>
    </div>
  );
}
