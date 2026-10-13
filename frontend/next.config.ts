import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['antd', '@ant-design/icons', 'lodash', 'recharts'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
