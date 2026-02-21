import { SlotConfig } from '../shared/slot.types';
import { PAYLINES_20 } from '../shared/paylines.20';

export const MYSTIC_FORTUNE_CONFIG: SlotConfig = {
  id: 'mystic_fortune',
  name: 'Mystic Fortune',
  rtp: 0.96,
  volatility: 'MEDIUM',
  rows: 3,
  paylines: PAYLINES_20,
  symbols: {
    list: ['A', 'K', 'Q', 'J', '10', '9', 'amulet', 'magic_orb', 'W', 'S'],
    wild: 'W',
    scatter: 'S',
  },
  reels: [
    ['A','K','Q','J','10','9','amulet','magic_orb','W','S','A','K','Q','J','10','9','amulet','A','K'],
    ['A','K','Q','J','10','9','amulet','magic_orb','W','S','A','K','Q','J','10','9','magic_orb','A','Q'],
    ['A','K','Q','J','10','9','amulet','magic_orb','W','S','A','K','Q','J','10','9','amulet','magic_orb','Q'],
    ['A','K','Q','J','10','9','amulet','magic_orb','W','S','A','K','Q','J','10','9','magic_orb','J','K'],
    ['A','K','Q','J','10','9','amulet','magic_orb','W','S','A','K','Q','J','10','9','amulet','10','A'],
  ],
  paytable: {
    A: { 3: 0.5, 4: 1.5, 5: 5 },
    K: { 3: 0.4, 4: 1.2, 5: 4 },
    Q: { 3: 0.3, 4: 1.0, 5: 3 },
    J: { 3: 0.25, 4: 0.8, 5: 2.5 },
    '10': { 3: 0.2, 4: 0.6, 5: 2 },
    '9': { 3: 0.15, 4: 0.5, 5: 1.5 },
    amulet: { 3: 0.6, 4: 2.0, 5: 8 },
    magic_orb: { 3: 0.8, 4: 3.0, 5: 12 },
    W: { 3: 1.0, 4: 4.0, 5: 20 },
  },

  // ✅ mystic_fortune: seulement 4 scatters => 10 free spins
  scatterFreeSpins: {
    4: 10,
  },

  buyFreeSpins: {
    enabled: true,
    costMul: 50,
    spins: 10,
    multiplier: 4,
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
