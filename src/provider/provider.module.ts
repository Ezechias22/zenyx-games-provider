import { Module } from '@nestjs/common';
import { ProviderController } from './provider.controller';
import { ProviderService } from './provider.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { LogsModule } from '../logs/logs.module';
import { EngineModule } from '../games/engine/engine.module';
import { WalletModule } from '../wallet/wallet.module';
import { OperatorModule } from '../operator/operator.module';

@Module({
  imports: [PrismaModule, LogsModule, EngineModule, WalletModule, OperatorModule],
  controllers: [ProviderController],
  providers: [ProviderService],
  exports: [ProviderService],
})
export class ProviderModule {}
