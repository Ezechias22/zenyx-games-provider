import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicGuard } from './public.guard';
import { PublicLaunchService } from './public.service';

import { RedisModule } from '../common/redis/redis.module';
import { GamesModule } from '../games/games.module';

import { LaunchController } from './launch.controller';

@Module({
  imports: [RedisModule, GamesModule],
  controllers: [PublicController, LaunchController],
  providers: [PublicGuard, PublicLaunchService],
  exports: [PublicLaunchService],
})
export class PublicModule {}
