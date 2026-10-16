import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
      },
    },
    include: ['**/*.{test,spec}.{ts,tsx}'],
    // Playwright e2e lives under tests/attendance and e2e - run via `npm run test:e2e` only.
    exclude: [
      'node_modules',
      '.next',
      'e2e/**',
      'tests/attendance/**',
      '**/playwright*.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
