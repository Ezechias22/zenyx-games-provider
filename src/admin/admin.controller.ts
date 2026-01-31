import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './admin.guard';

@ApiTags('admin')
@ApiSecurity('x-master-token')
@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  @Get('status')
  status() {
    return {
      provider: process.env.APP_NAME || 'ZENYX GAMES',
      version: process.env.npm_package_version || 'unknown',
      nodeEnv: process.env.NODE_ENV || 'unknown',
      uptimeSec: Math.floor(process.uptime()),
      ts: new Date().toISOString(),
    };
  }
}
