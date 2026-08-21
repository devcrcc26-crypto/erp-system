'use client';

import { Button, Tooltip } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  EPC_LOCALE_LABELS,
  type EpcLocale,
} from '@/lib/i18n/epc-messages';
import { useUpdateProfile } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import { tokens } from '@/lib/theme/tokens';

function nextLocale(current: EpcLocale): EpcLocale {
  return current === 'en' ? 'zh' : 'en';
}

/**
 * Header control to swap UI language between English and Chinese.
 */
export default function LanguageControl({
  compact = false,
}: {
  compact?: boolean;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const messageApi = useAppMessage();
  const updateUser = useAuthStore((state) => state.updateUser);
  const updateProfile = useUpdateProfile();
  const target = nextLocale(locale);

  async function handleToggle(): Promise<void> {
    const previous = locale;
    updateUser({ preferredLanguage: target });

    try {
      await updateProfile.mutateAsync({ preferredLanguage: target });
    } catch {
      updateUser({ preferredLanguage: previous });
      messageApi.error(t('common.languageChangeFailed'));
    }
  }

  const label = locale === 'en' ? 'EN' : '中文';
  const tooltip = t('common.switchToLanguage', {
    language: EPC_LOCALE_LABELS[target],
  });

  return (
    <Tooltip title={tooltip}>
      <Button
        type="text"
        size="small"
        loading={updateProfile.isPending}
        icon={<GlobalOutlined />}
        onClick={() => void handleToggle()}
        aria-label={tooltip}
        className={compact ? '!h-8 !px-1.5' : '!h-8 !px-2'}
        style={{ color: tokens.colorTextSecondary }}
      >
        <span className="text-[12px] font-medium tabular-nums">{label}</span>
      </Button>
    </Tooltip>
  );
}
