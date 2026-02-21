// src/games/slots/shared/slot.engine.ts
import { GameEngine, EngineAction, EngineContext } from '../../core/engine.interface';
import { ZenyxEvent, ZenyxRoundResult } from '../../core/events';
import { decMul } from '../../core/decimal';
import { sha256Hex } from '../../core/fairness';
import { fairnessU01 } from '../../core/fairness';
import { SlotConfig } from './slot.types';
import { spinSlot } from './slot.math';

// ---------- helpers (safe decimal string add, 8 decimals) ----------
function toScaledInt8(s: string): bigint {
  const v = String(s ?? '0').trim();
  if (!v) return 0n;
  const neg = v.startsWith('-');
  const raw = neg ? v.slice(1) : v;

  const [a, b = ''] = raw.split('.');
  const frac = (b + '00000000').slice(0, 8);
  const intPart = a ? BigInt(a) : 0n;
  const fracPart = BigInt(frac);
  const scaled = intPart * 100000000n + fracPart;
  return neg ? -scaled : scaled;
}

function fromScaledInt8(n: bigint): string {
  const neg = n < 0n;
  const v = neg ? -n : n;
  const intPart = v / 100000000n;
  const fracPart = v % 100000000n;
  const out = `${intPart.toString()}.${fracPart.toString().padStart(8, '0')}`;
  return neg ? `-${out}` : out;
}

function addDec8(a: string, b: string): string {
  return fromScaledInt8(toScaledInt8(a) + toScaledInt8(b));
}
// ---------------------------------------------------------------

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
    const fsRemainingBefore = Number(session.freeSpinsRemaining ?? 0);
    const inFSBefore = fsRemainingBefore > 0;

    // bet locked during FS (if set), otherwise use ctx.bet
    const bet = inFSBefore ? String(session.freeSpinBet ?? ctx.bet) : String(ctx.bet);

    // =========================
    // BUY FREE SPINS (action)
    // =========================
    if (action.type === 'BUY_FS') {
      const buy = this.config.buyFreeSpins;
      if (!buy?.enabled) throw new Error('BUY_FS disabled for this game');
      if (inFSBefore) throw new Error('Already in FREE_SPINS');

      const spins = Number(buy.spins ?? 0);
      if (!Number.isFinite(spins) || spins <= 0) throw new Error('Invalid BUY_FS spins');

      const mult = Number(buy.multiplier ?? this.config.freeSpinMultiplier ?? 1);

      const nextSession: any = { ...session };
      nextSession.freeSpinsRemaining = spins;
      nextSession.freeSpinBet = bet;
      nextSession.freeSpinMultiplier = mult;

      // ✅ init FS total tracking
      nextSession.fsTotalWin = '0.00000000';
      nextSession.fsSpinsPlayed = 0;
      nextSession.fsTotalSpins = spins;
      nextSession.fsStartedAt = now;

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

    const stateBefore: 'NORMAL' | 'FREE_SPINS' | 'BONUS' = inFSBefore ? 'FREE_SPINS' : 'NORMAL';
    events.push({ t: 'SPIN_START', ts: now, d: { state: stateBefore, bet } });

    const outcome = spinSlot(
      this.config,
      ctx.serverSeed,
      ctx.clientSeed,
      ctx.nonce,
      inFSBefore ? 'fs' : 'base',
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

      if (inFSBefore) {
        nextSession.freeSpinsRemaining = Number(nextSession.freeSpinsRemaining ?? 0) + fsAward;
        // keep totals; just extend total spins
        nextSession.fsTotalSpins = Number(nextSession.fsTotalSpins ?? 0) + fsAward;

        events.push({
          t: 'FREE_SPINS_RETRIGGER',
          ts: Date.now(),
          d: { added: fsAward, remaining: nextSession.freeSpinsRemaining },
        });
      } else {
        nextSession.freeSpinsRemaining = fsAward;
        nextSession.freeSpinBet = bet;
        nextSession.freeSpinMultiplier = Number(this.config.freeSpinMultiplier ?? 1);

        // ✅ init totals at first FS start (scatter)
        nextSession.fsTotalWin = '0.00000000';
        nextSession.fsSpinsPlayed = 0;
        nextSession.fsTotalSpins = fsAward;
        nextSession.fsStartedAt = Date.now();

        events.push({
          t: 'FREE_SPINS_START',
          ts: Date.now(),
          d: { total: fsAward, bet, multiplier: nextSession.freeSpinMultiplier },
        });
      }
    }

    // ---- FS multiplier ----
    if (inFSBefore) {
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
    if (!inFSBefore && bw?.enabled) {
      const chance = Math.max(0, Math.min(1, Number(bw.chance ?? 0)));
      if (chance > 0 && Array.isArray(bw.multipliers) && bw.multipliers.length > 0) {
        const u = fairnessU01(ctx.serverSeed, ctx.clientSeed, ctx.nonce, 'bonuswheel:trigger');
        if (u < chance) {
          events.push({ t: 'BONUS_WHEEL_START', ts: Date.now(), d: {} });

          const u2 = fairnessU01(ctx.serverSeed, ctx.clientSeed, ctx.nonce, 'bonuswheel:pick');
          const idx = Math.floor(u2 * bw.multipliers.length);
          const mul = Number(
            bw.multipliers[Math.min(bw.multipliers.length - 1, Math.max(0, idx))] ?? 0,
          );

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

    const win = decMul(bet, winMul); // string (8 decimals)

    // ✅ accumulate FS totals ONLY during free-spin spins
    if (inFSBefore) {
      nextSession.fsSpinsPlayed = Number(nextSession.fsSpinsPlayed ?? 0) + 1;
      nextSession.fsTotalWin = addDec8(String(nextSession.fsTotalWin ?? '0.00000000'), String(win));
    }

    // ---- decrement FS after spin ----
    if (inFSBefore) {
      const after = Math.max(0, Number(nextSession.freeSpinsRemaining ?? 0) - 1);
      nextSession.freeSpinsRemaining = after;

      if (after === 0) {
        const totalWin = String(nextSession.fsTotalWin ?? '0.00000000');
        const spinsPlayed = Number(nextSession.fsSpinsPlayed ?? 0);
        const totalSpins = Number(nextSession.fsTotalSpins ?? spinsPlayed);

        // clear active FS fields
        delete nextSession.freeSpinBet;

        // store last summary (optional but useful for debugging/UI)
        nextSession.lastFsSummary = {
          totalWin,
          spinsPlayed,
          totalSpins,
          endedAt: Date.now(),
        };

        // optional: reset running counters (keeps lastFsSummary)
        delete nextSession.fsTotalWin;
        delete nextSession.fsSpinsPlayed;
        delete nextSession.fsTotalSpins;
        delete nextSession.fsStartedAt;

        // ✅ send totalWin payload + ui hint (front can show animated image by gameId)
        events.push({
          t: 'FREE_SPINS_END',
          ts: Date.now(),
          d: {
            totalWin,
            spinsPlayed,
            totalSpins,
            ui: {
              gameId: ctx.gameId,
              animation: 'FS_END', // front maps to /assets/<gameId>/fs_end.(json/webp/gif)
            },
          },
        });
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

    // ✅ state AFTER the spin (so UI can switch immediately)
    const fsRemainingAfter = Number(nextSession.freeSpinsRemaining ?? 0);
    const stateAfter: 'NORMAL' | 'FREE_SPINS' | 'BONUS' = fsRemainingAfter > 0 ? 'FREE_SPINS' : 'NORMAL';

    const result: ZenyxRoundResult = {
      roundId: action.payload?.roundId ?? '',
      gameId: ctx.gameId,
      currency: ctx.currency,
      bet,
      win,
      state: stateAfter,
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