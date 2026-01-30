import { FRUIT_STAR_CONFIG } from './game.config';
import { FRUIT_STAR_PAYOUTS } from './payout.table';
import { RngService } from '../../engine/rng.service';

export class SlotEngine {
  constructor(private rng: RngService) {}

  spin(params: { serverSeed: string; clientSeed: string; nonce: number }) {
    const { reels } = FRUIT_STAR_CONFIG;
    const symbols = reels.map((reel, reelIndex) => {
      const r = this.rng.rng01(`${params.serverSeed}:${params.clientSeed}:${params.nonce}:${reelIndex}`);
      const idx = Math.floor(r * reel.length);
      return reel[idx];
    });
    return symbols;
  }

  winMultiplier(symbols: string[]): number {
    const key = symbols.join('');
    return FRUIT_STAR_PAYOUTS[key] || 0;
  }
}
