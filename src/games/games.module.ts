// src/games/games.module.ts
import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

import { WalletModule } from '../wallet/wallet.module';
import { EngineModule } from './engine/engine.module';
import { OperatorModule } from '../operator/operator.module';

import { CrashService } from './crash/crash.service';
import { DiceService } from './dice/dice.service';

// ✅ NEW: pour pouvoir injecter ProviderService dans GamesService
import { ProviderModule } from '../provider/provider.module';

@Module({
  imports: [
    OperatorModule, // nécessaire pour OperatorAuthGuard
    WalletModule,
    EngineModule,

    // ✅ IMPORTANT
    ProviderModule,

    // ❌ SlotFruitStarModule inutile maintenant (si tu n'utilises plus ce jeu)
    // SlotFruitStarModule,
  ],
  controllers: [GamesController],
  providers: [GamesService, CrashService, DiceService],
  exports: [GamesService],
})
export class GamesModule {}
