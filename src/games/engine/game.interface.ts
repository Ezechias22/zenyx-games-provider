export interface GamePlayResult {
  roundResult: Record<string, unknown>;
  winAmount: number;
  nonceUsed: number;
}

// ✅ play peut être sync ou async
export type MaybePromise<T> = T | Promise<T>;

export interface IGameModule {
  gameCode: string;
  rtp: number;
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';

  play(params: {
    serverSeed: string;
    clientSeed: string;
    nonce: number;
    bet: number;
    // champs additionnels selon jeux (crashCashoutAt, dice, etc.)
    [k: string]: any;
  }): MaybePromise<GamePlayResult>;
}
