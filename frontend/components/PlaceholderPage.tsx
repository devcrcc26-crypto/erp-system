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

  // Brand card (login-card bar, accent outline) with a gradient icon tile.
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white px-6 pb-10 pt-12"
        style={{
          border: '1px solid var(--color-card-border)',
          boxShadow: 'var(--shadow-panel)',
        }}
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: 'var(--gradient-primary)' }}
        />
      <Empty
        image={
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white"
            style={{
              background: 'var(--gradient-primary)',
              boxShadow: 'var(--shadow-button-sm)',
            }}
          >
            <Icon size={30} strokeWidth={1.75} />
          </div>
        }
        styles={{ image: { height: 'auto' } }}
        description={
          <div className="text-center">
            <h2
              className="mb-2 text-[18px] font-semibold tracking-tight"
              style={{ color: 'var(--color-text-heading)' }}
            >
              {title}
            </h2>
            <p
              className="mx-auto max-w-[300px] text-[13px] font-normal leading-relaxed"
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
    </div>
  );
}
