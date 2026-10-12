import type { NextConfig } from 'next';
import path from 'path';

const fmRulesPath = path.resolve(
  __dirname,
  '../backend/src/modules/attendance/application/utils/field-movement-field-rules.ts',
);

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['antd', '@ant-design/icons', 'lodash', 'recharts'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@erp/fm-rules': fmRulesPath,
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      '@erp/fm-rules': fmRulesPath,
    },
  },
};

export default nextConfig;
