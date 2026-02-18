import { GameEngine, EngineAction, EngineContext } from '../../core/engine.interface';
import { ZenyxEvent, ZenyxRoundResult } from '../../core/events';
import { decMul } from '../../core/decimal';
import { sha256Hex, fairnessU01 } from '../../core/fairness';
import { SlotConfig } from './slot.types';
import { spinSlot } from './slot.math';

export class SlotGameEngine implements GameEngine {
  id: string;
  kind: 'SLOT' = 'SLOT';
  rtp: number;

  // ✅ RTP Control ajouté
  private rtpControl = {
    enabled: true,
    target: 0.96
  };

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

    const session = (ctx.sessionData && typeof ctx.sessionData === 'object') ? ctx.sessionData : {};
    const fsRemaining = Number(session.freeSpinsRemaining ?? 0);
    const inFS = fsRemaining > 0;

    const state = inFS ? 'FREE_SPINS' : 'NORMAL';
    const bet = inFS ? String(session.freeSpinBet ?? ctx.bet) : String(ctx.bet);

    events.push({ t: 'SPIN_START', ts: now, d: { state, bet } });

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

    // 🎯 Dynamic RTP Adjustment
    if (this.rtpControl.enabled) {
      const adjustment = 0.98 + Math.random() * 0.04;
      winMul = winMul * adjustment;
    }

    for (const w of outcome.wins) {
      events.push({ t: 'WIN_LINE', ts: Date.now(), d: w });
    }

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
        nextSession.freeSpinsRemaining = Number(nextSession.freeSpinsRemaining ?? 0) + fsAward;
        events.push({
          t: 'FREE_SPINS_RETRIGGER',
          ts: Date.now(),
          d: { added: fsAward, remaining: nextSession.freeSpinsRemaining },
        });
      } else {
        nextSession.freeSpinsRemaining = fsAward;
        nextSession.freeSpinBet = bet;
        nextSession.freeSpinMultiplier = Number(this.config.freeSpinMultiplier ?? 1);

        events.push({
          t: 'FREE_SPINS_START',
          ts: Date.now(),
          d: { total: fsAward, bet, multiplier: nextSession.freeSpinMultiplier },
        });
      }
    }

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

    if (inFS) {
      const after = Math.max(0, Number(nextSession.freeSpinsRemaining ?? 0) - 1);
      nextSession.freeSpinsRemaining = after;

      if (after === 0) {
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

    // 🎡 Random Bonus Wheel (rare)
    const wheelRoll = fairnessU01(ctx.serverSeed, ctx.clientSeed, ctx.nonce, 'wheel');

    if (wheelRoll < 0.01) {
      const prizes = [2, 5, 10, 20];
      const prize = prizes[Math.floor(wheelRoll * prizes.length)];

      const bonusWin = decMul(bet, prize);

      events.push({
        t: 'BONUS_TRIGGER',
        ts: Date.now(),
        d: { type: 'WHEEL', multiplier: prize }
      });

      events.push({
        t: 'BONUS_END',
        ts: Date.now(),
        d: { win: bonusWin }
      });

      result.win = String(Number(result.win) + Number(bonusWin));
    }

    return { result, nextSessionData: nextSession };
  }
}
