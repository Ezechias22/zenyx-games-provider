//  
import { SlotConfig } from '../shared/slot.types';
import { PAYLINES_20 } from '../shared/paylines.20';

export const FRUIT_CLASSIC_CONFIG: SlotConfig = {
  id: 'fruit_classic',
  name: 'Fruit Classic',
  rtp: 0.96,
  volatility: 'MEDIUM',
  rows: 3,
  paylines: PAYLINES_20,
  symbols: {
    list: ['A', 'K', 'Q', 'J', '10', '9', 'cherry', 'lemon', 'W', 'S'],
    wild: 'W',
    scatter: 'S',
  },

  reels: [
    ['A','K','Q','J','10','9','cherry','lemon','W','S','A','K','Q','J','10','9','cherry','A','K'],
    ['A','K','Q','J','10','9','cherry','lemon','W','S','A','K','Q','J','10','9','lemon','A','Q'],
    ['A','K','Q','J','10','9','cherry','lemon','W','S','A','K','Q','J','10','9','cherry','lemon','Q'],
    ['A','K','Q','J','10','9','cherry','lemon','W','S','A','K','Q','J','10','9','lemon','J','K'],
    ['A','K','Q','J','10','9','cherry','lemon','W','S','A','K','Q','J','10','9','cherry','10','A'],
  ],

  paytable: {
    A: { 3: 0.5, 4: 1.5, 5: 5 },
    K: { 3: 0.4, 4: 1.2, 5: 4 },
    Q: { 3: 0.3, 4: 1.0, 5: 3 },
    J: { 3: 0.25, 4: 0.8, 5: 2.5 },
    '10': { 3: 0.2, 4: 0.6, 5: 2 },
    '9': { 3: 0.15, 4: 0.5, 5: 1.5 },
    cherry: { 3: 0.6, 4: 2.0, 5: 8 },
    lemon: { 3: 0.8, 4: 3.0, 5: 12 },
    W: { 3: 1.0, 4: 4.0, 5: 20 },
  },

  // ✅ fruit_classic: seulement 3 scatters => 8 free spins
  scatterFreeSpins: {
    3: 8,
  },

  freeSpinMultiplier: 2,
};
