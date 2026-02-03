import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class PublicSessionDto {
  @IsString()
  @MinLength(2)
  gameCode!: string;

  @IsString()
  @MinLength(1)
  playerExternalId!: string;

  @IsString()
  @MinLength(2)
  currency!: string;

  @IsOptional()
  @IsString()
  clientSeed?: string;
}

export class PublicPlayDto {
  @IsString()
  @MinLength(10)
  sessionId!: string;

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
