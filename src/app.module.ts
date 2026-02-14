import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { HealthModule } from './common/health/health.module';

import { OperatorModule } from './operator/operator.module';
import { WalletModule } from './wallet/wallet.module';
import { GamesModule } from './games/games.module';
import { LogsModule } from './logs/logs.module';
import { ProviderModule } from './provider/provider.module';

import { PublicModule } from './public/public.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // ✅ SERVE STATIC ASSETS
    // URL: https://domain/assets/<game>/<file>
    // Files: /app/public/assets/...
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public', 'assets'),
      serveRoot: '/assets',
      serveStaticOptions: {
        index: false,
        fallthrough: false,
        maxAge: '30d',
        setHeaders: (res) => {
          // utile pour charger images depuis un autre domaine (game-server)
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        },
      },
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 300,
      },
    ]),

    PrismaModule,
    RedisModule,
    LogsModule,
    HealthModule,

    OperatorModule,
    WalletModule,
    GamesModule,
    ProviderModule,
    PublicModule,
    AdminModule,
  ],
})
export class AppModule {}
