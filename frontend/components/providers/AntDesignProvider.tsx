// UI polish pass — styles only, no logic changes

'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { antdTheme } from '@/lib/theme/antd-theme';

export default function AntDesignProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const { locale } = useEpcTranslation();
  const antdLocale = locale === 'zh' ? zhCN : enUS;

  return (
    <AntdRegistry>
      <ConfigProvider theme={antdTheme} locale={antdLocale}>
        <App className="flex min-h-screen flex-1 flex-col">{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
