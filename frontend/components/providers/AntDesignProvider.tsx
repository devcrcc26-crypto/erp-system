'use client';

import '@ant-design/v5-patch-for-react-19';
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
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
