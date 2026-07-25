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
      url.searchParams.set('pool_timeout', '20');
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

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
