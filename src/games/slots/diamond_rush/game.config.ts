import { SlotConfig } from '../shared/slot.types';
import { PAYLINES_20 } from '../shared/paylines.20';

export const DIAMOND_RUSH_CONFIG: SlotConfig = {
  id: 'diamond_rush',
  name: 'Diamond Rush',
  rtp: 0.96,
  volatility: 'MEDIUM',
  rows: 3,
  paylines: PAYLINES_20,
  symbols: {
    list: ['A', 'K', 'Q', 'J', '10', '9', 'emerald', 'ruby', 'W', 'S'],
    wild: 'W',
    scatter: 'S',
  },
  reels: [
    ['A','K','Q','J','10','9','emerald','ruby','W','S','A','K','Q','J','10','9','emerald','A','K'],
    ['A','K','Q','J','10','9','emerald','ruby','W','S','A','K','Q','J','10','9','ruby','A','Q'],
    ['A','K','Q','J','10','9','emerald','ruby','W','S','A','K','Q','J','10','9','emerald','ruby','Q'],
    ['A','K','Q','J','10','9','emerald','ruby','W','S','A','K','Q','J','10','9','ruby','J','K'],
    ['A','K','Q','J','10','9','emerald','ruby','W','S','A','K','Q','J','10','9','emerald','10','A'],
  ],
  paytable: {
    A: { 3: 0.5, 4: 1.5, 5: 5 },
    K: { 3: 0.4, 4: 1.2, 5: 4 },
    Q: { 3: 0.3, 4: 1.0, 5: 3 },
    J: { 3: 0.25, 4: 0.8, 5: 2.5 },
    '10': { 3: 0.2, 4: 0.6, 5: 2 },
    '9': { 3: 0.15, 4: 0.5, 5: 1.5 },
    emerald: { 3: 0.6, 4: 2.0, 5: 8 },
    ruby: { 3: 0.8, 4: 3.0, 5: 12 },
    W: { 3: 1.0, 4: 4.0, 5: 20 },
  },

  // ✅ diamond_rush: seulement 4 scatters => 10 free spins
  scatterFreeSpins: {
    4: 10,
  },

  buyFreeSpins: {
    enabled: true,
    costMul: 50,
    spins: 10,
    multiplier: 2,
  },

  bonusWheel: {
    enabled: true,
    chance: 0.01, // 1% per PAID spin
    multipliers: [2, 2, 3, 3, 5, 8, 10],
  },

  jackpot: {
    enabled: true,
    seed: 50,
    contributionRate: 0.01, // 1% of bet
    chance: 0.0005, // 0.05% per PAID spin
    maxPayout: 5000,
  },

  freeSpinMultiplier: 2,
};
