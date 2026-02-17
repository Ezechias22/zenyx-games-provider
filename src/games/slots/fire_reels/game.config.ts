import { SlotConfig } from '../shared/slot.types';
import { PAYLINES_20 } from '../shared/paylines.20';

export const FIRE_REELS_CONFIG: SlotConfig = {
  id: 'fire_reels',
  name: 'Fire Reels',
  rtp: 0.96,
  volatility: 'MEDIUM',
  rows: 3,
  paylines: PAYLINES_20,
  symbols: {
    list: ['A', 'K', 'Q', 'J', '10', '9', 'flame_core', 'ember_crystal', 'W', 'S'],
    wild: 'W',
    scatter: 'S',
  },
  reels: [
    ['A','K','Q','J','10','9','flame_core','ember_crystal','W','S','A','K','Q','J','10','9','flame_core','A','K'],
    ['A','K','Q','J','10','9','flame_core','ember_crystal','W','S','A','K','Q','J','10','9','ember_crystal','A','Q'],
    ['A','K','Q','J','10','9','flame_core','ember_crystal','W','S','A','K','Q','J','10','9','flame_core','ember_crystal','Q'],
    ['A','K','Q','J','10','9','flame_core','ember_crystal','W','S','A','K','Q','J','10','9','ember_crystal','J','K'],
    ['A','K','Q','J','10','9','flame_core','ember_crystal','W','S','A','K','Q','J','10','9','flame_core','10','A'],
  ],
  paytable: {
    A: { 3: 0.5, 4: 1.5, 5: 5 },
    K: { 3: 0.4, 4: 1.2, 5: 4 },
    Q: { 3: 0.3, 4: 1.0, 5: 3 },
    J: { 3: 0.25, 4: 0.8, 5: 2.5 },
    '10': { 3: 0.2, 4: 0.6, 5: 2 },
    '9': { 3: 0.15, 4: 0.5, 5: 1.5 },
    flame_core: { 3: 0.6, 4: 2.0, 5: 8 },
    ember_crystal: { 3: 0.8, 4: 3.0, 5: 12 },
    W: { 3: 1.0, 4: 4.0, 5: 20 },
  },

  // ✅ fire_reels: 3 scatters => 8 free spins
  scatterFreeSpins: {
    3: 8,
  },

  freeSpinMultiplier: 2,
};
