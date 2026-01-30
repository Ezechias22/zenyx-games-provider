import { GameEngine, EngineAction, EngineContext } from '../core/engine.interface';
import { ZenyxEvent, ZenyxRoundResult } from '../core/events';
import { sha256Hex, fairnessU01 } from '../core/fairness';
import { decMul } from '../core/decimal';

export interface DiceConfig {
  id: string;
  name: string;
  rtp: number; // e.g. 0.99
  min: number;
  max: number;
  houseEdge: number; // 0.01
}

export class DiceGameEngine implements GameEngine {
  id: string;
  kind: 'DICE' = 'DICE';
  rtp: number;

  constructor(private cfg: DiceConfig) {
    this.id = cfg.id;
    this.rtp = cfg.rtp;
  }

  async handle(ctx: EngineContext, action: EngineAction): Promise<{ result: ZenyxRoundResult; nextSessionData: any }> {
    if (action.type !== 'DICE_ROLL') throw new Error('Invalid action for dice');

    const now = Date.now();
    const events: ZenyxEvent[] = [];
    const serverSeedHash = sha256Hex(ctx.serverSeed);

    const { target, mode } = action.payload ?? {};
    const t = Number(target);
    if (!Number.isFinite(t) || t <= this.cfg.min || t >= this.cfg.max) throw new Error('Invalid target');

    const u = fairnessU01(ctx.serverSeed, ctx.clientSeed, ctx.nonce, 'dice');
    const roll = this.cfg.min + u * (this.cfg.max - this.cfg.min); // [min,max)
    const winCond = mode === 'UNDER' ? roll < t : roll > t;

    // Payout multiplier: (probability^-1) * (1-houseEdge)
    const p = mode === 'UNDER' ? (t - this.cfg.min) / (this.cfg.max - this.cfg.min) : (this.cfg.max - t) / (this.cfg.max - this.cfg.min);
    const mult = p > 0 ? (1 / p) * (1 - this.cfg.houseEdge) : 0;
    const win = winCond ? decMul(ctx.bet, mult) : '0';

    events.push({ t: 'DICE_ROLL', ts: now, d: { mode, target: t, roll: Number(roll.toFixed(4)), win, multiplier: mult } });
    events.push({ t: 'FAIRNESS', ts: Date.now(), d: { serverSeedHash, clientSeed: ctx.clientSeed, nonce: ctx.nonce } });
    events.push({ t: 'ROUND_END', ts: Date.now(), d: { win } });

    const result: ZenyxRoundResult = {
      roundId: action.payload?.roundId ?? '',
      gameId: ctx.gameId,
      currency: ctx.currency,
      bet: ctx.bet,
      win,
      state: 'NORMAL',
      events,
      fairness: { algo: 'HMAC_SHA256', serverSeedHash, clientSeed: ctx.clientSeed, nonce: ctx.nonce },
    };

    return { result, nextSessionData: ctx.sessionData ?? {} };
  }
}

export const DICE_ENGINE = new DiceGameEngine({
  id: 'dice_over_under',
  name: 'Dice Over/Under',
  rtp: 0.99,
  min: 0,
  max: 100,
  houseEdge: 0.01,
});
