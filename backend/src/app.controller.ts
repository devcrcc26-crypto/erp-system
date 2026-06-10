import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './shared/prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Health check — verifies API and database connectivity.
   */
  @Get('health')
  async health(): Promise<{
    success: true;
    data: { status: string; database: string };
  }> {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      success: true,
      data: {
        status: 'ok',
        database: 'connected',
      },
    };
  }
}
