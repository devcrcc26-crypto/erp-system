// UI polish pass - styles only, no logic changes

'use client';

import type { ComponentType } from 'react';
import { Empty, Tag } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';

type IconProps = { size?: number; className?: string; strokeWidth?: number };

export default function PlaceholderPage({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<IconProps>;
  title: string;
  description?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-24">
      <Empty
        image={
          <div
            className="mx-auto mb-2 flex h-10 w-10 items-center justify-center"
            style={{ color: tokens.colorTextTertiary }}
          >
            <Icon size={40} strokeWidth={1.5} />
          </div>
        }
        description={
          <div className="text-center">
            <h2
              className="mb-2 text-[14px] font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {title}
            </h2>
            <p
              className="mx-auto max-w-[280px] text-[13px] font-normal"
              style={{ color: tokens.colorTextSecondary }}
            >
              {description ?? t('placeholder.defaultDescription')}
            </p>
            <Tag
              variant="filled"
              className="!mt-6"
              style={{
                borderRadius: 20,
                backgroundColor: tokens.colorTeal50,
                color: tokens.colorTeal600,
                fontSize: 11,
                fontWeight: 500,
                padding: '3px 10px',
              }}
            >
              {t('placeholder.comingSoon')}
            </Tag>
          </div>
        }
      />
    </div>
  );
}
