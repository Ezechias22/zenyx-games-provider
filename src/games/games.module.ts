import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

import { SlotFruitStarModule } from './slots/fruit_star/slot.module';
import { WalletModule } from '../wallet/wallet.module';
import { EngineModule } from './engine/engine.module';
import { OperatorModule } from '../operator/operator.module';

import { CrashService } from './crash/crash.service';
import { DiceService } from './dice/dice.service';

@Module({
  imports: [
    OperatorModule, // nécessaire pour OperatorAuthGuard
    WalletModule,
    EngineModule,
    SlotFruitStarModule,
  ],
  controllers: [GamesController],
  providers: [GamesService, CrashService, DiceService],
  exports: [GamesService],
})
export class GamesModule {}
