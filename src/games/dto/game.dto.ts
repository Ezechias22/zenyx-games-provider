import {
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
  // CRASH (crash_multiplier)
  // =========================
  @IsOptional()
  @IsNumber()
  @Min(1.01)
  crashCashoutAt?: number; // ex: 1.50, 2.00

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
  diceTarget?: number; // ex: 49.5
}
