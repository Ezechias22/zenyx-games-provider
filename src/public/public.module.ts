// src/public/public.module.ts
import { Module } from '@nestjs/common';

import { PublicController } from './public.controller';
import { LaunchController } from './launch.controller';
import { PublicGuard } from './public.guard';
import { PublicLaunchService } from './public.service';

import { RedisModule } from '../common/redis/redis.module';
import { GamesModule } from '../games/games.module';
import { OperatorModule } from '../operator/operator.module';

@Module({
  imports: [
    RedisModule,
    GamesModule,
    OperatorModule, // ✅ pour PublicGuard -> OperatorService
  ],
  controllers: [PublicController, LaunchController],
  providers: [PublicGuard, PublicLaunchService],
  exports: [PublicLaunchService],
})
export class PublicModule {}
