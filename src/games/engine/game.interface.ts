export interface GamePlayResult {
  roundResult: Record<string, unknown>;
  winAmount: number;
  nonceUsed: number;
}

export interface IGameModule {
  gameCode: string;
  rtp: number;
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  play(params: { serverSeed: string; clientSeed: string; nonce: number; bet: number }): GamePlayResult;
}
