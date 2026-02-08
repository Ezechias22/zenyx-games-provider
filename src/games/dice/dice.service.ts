import { BadRequestException, Injectable } from '@nestjs/common';
import { IGameModule, GamePlayResult } from '../engine/game.interface';
import { DICE_ENGINE } from './dice.engine';

@Injectable()
export class DiceService implements IGameModule {
  public readonly gameCode = 'dice_over_under';
  public readonly rtp = DICE_ENGINE.rtp;
  public readonly volatility = 'LOW' as const;

  async play(params: {
    serverSeed: string;
    clientSeed: string;
    nonce: number;
    bet: number;
    mode: 'UNDER' | 'OVER';
    target: number;
    roundId: string;
  }): Promise<GamePlayResult> {
    const mode = params.mode;
    const target = Number(params.target);

    if (mode !== 'UNDER' && mode !== 'OVER') {
      throw new BadRequestException('Missing/invalid diceMode (UNDER|OVER)');
    }

    // ✅ bornes cohérentes avec dice.engine.ts (min=0, max=100)
    if (!Number.isFinite(target) || target <= 0 || target >= 100) {
      throw new BadRequestException('Missing/invalid diceTarget (must be > 0 and < 100)');
    }

    const ctx: any = {
      operatorId: 'play',
      playerId: 'play',
      currency: 'XXX',
      gameId: this.gameCode,
      bet: params.bet,
      clientSeed: params.clientSeed,
      serverSeed: params.serverSeed,
      nonce: params.nonce,
      sessionData: {},
    };

    const action: any = {
      type: 'DICE_ROLL',
      payload: { mode, target, roundId: params.roundId },
    };

    const { result } = await DICE_ENGINE.handle(ctx, action);

    const winAmount = Number(result.win);

    return {
      nonceUsed: params.nonce,
      winAmount: Number.isFinite(winAmount) ? winAmount : 0,
      roundResult: {
        type: 'DICE',
        ...result,
        rtp: this.rtp,
        volatility: this.volatility,
      },
    };
  }
}
