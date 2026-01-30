import { ZenyxRoundResult } from './events';

export interface EngineContext {
  operatorId: string;
  playerId: string;
  currency: string;
  gameId: string;
  bet: string; // decimal string
  clientSeed: string;
  serverSeed: string;
  nonce: number;
  sessionData?: any; // persisted state (free spins, bonus, etc.)
}

export interface EngineAction {
  type: 'SPIN' | 'CRASH_START' | 'CRASH_CASHOUT' | 'DICE_ROLL';
  payload?: any;
}

export interface GameEngine {
  id: string;
  kind: 'SLOT' | 'CRASH' | 'DICE';
  rtp: number; // configured theoretical RTP, e.g., 0.96
  handle(ctx: EngineContext, action: EngineAction): Promise<{ result: ZenyxRoundResult; nextSessionData: any }>;
}
