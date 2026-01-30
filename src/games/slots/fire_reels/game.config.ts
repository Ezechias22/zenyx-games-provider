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
    list: ['A','K','Q','J','10','9','FRL1','FRL2','W','S'],
    wild: 'W',
    scatter: 'S',
  },
  // Reel strips are theme-tuned; distribution controls RTP/volatility.
  reels: [
    ['A','K','Q','J','10','9','FRL1','FRL2','W','S','A','K','Q','J','10','9','FRL1','A','K'],
    ['A','K','Q','J','10','9','FRL1','FRL2','W','S','A','K','Q','J','10','9','FRL2','A','Q'],
    ['A','K','Q','J','10','9','FRL1','FRL2','W','S','A','K','Q','J','10','9','FRL1','FRL2','Q'],
    ['A','K','Q','J','10','9','FRL1','FRL2','W','S','A','K','Q','J','10','9','FRL2','J','K'],
    ['A','K','Q','J','10','9','FRL1','FRL2','W','S','A','K','Q','J','10','9','FRL1','10','A'],
  ],
  paytable: {
    'A': { 3: 0.5, 4: 1.5, 5: 5 },
    'K': { 3: 0.4, 4: 1.2, 5: 4 },
    'Q': { 3: 0.3, 4: 1.0, 5: 3 },
    'J': { 3: 0.25, 4: 0.8, 5: 2.5 },
    '10': { 3: 0.2, 4: 0.6, 5: 2 },
    '9': { 3: 0.15, 4: 0.5, 5: 1.5 },
    'FRL1': { 3: 0.6, 4: 2.0, 5: 8 },
    'FRL2': { 3: 0.8, 4: 3.0, 5: 12 },
    'W': { 3: 1.0, 4: 4.0, 5: 20 },
  },
  scatterFreeSpins: {
    3: 8,
    4: 12,
    5: 20,
  },
  freeSpinMultiplier: 2,
};
