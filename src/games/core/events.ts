export type ZenyxEventType =
  | 'SPIN_START'
  | 'REELS_STOP'
  | 'WIN_LINE'
  | 'WIN_WAYS'
  | 'SCATTER_TRIGGER'
  | 'BONUS_TRIGGER'
  | 'FREE_SPINS_START'
  | 'FREE_SPINS_RETRIGGER'
  | 'FREE_SPINS_END'
  | 'BONUS_START'
  | 'BONUS_END'
  | 'MULTIPLIER_APPLIED'
  | 'BALANCE_UPDATE'
  | 'CRASH_START'
  | 'CRASH_TICK'
  | 'CASHOUT'
  | 'DICE_ROLL'
  | 'ROUND_END'
  | 'FAIRNESS';

export interface ZenyxEvent<T = any> {
  t: ZenyxEventType;
  ts: number; // epoch ms
  d: T;
}

export interface ZenyxRoundResult {
  roundId: string;
  gameId: string;
  currency: string;
  bet: string; // decimal as string
  win: string; // decimal as string
  state: 'NORMAL' | 'FREE_SPINS' | 'BONUS';
  events: ZenyxEvent[];
  fairness: {
    algo: 'HMAC_SHA256';
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
  };
}
