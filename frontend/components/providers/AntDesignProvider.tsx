'use client';

import { useMemo } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import FontScaleSync from '@/components/providers/FontScaleSync';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { buildAntdTheme } from '@/lib/theme/antd-theme';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

export default function AntDesignProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const { locale } = useEpcTranslation();
  const fontSizePx = useUiPreferencesStore((state) => state.fontSizePx);
  const antdLocale = locale === 'zh' ? zhCN : enUS;
  const theme = useMemo(() => buildAntdTheme(fontSizePx), [fontSizePx]);

  return (
    <AntdRegistry>
      <ConfigProvider theme={theme} locale={antdLocale}>
        <FontScaleSync />
        <App className="flex min-h-screen flex-1 flex-col">{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
