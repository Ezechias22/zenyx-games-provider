import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { HealthModule } from './common/health/health.module';
import { OperatorModule } from './operator/operator.module';
import { WalletModule } from './wallet/wallet.module';
import { GamesModule } from './games/games.module';
import { LogsModule } from './logs/logs.module';
import { ProviderModule } from './provider/provider.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]), // 300 req/min default; tune per operator at gateway
    PrismaModule,
    RedisModule,
    LogsModule,
    HealthModule,
    OperatorModule,
    WalletModule,
    GamesModule,
    ProviderModule,
  ],
})
export class AppModule {}
