import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './shared/decorators/public.decorator';
import { PrismaService } from './shared/prisma/prisma.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Health check - verifies API and database connectivity.
   */
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'API and database health check' })
  async health(): Promise<{ status: string; database: string }> {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'connected',
    };
  }
}
