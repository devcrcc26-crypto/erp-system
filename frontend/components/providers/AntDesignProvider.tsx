'use client';

import { useMemo } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App, ConfigProvider } from 'antd';
import type { Locale } from 'antd/es/locale';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import FontScaleSync from '@/components/providers/FontScaleSync';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { buildAntdTheme } from '@/lib/theme/antd-theme';
import {
  DISPLAY_DATE_FORMAT,
  DISPLAY_DATETIME_FORMAT,
} from '@/lib/utils/date-format';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

/**
 * Forces Ant Design date pickers to show DD/MM/YYYY regardless of locale.
 */
function withDdMmYyyyDateFormats(base: Locale): Locale {
  const pickerLang = base.DatePicker?.lang;
  if (!pickerLang) {
    return base;
  }

  return {
    ...base,
    DatePicker: {
      ...base.DatePicker,
      lang: {
        ...pickerLang,
        fieldDateFormat: DISPLAY_DATE_FORMAT,
        fieldDateTimeFormat: DISPLAY_DATETIME_FORMAT,
        dateFormat: DISPLAY_DATE_FORMAT,
        dateTimeFormat: `${DISPLAY_DATE_FORMAT} HH:mm:ss`,
      },
    },
    Calendar: base.Calendar
      ? {
          ...base.Calendar,
          lang: {
            ...base.Calendar.lang,
            fieldDateFormat: DISPLAY_DATE_FORMAT,
            fieldDateTimeFormat: DISPLAY_DATETIME_FORMAT,
            dateFormat: DISPLAY_DATE_FORMAT,
            dateTimeFormat: `${DISPLAY_DATE_FORMAT} HH:mm:ss`,
          },
        }
      : base.Calendar,
  };
}

export default function AntDesignProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const { locale } = useEpcTranslation();
  const fontSizePx = useUiPreferencesStore((state) => state.fontSizePx);
  const antdLocale = useMemo(
    () => withDdMmYyyyDateFormats(locale === 'zh' ? zhCN : enUS),
    [locale],
  );
  const theme = useMemo(() => buildAntdTheme(fontSizePx), [fontSizePx]);

  return (
    <AntdRegistry>
      <ConfigProvider theme={theme} locale={antdLocale}>
        <FontScaleSync />
        <App className="flex h-full min-h-0 flex-1 flex-col">{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
