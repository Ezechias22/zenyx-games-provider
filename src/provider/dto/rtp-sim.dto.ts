import { IsInt, IsString, Min, Max, IsOptional } from 'class-validator';

export class RtpSimDto {
  @IsString()
  gameId!: string;

  @IsInt()
  @Min(1000)
  @Max(2000000)
  spins!: number;

  @IsOptional()
  @IsString()
  bet?: string;
}
