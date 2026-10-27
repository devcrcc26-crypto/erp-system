import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['antd', '@ant-design/icons', 'lodash', 'recharts'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Resolved before render, so /help never needs an in-page (soft) redirect.
  async redirects() {
    return [
      {
        source: '/help',
        destination: '/help/getting-started',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
