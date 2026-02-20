// src/games/slots/shared/slot.engine.ts
import { GameEngine, EngineAction, EngineContext } from '../../core/engine.interface';
import { ZenyxEvent, ZenyxRoundResult } from '../../core/events';
import { decMul } from '../../core/decimal';
import { sha256Hex } from '../../core/fairness';
import { fairnessU01 } from '../../core/fairness';
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
    const now = Date.now();
    const events: ZenyxEvent[] = [];
    const serverSeedHash = sha256Hex(ctx.serverSeed);

    const session = (ctx.sessionData && typeof ctx.sessionData === 'object') ? ctx.sessionData : {};
    const fsRemaining = Number(session.freeSpinsRemaining ?? 0);
    const inFS = fsRemaining > 0;

    // bet locked during FS (if set), otherwise use ctx.bet
    const bet = inFS ? String(session.freeSpinBet ?? ctx.bet) : String(ctx.bet);
    const state: 'NORMAL' | 'FREE_SPINS' | 'BONUS' = inFS ? 'FREE_SPINS' : 'NORMAL';

    // =========================
    // BUY FREE SPINS (action)
    // =========================
    if (action.type === 'BUY_FS') {
      const buy = this.config.buyFreeSpins;
      if (!buy?.enabled) throw new Error('BUY_FS disabled for this game');
      if (inFS) throw new Error('Already in FREE_SPINS');

      const spins = Number(buy.spins ?? 0);
      if (!Number.isFinite(spins) || spins <= 0) throw new Error('Invalid BUY_FS spins');

      const mult = Number(buy.multiplier ?? this.config.freeSpinMultiplier ?? 1);

      const nextSession: any = { ...session };
      nextSession.freeSpinsRemaining = spins;
      nextSession.freeSpinBet = bet;
      nextSession.freeSpinMultiplier = mult;

      events.push({
        t: 'BUY_FREE_SPINS',
        ts: now,
        d: { bet, spins, multiplier: mult, costMul: Number(buy.costMul ?? 0) },
      });

      events.push({
        t: 'FREE_SPINS_START',
        ts: now,
        d: { total: spins, bet, multiplier: mult, buy: true },
      });

      const result: ZenyxRoundResult = {
        roundId: action.payload?.roundId ?? '',
        gameId: ctx.gameId,
        currency: ctx.currency,
        bet,
        win: '0',
        state: 'FREE_SPINS',
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

    // =========================
    // SPIN
    // =========================
    if (action.type !== 'SPIN') throw new Error('Invalid action for slot');

    events.push({ t: 'SPIN_START', ts: now, d: { state, bet } });

    const outcome = spinSlot(
      this.config,
      ctx.serverSeed,
      ctx.clientSeed,
      ctx.nonce,
      inFS ? 'fs' : 'base',
    );

    events.push({ t: 'REELS_STOP', ts: Date.now(), d: { grid: outcome.grid } });

    let winMul = outcome.totalPayoutMul;

    for (const w of outcome.wins) {
      events.push({ t: 'WIN_LINE', ts: Date.now(), d: w });
    }

    let nextSession: any = { ...session };

    // ---- scatter -> free spins ----
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

    // ---- FS multiplier ----
    if (inFS) {
      const m = Number(nextSession.freeSpinMultiplier ?? this.config.freeSpinMultiplier ?? 1);
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

    // ---- BONUS WHEEL (paid spins only, not in FS) ----
    const bw = this.config.bonusWheel;
    if (!inFS && bw?.enabled) {
      const chance = Math.max(0, Math.min(1, Number(bw.chance ?? 0)));
      if (chance > 0 && Array.isArray(bw.multipliers) && bw.multipliers.length > 0) {
        const u = fairnessU01(ctx.serverSeed, ctx.clientSeed, ctx.nonce, 'bonuswheel:trigger');
        if (u < chance) {
          events.push({ t: 'BONUS_WHEEL_START', ts: Date.now(), d: {} });

          const u2 = fairnessU01(ctx.serverSeed, ctx.clientSeed, ctx.nonce, 'bonuswheel:pick');
          const idx = Math.floor(u2 * bw.multipliers.length);
          const mul = Number(bw.multipliers[Math.min(bw.multipliers.length - 1, Math.max(0, idx))] ?? 0);

          if (Number.isFinite(mul) && mul > 0) {
            winMul += mul; // add as extra payout multiplier
          }

          events.push({
            t: 'BONUS_WHEEL_RESULT',
            ts: Date.now(),
            d: { multiplier: mul },
          });
        }
      }
    }

    const win = decMul(bet, winMul);

    // ---- decrement FS after spin ----
    if (inFS) {
      const after = Math.max(0, Number(nextSession.freeSpinsRemaining ?? 0) - 1);
      nextSession.freeSpinsRemaining = after;

      if (after === 0) {
        delete nextSession.freeSpinBet;
        events.push({ t: 'FREE_SPINS_END', ts: Date.now(), d: {} });
      }
    }

    // store lastWin for gamble (engine only stores intent; wallet moves in service)
    nextSession.lastWin = win;
    nextSession.lastWinAt = Date.now();
    nextSession.lastWinGamblable = win !== '0' && win !== '0.00000000';

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
