export type ReelStrip = string[]; // symbols
export interface SlotConfig {
  id: string;
  name: string;
  rtp: number;
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  reels: ReelStrip[]; // 5 reels
  rows: number; // 3
  paylines: number[][]; // each line has 5 indices (0..2) per reel
  symbols: {
    list: string[];
    wild: string;
    scatter: string;
  };
  paytable: Record<string, Record<number, number>>; // symbol -> count -> payout x bet
  scatterFreeSpins: Record<number, number>; // scatters -> fs count
  baseMultiplier?: number; // optional
  freeSpinMultiplier?: number; // optional
}

export interface SpinOutcome {
  grid: string[][]; // [reel][row]
  wins: {
    type: 'LINE';
    line: number;
    symbol: string;
    count: number;
    payoutMul: number;
    positions: Array<{ reel: number; row: number }>;
  }[];
  scatters: number;
  totalPayoutMul: number;
}
