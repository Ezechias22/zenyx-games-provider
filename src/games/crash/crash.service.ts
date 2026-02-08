import { BadRequestException, Injectable } from '@nestjs/common';
import { IGameModule, GamePlayResult } from '../engine/game.interface';
import { crashMultiplier } from './crash.math';

@Injectable()
export class CrashService implements IGameModule {
  public readonly gameCode = 'crash_multiplier';
  public readonly rtp = 0.97;
  public readonly volatility = 'MEDIUM' as const;

  play(params: {
    serverSeed: string;
    clientSeed: string;
    nonce: number;
    bet: number;
    cashoutAt: number;
  }): GamePlayResult {
    const cashoutAt = Number(params.cashoutAt);
    if (!Number.isFinite(cashoutAt) || cashoutAt <= 1) {
      throw new BadRequestException('Missing/invalid crashCashoutAt (must be > 1.0)');
    }

    const bustAt = crashMultiplier(params.serverSeed, params.clientSeed, params.nonce);

    const winAmount = cashoutAt < bustAt ? params.bet * cashoutAt : 0;

    return {
      nonceUsed: params.nonce,
      winAmount,
      roundResult: {
        type: 'CRASH',
        bet: params.bet,
        cashoutAt,
        bustAt,
        win: winAmount,
        rtp: this.rtp,
        volatility: this.volatility,
      },
    };
  }
}
