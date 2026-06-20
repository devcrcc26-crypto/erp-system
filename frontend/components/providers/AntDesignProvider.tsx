'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App, ConfigProvider } from 'antd';
import { antdTheme } from '@/lib/theme/antd-theme';

export default function AntDesignProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <AntdRegistry>
      <ConfigProvider theme={antdTheme}>
        <App className="flex min-h-screen flex-1 flex-col">{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
