import { Injectable } from '@nestjs/common';
import { EngineRegistry } from '../games/core/registry';
import { sha256Hex, newServerSeed } from '../games/core/fairness';

import { FRUIT_CLASSIC_ENGINE } from '../games/slots/fruit_classic/slot.engine';
import { EGYPT_RICHES_ENGINE } from '../games/slots/egypt_riches/slot.engine';
import { JUNGLE_WILD_ENGINE } from '../games/slots/jungle_wild/slot.engine';
import { LUXURY_GOLD_ENGINE } from '../games/slots/luxury_gold/slot.engine';
import { DIAMOND_RUSH_ENGINE } from '../games/slots/diamond_rush/slot.engine';
import { FIRE_REELS_ENGINE } from '../games/slots/fire_reels/slot.engine';
import { MYSTIC_FORTUNE_ENGINE } from '../games/slots/mystic_fortune/slot.engine';

import { CrashGameEngine } from '../games/crash/crash.engine';
import { DICE_ENGINE } from '../games/dice/dice.engine';

@Injectable()
export class ProviderService {
  private registry = new EngineRegistry();
  private crash = new CrashGameEngine();

  constructor() {
    this.registry.register(FRUIT_CLASSIC_ENGINE);
    this.registry.register(EGYPT_RICHES_ENGINE);
    this.registry.register(JUNGLE_WILD_ENGINE);
    this.registry.register(LUXURY_GOLD_ENGINE);
    this.registry.register(DIAMOND_RUSH_ENGINE);
    this.registry.register(FIRE_REELS_ENGINE);
    this.registry.register(MYSTIC_FORTUNE_ENGINE);
    this.registry.register(this.crash);
    this.registry.register(DICE_ENGINE);
  }

  listEngines(kind?: string) {
    return this.registry.list().filter(e => !kind || e.kind === kind);
  }

  async getGameConfig(gameId: string) {
    const e = this.registry.get(gameId);
    return { id: e.id, kind: e.kind, rtp: e.rtp };
  }

  async verifyFairness(params: { serverSeed: string; clientSeed: string; nonce: number; gameId: string; action: any }) {
    const e = this.registry.get(params.gameId);
    const ctx = {
      operatorId: 'verify',
      playerId: 'verify',
      currency: 'XXX',
      gameId: params.gameId,
      bet: '1',
      clientSeed: params.clientSeed,
      serverSeed: params.serverSeed,
      nonce: params.nonce,
      sessionData: {},
    };
    const { result } = await e.handle(ctx as any, params.action as any);
    return result;
  }

  async simulateRtp(gameId: string, spins: number, bet = '1') {
    const e = this.registry.get(gameId);
    if (e.kind !== 'SLOT') throw new Error('RTP simulation currently supported for slots only');

    let totalBet = 0;
    let totalWin = 0;

    let serverSeed = newServerSeed();
    const clientSeed = 'SIMULATION';
    let nonce = 0;

    let sessionData: any = {};
    for (let i = 0; i < spins; i++) {
      const ctx: any = {
        operatorId: 'sim',
        playerId: 'sim',
        currency: 'SIM',
        gameId,
        bet,
        clientSeed,
        serverSeed,
        nonce,
        sessionData,
      };

      const { result, nextSessionData } = await e.handle(ctx, { type: 'SPIN', payload: { roundId: `sim-${i}` } });
      sessionData = nextSessionData;

      totalBet += 1;
      totalWin += Number(result.win);

      nonce++;
      if (nonce % 50000 === 0) serverSeed = newServerSeed();
    }

    const rtp = totalWin / totalBet; // bet=1
    return { gameId, spins, rtp };
  }
}
