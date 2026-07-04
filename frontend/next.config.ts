import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  transpilePackages: [],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@erp/shared': path.join(__dirname, '../backend/src/shared'),
    };
    return config;
  },
};

export default nextConfig;
