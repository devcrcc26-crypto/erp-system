import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma CLI config (Prisma 6.19).
 * Migrate/seed settings live here. Runtime still uses url in schema.prisma
 * plus PrismaService datasources override.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
    // Used by Migrate when DATABASE_URL points at a pooler
    directUrl: process.env.DIRECT_URL,
  },
});
