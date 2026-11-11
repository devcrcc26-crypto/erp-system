import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Caps Prisma's client pool so Nest watch + parallel queries cannot exhaust
 * Supabase session-mode pooler (often pool_size: 15 on free/small plans).
 */
function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return undefined;
  }

  const limit = process.env.DATABASE_CONNECTION_LIMIT ?? '5';
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', limit);
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '30');
    }
    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', '30');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: {
        db: {
          url: resolveDatabaseUrl(),
        },
      },
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }

  /**
   * Parses host/port/database from DATABASE_URL for startup logging (never password).
   */
  private describeDatabaseTarget(): string {
    const raw = process.env.DATABASE_URL;
    if (!raw) {
      return 'unknown';
    }
    try {
      const url = new URL(raw);
      const database = url.pathname.replace(/^\//, '').split('?')[0] || 'unknown';
      const port = url.port || (url.protocol === 'postgresql:' ? '5432' : '');
      return port
        ? `${url.hostname}:${port}/${database}`
        : `${url.hostname}/${database}`;
    } catch {
      return 'unparseable-url';
    }
  }

  async onModuleInit(): Promise<void> {
    const maxAttempts = 5;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        this.logger.log(`[DB] Connected to ${this.describeDatabaseTarget()}`);
        return;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const isPoolTimeout =
          message.includes('connection pool') ||
          message.includes('P2024') ||
          (typeof error === 'object' &&
            error !== null &&
            'errorCode' in error &&
            (error as { errorCode?: string }).errorCode === 'P2024');

        if (!isPoolTimeout || attempt === maxAttempts) {
          throw error;
        }

        const delayMs = attempt * 2000;
        this.logger.warn(
          `Database pool busy (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
