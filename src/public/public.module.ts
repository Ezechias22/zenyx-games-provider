import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicGuard } from './public.guard';
import { GamesModule } from '../games/games.module';
import { RedisModule } from '../common/redis/redis.module';
import { OperatorModule } from '../operator/operator.module';

@Module({
  imports: [GamesModule, RedisModule, OperatorModule],
  controllers: [PublicController],
  providers: [PublicGuard],
})
export class PublicModule {}
