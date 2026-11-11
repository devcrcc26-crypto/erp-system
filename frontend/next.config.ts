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
  // User-guide markdown lives under public/guide — never cache so edits show
  // on the next navigation/refresh without restarting the frontend.
  async headers() {
    return [
      {
        source: '/guide/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
