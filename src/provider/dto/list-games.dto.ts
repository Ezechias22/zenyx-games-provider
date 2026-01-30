import { IsOptional, IsString } from 'class-validator';

export class ListGamesQueryDto {
  @IsOptional()
  @IsString()
  kind?: 'SLOT' | 'CRASH' | 'DICE';
}
