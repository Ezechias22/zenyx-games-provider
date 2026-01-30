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
    list: ['A','K','Q','J','10','9','FR1','FR2','W','S'],
    wild: 'W',
    scatter: 'S',
  },
  // Reel strips are theme-tuned; distribution controls RTP/volatility.
  reels: [
    ['A','K','Q','J','10','9','FR1','FR2','W','S','A','K','Q','J','10','9','FR1','A','K'],
    ['A','K','Q','J','10','9','FR1','FR2','W','S','A','K','Q','J','10','9','FR2','A','Q'],
    ['A','K','Q','J','10','9','FR1','FR2','W','S','A','K','Q','J','10','9','FR1','FR2','Q'],
    ['A','K','Q','J','10','9','FR1','FR2','W','S','A','K','Q','J','10','9','FR2','J','K'],
    ['A','K','Q','J','10','9','FR1','FR2','W','S','A','K','Q','J','10','9','FR1','10','A'],
  ],
  paytable: {
    'A': { 3: 0.5, 4: 1.5, 5: 5 },
    'K': { 3: 0.4, 4: 1.2, 5: 4 },
    'Q': { 3: 0.3, 4: 1.0, 5: 3 },
    'J': { 3: 0.25, 4: 0.8, 5: 2.5 },
    '10': { 3: 0.2, 4: 0.6, 5: 2 },
    '9': { 3: 0.15, 4: 0.5, 5: 1.5 },
    'FR1': { 3: 0.6, 4: 2.0, 5: 8 },
    'FR2': { 3: 0.8, 4: 3.0, 5: 12 },
    'W': { 3: 1.0, 4: 4.0, 5: 20 },
  },
  scatterFreeSpins: {
    3: 8,
    4: 12,
    5: 20,
  },
  freeSpinMultiplier: 2,
};
