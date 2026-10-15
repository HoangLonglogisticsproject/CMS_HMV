import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Public } from '../auth/auth.decorators';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Check API and Database Health' })
  @ApiResponse({ status: 200, description: 'Health status payload' })
  async getHealth() {
    let dbStatus: 'connected' | 'disconnected' = 'connected';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'disconnected';
    }

    return {
      status: 'ok',
      database: dbStatus,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
