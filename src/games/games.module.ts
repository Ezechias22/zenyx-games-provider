import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { SlotFruitStarModule } from './slots/fruit_star/slot.module';
import { WalletModule } from '../wallet/wallet.module';
import { EngineModule } from './engine/engine.module';
import { OperatorModule } from '../operator/operator.module'; // ✅ AJOUTE

@Module({
  imports: [
    OperatorModule, // ✅ nécessaire pour OperatorAuthGuard + OperatorService
    WalletModule,
    EngineModule,
    SlotFruitStarModule,
  ],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}
