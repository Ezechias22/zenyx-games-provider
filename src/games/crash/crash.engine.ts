import { GameEngine, EngineAction, EngineContext } from '../core/engine.interface';
import { ZenyxEvent, ZenyxRoundResult } from '../core/events';
import { sha256Hex } from '../core/fairness';
import { decMul, decToInt, intToDec } from '../core/decimal';
import { crashMultiplier } from './crash.math';

export class CrashGameEngine implements GameEngine {
  id = 'crash_multiplier';
  kind: 'CRASH' = 'CRASH';
  rtp = 0.97;

  async handle(ctx: EngineContext, action: EngineAction): Promise<{ result: ZenyxRoundResult; nextSessionData: any }> {
    const now = Date.now();
    const events: ZenyxEvent[] = [];
    const serverSeedHash = sha256Hex(ctx.serverSeed);

    const session = ctx.sessionData ?? {};
    const bet = ctx.bet;

    if (action.type === 'CRASH_START') {
      const bustAt = crashMultiplier(ctx.serverSeed, ctx.clientSeed, ctx.nonce);
      const roundId = action.payload?.roundId ?? '';

      events.push({ t: 'CRASH_START', ts: now, d: { bet, bustAt } });
      events.push({ t: 'FAIRNESS', ts: Date.now(), d: { serverSeedHash, clientSeed: ctx.clientSeed, nonce: ctx.nonce } });

      const result: ZenyxRoundResult = {
        roundId,
        gameId: ctx.gameId,
        currency: ctx.currency,
        bet,
        win: '0',
        state: 'NORMAL',
        events,
        fairness: { algo: 'HMAC_SHA256', serverSeedHash, clientSeed: ctx.clientSeed, nonce: ctx.nonce },
      };

      return { result, nextSessionData: { ...session, crash: { bustAt, active: true, bet, cashedOut: false } } };
    }

    if (action.type === 'CRASH_CASHOUT') {
      const crash = session.crash;
      if (!crash?.active) throw new Error('No active crash round');
      if (crash.cashedOut) throw new Error('Already cashed out');

      const at = Number(action.payload?.at);
      if (!Number.isFinite(at) || at < 1) throw new Error('Invalid cashout multiplier');

      // If cashout after bust, win = 0
      const win = at < crash.bustAt ? decMul(crash.bet, at) : '0';
      events.push({ t: 'CASHOUT', ts: now, d: { at, bustAt: crash.bustAt, win } });
      if (win !== '0') events.push({ t: 'MULTIPLIER_APPLIED', ts: Date.now(), d: { multiplier: at } });
      events.push({ t: 'FAIRNESS', ts: Date.now(), d: { serverSeedHash, clientSeed: ctx.clientSeed, nonce: ctx.nonce } });
      events.push({ t: 'ROUND_END', ts: Date.now(), d: { win } });

      const result: ZenyxRoundResult = {
        roundId: action.payload?.roundId ?? '',
        gameId: ctx.gameId,
        currency: ctx.currency,
        bet: crash.bet,
        win,
        state: 'NORMAL',
        events,
        fairness: { algo: 'HMAC_SHA256', serverSeedHash, clientSeed: ctx.clientSeed, nonce: ctx.nonce },
      };

      return { result, nextSessionData: { ...session, crash: { ...crash, active: false, cashedOut: true } } };
    }

    throw new Error('Invalid action for crash');
  }
}
