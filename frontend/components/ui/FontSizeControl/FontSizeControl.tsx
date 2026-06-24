'use client';

import { Button, Tooltip } from 'antd';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  FONT_SIZE_MAX_PX,
  FONT_SIZE_MIN_PX,
} from '@/lib/theme/font-scale';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';
import { tokens } from '@/lib/theme/tokens';

/**
 * Header control to increase or decrease application font size.
 */
export default function FontSizeControl({
  compact = false,
}: {
  compact?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const fontSizePx = useUiPreferencesStore((state) => state.fontSizePx);
  const increaseFontSize = useUiPreferencesStore((state) => state.increaseFontSize);
  const decreaseFontSize = useUiPreferencesStore((state) => state.decreaseFontSize);

  const atMin = fontSizePx <= FONT_SIZE_MIN_PX;
  const atMax = fontSizePx >= FONT_SIZE_MAX_PX;

  return (
    <div
      className={[
        'flex shrink-0 items-center',
        compact ? 'gap-0.5' : 'gap-1',
      ].join(' ')}
      role="group"
      aria-label={t('common.fontSize')}
    >
      <Tooltip title={t('common.decreaseFontSize')}>
        <Button
          type="text"
          size="small"
          icon={<MinusOutlined />}
          disabled={atMin}
          aria-label={t('common.decreaseFontSize')}
          onClick={decreaseFontSize}
          className="!h-8 !w-8"
          style={{ color: tokens.colorTextSecondary }}
        />
      </Tooltip>
      {!compact && (
        <span
          className="min-w-[2rem] text-center text-[11px] font-medium tabular-nums"
          style={{ color: tokens.colorTextTertiary }}
          aria-live="polite"
        >
          {fontSizePx}px
        </span>
      )}
      <Tooltip title={t('common.increaseFontSize')}>
        <Button
          type="text"
          size="small"
          icon={<PlusOutlined />}
          disabled={atMax}
          aria-label={t('common.increaseFontSize')}
          onClick={increaseFontSize}
          className="!h-8 !w-8"
          style={{ color: tokens.colorTextSecondary }}
        />
      </Tooltip>
    </div>
  );
}
