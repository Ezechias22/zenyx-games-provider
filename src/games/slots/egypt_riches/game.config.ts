import { SlotConfig } from '../shared/slot.types';

export const EGYPT_RICHES_CONFIG: SlotConfig = {
  id: 'egypt_riches',
  name: 'Egypt Riches',
  rtp: 0.96,
  volatility: 'HIGH',

  reels: [
    ['A','K','Q','J','10','9','EG1','EG2','W','S'],
    ['A','K','Q','J','10','9','EG1','EG2','W','S'],
    ['A','K','Q','J','10','9','EG1','EG2','W','S'],
    ['A','K','Q','J','10','9','EG1','EG2','W','S'],
    ['A','K','Q','J','10','9','EG1','EG2','W','S'],
  ],

  rows: 3,

  paylines: [
    [0,0,0,0,0],
    [1,1,1,1,1],
    [2,2,2,2,2],
    [0,1,2,1,0],
    [2,1,0,1,2],
  ],

  symbols: {
    list: ['A','K','Q','J','10','9','EG1','EG2','W','S'],
    wild: 'W',
    scatter: 'S',
  },

  paytable: {
    A: { 3: 5, 4: 10, 5: 20 },
    K: { 3: 5, 4: 10, 5: 20 },
    Q: { 3: 4, 4: 8, 5: 15 },
    J: { 3: 3, 4: 6, 5: 12 },
    '10': { 3: 3, 4: 6, 5: 12 },
    '9': { 3: 2, 4: 5, 5: 10 },

    EG1: { 3: 10, 4: 25, 5: 50 },
    EG2: { 3: 15, 4: 40, 5: 80 },

    W: { 3: 20, 4: 50, 5: 100 },
  },

  // 🎯 TA RÈGLE EXACTE
  scatterFreeSpins: {
    4: 12,   // ✅ seulement 4 scatters = 12 free spins
  },

  freeSpinMultiplier: 2,   // 🔥 bonus Egypt x2 pendant FS
  baseMultiplier: 1,
};
