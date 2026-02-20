// src/games/games.module.ts
import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

import { WalletModule } from '../wallet/wallet.module';
import { EngineModule } from './engine/engine.module';
import { OperatorModule } from '../operator/operator.module';
import { ProviderModule } from '../provider/provider.module';

import { CrashService } from './crash/crash.service';
import { DiceService } from './dice/dice.service';

// ✅ NEW
import { RtpService } from './features/rtp.service';
import { JackpotService } from './features/jackpot.service';
import { GambleService } from './features/gamble.service';
import { BonusService } from './features/bonus.service';
import { BuyFsService } from './features/buyfs.service';

@Module({
  imports: [OperatorModule, WalletModule, EngineModule, ProviderModule],
  controllers: [GamesController],
  providers: [
    GamesService,
    CrashService,
    DiceService,

    // ✅ NEW
    RtpService,
    JackpotService,
    BuyFsService,
    GambleService,
    BonusService,
  ],
  exports: [GamesService],
})
export class GamesModule {}
