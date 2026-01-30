import { GameEngine, EngineAction, EngineContext } from '../../core/engine.interface';
import { ZenyxEvent, ZenyxRoundResult } from '../../core/events';
import { decMul, decToInt, intToDec } from '../../core/decimal';
import { sha256Hex } from '../../core/fairness';
import { SlotConfig } from './slot.types';
import { spinSlot } from './slot.math';

export class SlotGameEngine implements GameEngine {
  id: string;
  kind: 'SLOT' = 'SLOT';
  rtp: number;

  constructor(private config: SlotConfig) {
    this.id = config.id;
    this.rtp = config.rtp;
  }

  async handle(ctx: EngineContext, action: EngineAction): Promise<{ result: ZenyxRoundResult; nextSessionData: any }> {
    if (action.type !== 'SPIN') throw new Error('Invalid action for slot');

    const now = Date.now();
    const events: ZenyxEvent[] = [];
    const serverSeedHash = sha256Hex(ctx.serverSeed);

    // Determine state
    const session = ctx.sessionData ?? {};
    const inFS: boolean = session.freeSpinsRemaining > 0;
    const state = inFS ? 'FREE_SPINS' : 'NORMAL';
    const bet = inFS ? (session.freeSpinBet ?? ctx.bet) : ctx.bet;

    events.push({ t: 'SPIN_START', ts: now, d: { state, bet } });

    const outcome = spinSlot(this.config, ctx.serverSeed, ctx.clientSeed, ctx.nonce, inFS ? 'fs' : 'base');

    events.push({ t: 'REELS_STOP', ts: Date.now(), d: { grid: outcome.grid } });

    let winMul = outcome.totalPayoutMul;
    const winLines = outcome.wins;

    for (const w of winLines) {
      events.push({ t: 'WIN_LINE', ts: Date.now(), d: w });
    }

    // Scatter -> Free spins
    let nextSession = { ...session };
    if (outcome.scatters >= 3) {
      const fsAward = this.config.scatterFreeSpins[outcome.scatters] ?? 0;
      if (fsAward > 0) {
        events.push({ t: 'SCATTER_TRIGGER', ts: Date.now(), d: { scatters: outcome.scatters, freeSpins: fsAward } });
        if (inFS) {
          nextSession.freeSpinsRemaining = (nextSession.freeSpinsRemaining ?? 0) + fsAward;
          events.push({ t: 'FREE_SPINS_RETRIGGER', ts: Date.now(), d: { added: fsAward, remaining: nextSession.freeSpinsRemaining } });
        } else {
          nextSession.freeSpinsRemaining = fsAward;
          nextSession.freeSpinBet = bet; // lock bet for FS feature
          events.push({ t: 'FREE_SPINS_START', ts: Date.now(), d: { total: fsAward, bet } });
        }
      }
    }

    // Free spin multiplier
    if (inFS && (this.config.freeSpinMultiplier ?? 1) !== 1) {
      const m = this.config.freeSpinMultiplier ?? 1;
      const before = winMul;
      winMul = winMul * m;
      events.push({ t: 'MULTIPLIER_APPLIED', ts: Date.now(), d: { from: before, to: winMul, multiplier: m, reason: 'FREE_SPINS' } });
    }

    const win = decMul(bet, winMul);

    // decrement FS
    if (inFS) {
      nextSession.freeSpinsRemaining = Math.max(0, (nextSession.freeSpinsRemaining ?? 0) - 1);
      if (nextSession.freeSpinsRemaining === 0) {
        events.push({ t: 'FREE_SPINS_END', ts: Date.now(), d: {} });
      }
    }

    events.push({ t: 'FAIRNESS', ts: Date.now(), d: { serverSeedHash, clientSeed: ctx.clientSeed, nonce: ctx.nonce } });
    events.push({ t: 'ROUND_END', ts: Date.now(), d: { win } });

    const result: ZenyxRoundResult = {
      roundId: action.payload?.roundId ?? '',
      gameId: ctx.gameId,
      currency: ctx.currency,
      bet,
      win,
      state,
      events,
      fairness: { algo: 'HMAC_SHA256', serverSeedHash, clientSeed: ctx.clientSeed, nonce: ctx.nonce },
    };

    return { result, nextSessionData: nextSession };
  }
}
