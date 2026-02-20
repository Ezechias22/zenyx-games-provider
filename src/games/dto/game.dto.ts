// src/games/dto/game.dto.ts
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class GameInitDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  gameCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  gameId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  playerExternalId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  playerId?: string;

  @IsString()
  @MinLength(2)
  currency!: string;

  @IsOptional()
  @IsString()
  clientSeed?: string;
}

// ✅ Type strict utilisé par le service
export type GameInitNormalizedDto = {
  gameCode: string;
  playerExternalId: string;
  currency: string;
  clientSeed?: string;
};

export class GamePlayDto {
  @IsString()
  @MinLength(2)
  roundId!: string;

  @IsNumber()
  @Min(0.00000001)
  bet!: number;

  @IsOptional()
  @IsString()
  clientSeed?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  // =========================
  // SLOT FEATURES
  // =========================
  @IsOptional()
  @IsBoolean()
  buyFreeSpins?: boolean; // BUY FS (déclenche FS immédiatement)

  // =========================
  // GAMBLE (double or nothing)
  // =========================
  @IsOptional()
  @IsBoolean()
  gamble?: boolean; // fait un gamble sur le dernier win "gamblable"

  @IsOptional()
  @IsString()
  @IsIn(['RED', 'BLACK'])
  gamblePick?: 'RED' | 'BLACK'; // optionnel (cosmétique)

  // =========================
  // CRASH (crash_multiplier)
  // =========================
  @IsOptional()
  @IsNumber()
  @Min(1.01)
  crashCashoutAt?: number;

  // =========================
  // DICE (dice_over_under)
  // =========================
  @IsOptional()
  @IsString()
  @IsIn(['UNDER', 'OVER'])
  diceMode?: 'UNDER' | 'OVER';

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  @Max(99.9999)
  diceTarget?: number;
}
