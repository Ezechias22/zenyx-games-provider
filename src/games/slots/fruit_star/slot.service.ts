import { Injectable } from '@nestjs/common';
import { IGameModule, GamePlayResult } from '../../engine/game.interface';
import { FRUIT_STAR_CONFIG } from './game.config';
import { SlotEngine } from './slot.engine';
import { RngService } from '../../engine/rng.service';

@Injectable()
export class SlotFruitStarService implements IGameModule {
  public readonly gameCode = FRUIT_STAR_CONFIG.gameCode;
  public readonly rtp = FRUIT_STAR_CONFIG.rtp;
  public readonly volatility = FRUIT_STAR_CONFIG.volatility;

  private engine: SlotEngine;

  constructor(rng: RngService) {
    this.engine = new SlotEngine(rng);
  }

  play(params: { serverSeed: string; clientSeed: string; nonce: number; bet: number }): GamePlayResult {
    const symbols = this.engine.spin({ serverSeed: params.serverSeed, clientSeed: params.clientSeed, nonce: params.nonce });
    const mult = this.engine.winMultiplier(symbols);
    const winAmount = params.bet * mult;

    return {
      nonceUsed: params.nonce,
      winAmount,
      roundResult: {
        type: 'SLOT',
        symbols,
        multiplier: mult,
        bet: params.bet,
        win: winAmount,
        rtp: this.rtp,
        volatility: this.volatility,
      },
    };
  }
}
