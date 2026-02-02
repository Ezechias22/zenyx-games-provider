import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class GameInitDto {
  /**
   * Engine game code (primary)
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  gameCode?: string;

  /**
   * Alias for gameCode (friendly for provider clients)
   * Example: fruit_classic
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  gameId?: string;

  /**
   * External player id (primary)
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  playerExternalId?: string;

  /**
   * Alias for playerExternalId
   */
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

export class GamePlayDto {
  @IsString()
  @MinLength(2)
  roundId!: string;

  /**
   * Bet is a NUMBER in engine/casino flow.
   * (Provider RTP simulate uses bet as STRING in your current API)
   */
  @IsNumber()
  @Min(0.00000001)
  bet!: number;

  @IsOptional()
  @IsString()
  clientSeed?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
