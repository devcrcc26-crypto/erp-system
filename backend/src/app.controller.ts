import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './shared/decorators/public.decorator';
import {
  getAutoApproveModeFromEnv,
  resolveDatabaseHostFromUrl,
} from './shared/config/auto-approve.mode';
import { PrismaService } from './shared/prisma/prisma.service';

/**
 * Extracts the DB hostname from DATABASE_URL (never credentials).
 */
function resolveDatabaseHost(): string {
  return resolveDatabaseHostFromUrl(process.env.DATABASE_URL);
}

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Health check - verifies API and database connectivity.
   * Exposes databaseHost so the frontend can show a TEST DATABASE badge
   * when not connected to Supabase, and emailDisabled for the Emails off badge.
   */
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'API and database health check' })
  async health(): Promise<{
    status: string;
    database: string;
    databaseHost: string;
    emailDisabled: boolean;
    autoApproveAll: boolean;
  }> {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'connected',
      databaseHost: resolveDatabaseHost(),
      emailDisabled:
        this.configService.get<boolean>('EMAIL_DISABLED') === true,
      autoApproveAll: getAutoApproveModeFromEnv().active,
    };
  }
}
