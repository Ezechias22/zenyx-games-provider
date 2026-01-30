import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class WalletBalanceDto {
  @IsString()
  @MinLength(1)
  playerExternalId!: string;

  @IsString()
  @MinLength(2)
  currency!: string;
}

export class WalletDebitDto extends WalletBalanceDto {
  @IsNumber()
  @Min(0.00000001)
  amount!: number;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  meta?: Record<string, unknown>;
}

export class WalletCreditDto extends WalletDebitDto {}

export class WalletRollbackDto {
  @IsString()
  @MinLength(1)
  transactionId!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
