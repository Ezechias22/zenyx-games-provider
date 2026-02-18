import { GameEngine, EngineAction, EngineContext } from '../../core/engine.interface';
import { ZenyxEvent, ZenyxRoundResult } from '../../core/events';
import { decMul } from '../../core/decimal';
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

  async handle(
    ctx: EngineContext,
    action: EngineAction,
  ): Promise<{ result: ZenyxRoundResult; nextSessionData: any }> {
    if (action.type !== 'SPIN') throw new Error('Invalid action for slot');

    const now = Date.now();
    const events: ZenyxEvent[] = [];
    const serverSeedHash = sha256Hex(ctx.serverSeed);

    // ---- session state ----
    const session = (ctx.sessionData && typeof ctx.sessionData === 'object') ? ctx.sessionData : {};
    const fsRemaining = Number(session.freeSpinsRemaining ?? 0);
    const inFS = fsRemaining > 0;

    const state = inFS ? 'FREE_SPINS' : 'NORMAL';

    // bet locked during FS (if set), otherwise use ctx.bet
    const bet = inFS ? String(session.freeSpinBet ?? ctx.bet) : String(ctx.bet);

    events.push({ t: 'SPIN_START', ts: now, d: { state, bet } });

    // tag changes RNG stream between base and FS
    const outcome = spinSlot(
      this.config,
      ctx.serverSeed,
      ctx.clientSeed,
      ctx.nonce,
      inFS ? 'fs' : 'base',
    );

    events.push({ t: 'REELS_STOP', ts: Date.now(), d: { grid: outcome.grid } });

    // ---- wins ----
    let winMul = outcome.totalPayoutMul;

    for (const w of outcome.wins) {
      events.push({ t: 'WIN_LINE', ts: Date.now(), d: w });
    }

    // ---- scatter -> free spins (by config) ----
    let nextSession: any = { ...session };

    const scatters = outcome.scatters;
    const fsAward = Number(this.config.scatterFreeSpins?.[scatters] ?? 0);

    if (fsAward > 0) {
      events.push({
        t: 'SCATTER_TRIGGER',
        ts: Date.now(),
        d: { scatters, freeSpins: fsAward },
      });

      if (inFS) {
        // retrigger
        nextSession.freeSpinsRemaining = Number(nextSession.freeSpinsRemaining ?? 0) + fsAward;
        events.push({
          t: 'FREE_SPINS_RETRIGGER',
          ts: Date.now(),
          d: { added: fsAward, remaining: nextSession.freeSpinsRemaining },
        });
      } else {
        // start FS
        nextSession.freeSpinsRemaining = fsAward;
        nextSession.freeSpinBet = bet; // lock bet for whole FS feature
        nextSession.freeSpinMultiplier = Number(this.config.freeSpinMultiplier ?? 1);

        events.push({
          t: 'FREE_SPINS_START',
          ts: Date.now(),
          d: { total: fsAward, bet, multiplier: nextSession.freeSpinMultiplier },
        });
      }
    }

    // ---- FS multiplier ----
    if (inFS) {
      const m = Number(this.config.freeSpinMultiplier ?? 1);
      if (m !== 1) {
        const before = winMul;
        winMul = winMul * m;
        events.push({
          t: 'MULTIPLIER_APPLIED',
          ts: Date.now(),
          d: { from: before, to: winMul, multiplier: m, reason: 'FREE_SPINS' },
        });
      }
    }

    const win = decMul(bet, winMul);

    // ---- decrement FS after spin ----
    if (inFS) {
      const after = Math.max(0, Number(nextSession.freeSpinsRemaining ?? 0) - 1);
      nextSession.freeSpinsRemaining = after;

      if (after === 0) {
        // cleanup (optional)
        delete nextSession.freeSpinBet;

        events.push({ t: 'FREE_SPINS_END', ts: Date.now(), d: {} });
      }
    }

    events.push({
      t: 'FAIRNESS',
      ts: Date.now(),
      d: { serverSeedHash, clientSeed: ctx.clientSeed, nonce: ctx.nonce },
    });

    events.push({ t: 'ROUND_END', ts: Date.now(), d: { win } });

    const result: ZenyxRoundResult = {
      roundId: action.payload?.roundId ?? '',
      gameId: ctx.gameId,
      currency: ctx.currency,
      bet,
      win,
      state,
      events,
      fairness: {
        algo: 'HMAC_SHA256',
        serverSeedHash,
        clientSeed: ctx.clientSeed,
        nonce: ctx.nonce,
      },
    };

    return { result, nextSessionData: nextSession };
  }
}
